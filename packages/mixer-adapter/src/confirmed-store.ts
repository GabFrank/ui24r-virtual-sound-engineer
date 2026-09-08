import type { ChangeSource, StoreState, BulkExternalChange } from './api.ts';
import { decodificar } from './protocol.ts';

/**
 * Almacén de estado confirmado. Implementa ADR-005.
 *
 * Tres reglas que lo definen, y las tres vienen de limitaciones reales del
 * protocolo, no de preferencias de diseño:
 *
 * 1. **Se alimenta solo de mensajes entrantes.** La biblioteca comunitaria
 *    construye su estado mezclando lo que envía con lo que recibe: una
 *    escritura propia aparece como valor actual antes de que la consola la
 *    aplique. Verificar contra eso compara contra un valor que quizá nunca
 *    llegó, y un retroceso restauraría algo que nunca existió.
 *
 * 2. **El origen se deduce, no se lee.** El protocolo no dice qué cliente
 *    escribió. Solo se puede distinguir propio de ajeno por correlación
 *    temporal con lo que uno mismo envió.
 *
 * 3. **Una avalancha no son muchos cambios externos.** Recuperar una
 *    instantánea manda cientos de mensajes; arrastrar un fader manda decenas
 *    por segundo. Tratarlos uno por uno llenaría la pantalla de conflictos
 *    falsos.
 */

export interface EntradaEstado {
  readonly valor: number;
  readonly confirmadoEl: string;
  readonly origen: ChangeSource;
  readonly version: number;
}

export interface OpcionesStore {
  /** Ventana para considerar propio un mensaje entrante, en milisegundos. */
  readonly ventanaCorrelacionMs?: number;
  /** Ventana ampliada durante una avalancha: los ecos llegan más tarde. */
  readonly ventanaCorrelacionEnRafagaMs?: number;
  /** Rutas distintas en la ventana que disparan la detección de avalancha. */
  readonly umbralRafagaRutas?: number;
  readonly ventanaRafagaMs?: number;
  /** Reloj inyectable, para poder testear el tiempo sin esperarlo. */
  readonly ahora?: () => number;
}

interface EscrituraPendiente {
  readonly path: string;
  readonly valor: number;
  readonly enviadaEnMs: number;
}

/**
 * La ruta de la instantánea activa.
 *
 * Está acá y no en `clasificar-ruta.ts` porque el almacén la necesita antes de
 * clasificar nada: un cambio en esta ruta invalida el estado entero, sin mirar
 * qué más pasó.
 */
export const RUTA_INSTANTANEA_ACTIVA = 'var.currentSnapshot';

export class ConfirmedStateStore {
  private readonly estado = new Map<string, EntradaEstado>();
  private pendientes: EscrituraPendiente[] = [];
  private cambiosRecientes: { path: string; enMs: number }[] = [];
  private _storeState: StoreState = 'INVALID';
  private enRafagaHastaMs = 0;
  private causaAvisada: BulkExternalChange['probableCausa'] | null = null;
  private cargandoVolcado = false;

  private readonly ventanaMs: number;
  private readonly ventanaRafagaCorrelacionMs: number;
  private readonly umbralRutas: number;
  private readonly ventanaRafagaMs: number;
  private readonly ahora: () => number;

  private oyentesExterno: ((path: string, valor: number) => void)[] = [];
  private oyentesRafaga: ((e: BulkExternalChange) => void)[] = [];

  constructor(opciones: OpcionesStore = {}) {
    this.ventanaMs = opciones.ventanaCorrelacionMs ?? 300;
    this.ventanaRafagaCorrelacionMs = opciones.ventanaCorrelacionEnRafagaMs ?? 1000;
    this.umbralRutas = opciones.umbralRafagaRutas ?? 10;
    this.ventanaRafagaMs = opciones.ventanaRafagaMs ?? 1000;
    this.ahora = opciones.ahora ?? (() => Date.now());
  }

  get storeState(): StoreState {
    return this._storeState;
  }

  /** Si está recibiendo el volcado completo de estado. */
  get recibiendoVolcado(): boolean {
    return this.cargandoVolcado;
  }

