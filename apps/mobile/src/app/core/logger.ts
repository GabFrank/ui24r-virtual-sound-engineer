import { Injectable, inject } from '@angular/core';

/**
 * Registro estructurado. Implementa INV-022 y docs/logging.md.
 *
 * Está en el núcleo y no como un detalle, porque la invariante exige que toda
 * escritura a la consola quede registrada con su valor previo, el esperado, el
 * enviado y cómo se confirmó. Sin ese registro no se puede reconstruir qué
 * pasó en un show, que es justo cuando hace falta.
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
  escribir(evento: LogEvent): void;
}

/** Salida por consola. En producción se suma la persistente. */
export class ConsoleSink implements LogSink {
  escribir(e: LogEvent): void {
    const linea = `[${e.ts}] ${e.category}/${e.level} ${e.event}`;
    if (e.level === 'error') console.error(linea, e.payload);
    else if (e.level === 'warn') console.warn(linea, e.payload);
    else console.log(linea, e.payload);
  }
}

@Injectable({ providedIn: 'root' })
export class Logger {
  private sinks: LogSink[] = [new ConsoleSink()];
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
    for (const s of this.sinks) s.escribir(e);
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

export const inyectarLogger = () => inject(Logger);
