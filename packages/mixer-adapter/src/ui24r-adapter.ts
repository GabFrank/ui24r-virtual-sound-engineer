import type {
  BulkExternalChange, ConnectionState, DeviceInfo, MixerDomainAPI,
  ReadResult, WriteResult,
} from './api.ts';
import { ConfirmedStateStore, type EntradaEstado } from './confirmed-store.ts';
import {
  codificarSetd, dbDeMedidor, decodificar, decodificarVuCanales, MEDIDOR_SATURACION,
} from './protocol.ts';
import { faderADb, gananciaADb } from './conversiones.ts';
import type { Transport } from './transport.ts';

export interface OpcionesAdapter {
  /**
   * Hueco sin tramas del analizador que declara la conexión inestable.
   *
   * **Antes esto miraba las tramas de medidores, y estaba mal.** Medido el
   * 2026-09-08: la consola **deja de emitir `VU2` cuando no hay señal**. En
   * treinta segundos de silencio llegó una sola trama; con música, 1932 en
   * noventa segundos. Un vigilante sobre `VU2` declara la conexión inestable
   * en cada silencio, o sea entre tema y tema y en toda la prueba de sonido:
   * justo cuando el operador mira la pantalla.
   *
   * El analizador no hace esa supresión: 30,0 Hz medidos con señal y 30,2 Hz
   * en silencio absoluto, con percentil 95 de 37 ms. Es el latido honesto de
   * este aparato, y es lo que se vigila ahora.
   */
  readonly umbralHuecoRtaMs?: number;
  /** Espera máxima por la confirmación de una escritura. */
  readonly timeoutConfirmacionMs?: number;
  /**
   * Quietud sin líneas de estado que da por terminado el volcado inicial.
   *
   * **Existe porque la Ui24R no manda ninguna marca de fin de volcado.** El
   * adaptador esperaba una línea `DUMP_END` que el simulador sí emite y la
   * consola real no: contra el aparato, el estado confirmado se quedaba en
   * INVALID para siempre y ninguna lectura era confiable.
   *
   * El volcado son ~6 665 claves en unos 220 mensajes seguidos, y entra
   * completo entre 112 y 158 ms (20 de 20 ciclos medidos el 2026-09-08). Un
   * cuarto de segundo sin una sola línea de estado es holgado para ese ritmo y
   * corto para el operador. Las tramas de medidores y de analizador no cuentan:
   * llegan siempre y no dirían nada.
   */
  readonly quietudVolcadoMs?: number;
  readonly ahora?: () => number;
}

export interface EstadoCanal {
  readonly indice: number;
  readonly nombre: string;
  readonly faderDb: number;
  /**
   * La ganancia de entrada, o `null` si la consola todavía no la dijo.
   *
   * Era `number`, y cuando el estado confirmado no tenía `hw.N.gain` se
   * devolvía el extremo del rango como si fuera una lectura. La telemetría
   * imprimía «≈-6» y el asistente proponía a partir de ese número. El «≈»
   * distingue «estimado a partir de un valor crudo real» de «medido»; no
   * distinguía ninguno de los dos de «inventado», que es peor que los otros
   * dos juntos.
   */
  readonly gainDb: number | null;
  readonly silenciado: boolean;
  readonly nivelDb: number;
  readonly picoDb: number;
  readonly eventosSaturacion: number;
}

/**
 * Adaptador de la consola Ui24R.
 *
 * Es el único punto del sistema que habla el protocolo. Todo lo demás usa
 * `MixerDomainAPI`. Dos cosas que hace distinto de la biblioteca comunitaria,
 * y que son la razón de que exista:
 *
 * - Lee **solo** del almacén de estado confirmado, alimentado por mensajes
 *   entrantes. Nunca da por aplicada una escritura propia sin confirmación.
 * - Deduce si la conexión está sana por la **cadencia de los medidores**, no
 *   por pérdida de paquetes: sobre TCP no se pierden, se retrasan.
 */
