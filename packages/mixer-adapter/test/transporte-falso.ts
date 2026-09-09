import type { Transport } from '../src/transport.ts';

/**
 * Un transporte que no habla con nadie: las líneas las inyecta el test.
 *
 * Alcanza para probar el despacho del adaptador —a quién le avisa cada tipo de
 * trama, y qué ruta lee para cada canal— sin consola ni simulador. Contra el
 * simulador estas pruebas no servirían: el simulador cargaba la misma
 * suposición equivocada sobre los índices, y los dos errores se cancelaban.
 */
export class TransporteFalso implements Transport {
  private recibir: ((linea: string) => void) | null = null;
  conectado = false;

  async conectar(): Promise<void> { this.conectado = true; }
  async desconectar(): Promise<void> { this.conectado = false; }
  enviar(): void { /* estas pruebas no escriben */ }
  alRecibir(cb: (linea: string) => void): () => void {
    this.recibir = cb;
    return () => { this.recibir = null; };
  }
  alAbrir(): () => void { return () => {}; }
  alCerrar(): () => void { return () => {}; }

  /** Mete una línea como si viniera de la consola. */
  entra(linea: string): void { this.recibir?.(linea); }
}
