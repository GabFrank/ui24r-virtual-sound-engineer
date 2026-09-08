import { type LogCategory, type LogEvent, type LogLevel, type LogSink } from './tipos.ts';

/**
 * El registro. Reparte cada evento entre sus sumideros.
 *
 * No sabe dónde se guarda nada: eso lo deciden los sumideros que se le
 * agreguen. Así el mismo registro sirve en el navegador, en la tablet y en un
 * test, y cambiar el destino no toca a quien registra.
 */
export class Registro {
  private sinks: LogSink[] = [];
  private sessionId: string | null = null;

  agregarSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  fijarSesion(sessionId: string | null): void {
    this.sessionId = sessionId;
  }

  private emitir(
    category: LogCategory,
    level: LogLevel,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    const e: LogEvent = {
      ts: new Date().toISOString(),
      sessionId: this.sessionId,
      category,
      level,
      event,
      payload,
    };
    for (const s of this.sinks) {
      // Un sumidero roto no puede dejar sin registro a los demás ni interrumpir
      // a quien estaba registrando. Se avisa por consola y se sigue con el
      // siguiente: usar el propio registro acá sería una recursión.
      try {
        s.escribir(e);
      } catch (err) {
        console.warn('un sumidero de registro falló y se lo salteó', err);
      }
    }
  }

  debug(c: LogCategory, event: string, payload: Record<string, unknown> = {}): void {
    this.emitir(c, 'debug', event, payload);
  }
  info(c: LogCategory, event: string, payload: Record<string, unknown> = {}): void {
    this.emitir(c, 'info', event, payload);
  }
  warn(c: LogCategory, event: string, payload: Record<string, unknown> = {}): void {
    this.emitir(c, 'warn', event, payload);
  }
  error(c: LogCategory, event: string, payload: Record<string, unknown> = {}): void {
    this.emitir(c, 'error', event, payload);
  }

  /**
   * Registro de una escritura a la consola. Campos obligatorios por INV-022.
   * Un cambio sin valor previo leído de la consola es un error de programación,
   * no un caso que este método deba tolerar.
   */
  escritura(datos: {
    transactionId: string;
    path: string;
    unidad: string;
    previous: number;
    expected: number;
    sent: number;
    ack: 'ECHO' | 'VU' | 'TIMEOUT' | 'NONE';
    verified: boolean;
  }): void {
    this.emitir('transaction', 'info', 'write', { ...datos });
  }
}