export class Ui24rMixerAdapter implements MixerDomainAPI {
  private readonly store: ConfirmedStateStore;
  private _estadoConexion: ConnectionState = 'DISCONNECTED';
  private ultimaTramaVuMs: number | null = null;
  private ultimaTramaRtaMs: number | null = null;
  private readonly umbralHuecoRtaMs: number;
  private readonly timeoutMs: number;
  private readonly ahora: () => number;

  private readonly nombresCanal = new Map<number, string>();
  /**
   * Cuántos canales tiene la consola de enfrente.
   *
   * No se supone: la cabecera de cada trama `VU2` lo dice, y el volcado manda
   * un `i.N.name` por cada entrada. Estaba fijo en doce, y una Ui24R tiene
   * veinticuatro: las dos entradas RCA son los canales 21 y 22, así que con
   * doce no se veía justamente la fuente que se usa para probar.
   */
  private canalesDetectados = 0;
  private readonly nivelesVu = new Map<number, number>();
  private readonly picosVu = new Map<number, number>();
  private readonly saturaciones = new Map<number, number>();

  private info: DeviceInfo = { modelo: 'desconocido', firmware: 'desconocido' };
  private oyentesConexion: ((e: ConnectionState) => void)[] = [];
  private oyentesTelemetria: (() => void)[] = [];
  private oyentesLatido: (() => void)[] = [];
  private desuscribir: (() => void)[] = [];
  private vigilanteVu: ReturnType<typeof setInterval> | null = null;
  private temporizadorVolcado: ReturnType<typeof setTimeout> | null = null;
  private readonly quietudVolcadoMs: number;
  /** La última dirección conectada, para poder releer el estado. */
  private url: string | null = null;

  private readonly transporte: Transport;

  constructor(transporte: Transport, opciones: OpcionesAdapter = {}) {
    this.transporte = transporte;
    this.ahora = opciones.ahora ?? (() => Date.now());
    // 300 ms serian ocho tramas perdidas del analizador, que va a 30 Hz con
    // percentil 95 de 37 ms. Se mantiene el valor: sobre RTA es holgado y
    // ademas es un flujo que no se apaga solo.
    this.umbralHuecoRtaMs = opciones.umbralHuecoRtaMs ?? 300;
    this.timeoutMs = opciones.timeoutConfirmacionMs ?? 500;
    this.quietudVolcadoMs = opciones.quietudVolcadoMs ?? 250;
    this.store = new ConfirmedStateStore({ ahora: this.ahora });
  }

  get estadoConexion(): ConnectionState {
    return this._estadoConexion;
  }

  async conectar(url: string): Promise<void> {
    this.url = url;
    this.cambiarEstado('RECONNECTING');
    // El volcado empieza en cuanto se abre la conexión: la consola lo manda
    // sin que se le pida.
    this.store.volcadoIniciado();

    this.desuscribir.push(
      this.transporte.alRecibir((linea) => this.procesar(linea)),
      this.transporte.alCerrar(() => {
        this.store.invalidar();
        this.cambiarEstado('DISCONNECTED');
      }),
    );

    await this.transporte.conectar(url);
    this.cambiarEstado('CONNECTED');

    // Vigila el hueco entre tramas de medidores: si la consola deja de
    // emitirlas, la conexión está en problemas aunque el socket siga abierto.
    this.vigilanteVu = setInterval(() => this.revisarCadenciaRta(), 100);
  }