  /**
   * Marca el inicio del volcado completo.
   *
   * Al conectar, y al reconectar, la consola manda su estado entero como
   * cientos de mensajes individuales. Eso no es "alguien cambió cien
   * parámetros": es la consola diciendo cómo está. Mientras dura, los cambios
   * se aplican pero no se anuncian como ajenos ni cuentan para detectar una
   * avalancha. Sin esta distinción, cada conexión abriría una alerta de cambio
   * masivo.
   */
  volcadoIniciado(): void {
    this.cargandoVolcado = true;
    this._storeState = 'INVALID';
    this.cambiosRecientes = [];
  }

  /**
   * El estado deja de ser confiable al perder la conexión: la consola pudo
   * cambiar mientras no estábamos. Vuelve a ser válido con el volcado completo.
   */
  invalidar(): void {
    this._storeState = 'INVALID';
  }

  volcadoCompletoRecibido(): void {
    this.cargandoVolcado = false;
    this.cambiosRecientes = [];
    this._storeState = 'VALID';
  }

  /** Registra una escritura propia para poder reconocer su eco. */
  registrarEscrituraPropia(path: string, valor: number): void {
    const t = this.ahora();
    this.pendientes.push({ path, valor, enviadaEnMs: t });
    this.limpiarPendientes(t);
  }

  /** Procesa una línea entrante del protocolo. */
  procesarLinea(linea: string): void {
    const m = decodificar(linea);
    if (m.tipo !== 'SETD') return;
    this.aplicar(m.path, m.valor);
  }

  aplicar(path: string, valor: number): void {
    const t = this.ahora();
    const origen = this.deducirOrigen(path, valor, t);
    const previo = this.estado.get(path);

    this.estado.set(path, {
      valor,
      confirmadoEl: new Date(t).toISOString(),
      origen,
      version: (previo?.version ?? 0) + 1,
    });

    if (origen === 'EXTERNAL' && !this.cargandoVolcado) {
      this.registrarCambioReciente(path, t);
      for (const cb of this.oyentesExterno) cb(path, valor);
    }
  }

  leer(path: string): EntradaEstado | undefined {
    return this.estado.get(path);
  }

  /**
   * Comparación previa a escribir. Implementa INV-011.
   *
   * Con el estado inválido no se escribe: no sabemos si lo que tenemos refleja
   * la consola.
   */
  coincideConEsperado(path: string, esperado: number, tolerancia = 1e-9): {
    coincide: boolean;
    actual: number | null;
    motivo: string | null;
  } {
    if (this._storeState !== 'VALID') {
      return { coincide: false, actual: null, motivo: 'el estado confirmado no es válido' };
    }
    const e = this.estado.get(path);
    if (!e) {
      return { coincide: false, actual: null, motivo: `${path} no está en el estado confirmado` };
    }
    if (Math.abs(e.valor - esperado) > tolerancia) {
      return {
        coincide: false,
        actual: e.valor,
        motivo: `se esperaba ${esperado} y hay ${e.valor}, cambiado desde ${e.origen === 'EXTERNAL' ? 'otro cliente' : 'origen desconocido'}`,
      };
    }
    return { coincide: true, actual: e.valor, motivo: null };
  }

  alCambioExterno(cb: (path: string, valor: number) => void): () => void {
    this.oyentesExterno.push(cb);
    return () => { this.oyentesExterno = this.oyentesExterno.filter((f) => f !== cb); };
  }

  alCambioMasivo(cb: (e: BulkExternalChange) => void): () => void {
    this.oyentesRafaga.push(cb);
    return () => { this.oyentesRafaga = this.oyentesRafaga.filter((f) => f !== cb); };
  }

  /** Instantánea del estado, para depurar y para la vista de diferencias. */
  volcar(): ReadonlyMap<string, EntradaEstado> {
    return new Map(this.estado);
  }

  private deducirOrigen(path: string, valor: number, t: number): ChangeSource {
    const ventana = t < this.enRafagaHastaMs ? this.ventanaRafagaCorrelacionMs : this.ventanaMs;
    this.limpiarPendientes(t);
    const i = this.pendientes.findIndex(
      (p) => p.path === path && Math.abs(p.valor - valor) < 1e-9 && t - p.enviadaEnMs <= ventana,
    );
    if (i >= 0) {
      this.pendientes.splice(i, 1);
      return 'SELF';
    }
    return 'EXTERNAL';
  }

