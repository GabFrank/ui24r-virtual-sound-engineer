import { MEDIDOR_RANGO_DB, MEDIDOR_SATURACION, dbDeMedidor } from '@vse/mixer-adapter';

/**
 * Escala del medidor visual, copiada de la consola.
 *
 * Vive fuera del componente porque es aritmética pura y así se prueba con
 * `node --test`, sin montar Angular. El componente solo la consulta.
 *
 * **De dónde sale.** La Ui24R dibuja la barra de su medidor con `c = h * value`
 * —altura proporcional a la posición normalizada— y coloca las marcas de su
 * escala con `-dB * h / VU_RANGE`, con `VU_RANGE = 80`. Las dos cosas juntas
 * dicen que la barra es **lineal en decibeles entre −80 y 0**, y son las mismas
 * dos líneas de las que sale `dbDeMedidor` en el adaptador.
 *
 * Antes esta escala era propia: piso en −60 dB y `pow(norm, 0.65)`, con un
 * comentario que decía expandir la zona de −20 a 0 «a más de la mitad del
 * recorrido». No la expandía: la dejaba en el 23 %, porque un exponente menor
 * que uno comprime arriba y estira abajo, justo al revés de lo que el
 * comentario afirmaba. Lo que hacía en realidad era aproximarse a la recta de
 * la consola por encima de −40 dB y cortar de golpe por debajo de −60: los
 * veinte decibeles más bajos de la escala, que la consola sí dibuja, eran una
 * barra vacía.
 *
 * Que las dos barras coincidan no es cosmética. El usuario mira la tablet y la
 * consola en la misma pasada; si el mismo canal ocupa distinta fracción en cada
 * una, no puede comparar, que es lo único para lo que sirve tener el número de
 * la consola en vez de un dBFS nuestro.
 */

/** Fondo de la escala: −80 dB. Por debajo la consola no dibuja nada. */
export const PISO_DB = -MEDIDOR_RANGO_DB;

/**
 * Punta de la escala, donde la consola enciende su indicador de saturación.
 *
 * Sale de `MEDIDOR_SATURACION` y no de un −1 escrito a mano, que es lo que
 * había acá. El adaptador cuenta un evento de saturación con esa misma regla:
 * si la barra se pintara de rojo en otro punto, la pantalla diría «saturando»
 * junto a una cuenta de saturaciones en cero, y una de las dos estaría
 * mintiendo.
 */
export const UMBRAL_SATURACION_DB = dbDeMedidor(MEDIDOR_SATURACION);

/**
 * Desde acá la barra avisa en ámbar.
 *
 * **No está medido.** Es el margen que el proyecto viene tratando como
 * cómodo —los perfiles de canal piden entre 8 y 14 dB— y ningún spike dijo
 * todavía cuánto margen hace falta de verdad. Se deja donde estaba porque
 * moverlo sería cambiar un número por otro igual de supuesto; lo que sí cambió
 * es que ahora se mide contra la punta real de la escala.
 */
export const UMBRAL_RIESGO_DB = -12;

/**
 * Fracción de la barra, en porcentaje, para un nivel en dB.
 *
 * Es `c = h * value` de la consola, despejado a partir de los decibeles: la
 * posición normalizada vuelve a salir de la recta del medidor.
 */
export function porcentajeDeDb(db: number): number {
  if (!Number.isFinite(db) || db <= PISO_DB) return 0;
  const acotado = Math.min(UMBRAL_SATURACION_DB, db);
  return Math.round(((acotado - PISO_DB) / (UMBRAL_SATURACION_DB - PISO_DB)) * 100);
}