  /**
   * Vuelve a leer el estado entero de la consola.
   *
   * Es la mitad que le faltaba a INV-021. La invariante dice «store INVALID
   * **hasta re-lectura**», y el estado se invalidaba sin que existiera ninguna
   * forma de releerlo: lo único que devuelve el almacén a VALID es el volcado
   * completo, que la consola manda sola al abrir la conexión. El cartel decía
   * «hasta releerlo» y el botón decía «Entendido», así que un recall desde el
   * navegador de la consola dejaba el estado —y con él la posibilidad de
   * escribir— muerto por el resto del show.
   *
   * **Ahora se pide, ya no se reconecta.** El comentario anterior decía que no
   * había mensaje verificado que pidiera el volcado y que por eso se reconectaba.
   * SPK-P0.2a cerró el 2026-09-08 y `INIT` quedó medido: mandarlo produjo un
   * segundo volcado completo del estado. No escribe ningún parámetro; es una
   * consulta, como `ALIVE`.
   *
   * El cambio no es cosmético. Reconectar **ya no funcionaba** contra la consola
   * real: el identificador de sesión de socket.io es de un solo uso, así que
   * volver a abrir la misma dirección falla. Pedir `INIT` evita además tirar la
   * conexión para recuperar algo que la consola manda sin cortar nada.
   */
  async releerEstado(): Promise<void> {
    if (this.url === null) {
      throw new Error('no hay conexión que releer: primero hay que conectarse');
    }
    if (!this.transporte.conectado) {
      throw new Error('el transporte no está conectado: no hay a quién pedirle el estado');
    }
    this.store.volcadoIniciado();
    this.transporte.enviar('INIT');
    this.reiniciarQuietudDeVolcado();
  }

  async desconectar(): Promise<void> {
    if (this.vigilanteVu) clearInterval(this.vigilanteVu);
    this.vigilanteVu = null;
    if (this.temporizadorVolcado !== null) clearTimeout(this.temporizadorVolcado);
    this.temporizadorVolcado = null;
    for (const f of this.desuscribir) f();
    this.desuscribir = [];
    await this.transporte.desconectar();
    this.store.invalidar();
    this.cambiarEstado('DISCONNECTED');
  }

  async infoDispositivo(): Promise<DeviceInfo> {
    return this.info;
  }

  /**
   * El estado confirmado entero, tal como está.
   *
   * Existe para el diagnóstico: la huella que compara dos clientes conectados a
   * la vez (criterio 5 de SPK-P0.1) tiene que cubrir todo lo leído y no una
   * muestra elegida a ojo. Es de solo lectura y no expone el almacén.
   */
  volcadoDelEstado(): ReadonlyMap<string, EntradaEstado> {
    return this.store.volcar();
  }

  /**
   * Relee la lista de instantáneas de la consola.
   *
   * Todavía no está implementada: el mensaje del protocolo que la devuelve es
   * uno de los que SPK-P0.4 tiene que verificar. Se lanza en vez de devolver
   * una lista vacía o inventada, porque quien llama —el ejecutor de
   * transacciones, para INV-001— trata el fallo como «no verificada» y no
   * escribe. Devolver algo aquí sería afirmar sobre el protocolo justo lo que
   * la primera regla del repositorio prohíbe afirmar.
   */
  private readonly oyentesVolcado: (() => void)[] = [];

  async listarSnapshots(): Promise<readonly string[]> {
    throw new Error(
      'listarSnapshots todavía no está implementado: depende de SPK-P0.4. ' +
      'Hasta entonces ninguna transacción con instantánea puede verificarse.',
    );
  }

  leer(parametro: string): ReadResult {
    const e = this.store.leer(parametro);
    return {
      value: e?.valor ?? 0,
      confirmedAt: e?.confirmadoEl ?? null,
      source: e?.origen ?? 'UNKNOWN',
      version: e?.version ?? 0,
      storeState: this.store.storeState,
    };
  }

