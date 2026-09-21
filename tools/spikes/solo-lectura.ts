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
 * Este módulo es el punto por el que esos guiones hablan, y **rechaza todo lo que
 * no esté en la lista blanca de órdenes de lectura**. Así la exención de la
 * guarda no descansa en que quien escribió el guion se haya portado bien, sino en
 * que por este camino no se puede escribir.
 *
 * Es la misma forma que ya tiene la exención de `restaurar.ts`: una línea con su
 * razón escrita, que alguien puede revisar, en vez de un criterio estructural
 * que cualquiera esquiva sin proponérselo.
 *
 * **Y acá va lo que esta garantía NO cubre, porque la primera redacción prometió
 * de más y una auditoría lo rompió por dos caminos el mismo día.**
 *
 * - **Decía «el camino alternativo no puede escribir», y eso es falso si se lee
 *   como una propiedad del guion.** Es una propiedad de **este módulo**: un guion
 *   que use `soloLectura` para leer y además hable con el socket por otro lado
 *   --`c.ws.send(...)`, `c['enviar'](...)`, una referencia guardada-- escribe
 *   igual. La guarda que lo detectaría busca `.enviar(` por texto, y esas tres
 *   formas no coinciden. La debilidad del detector es anterior a este módulo; lo
 *   que este comentario corrige es la promesa que se apoyaba en él.
 * - **La primera versión miraba sólo hasta el primer `^` y dejaba pasar un salto
 *   de línea**, así que `PRESETLIST^ch\nSETD^...` viajaba entero al cable. El
 *   protocolo de bajada es multi-orden por salto de línea --`cliente.ts` parte el
 *   payload por `\n`--, así que suponer que el de subida no lo es sería
 *   exactamente la clase de suposición que este repositorio no se permite. Hoy se
 *   rechaza cualquier carácter de control.
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
  // Reproductor: listas y pistas. **Las órdenes de pedido no se llaman como la
  // respuesta**, y la primera versión de esta lista puso los nombres de la
  // respuesta --`PLISTS`, `PLIST_TRACKS`--, con lo que un guion que pidiera las
  // listas del reproductor habría sido rechazado y las dos órdenes de verdad no
  // estaban. Lo encontró una auditoría; los nombres salen de `E_COMMANDS` en
  // `mixer.html`.
  'MEDIA_GET_PLISTS',
  'MEDIA_GET_PLIST_TRACKS',
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
      // **Una orden es UNA orden.** Un salto de línea acá son dos órdenes en el
      // cable, y la segunda no la mira nadie. Se rechaza todo carácter de
      // control, no sólo el salto: el criterio es «lo que no es texto de una
      // línea», no una lista de los caracteres que a uno se le ocurrieron.
      // eslint-disable-next-line no-control-regex
      if (/[\u0000-\u001f\u007f]/.test(orden)) {
        throw new Error(
          'Una orden de sólo lectura no puede traer caracteres de control: un salto de línea '
          + 'son dos órdenes en el cable. Se esperaba una sola orden en una sola línea.',
        );
      }
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
