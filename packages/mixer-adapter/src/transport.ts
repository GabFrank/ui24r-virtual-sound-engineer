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

/** Transporte sobre WebSocket, que es lo que habla la consola. */
export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private recibir: ((linea: string) => void)[] = [];
  private abrir: (() => void)[] = [];
  private cerrar: ((motivo: string) => void)[] = [];

  get conectado(): boolean {
    return this.ws?.readyState === 1;
  }

  conectar(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => {
        for (const cb of this.abrir) cb();
        resolve();
      };
      ws.onerror = () => reject(new Error(`no se pudo conectar a ${url}`));
      ws.onclose = (e) => {
        for (const cb of this.cerrar) cb(e.reason || 'cerrado');
      };
      ws.onmessage = (e) => {
        // La consola puede mandar varias líneas en un solo marco.
        for (const linea of String(e.data).split('\n')) {
          if (linea.length > 0) for (const cb of this.recibir) cb(linea);
        }
      };
    });
  }

  async desconectar(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  enviar(linea: string): void {
    if (!this.conectado) throw new Error('transporte no conectado');
    this.ws!.send(linea);
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
