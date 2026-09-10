/**
 * Qué canal puede estar produciendo una realimentación detectada en el general.
 *
 * **Por qué se vigila el general y no cada canal.** La realimentación no es un
 * fenómeno de canal sino del sistema: es un lazo que sale por los parlantes y
 * vuelve a entrar por un micrófono. Aparece en el general venga del canal que
 * venga. Vigilar un canal detecta solo ese, y rotar entre canales detecta tarde
 * —una realimentación arranca en un par de segundos— además de hacerle saltar
 * el analizador al operador justo cuando más lo necesita quieto.
 *
 * **Lo que el general no dice es cuál canal la produce.** Eso se acota con algo
 * que ya llega gratis: los medidores por canal vienen en cada trama `VU2`, para
 * los 24, siempre. Un canal en silencio no puede estar realimentando.
 *
 * **Es una pista, no un veredicto**, y la pantalla tiene que decirlo así. Que
 * un canal tenga señal no prueba que sea el culpable: puede haber tres
 * micrófonos abiertos y realimentar uno solo. Lo que sí es concluyente es la
 * negativa —un canal mudo queda descartado— y eso ya reduce el problema de
 * veinticuatro candidatos a los pocos que están abiertos.
 */

/** Lo mínimo que hace falta saber de un canal para sospechar de él. */
export interface CanalSospechable {
  readonly indice: number;
  readonly nombre: string;
  /** Nivel actual del canal, en la escala de la consola. */
  readonly nivelDb: number;
  /** Si el canal está silenciado en la consola. */
  readonly silenciado: boolean;
  /** Si el usuario lo marcó como fuente real en vivo. */
  readonly enVivo: boolean;
}

export interface Sospechoso {
  readonly indice: number;
  readonly nombre: string;
  readonly nivelDb: number;
}

/**
 * Por debajo de esto un canal no puede estar alimentando nada.
 *
 * Es el mismo piso que usa el asistente de ganancia para separar una fuente
 * audible del ruido de la cadena, y por el mismo motivo.
 */
export const PISO_PARA_SOSPECHAR_DB = -60;

/**
 * Los canales que podrían estar produciendo la realimentación, del más
 * probable al menos.
 *
 * Se descartan, en este orden y por razones distintas:
 *
 * - **Los silenciados**, porque no llegan al general. Es concluyente.
 * - **Los que están por debajo del piso**, porque no hay energía que realimentar.
 * - **Los que no son fuentes en vivo**, si el usuario los marcó: una pista
 *   grabada o una entrada de línea no puede realimentar, porque no hay
 *   micrófono en el lazo. Si nadie marcó nada, no se descarta a nadie por acá.
 *
 * El orden es por nivel, que es lo más cerca de «probabilidad» que se puede
 * decir sin más información.
 */
export function sospechososDeRealimentacion(
  canales: readonly CanalSospechable[],
): readonly Sospechoso[] {
  // Si nadie marcó canales en vivo, la marca no discrimina y usarla dejaría la
  // lista vacía justo cuando más falta hace.
  const hayMarcados = canales.some((c) => c.enVivo);

  return canales
    .filter((c) => !c.silenciado)
    .filter((c) => Number.isFinite(c.nivelDb) && c.nivelDb > PISO_PARA_SOSPECHAR_DB)
    .filter((c) => !hayMarcados || c.enVivo)
    .sort((a, b) => b.nivelDb - a.nivelDb)
    .map((c) => ({ indice: c.indice, nombre: c.nombre, nivelDb: c.nivelDb }));
}
