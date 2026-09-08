import type { LogEvent, LogSink } from './tipos.ts';

/** Salida por consola. En el dispositivo se le suma la persistente. */
export class SumideroConsola implements LogSink {
  escribir(e: LogEvent): void {
    const linea = `[${e.ts}] ${e.category}/${e.level} ${e.event}`;
    if (e.level === 'error') console.error(linea, e.payload);
    else if (e.level === 'warn') console.warn(linea, e.payload);
    else console.log(linea, e.payload);
  }
}
