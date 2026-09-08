import type {
  BulkExternalChange, ConnectionState, DeviceInfo, MixerDomainAPI,
  ReadResult, WriteResult,
} from './api.ts';
import { ConfirmedStateStore } from './confirmed-store.ts';
import { codificarSetd, decodificar, decodificarVu } from './protocol.ts';
import { faderADb, gananciaADb } from './conversiones.ts';
import type { Transport } from './transport.ts';

export interface OpcionesAdapter {
  /** Hueco entre tramas de medidores que declara la conexión inestable. */
  readonly umbralHuecoVuMs?: number;
  /** Espera máxima por la confirmación de una escritura. */
  readonly timeoutConfirmacionMs?: number;
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
  private readonly umbralHuecoVuMs: number;
  private readonly timeoutMs: number;
  private readonly ahora: () => number;

  private readonly nombresCanal = new Map<number, string>();
  private readonly nivelesVu = new Map<number, number>();
  private readonly picosVu = new Map<number, number>();
  private readonly saturaciones = new Map<number, number>();

  private info: DeviceInfo = { modelo: 'desconocido', firmware: 'desconocido' };
  private oyentesConexion: ((e: ConnectionState) => void)[] = [];
  private oyentesTelemetria: (() => void)[] = [];
  private desuscribir: (() => void)[] = [];
  private vigilanteVu: ReturnType<typeof setInterval> | null = null;
  /** La última dirección conectada, para poder releer el estado. */
  private url: string | null = null;

  private readonly transporte: Transport;

  constructor(transporte: Transport, opciones: OpcionesAdapter = {}) {
    this.transporte = transporte;
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.umbralHuecoVuMs = opciones.umbralHuecoVuMs ?? 300;
    this.timeoutMs = opciones.timeoutConfirmacionMs ?? 500;
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
    this.vigilanteVu = setInterval(() => this.revisarCadenciaVu(), 100);
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
   * Se hace reconectando, y no pidiendo el volcado, porque **no hay mensaje
   * verificado que lo pida**: cuál es lo tiene que decir SPK-P0.2a. Reconectar
   * usa lo único que el protocolo ya demostró hacer.
   */
  async releerEstado(): Promise<void> {
    if (this.url === null) {
      throw new Error('no hay conexión que releer: primero hay que conectarse');
    }
    const url = this.url;
    await this.desconectar();
    await this.conectar(url);
  }

  async desconectar(): Promise<void> {
    if (this.vigilanteVu) clearInterval(this.vigilanteVu);
    this.vigilanteVu = null;
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

  /** Vista de los canales, ya en unidades físicas, para la interfaz. */
  canales(cantidad = 12): readonly EstadoCanal[] {
    const salida: EstadoCanal[] = [];
    for (let i = 1; i <= cantidad; i++) {
      const fader = this.store.leer(`i.${i}.mix`);
      const gain = this.store.leer(`hw.${i}.gain`);
      const mute = this.store.leer(`i.${i}.mute`);
      salida.push({
        indice: i,
        nombre: this.nombresCanal.get(i) ?? `CANAL ${i}`,
        faderDb: fader ? faderADb(fader.valor) : -Infinity,
        gainDb: gain ? gananciaADb(gain.valor) : null,
        silenciado: (mute?.valor ?? 0) > 0.5,
        nivelDb: this.nivelesVu.get(i) ?? -Infinity,
        picoDb: this.picosVu.get(i) ?? -Infinity,
        eventosSaturacion: this.saturaciones.get(i) ?? 0,
      });
    }
    return salida;
  }

  private procesar(linea: string): void {
    const m = decodificar(linea);

    if (m.tipo === 'SETD') {
      this.store.procesarLinea(linea);
      return;
    }

    if (m.tipo === 'SETS') {
      const coincidencia = /^i\.(\d+)\.name$/.exec(m.path);
      if (coincidencia) this.nombresCanal.set(Number(coincidencia[1]), m.texto);
      return;
    }

    if (m.tipo === 'VU2') {
      this.procesarVu(m.cargaBase64);
      return;
    }

    if (m.linea === 'DUMP_END') {
      this.store.volcadoCompletoRecibido();
      this.cambiarEstado('CONNECTED');
      for (const cb of this.oyentesVolcado) cb();
    }
  }

  private procesarVu(base64: string): void {
    const ahora = this.ahora();
    this.ultimaTramaVuMs = ahora;
    if (this._estadoConexion === 'UNSTABLE') this.cambiarEstado('CONNECTED');

    const niveles = decodificarVu(base64);
    for (let i = 0; i < niveles.length; i++) {
      const canal = i + 1;
      const db = niveles[i]!;
      this.nivelesVu.set(canal, db);

      const picoPrevio = this.picosVu.get(canal) ?? -Infinity;
      this.picosVu.set(canal, Math.max(picoPrevio, db));

      // Saturación por telemetría: el valor de referencia se calibra en
      // SPK-P0.10b. Hasta entonces se usa -1 dB, y el número real lo fija
      // ese spike.
      if (db >= -1) {
        this.saturaciones.set(canal, (this.saturaciones.get(canal) ?? 0) + 1);
      }
    }
    for (const cb of this.oyentesTelemetria) cb();
  }

  private revisarCadenciaVu(): void {
    if (this._estadoConexion === 'DISCONNECTED') return;
    if (this.ultimaTramaVuMs === null) return;
    const hueco = this.ahora() - this.ultimaTramaVuMs;
    if (hueco > this.umbralHuecoVuMs && this._estadoConexion === 'CONNECTED') {
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