  /**
   * Escribe comparando antes contra el valor esperado (INV-011).
   *
   * Si el valor actual no es el esperado, alguien lo cambió: se devuelve
   * conflicto y **no se escribe**. Sobrescribir el cambio de otra persona en
   * medio de un show es exactamente lo que este proyecto no puede hacer.
   */
  async escribir(parametro: string, valor: number, esperado: number): Promise<WriteResult> {
    if (this._estadoConexion !== 'CONNECTED') {
      return {
        status: 'REJECTED',
        confirmedBy: 'NONE',
        actual: null,
        motivo: `la conexión está en ${this._estadoConexion}`,
      };
    }

    const cmp = this.store.coincideConEsperado(parametro, esperado);
    if (!cmp.coincide) {
      return { status: 'CONFLICT', confirmedBy: 'NONE', actual: cmp.actual, motivo: cmp.motivo };
    }

    this.store.registrarEscrituraPropia(parametro, valor);
    this.transporte.enviar(codificarSetd(parametro, valor));

    const confirmado = await this.esperarConfirmacion(parametro, valor);
    if (confirmado) {
      return { status: 'APPLIED', confirmedBy: 'ECHO', actual: valor, motivo: null };
    }
    return {
      status: 'UNVERIFIED',
      confirmedBy: 'TIMEOUT',
      actual: null,
      motivo:
        `sin confirmación en ${this.timeoutMs} ms. El cambio pudo aplicarse o no: ` +
        'la transacción queda detenida hasta que alguien decida',
    };
  }

  alCambiarExterno(cb: (parametro: string, valor: number) => void): () => void {
    return this.store.alCambioExterno(cb);
  }

  /**
   * Avisa cuando el volcado inicial terminó y el estado confirmado ya es
   * completo.
   *
   * Hace falta porque `CONNECTED` se emite al abrir el socket, antes de recibir
   * un solo mensaje del volcado. Quien escuchaba solo la conexión daba el
   * estado por válido durante todo ese intervalo, en el que el almacén todavía
   * está INVALID.
   */
  alVolcadoCompleto(cb: () => void): () => void {
    this.oyentesVolcado.push(cb);
    return () => {
      const i = this.oyentesVolcado.indexOf(cb);
      if (i >= 0) this.oyentesVolcado.splice(i, 1);
    };
  }

  alCambioMasivo(cb: (evento: BulkExternalChange) => void): () => void {
    return this.store.alCambioMasivo(cb);
  }

  alCambiarConexion(cb: (estado: ConnectionState) => void): () => void {
    this.oyentesConexion.push(cb);
    return () => { this.oyentesConexion = this.oyentesConexion.filter((f) => f !== cb); };
  }

  alActualizarTelemetria(cb: () => void): () => void {
    this.oyentesTelemetria.push(cb);
    return () => { this.oyentesTelemetria = this.oyentesTelemetria.filter((f) => f !== cb); };
  }

  /**
   * Cada trama del analizador (`RTA`).
   *
   * Es un aviso distinto del de telemetria a proposito. `VU2` **se apaga en
   * silencio** --una trama en treinta segundos sin senal, frente a mas de
   * veinte por segundo con musica-- asi que su cadencia mide cuanto silencio
   * hubo, no como esta la conexion. `RTA` no se apaga: llega a 30 Hz con senal
   * y sin ella, y por eso es el flujo sobre el que este adaptador ya decide si
   * la conexion esta inestable. Quien quiera medir la salud de la conexion
   * tiene que escuchar aca; quien quiera saber si habia audio, alla.
   */
  alLatido(cb: () => void): () => void {
    this.oyentesLatido.push(cb);
    return () => { this.oyentesLatido = this.oyentesLatido.filter((f) => f !== cb); };
  }

  /** Vista de los canales, ya en unidades físicas, para la interfaz. */
  canales(cantidad = this.canalesDetectados || CANALES_HASTA_SABER): readonly EstadoCanal[] {
    const salida: EstadoCanal[] = [];
    for (let canal = 1; canal <= cantidad; canal++) {
      const n = indiceDeRuta(canal);
      const fader = this.store.leer(`i.${n}.mix`);
      const gain = this.store.leer(`hw.${n}.gain`);
      const mute = this.store.leer(`i.${n}.mute`);
      salida.push({
        indice: canal,
        nombre: this.nombresCanal.get(canal) ?? `CANAL ${canal}`,
        faderDb: fader ? faderADb(fader.valor) : -Infinity,
        gainDb: gain ? gananciaADb(gain.valor) : null,
        silenciado: (mute?.valor ?? 0) > 0.5,
        nivelDb: this.nivelesVu.get(canal) ?? -Infinity,
        picoDb: this.picosVu.get(canal) ?? -Infinity,
        eventosSaturacion: this.saturaciones.get(canal) ?? 0,
      });
    }
    return salida;
  }

