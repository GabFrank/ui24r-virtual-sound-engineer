/**
 * Registro estructurado. Implementa INV-022 y `docs/logging.md`.
 *
 * Es un paquete propio y no una clase dentro de la aplicación porque lo
 * difícil del registro no es escribir la línea: es el sumidero persistente
 * —con su cola, su volcado y su purga— y eso hay que poder probarlo sin
 * Angular, sin Android y sin esperar a que se llene una tabla.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'mixer' | 'audio' | 'safety' | 'transaction' | 'ui' | 'system';

export interface LogEvent {
  readonly ts: string;
  readonly sessionId: string | null;
  readonly category: LogCategory;
  readonly level: LogLevel;
  readonly event: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface LogSink {
  /**
   * Recibe un evento.
   *
   * Es síncrono y no puede lanzar: quien registra está en mitad de otra cosa
   * —una escritura a la consola, un arranque— y un sumidero que falla no puede
   * llevarse por delante lo que se estaba registrando. Los sumideros que
   * escriben en algún sitio encolan acá y vuelcan aparte.
   */
  escribir(evento: LogEvent): void;
}

/** Orden de gravedad, para poder filtrar «warn y peor». */
export const ORDEN_NIVEL: Readonly<Record<LogLevel, number>> = {
  debug: 0, info: 1, warn: 2, error: 3,
};