  private limpiarPendientes(t: number): void {
    const limite = Math.max(this.ventanaMs, this.ventanaRafagaCorrelacionMs);
    this.pendientes = this.pendientes.filter((p) => t - p.enviadaEnMs <= limite);
  }

  /**
   * Detecta la avalancha por número de **rutas distintas**, no de mensajes.
   * Arrastrar un fader manda decenas de mensajes sobre una sola ruta: eso es
   * un gesto, no una avalancha. Recuperar una instantánea toca muchas rutas.
   */
  private registrarCambioReciente(path: string, t: number): void {
    this.cambiosRecientes.push({ path, enMs: t });
    this.cambiosRecientes = this.cambiosRecientes.filter((c) => t - c.enMs <= this.ventanaRafagaMs);

    const rutas = new Set(this.cambiosRecientes.map((c) => c.path));
    // INV-021 dice «cambio masivo **o** cambio de currentSnapshot», y solo
    // estaba la primera mitad. Un recall desde el navegador de la consola
    // cambia la instantánea activa y después los parámetros que difieran: si
    // difieren menos de diez, la avalancha no se detectaba y el estado local
    // seguía dándose por bueno cuando ya no describía la consola. Es peor que
    // la avalancha grande, porque un recall chico es el que nadie nota.
    const cambioDeInstantanea = path === RUTA_INSTANTANEA_ACTIVA;
    const hayAvalancha = rutas.size >= this.umbralRutas;
    if (!cambioDeInstantanea && !hayAvalancha) return;

    if (t < this.enRafagaHastaMs) {
      // Ya se avisó por esta avalancha. La única razón para volver a hablar es
      // haber aprendido algo: la consola no promete un orden, así que el
      // cambio de instantánea puede llegar **después** de los parámetros que
      // movió. Cuando llega, lo que se aviso como un arrastre de faders era en
      // realidad un recall, y eso cambia lo que conviene hacer. Se corrige una
      // sola vez por avalancha.
      if (cambioDeInstantanea && this.causaAvisada !== 'SNAPSHOT_RECALL') {
        this.causaAvisada = 'SNAPSHOT_RECALL';
        this.avisarRafaga(rutas.size, 'SNAPSHOT_RECALL', t);
      }
      return;
    }

    this.enRafagaHastaMs = t + this.ventanaRafagaMs;
    this.invalidar();
    this.causaAvisada = this.causaProbable(cambioDeInstantanea, rutas);
    this.avisarRafaga(rutas.size, this.causaAvisada, t);
  }

  private avisarRafaga(
    rutasAfectadas: number,
    probableCausa: BulkExternalChange['probableCausa'],
    t: number,
  ): void {
    const evento: BulkExternalChange = {
      rutasAfectadas,
      ventanaMs: this.ventanaRafagaMs,
      probableCausa,
      timestamp: new Date(t).toISOString(),
    };
    for (const cb of this.oyentesRafaga) cb(evento);
  }

  /**
   * De dónde salió la avalancha.
   *
   * Estaba fijo en `SNAPSHOT_RECALL`, que es mentira siempre que no lo sea, y
   * la causa se le muestra al usuario para que decida qué hacer. Ahora se
   * deduce de lo que se vio: la instantánea activa cambió, o todas las rutas
   * son el mismo parámetro de canales distintos —un fader arrastrado en grupo—,
   * o no se sabe, que también es una respuesta.
   */
  private causaProbable(
    cambioDeInstantanea: boolean,
    rutas: ReadonlySet<string>,
  ): BulkExternalChange['probableCausa'] {
    if (cambioDeInstantanea) return 'SNAPSHOT_RECALL';
    const sufijos = new Set([...rutas].map((r) => r.split('.').slice(2).join('.')));
    if (sufijos.size === 1 && rutas.size > 1) return 'FADER_DRAG';
    return 'DESCONOCIDA';
  }
}
