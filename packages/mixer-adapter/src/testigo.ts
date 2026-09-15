/**
 * La conexión testigo: el único mecanismo que confirma una escritura contra
 * esta consola. Implementa ADR-024.
 *
 * **Por qué existe.** Medido el 2026-09-08 contra la Ui24R en `192.168.0.78`,
 * firmware `3.4.8318-ui24`, en `i.9.mute`, `i.9.mix` e `i.9.pan`:
 *
 * - La consola **no le devuelve el eco de una escritura a quien la hizo**. Seis
 *   segundos escuchando, cero líneas para la ruta escrita.
 * - **Sí la difunde a los demás clientes.** Con tres conexiones a la vez, el que
 *   escribe ve cero líneas y los otros dos ven una cada uno.
 * - **Dos conexiones del mismo proceso alcanzan**: la consola las trata como
 *   clientes distintos. El testigo vio la escritura a los **27 ms**.
 *
 * De ahí sale este objeto: un segundo socket que no escribe nunca y solo mira,
 * para poder decir «la consola difundió el valor que mandamos».
 *
 * **Lo que confirma, y lo que no.** Confirma que la consola difundió esa ruta
 * con ese valor dentro de la ventana. No prueba que la línea sea nuestra: si
 * otro cliente escribe la misma ruta al mismo valor en el mismo instante, el
 * testigo no puede distinguirlo, porque el protocolo no identifica al emisor
 * (ADR-005). Y tampoco prueba que ese siga siendo el valor actual: una
 * escritura ajena posterior dentro de la misma ventana llega después y este
 * objeto ya resolvió. Es la misma ambigüedad que ADR-005 asume para el origen
 * de los cambios, y con este mecanismo se hereda tal cual.
 */

import { decodificar } from './protocol.ts';
import type { Transport } from './transport.ts';

export interface OpcionesTestigo {
  /**
   * Quietud sin líneas de estado que da por terminado el volcado del testigo.
   *
   * Al abrirse, el testigo recibe el volcado entero igual que cualquier
   * cliente: del orden de seis mil claves en unos 220 mensajes, completo entre
   * 112 y 158 ms. No es un número constante: 6 665 y 6 087 en dos sesiones con
   * el mismo firmware, y por eso el fin del volcado se detecta por quietud.
   * Es el mismo criterio que usa el adaptador para su propia conexión.
   */
  readonly quietudVolcadoMs?: number;
  /** Tope duro para dar el volcado por terminado aunque no haya quietud. */
  readonly topeVolcadoMs?: number;
}

/**
 * Cuánto se espera como mucho a que el volcado del testigo se aquiete.
 *
 * Sin tope, una consola que emitiera estado sin pausa dejaría al testigo
 * eternamente «casi listo» y ninguna escritura saldría nunca. Con el tope, el
 * testigo empieza a correlacionar igual: peor que esperar la quietud, mejor que
 * no escribir.
 */
export const TESTIGO_TOPE_VOLCADO_MS = 3000;

interface Pendiente {
  readonly path: string;
  readonly valor: number;
  readonly resolver: (visto: boolean) => void;
  readonly temporizador: ReturnType<typeof setTimeout>;
}

/** Igual que la del almacén: los valores del protocolo viajan como texto. */
const TOLERANCIA = 1e-9;


/**
 * Una espera de confirmación por testigo, con su forma de abandonarla.
 *
 * Es un objeto y no una promesa suelta **porque hay un camino que arma la
 * espera y después no escribe**: cuando el envío falla. Dejarla armada no es
 * una fuga de memoria —vence sola— sino una fuga de **estado**, y la de peor
 * signo: roba la confirmación de la escritura siguiente.
 */
export interface EsperaDeEscritura {
  readonly visto: Promise<boolean>;
  cancelar(): void;
}

export class TestigoDeEscrituras {
  private readonly transporte: Transport;
  private readonly quietudVolcadoMs: number;
  private readonly topeVolcadoMs: number;

  private pendientes: Pendiente[] = [];

  /**
   * Cuántas confirmaciones está esperando ahora mismo.
   *
   * Se expone para poder **comprobar que no quedan huérfanas**. Un pendiente
   * abandonado no rompe nada visible: vence solo a los 500 ms, y mientras tanto
   * intercepta la difusión del siguiente. Sin este número, la única forma de
   * verlo es montar la carrera entera y esperar a que salga mal.
   */
  get enEspera(): number { return this.pendientes.length; }
  private desuscribir: (() => void)[] = [];

  /**
   * Si el volcado inicial ya terminó.
   *
   * Antes de que termine **no se correlaciona nada**, y no es una precaución
   * teórica: el volcado trae el valor que la ruta ya tenía, así que una
   * escritura que repite el valor actual —revertir a lo que había, reaplicar
   * algo idempotente— se daría por confirmada con una línea que salió de la
   * consola antes de que la escritura existiera.
   */
  private listo = false;
  private resolverListo: (() => void) | null = null;
  private temporizadorQuietud: ReturnType<typeof setTimeout> | null = null;
  private temporizadorTope: ReturnType<typeof setTimeout> | null = null;

  constructor(transporte: Transport, opciones: OpcionesTestigo = {}) {
    this.transporte = transporte;
    this.quietudVolcadoMs = opciones.quietudVolcadoMs ?? 250;
    this.topeVolcadoMs = opciones.topeVolcadoMs ?? TESTIGO_TOPE_VOLCADO_MS;
  }

