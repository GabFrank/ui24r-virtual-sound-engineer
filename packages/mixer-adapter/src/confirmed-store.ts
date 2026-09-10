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
  /**
   * Cuánto se espera a que un gesto termine antes de avisar el cambio externo.
   *
   * Tiene que ser mayor que el tic de difusión de la consola —~34 ms medidos—
   * o el arrastre se parte en pedazos.
   */
  readonly ventanaAgrupacionMs?: number;
  /** Reloj inyectable, para poder testear el tiempo sin esperarlo. */
  readonly ahora?: () => number;
  /**
   * Temporizador inyectable, por el mismo motivo que el reloj.
   *
   * La primera versión de la agrupación usó `setTimeout` a secas y rompió
   * cuatro tests que llevaban años pasando: este almacén se prueba con un reloj
   * falso justamente para no esperar, y meter tiempo real por la ventana de
   * atrás lo deshace. Que los tests se cayeran fue la señal, no el estorbo.
   */
  readonly programar?: (fn: () => void, ms: number) => { cancelar: () => void };
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
  private readonly ventanaAgrupacionMs: number;
  private readonly ahora: () => number;
  private readonly programar: (fn: () => void, ms: number) => { cancelar: () => void };

  private oyentesExterno: ((path: string, valor: number) => void)[] = [];
  /** Cambios externos esperando a que el gesto termine, por ruta. */
  private readonly agrupando = new Map<string, {
    valor: number;
    cancelar: () => void;
    desdeMs: number;
  }>();
  private oyentesRafaga: ((e: BulkExternalChange) => void)[] = [];

  constructor(opciones: OpcionesStore = {}) {
    this.ventanaMs = opciones.ventanaCorrelacionMs ?? 300;
    this.ventanaRafagaCorrelacionMs = opciones.ventanaCorrelacionEnRafagaMs ?? 1000;
    this.umbralRutas = opciones.umbralRafagaRutas ?? 10;
    this.ventanaRafagaMs = opciones.ventanaRafagaMs ?? 1000;
    this.ventanaAgrupacionMs = opciones.ventanaAgrupacionMs ?? 250;
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.programar = opciones.programar ?? ((fn, ms) => {
      const id = setTimeout(fn, ms);
      // `unref` para que un aviso pendiente no mantenga vivo el proceso: un
      // spike que termina no tiene por qué esperar a que se cierre una ventana.
      (id as unknown as { unref?: () => void }).unref?.();
      return { cancelar: () => clearTimeout(id) };
    });
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

  /**
   * Anota una escritura en vuelo, para que el testigo pueda descontarla.
   *
   * Ya **no** sirve para reconocer un eco: no hay eco. Queda porque
   * `confirmarPorTestigo` descuenta de acá lo que confirma, y porque tener la
   * lista de lo que está en vuelo es útil para depurar una escritura que venció.
   */
  registrarEscrituraPropia(path: string, valor: number): void {
    const t = this.ahora();
    this.pendientes.push({ path, valor, enviadaEnMs: t });
    this.limpiarPendientes(t);
  }

  /**
   * Da por confirmado un valor que **la conexión testigo** vio difundir.
   *
   * No rompe la regla 1 de este almacén —«se alimenta solo de mensajes
   * entrantes»— sino que la extiende: la línea que provoca esta llamada es un
   * mensaje entrante de la consola, aunque haya llegado por el otro socket. Lo
   * que sigue prohibido es dar por buena una escritura porque la enviamos.
   *
   * Existe porque **sin esto el estado local queda viejo justo en los
   * parámetros que tocamos**: la consola no le devuelve el eco al emisor, así
   * que la conexión principal nunca ve su propia escritura. La segunda
   * escritura sobre la misma ruta comparaba contra el valor anterior y daba
   * CONFLICT contra nosotros mismos. Una rampa de dos pasos era imposible.
   *
   * El origen es `SELF` sin deducir nada. La deducción por ventana temporal es
   * para mensajes que llegan solos; acá el llamador ya correlacionó ruta, valor
   * y ventana, y con un testigo lento —más de 300 ms— la deducción marcaría
   * `EXTERNAL` y abriría un aviso de cambio ajeno por nuestro propio cambio.
   */
  confirmarPorTestigo(path: string, valor: number): void {
    const t = this.ahora();
    this.limpiarPendientes(t);
    const i = this.pendientes.findIndex(
      (p) => p.path === path && Math.abs(p.valor - valor) < 1e-9,
    );
    if (i >= 0) this.pendientes.splice(i, 1);

    const previo = this.estado.get(path);
    this.estado.set(path, {
      valor,
      confirmadoEl: new Date(t).toISOString(),
      origen: 'SELF',
      version: (previo?.version ?? 0) + 1,
    });
  }

  /** Procesa una línea entrante del protocolo. */
  procesarLinea(linea: string): void {
    const m = decodificar(linea);
    if (m.tipo !== 'SETD') return;
    this.aplicar(m.path, m.valor);
  }

  aplicar(path: string, valor: number): void {
    const t = this.ahora();
    const origen = this.deducirOrigen();
    const previo = this.estado.get(path);

    this.estado.set(path, {
      valor,
      confirmadoEl: new Date(t).toISOString(),
      origen,
      version: (previo?.version ?? 0) + 1,
    });

    if (origen === 'EXTERNAL' && !this.cargandoVolcado) {
      this.registrarCambioReciente(path, t);
      this.avisarCambioExterno(path, valor, t);
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

  /**
   * De dónde viene un cambio que llegó **por la conexión principal**.
   *
   * **Siempre es ajeno, y esto es una consecuencia de lo medido.** Antes esto
   * buscaba entre nuestras escrituras pendientes una que coincidiera en ruta,
   * valor y ventana temporal, y la marcaba `SELF`. Era la forma de reconocer
   * el eco de la consola, de cuando se creía que había eco.
   *
   * Medido el 2026-09-08: **la consola no le devuelve nada a quien escribe**.
   * O sea que por este socket nuestra propia escritura no vuelve nunca, y esa
   * rama no podía acertar por el motivo que decía. Lo único que podía hacer es
   * acertar por coincidencia — y ahí hacía daño de verdad: si una escritura
   * nuestra vencía sin testigo, quedaba pendiente hasta un segundo, y **un
   * cambio de otro operador a la misma ruta y el mismo valor dentro de esa
   * ventana se tragaba como propio y no disparaba el aviso de cambio ajeno**.
   *
   * Lo que llega por acá es de otro cliente, o de una recuperación de
   * instantánea. Las dos cosas son ajenas. Lo nuestro entra por
   * `confirmarPorTestigo`, que no deduce nada porque no hace falta.
   */
  private deducirOrigen(): ChangeSource {
    return 'EXTERNAL';
  }

  private limpiarPendientes(t: number): void {
    const limite = Math.max(this.ventanaMs, this.ventanaRafagaCorrelacionMs);
    this.pendientes = this.pendientes.filter((p) => t - p.enviadaEnMs <= limite);
  }

  /**
   * Avisa un cambio externo, **agrupando el arrastre en uno solo**.
   *
   * **El daño que esto evita es concreto.** Cada cambio externo va al registro y
   * a la lista de «últimos veinte cambios» de la aplicación. Un arrastre de
   * fader desde otro dispositivo produce del orden de veinte líneas —medido
   * contra la consola el 2026-09-10: de 40 escrituras cada 15 ms difunde 20— y
   * con eso **una sola pasada de fader ajena borra todo el historial reciente**,
   * que es justo lo que el operador iba a mirar para entender qué pasó.
   *
   * **Se retrasa el aviso en vez de emitir el primero y suprimir el resto.** Un
   * arrastre no tiene un valor «bueno» hasta que termina: el que importa es el
   * último, donde el fader quedó. Avisar el primero y callar los demás dejaría
   * en el historial el valor del que arrancó el gesto, que es el que ya no
   * está. El precio es la demora de la ventana, y para una lista que se lee
   * después no cuesta nada.
   *
   * **La ventana tiene que ser mayor que el tic de difusión de la consola**,
   * que son ~34 ms medidos: durante un arrastre las líneas llegan a ese ritmo,
   * así que con una ventana más chica el gesto se partiría en pedazos. Con 250
   * cierra sola cuando el gesto para, y un movimiento deliberado cada medio
   * segundo sigue contando como cambios distintos.
   *
   * **Lo que esto cuesta, dicho sin vueltas.** Dos cambios sobre la misma ruta
   * separados por menos de 250 ms se avisan como uno solo, con el último valor.
   * Si alguien mueve un fader en escalones rápidos y deliberados, el historial
   * va a mostrar dónde terminó y no cada escalón. Se eligió así porque el caso
   * frecuente es el arrastre —donde los escalones intermedios no le sirven a
   * nadie— y el caso raro es alguien tecleando valores cada 100 ms.
   *
   * **Y lo que NO cuesta, que es lo que importa para la seguridad.** El estado
   * confirmado se actualiza con cada línea, antes de este aviso y sin pasar por
   * él. O sea que la comprobación de INV-011 —¿el valor sigue siendo el que
   * creo?— ve todos los cambios, agrupados o no. Agrupar afecta lo que se
   * *cuenta*, nunca lo que se *sabe*.
   */
  private avisarCambioExterno(path: string, valor: number, t: number): void {
    // Ventana en cero significa **no agrupar**, y avisa en el acto sin pasar
    // por ningún temporizador. Es lo que usan los tests que miran el etiquetado
    // y no la agrupación: obligarlos a mover un reloj para recibir un aviso que
    // no están probando sería ruido en cada uno de ellos.
    if (this.ventanaAgrupacionMs <= 0) {
      for (const cb of this.oyentesExterno) cb(path, valor);
      return;
    }

    const pendiente = this.agrupando.get(path);
    pendiente?.cancelar();
    const { cancelar } = this.programar(() => {
      const ultimo = this.agrupando.get(path);
      this.agrupando.delete(path);
      if (ultimo === undefined) return;
      for (const cb of this.oyentesExterno) cb(path, ultimo.valor);
    }, this.ventanaAgrupacionMs);
    this.agrupando.set(path, { valor, cancelar, desdeMs: pendiente?.desdeMs ?? t });
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

    // La invalidación va siempre, la alerta no. La ventana de silencio existe
    // para no abrir un cartel por cada trama de un mismo recall; suprimir
    // también la invalidación hacía que una avalancha **distinta**, caída
    // dentro de esa ventana, dejara el estado dado por bueno. Con la relectura
    // ahora en manos del usuario, volver a VALID dentro del segundo dejó de ser
    // imposible.
    this.invalidar();

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
    // **Esto NO es un arrastre, y llamarlo así durante meses no lo hizo serlo.**
    // Pide varias rutas DISTINTAS con el mismo sufijo, o sea varios canales
    // moviendo el mismo parámetro a la vez: un grupo, un VCA, o un recall
    // parcial. Un arrastre de un fader es UNA sola ruta escrita muchas veces y
    // nunca puede entrar por acá. El texto que la aplicación muestra siempre
    // dijo la verdad —«N canales cambiaron el mismo parámetro»—; el que mentía
    // era el identificador, y por eso el criterio 5 de SPK-P0.9 parecía cubierto
    // hasta que se midió contra la consola.
    if (sufijos.size === 1 && rutas.size > 1) return 'GRUPO_DE_CANALES';
    return 'DESCONOCIDA';
  }
}