  private procesar(linea: string): void {
    const m = decodificar(linea);

    if (m.tipo === 'SETD') {
      this.store.procesarLinea(linea);
      this.reiniciarQuietudDeVolcado();
      return;
    }

    if (m.tipo === 'SETS') {
      this.reiniciarQuietudDeVolcado();
      const coincidencia = /^i\.(\d+)\.name$/.exec(m.path);
      // El nombre se guarda por canal, no por índice de ruta: `i.0.name` es el
      // canal 1. Se convierte acá, en el borde, para que el resto del
      // adaptador hable un solo idioma.
      if (coincidencia) {
        const canal = canalDeIndice(Number(coincidencia[1]));
        this.nombresCanal.set(canal, m.texto);
        this.canalesDetectados = Math.max(this.canalesDetectados, canal);
      }
      return;
    }

    if (m.tipo === 'VU2') {
      this.procesarVu(m.cargaBase64);
      return;
    }

    // El analizador es la señal de vida: llega pase lo que pase, con señal y en
    // silencio. No se decodifica su contenido, solo se anota que llegó.
    if (m.tipo === 'RTA') {
      this.ultimaTramaRtaMs = this.ahora();
      if (this._estadoConexion === 'UNSTABLE') this.cambiarEstado('CONNECTED');
      for (const cb of this.oyentesLatido) cb();
      return;
    }

    // El simulador sí manda un centinela. Se respeta: cuando está, no hace
    // falta esperar la quietud.
    if (m.tipo === 'OTRO' && m.linea === 'DUMP_END') {
      this.completarVolcado();
    }
  }

  private procesarVu(base64: string): void {
    // Se anota la marca de tiempo para la estadistica de cadencia, pero **no**
    // se toca el estado de la conexion: la ausencia de VU2 significa silencio,
    // no caida. Quien decide sobre la conexion es el analizador.
    this.ultimaTramaVuMs = this.ahora();

    const medidores = decodificarVuCanales(base64);
    this.canalesDetectados = Math.max(this.canalesDetectados, medidores.length);
    for (let i = 0; i < medidores.length; i++) {
      const canal = i + 1;
      const medidor = medidores[i]!;
      const db = dbDeMedidor(medidor.entrada);
      this.nivelesVu.set(canal, db);

      const picoPrevio = this.picosVu.get(canal) ?? -Infinity;
      this.picosVu.set(canal, Math.max(picoPrevio, db));

      // Saturación: la consola enciende su indicador cuando el medidor llega a
      // la punta de la escala —`1 <= valor` en `setVU`—, que son 0 dB. Antes
      // acá había un umbral de -1 dB elegido a mano y, con la conversión
      // equivocada, un canal 12 dB por debajo del tope acumulaba mil
      // saturaciones por minuto.
      //
      // Se mira `entrada`, que es el nivel que esta fila muestra. La consola
      // vigila además `pre` para el clip del previo, en su página de ganancia;
      // cuál de los dos debe mirar un asistente de ganancia lo decide
      // SPK-P0.10b, que es el que mide qué significa cada uno en dBFS.
      if (medidor.entrada >= MEDIDOR_SATURACION) {
        this.saturaciones.set(canal, (this.saturaciones.get(canal) ?? 0) + 1);
      }
    }
    for (const cb of this.oyentesTelemetria) cb();
  }

