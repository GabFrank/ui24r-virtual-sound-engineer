import { MEDIDOR_RANGO_DB } from './protocol.ts';

/**
 * Retención de picos con caída, como la dibuja la consola.
 *
 * **Por qué esto existe y no es simplemente un máximo.** Medido el 2026-09-09:
 * la consola manda el nivel **instantáneo** y la balística la dibuja su propio
 * cliente. Cinco ráfagas de tono dieron subida por debajo de la resolución de
 * las tramas —44 ms— y caída de 20 dB en 37 ms de mediana. O sea que lo que el
 * operador ve suavizado en la pantalla de la consola no viene del aparato: lo
 * calcula el navegador.
 *
 * Eso convierte nuestra retención de picos en una decisión de producto, no en
 * algo heredado. Antes guardábamos el máximo absoluto hasta que alguien tocaba
 * «Reiniciar picos», que responde una pregunta distinta —«¿este canal pegó
 * fuerte alguna vez?»— y no se parece a nada de lo que muestra la consola.
 *
 * **La ley de caída de la consola no es la que estaba acá, y tampoco es
 * constante.** El `/2` que se había copiado sale de la rama
 * `if (!this.globalEnabled())` de `setValueExt`, o sea la del widget que **no**
 * está visible. La rama viva usa `GLOBAL_PEAK_FALL_SPEED = GLOBAL_VU_FALL_SPEED
 * / 10 = 0.001` y **acelera**: `pFallVelocity += GLOBAL_PEAK_FALL_ACC` en cada
 * cuadro, así que arranca en ~4,8 dB/s y se va duplicando.
 *
 * Lo que sigue acá es una **caída constante**, que es una simplificación
 * nuestra y no la consola. Se declara como tal en vez de disfrazarla: la
 * balística del pico ya era una decisión de producto —la consola manda el
 * nivel instantáneo—, y una rampa constante es más fácil de explicar al
 * operador que una que acelera. Si algún día se quiere reproducir la de la
 * consola, la fórmula está acá arriba.
 *
 * **La traducción a tiempo real es nuestra, y conviene saberlo.** La consola
 * cuenta por cuadros de animación; nosotros no dibujamos a 60 Hz, así que la
 * caída se expresa en decibeles por segundo suponiendo esa cadencia. Si algún
 * día se mide la caída real contra el aparato, este número se ajusta acá y la
 * pantalla lo sigue sola.
 */

/** Cuadros por segundo que supone la traducción. Es una suposición, no una medición. */
const CUADROS_POR_SEGUNDO = 60;

/** Caída del pico, en decibeles por segundo. */
export const CAIDA_PICO_DB_POR_S =
  (0.01 / 2) * CUADROS_POR_SEGUNDO * MEDIDOR_RANGO_DB;

/**
 * Cuánto se sostiene el pico antes de empezar a caer.
 *
 * `CLIP_HOLD_TIME = PEAK_HOLD_TIME = 3E3` en la consola: **tres segundos**.
 *
 * **Acá hubo un error de factor mil, y lo que lo hizo sobrevivir no fue el
 * número sino el comentario.** Estaba escrito «`PEAK_HOLD_TIME = 3` en la
 * consola; es tan corto que en la práctica el pico empieza a caer de
 * inmediato». Esa frase *explica* el valor equivocado y le da al que lee una
 * razón para no dudar, que es peor que copiarlo mal a secas.
 *
 * Y el validador de cifras no podía atraparlo: compara el código contra una
 * tabla del mismo repositorio, así que con los dos diciendo 3 pasaba en verde.
 * Un error de lectura de la fuente es invisible para una comprobación de
 * coherencia interna.
 */
export const RETENCION_PICO_MS = 3000;

/** El pico de un canal: su valor y desde cuándo no sube. */
export interface Pico {
  readonly db: number;
  readonly desdeMs: number;
}

/**
 * El pico nuevo a partir del anterior y de la lectura de esta trama.
 *
 * Si la lectura supera al pico, el pico salta y se reinicia la retención. Si
 * no, cae con el tiempo transcurrido —nunca por debajo de la lectura actual,
 * que sería mostrar menos señal de la que hay.
 */
export function actualizarPico(
  anterior: Pico | undefined,
  db: number,
  ahoraMs: number,
): Pico {
  if (anterior === undefined || db >= anterior.db) return { db, desdeMs: ahoraMs };

  const sostenidoMs = ahoraMs - anterior.desdeMs;
  if (sostenidoMs <= RETENCION_PICO_MS) return anterior;

  const caidoDb = ((sostenidoMs - RETENCION_PICO_MS) / 1000) * CAIDA_PICO_DB_POR_S;
  const bajado = anterior.db - caidoDb;
  // El pico nunca baja por debajo de la señal presente: sería dibujar una
  // marca de máximo por debajo de la barra que la produjo.
  return bajado <= db ? { db, desdeMs: ahoraMs } : { db: bajado, desdeMs: ahoraMs };
}
