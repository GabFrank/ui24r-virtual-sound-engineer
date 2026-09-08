import { Injectable, inject } from '@angular/core';
import { Registro, SumideroConsola } from '@vse/logging';

/**
 * El registro de la aplicación.
 *
 * Todo lo que hace está en `@vse/logging`: acá solo se le pone la ficha de
 * inyección y el sumidero de consola, que es el único que funciona antes de
 * que el almacén esté abierto. El persistente se agrega en el arranque, cuando
 * ya hay dónde guardar.
 *
 * Se re-exportan los tipos para que el resto de la aplicación no tenga que
 * saber de qué paquete vienen.
 */
export type { LogCategory, LogEvent, LogLevel, LogSink } from '@vse/logging';

@Injectable({ providedIn: 'root' })
export class Logger extends Registro {
  constructor() {
    super();
    this.agregarSink(new SumideroConsola());
  }
}

export const inyectarLogger = () => inject(Logger);
