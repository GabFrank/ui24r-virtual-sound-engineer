/**
 * Conversiones entre el valor crudo del protocolo y unidades físicas.
 *
 * **Ninguna está verificada contra la consola.** La matriz de capacidades da
 * por CONFIRMADO que el parámetro existe y cuál es su rango; la *forma* de la
 * curva entre 0 y 1 la mide SPK-P0.2a y todavía no se midió. Están todas acá,
 * juntas y marcadas, por dos motivos: para que se reemplacen de una vez cuando
 * llegue la medición, y para que nadie las confunda con un dato.
 *
 * La regla del proyecto es no implementar sobre un parámetro que ningún spike
 * verificó. Estas funciones existen igual porque la telemetría tiene que
 * mostrar algo, pero lo que muestran es una estimación y la interfaz tiene que
 * decirlo: por eso `VERIFICADO_CONTRA_CONSOLA` es un valor exportado y no un
 * comentario.
 */

/**
 * Si las curvas fueron medidas contra una consola real.
 *
 * Lo consulta la interfaz para marcar las lecturas como aproximadas. Pasa a
 * `true` cuando SPK-P0.2a deje su evidencia, y no antes.
 */
export const VERIFICADO_CONTRA_CONSOLA = false;

/** Extremos de la conversión del fader, en dB. */
export const FADER_DB_MAXIMO = 10;
export const FADER_DB_MINIMO = -90;

/** Pendiente de la curva del fader. Provisional: la mide SPK-P0.2a. */
const PENDIENTE_FADER = 2.2;

/**
 * Valor del fader (0 a 1) a dB.
 *
 * Solo el cero es silencio. La versión anterior devolvía `-Infinity` para todo
 * lo que estuviera por debajo de 0,0625 mientras la fórmula, justo encima de
 * ese punto, daba −43 dB: un salto de 47 dB en un movimiento imperceptible del
 * fader, y una lectura que pasaba de «bajo» a «apagado» sin nada en medio. El
 * corte no describía ninguna característica de la consola; era el resto de un
 * tramo que nunca se escribió.
 */
export function faderADb(valor: number): number {
  if (valor <= 0) return -Infinity;
  if (valor >= 1) return FADER_DB_MAXIMO;
  const db = 20 * Math.log10(valor) * PENDIENTE_FADER + FADER_DB_MAXIMO;
  return Math.max(FADER_DB_MINIMO, Math.min(FADER_DB_MAXIMO, db));
}

/**
 * dB a valor del fader. Inversa exacta de `faderADb` en el tramo no recortado.
 *
 * Fuera de él no puede serlo, y no es un defecto: por debajo de
 * `FADER_DB_MINIMO` la curva está recortada, así que muchos dB corresponden al
 * mismo valor y la vuelta elige el extremo. Está probado como tal.
 */
export function dbAFader(db: number): number {
  if (db <= FADER_DB_MINIMO) return 0;
  const v = Math.pow(10, (Math.min(FADER_DB_MAXIMO, db) - FADER_DB_MAXIMO)
    / (20 * PENDIENTE_FADER));
  return Math.max(0, Math.min(1, v));
}

/** Extremos de la ganancia de entrada, en dB. Confirmados en la matriz. */
export const GANANCIA_DB_MINIMA = -6;
export const GANANCIA_DB_MAXIMA = 57;

/**
 * Valor de la ganancia (0 a 1) a dB.
 *
 * El rango está CONFIRMADO en la matriz de capacidades: de −6 a 57 dB. Lo que
 * **no** está confirmado es que el recorrido sea lineal, y esta función lo
 * supone. Estaba escrita como `gain.valor * 63 - 6` dentro del adaptador, sin
 * nombre y sin decir de dónde salía el 63, que es simplemente 57 menos −6.
 *
 * Importa más que la del fader: el asistente de ganancia propone cuánto subir
 * o bajar a partir de este número. Mientras siga sin medirse, la propuesta
 * hereda la suposición, y eso tiene que verse en la pantalla.
 */
export function gananciaADb(valor: number): number {
  const acotado = Math.max(0, Math.min(1, valor));
  return GANANCIA_DB_MINIMA + acotado * (GANANCIA_DB_MAXIMA - GANANCIA_DB_MINIMA);
}

export function dbAGanancia(db: number): number {
  const acotado = Math.max(GANANCIA_DB_MINIMA, Math.min(GANANCIA_DB_MAXIMA, db));
  return (acotado - GANANCIA_DB_MINIMA) / (GANANCIA_DB_MAXIMA - GANANCIA_DB_MINIMA);
}
