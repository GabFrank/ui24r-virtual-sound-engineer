/**
 * De qué previo viene cada canal, en vez de darlo por hecho.
 *
 * **El defecto que esto cierra.** El adaptador armaba `hw.${canal-1}.gain`, o
 * sea suponía que el canal N usa el previo N. Con el enrutamiento de fábrica
 * es cierto y por eso nunca se notó: es la misma trampa que el error de base
 * cero, que coincidía consigo mismo hasta que dejó de hacerlo. Si alguien
 * repatchea, la aplicación lee —y en nivel ASISTIDO escribiría— la ganancia de
 * un previo que ese canal no usa. Está anotado como R-24.
 *
 * **Lo que dice la consola, medido el 2026-09-09.** `i.N.src` no es un
 * enumerado opaco: es una ruta, y se lee sola.
 *
 *     i.N.src  ->  hw.0 … hw.19   en los canales 1 a 20
 *                  none           en los canales 21 a 24
 *
 * `none` es un canal sin previo —las entradas de línea y de medios—: no hay
 * ganancia que ajustar, y la aplicación ya lo mostraba como «Ganancia —» sin
 * saber por qué.
 *
 * **`src` no acepta escritura por `SETD`.** Medido el 2026-09-09: se probó con
 * `none`, `hw.0`, `usb.4`, `p.0`, `ua.4` y `l.0` sobre `i.4` y el testigo no
 * vio ninguna. En la misma corrida y por el mismo socket, las escrituras a
 * `stereoIndex` sí se vieron todas, así que no era el testigo fallando.
 *
 * Eso acota R-24: el enrutamiento se puede **leer** pero no cambiar por este
 * camino, así que la aplicación no puede repatchear ni por error ni a
 * propósito. Quien repatchee lo hace desde la consola.
 */

/** La ruta de la ganancia del previo que alimenta a un canal, si tiene uno. */
export function rutaDeGanancia(fuente: string | undefined): string | null {
  // **Sin dato no se adivina.** Volver a `hw.${canal-1}` como respaldo sería
  // reintroducir la suposición justo en el caso en que no se puede comprobar,
  // y en silencio. Mientras no haya llegado el `src` del canal, la ganancia se
  // informa como desconocida, que es lo que efectivamente es: durante el
  // volcado dura milisegundos, y después de una avalancha es la verdad.
  if (fuente === undefined) return null;
  if (!ES_PREVIO.test(fuente)) return null;
  return `${fuente}.gain`;
}

/**
 * Qué fuentes cuentan como previo.
 *
 * Se acepta la familia `hw.N` y nada más. `none` cae por acá, y también
 * cualquier valor que la consola empiece a mandar y que no sepamos leer:
 * preferimos no informar ganancia antes que informar la de otra cosa.
 */
const ES_PREVIO = /^hw\.\d+$/;

/**
 * Si el canal está reproduciendo una pista grabada en vez de su entrada.
 *
 * **Con el soundcheck virtual encendido, la ganancia del previo no afecta lo
 * que suena.** El canal reproduce lo que se grabó, así que mover la perilla no
 * cambia nada de lo que el operador escucha. Un consejo de ganancia ahí no es
 * impreciso: **es inaplicable**, y decirlo de otra manera manda al usuario a
 * mover algo que no hace nada.
 *
 * Hacen falta las dos cosas: el modo encendido —`var.mtk.soundcheck`, que es
 * global— y que el canal tenga una pista asignada —`i.N.scsrc`, que apunta a
 * `ua.N` o `ub.N`—. Con el modo apagado la pista sigue asignada y no se usa,
 * así que mirar solo `scsrc` daría un falso positivo permanente: en esta
 * consola los 24 canales tienen una.
 */
export function tomaPistaGrabada(
  soundcheckEncendido: boolean,
  scsrc: string | undefined,
): boolean {
  if (!soundcheckEncendido) return false;
  return scsrc !== undefined && scsrc !== '' && scsrc !== 'none';
}
