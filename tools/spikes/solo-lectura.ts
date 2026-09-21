/**
 * Un guion que **pregunta** y no puede escribir, aunque se equivoque quien lo
 * escriba.
 *
 * **De dónde sale.** La guarda de `restauracion-garantizada.test.ts` marca como
 * «escribe a la consola» a cualquier guion que use `.enviar(`, y lo hace a
 * propósito: el filtro anterior reconocía el modismo `enviar(codificarSetd(`, y
 * **32 guiones escribían de otras formas** sin que nadie los contara. Un
 * detector que reconoce un modismo cuenta lo que sabe buscar, no lo que pasa.
 *
 * Pero el protocolo de esta consola también tiene órdenes que **piden datos**
 * —listar preajustes, leer uno, listar shows— y un guion hecho sólo de ésas no
 * deja nada escrito: envolverlo en una restauración que no restaura nada sería
 * cumplir la forma de la guarda y no su motivo.
 *
 * **La salida no es aflojar el detector: es hacer que no haga falta confiar.**
 * Este módulo es el único punto por el que esos guiones hablan, y **rechaza todo
 * lo que no esté en la lista blanca de órdenes de lectura**. Así la exención de
 * la guarda no descansa en que quien escribió el guion se haya portado bien,
 * sino en que el camino alternativo **no puede** escribir.
 *
 * Es la misma forma que ya tiene la exención de `restaurar.ts`: una línea con su
 * razón escrita, que alguien puede revisar, en vez de un criterio estructural
 * que cualquiera esquiva sin proponérselo.
 */

/** Lo mínimo que este módulo necesita de un cliente: mandar una línea. */
export interface Transporte {
  enviar(linea: string): void;
}

/**
 * Las órdenes que sólo piden datos, con la categoría o el nombre como
 * argumentos. Ninguna cambia una clave de la consola.
 *
 * **La lista se amplía a mano y con motivo.** Agregar una orden acá es afirmar
 * que no escribe, así que va con la evidencia de dónde se leyó eso — el cliente
 * que sirve la propia consola, o una medición.
 */
export const ORDENES_DE_LECTURA: ReadonlySet<string> = new Set([
  // Preajustes: listar una categoría y leer el contenido de uno.
  // `mixer.html`, objeto `PRESETS`: `list` y `read` sólo piden.
  'PRESETLIST',
  'READPRESET',
  // Shows, instantáneas y cues: las tres listas.
  'SHOWLIST',
  'SNAPSHOTLIST',
  'CUELIST',
  // Reproductor: listas y pistas.
  'PLISTS',
  'PLIST_TRACKS',
  // Medios montados.
  'USBMOUNTS',
]);

/** Lo que devuelve `soloLectura`: se pregunta, no se envía. */
export interface Lector {
  pedir(orden: string): void;
}

/**
 * Envuelve un transporte y deja pasar **sólo** órdenes de lectura.
 *
 * Rechaza lanzando, no devolviendo falso: un guion que pida algo que no
 * corresponde tiene que **morir**, no seguir con una medición a medias. Y lanzar
 * es lo que pide `con-restauracion.ts` para abortar, así que las dos piezas
 * combinan sin sorpresas.
 */
export function soloLectura(t: Transporte): Lector {
  return {
    pedir(orden: string): void {
      const cabeza = orden.split('^')[0] ?? '';
      if (!ORDENES_DE_LECTURA.has(cabeza)) {
        throw new Error(
          `Esta conexión es de sólo lectura y "${cabeza}" no está en la lista de órdenes que piden datos. `
          + `Se esperaba una de: ${[...ORDENES_DE_LECTURA].join(', ')}. `
          + `Si el guion tiene que escribir, no puede usar soloLectura: usá conRestauracion.`,
        );
      }
      t.enviar(orden);
    },
  };
}
