/**
 * Transporte hacia la consola.
 *
 * Se abstrae para que el adaptador se pueda ejercitar contra un simulador sin
 * cambiar una línea. Ojo con lo que eso significa: el simulador reproduce
 * **nuestras suposiciones** sobre el protocolo. Que el adaptador funcione
 * contra él prueba que la lógica de la aplicación es correcta, no que el
 * protocolo sea como creemos. Eso solo lo prueban los spikes con la consola
 * real.
 */

import {
  ALIVE_INTERVALO_MS, MENSAJE_ALIVE, despojarSocketIo,
} from './protocol.ts';

export interface Transport {
  conectar(url: string): Promise<void>;
  desconectar(): Promise<void>;
  /** Envía una línea cruda del protocolo. */
  enviar(linea: string): void;
  /** Mensajes entrantes. Es la única fuente del estado confirmado. */
  alRecibir(cb: (linea: string) => void): () => void;
  alAbrir(cb: () => void): () => void;
  alCerrar(cb: (motivo: string) => void): () => void;
  readonly conectado: boolean;
}

/**
 * Resuelve la dirección del WebSocket de una Ui24R a partir de su máquina.
 *
 * **Por qué hace falta una función y no alcanza con guardar una URL.** La
 * consola habla socket.io 0.9. Antes de abrir el WebSocket hay que pedir por
 * HTTP un identificador de sesión:
 *
 * ```
 * $ curl "http://192.168.0.49/socket.io/1/"
 * 10454688205293084044:5:5:websocket
 * ```
 *
 * El formato es `<sesión>:<latido>:<cierre>:<transportes>` y la dirección real
 * queda `ws://<máquina>/socket.io/1/websocket/<sesión>`. **Ese identificador es
 * de un solo uso**: hay que pedir uno nuevo en cada conexión, y por lo tanto
 * también en cada reconexión.
 *
 * Consecuencia directa, y por eso esto no es un detalle interno: el campo
 * «Dirección» de Ajustes **no puede guardar una dirección estable**. Lo
 * anticipaba el propio comentario de `validarUrlDeConsola`: «cuando el spike
 * cierre, se podrá derivar la ruta y este campo pasará a pedir solo la
 * máquina». El spike cerró el 2026-09-08.
 *
 * Dos avisos sobre lo que el apretón de manos dice:
 *
 * - **El único transporte es `websocket`.** No hay reserva por sondeo.
 * - **El latido que declara es mentira.** Dice 5 segundos y la consola manda
 *   `2::` cada ~66 ms. No usar ese número para decidir si la conexión cayó.
 */
export async function resolverDireccionUi24r(
  maquina: string,
  buscar: typeof fetch = fetch,
): Promise<string> {
  const limpia = maquina.trim().replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  const respuesta = await buscar(`http://${limpia}/socket.io/1/`);
  if (!respuesta.ok) {
    throw new Error(
      `la consola en ${limpia} respondio ${respuesta.status} al apreton de manos`,
    );
  }
  const cuerpo = (await respuesta.text()).trim();
  const sesion = cuerpo.split(':')[0];
  if (!sesion) {
    throw new Error(`apreton de manos ininteligible desde ${limpia}: ${JSON.stringify(cuerpo)}`);
  }
  return `ws://${limpia}/socket.io/1/websocket/${sesion}`;
}

/** Transporte sobre WebSocket, que es lo que habla la consola. */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private recibir: ((linea: string) => void)[] = [];
  private abrir: (() => void)[] = [];
  private cerrar: ((motivo: string) => void)[] = [];
  private latido: ReturnType<typeof setInterval> | null = null;

  get conectado(): boolean {
    return this.ws?.readyState === 1;
  }

  conectar(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        this.arrancarLatido();
        for (const cb of this.abrir) cb();
        resolve();
      };
      ws.onerror = () => reject(new Error(`no se pudo conectar a ${url}`));
      ws.onclose = (e) => {
        this.detenerLatido();
        for (const cb of this.cerrar) cb(e.reason || 'cerrado');
      };
      ws.onmessage = (e) => {
        // Se quita el envoltorio de socket.io antes de entregar nada. Una trama
        // puede traer varias líneas separadas por \n, y también puede no traer
        // ninguna: el latido y la confirmación de conexión no son protocolo.
        const trama = despojarSocketIo(String(e.data));
        for (const linea of trama.lineas) {
          for (const cb of this.recibir) cb(linea);
        }
      };
    });
  }

  /**
   * Arranca el `ALIVE` periódico.
   *
   * Se llama al abrir. Sin esto la consola deja de emitir a los pocos segundos,
   * y el síntoma no es una desconexión sino un silencio: el socket sigue
   * abierto y no llega nada. Medido el 2026-09-08.
   */
  private arrancarLatido(): void {
    this.detenerLatido();
    this.latido = setInterval(() => {
      if (this.conectado) this.enviar(MENSAJE_ALIVE);
    }, ALIVE_INTERVALO_MS);
  }

  private detenerLatido(): void {
    if (this.latido !== null) {
      clearInterval(this.latido);
      this.latido = null;
    }
  }

  async desconectar(): Promise<void> {
    this.detenerLatido();
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Envía una línea de protocolo, envuelta como socket.io 0.9.
   *
   * **Faltaba el envoltorio también en esta dirección.** Se mandaba la línea
   * pelada, y la consola no la entiende: espera `3:::ALIVE`, no `ALIVE`. El
   * síntoma habría sido de los peores — el socket abierto, el estado llegando,
   * y ninguna de nuestras líneas surtiendo efecto, incluido el `ALIVE` sin el
   * cual la consola se calla a los pocos segundos.
   */
  enviar(linea: string): void {
    if (!this.conectado) throw new Error('transporte no conectado');
    this.ws!.send(`3:::${linea}`);
  }

  alRecibir(cb: (linea: string) => void): () => void {
    this.recibir.push(cb);
    return () => { this.recibir = this.recibir.filter((f) => f !== cb); };
  }
  alAbrir(cb: () => void): () => void {
    this.abrir.push(cb);
    return () => { this.abrir = this.abrir.filter((f) => f !== cb); };
  }
  alCerrar(cb: (motivo: string) => void): () => void {
    this.cerrar.push(cb);
    return () => { this.cerrar = this.cerrar.filter((f) => f !== cb); };
  }
}

/**
 * Transporte para una Ui24R real: resuelve la dirección en cada conexión.
 *
 * `WebSocketTransport` recibe una URL y la abre, que es lo correcto contra el
 * simulador. Contra la consola real no alcanza, porque **el identificador de
 * sesión se agota al usarlo**: reconectar con la misma URL falla siempre.
 *
 * Por eso este transporte recibe la **máquina** —`192.168.0.49`, o un nombre—
 * y hace el apretón de manos cada vez que se conecta. Es lo que hace que la
 * reconexión funcione, y no un envoltorio de conveniencia.
 */
export class Ui24rTransport extends WebSocketTransport {
  private readonly buscar: typeof fetch;

  constructor(buscar: typeof fetch = fetch) {
    super();
    this.buscar = buscar;
  }

  override async conectar(maquina: string): Promise<void> {
    const url = await resolverDireccionUi24r(maquina, this.buscar);
    await super.conectar(url);
  }
}
