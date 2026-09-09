/**
 * Tomar prestado el analizador y devolverlo como estaba.
 *
 * `var.rta` elige qué canal mira el analizador de espectro y es **global**: una
 * sola variable de la consola, no una por cliente. Escribirla le cambia la
 * pantalla al operador, en vivo y sin avisar (R-28).
 *
 * **Por qué existe este ayudante y no está copiado en cada sonda.** Las tres
 * sondas del analizador restauraban a cadena vacía, que es una *reconstrucción*
 * y no el valor que había. La regla de la fase de mediciones —anotar el valor
 * anterior antes de tocar— se cumplía de palabra y no de hecho, y en la única
 * clave del proyecto que le cambia la pantalla a otra persona.
 *
 * Medido el 2026-09-09: `var.rta` **sí llega en el volcado**, como
 * `SETS^var.rta^` con el valor vacío. Una nota anterior decía que la clave no
 * existía y estaba equivocada. Que llegue es lo que importa: se puede leer, así
 * que se lee.
 *
 * Lo que no se puede saber hoy: si el vacío es el estado de fábrica o quedó así
 * porque una sesión anterior lo dejó vacío al «restaurar». Por eso este ayudante
 * guarda lo que lee, sea lo que sea, en vez de suponer cuál es el reposo.
 */
import type { Ui24rTransport } from '@vse/mixer-adapter';

export interface AnalizadorPrestado {
  /** Lo que había antes de tocar nada. `undefined` si la clave no llegó. */
  readonly anterior: string | undefined;
  /** Apunta el analizador a una fuente. */
  apuntarA(fuente: string): void;
  /** Devuelve la fuente a como estaba. Idempotente. */
  devolver(): void;
}

/**
 * Empieza a escuchar `var.rta` **antes** de que llegue el volcado.
 *
 * Hay que llamarlo antes de `conectar()`: el valor viaja una sola vez, dentro
 * del volcado inicial, y quien se suscriba después no lo ve nunca.
 */
export function tomarAnalizador(t: Ui24rTransport): AnalizadorPrestado {
  let anterior: string | undefined;
  t.alRecibir((linea) => {
    if (!linea.startsWith('SETS^var.rta^')) return;
    // Solo la primera: las siguientes son nuestras propias escrituras rebotando
    // por otros clientes, y guardarlas seria restaurar a lo que nosotros mismos
    // pusimos.
    if (anterior === undefined) anterior = linea.slice('SETS^var.rta^'.length);
  });

  return {
    get anterior(): string | undefined { return anterior; },
    apuntarA(fuente: string): void {
      t.enviar(`SETS^var.rta^${fuente}`);
    },
    devolver(): void {
      // Si nunca llegó, no se inventa: dejarlo como está es menos dañino que
      // escribir un valor que nadie leyó.
      if (anterior === undefined) {
        console.error('AVISO: var.rta no llego en el volcado, no se restaura nada.');
        return;
      }
      t.enviar(`SETS^var.rta^${anterior}`);
    },
  };
}
