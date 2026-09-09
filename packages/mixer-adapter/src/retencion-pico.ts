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
 * Las constantes salen del `mixer.html`: `GLOBAL_VU_FALL_SPEED = 0.01` en
 * unidades de posición por cuadro de animación, aplicada al pico como la mitad
 * —`pFallVelocity = GLOBAL_VU_FALL_SPEED / 2`— después de `PEAK_HOLD_TIME`.
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
 * `PEAK_HOLD_TIME = 3` en la consola. Es tan corto que en la práctica el pico
 * empieza a caer de inmediato; se respeta el número igual, en vez de
 * redondearlo a cero, porque es el que está escrito del otro lado.
 */
export const RETENCION_PICO_MS = 3;

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