  /** Si el socket del testigo está abierto y ya terminó su volcado. */
  get listoParaAtestiguar(): boolean {
    return this.listo && this.transporte.conectado;
  }

  /**
   * Abre la sesión y espera a que su volcado se aquiete.
   *
   * La espera es parte de conectar a propósito: quien llama tiene que pagarla
   * antes de mandar la primera escritura, no en medio de ella.
   */
  async conectar(destino: string): Promise<void> {
    this.desuscribir.push(
      this.transporte.alRecibir((linea) => this.recibir(linea)),
      this.transporte.alCerrar(() => this.alCaer()),
    );
    await this.transporte.conectar(destino);
    await this.esperarQuietudDeVolcado();
  }

  /**
   * Promete si el testigo ve difundir `path` con `valor` antes del plazo.
   *
   * Se llama **antes** de enviar la escritura: a 27 ms de latencia medida, una
   * suscripción posterior al envío es una carrera perdida. Y por eso hay que
   * poder **cancelarla**: si la escritura no llega a salir, la espera ya está
   * armada.
   *
   * **Sin el cancelador, un pendiente huérfano se come la confirmación de la
   * escritura siguiente.** Lo midió una auditoría el 2026-09-11: `recibir()`
   * resuelve el **primer** pendiente que coincide, así que uno abandonado
   * intercepta la difusión destinada al reintento. El escenario es el que más
   * pasa: parpadea la wifi, la escritura sale rechazada, el operador repite el
   * mismo movimiento, **la consola sí lo aplica y lo difunde**, el testigo sí lo
   * ve — y el adaptador contesta «pudo aplicarse o no», que es justo el modo de
   * fallo que se estaba tratando de eliminar.
   */
  esperar(path: string, valor: number, timeoutMs: number): EsperaDeEscritura {
    let cancelar = (): void => {};
    const visto = new Promise<boolean>((resolve) => {
      const temporizador = setTimeout(() => {
        this.pendientes = this.pendientes.filter((p) => p !== pendiente);
        resolve(false);
      }, timeoutMs);
      const pendiente: Pendiente = { path, valor, resolver: resolve, temporizador };
      this.pendientes.push(pendiente);
      cancelar = () => {
        if (!this.pendientes.includes(pendiente)) return;
        this.pendientes = this.pendientes.filter((p) => p !== pendiente);
        clearTimeout(temporizador);
        resolve(false);
      };
    });
    return { visto, cancelar: () => cancelar() };
  }

  async cerrar(): Promise<void> {
    for (const f of this.desuscribir) f();
    this.desuscribir = [];
    this.limpiarTemporizadores();
    this.resolverListo?.();
    this.resolverListo = null;
    this.listo = false;
    this.resolverPendientes(false);
    await this.transporte.desconectar();
  }

  private recibir(linea: string): void {
    const m = decodificar(linea);
    // El simulador manda un centinela de fin de volcado y la consola real no.
    // Cuando está, no hace falta esperar la quietud.
    if (m.tipo === 'OTRO' && m.linea === 'DUMP_END') {
      this.marcarListo();
      return;
    }
    if (m.tipo === 'SETD' || m.tipo === 'SETS') this.reiniciarQuietud();
    if (m.tipo !== 'SETD') return;
    if (!this.listo) return;

    const i = this.pendientes.findIndex(
      (p) => p.path === m.path && Math.abs(p.valor - m.valor) < TOLERANCIA,
    );
    if (i < 0) return;
    const [pendiente] = this.pendientes.splice(i, 1);
    clearTimeout(pendiente!.temporizador);
    pendiente!.resolver(true);
  }

  /**
   * El testigo se cayó: nada de lo pendiente se puede seguir esperando.
   *
   * Se resuelve en falso en vez de dejar colgado el temporizador, porque el
   * llamador tiene que enterarse ahora de que esa escritura quedó sin verificar
   * y no dentro de medio segundo.
   */
  private alCaer(): void {
    this.listo = false;
    this.resolverPendientes(false);
  }

  private resolverPendientes(visto: boolean): void {
    const pendientes = this.pendientes;
    this.pendientes = [];
    for (const p of pendientes) {
      clearTimeout(p.temporizador);
      p.resolver(visto);
    }
  }

  private esperarQuietudDeVolcado(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolverListo = resolve;
      this.temporizadorTope = setTimeout(() => this.marcarListo(), this.topeVolcadoMs);
      // La cuenta arranca al conectar y no con la primera línea: si la consola
      // no manda nada, el testigo está listo igual y no hay por qué esperar al
      // tope.
      this.reiniciarQuietud();
    });
  }

  private reiniciarQuietud(): void {
    if (this.listo) return;
    if (this.temporizadorQuietud !== null) clearTimeout(this.temporizadorQuietud);
    this.temporizadorQuietud = setTimeout(() => this.marcarListo(), this.quietudVolcadoMs);
  }

  private marcarListo(): void {
    if (this.listo) return;
    this.listo = true;
    this.limpiarTemporizadores();
    const resolver = this.resolverListo;
    this.resolverListo = null;
    resolver?.();
  }

  private limpiarTemporizadores(): void {
    if (this.temporizadorQuietud !== null) clearTimeout(this.temporizadorQuietud);
    this.temporizadorQuietud = null;
    if (this.temporizadorTope !== null) clearTimeout(this.temporizadorTope);
    this.temporizadorTope = null;
  }
}