  /**
   * Reinicia la cuenta de quietud mientras siguen llegando líneas de estado.
   *
   * Solo actúa durante el volcado inicial. Después de eso las líneas de estado
   * son cambios normales y no tienen que reabrir nada.
   */
  private reiniciarQuietudDeVolcado(): void {
    if (this.store.storeState === 'VALID') return;
    if (this.temporizadorVolcado !== null) clearTimeout(this.temporizadorVolcado);
    this.temporizadorVolcado = setTimeout(
      () => this.completarVolcado(), this.quietudVolcadoMs,
    );
  }

  /** Da el volcado por terminado. Es idempotente a propósito. */
  private completarVolcado(): void {
    if (this.temporizadorVolcado !== null) {
      clearTimeout(this.temporizadorVolcado);
      this.temporizadorVolcado = null;
    }
    if (this.store.storeState === 'VALID') return;
    this.store.volcadoCompletoRecibido();
    this.cambiarEstado('CONNECTED');
    for (const cb of this.oyentesVolcado) cb();
  }

  private revisarCadenciaRta(): void {
    if (this._estadoConexion === 'DISCONNECTED') return;
    if (this.ultimaTramaRtaMs === null) return;
    const hueco = this.ahora() - this.ultimaTramaRtaMs;
    if (hueco > this.umbralHuecoRtaMs && this._estadoConexion === 'CONNECTED') {
      this.cambiarEstado('UNSTABLE');
    }
  }

  private esperarConfirmacion(parametro: string, valor: number): Promise<boolean> {
    return new Promise((resolve) => {
      const inicio = this.ahora();
      const revisar = () => {
        const e = this.store.leer(parametro);
        if (e && Math.abs(e.valor - valor) < 1e-9 && e.origen === 'SELF') {
          clearInterval(temporizador);
          resolve(true);
          return;
        }
        if (this.ahora() - inicio >= this.timeoutMs) {
          clearInterval(temporizador);
          resolve(false);
        }
      };
      const temporizador = setInterval(revisar, 10);
    });
  }

  private cambiarEstado(e: ConnectionState): void {
    if (this._estadoConexion === e) return;
    this._estadoConexion = e;
    for (const cb of this.oyentesConexion) cb(e);
  }

  /** Reinicia los contadores de pico y saturación al empezar una captura. */
  reiniciarPicos(): void {
    this.picosVu.clear();
    this.saturaciones.clear();
  }
}

/**
 * Canal de la consola —el número de la serigrafía, desde 1— al índice que usan
 * las rutas del protocolo.
 *
 * **Las rutas son de base cero.** El canal 1 es `i.0.mix`, `hw.0.gain` e
 * `i.0.name`. Está medido contra el aparato y escrito en
 * `docs/protocol-spec.md`, pero este adaptador componía `i.1` para el canal 1,
 * y el resultado era una fila de la interfaz que mezclaba dos canales
 * distintos: el medidor del canal 1 —que sí llega en la posición 0 de la trama
 * `VU2`, y por eso se veía correcto— junto al nombre, la ganancia, el fader y
 * el silencio del canal 2.
 *
 * **Por qué no lo agarró ningún test.** El simulador construía su estado con
 * la misma suposición equivocada, así que los dos errores se cancelaban y
 * contra el simulador todo cuadraba. Es el caso exacto que advierte
 * CONTRIBUTING: un test que pasa contra el simulador no cierra nada.
 */
function indiceDeRuta(canal: number): number {
  return canal - 1;
}

/** La vuelta: índice de ruta a canal. */
function canalDeIndice(indice: number): number {
  return indice + 1;
}

/**
 * Cuántos canales mostrar mientras la consola todavía no dijo cuántos tiene.
 *
 * Pasa solo entre que se abre el socket y llega la primera línea. Doce es lo
 * que entra en una pantalla sin desplazar; en cuanto llega el volcado o una
 * trama de medidores, manda el número real.
 */
const CANALES_HASTA_SABER = 12;
