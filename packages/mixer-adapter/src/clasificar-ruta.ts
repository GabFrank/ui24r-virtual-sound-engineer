import type { ParameterKind } from '@vse/domain';

/**
 * Clasifica una ruta del protocolo en su clase de parámetro del dominio.
 *
 * Existe por un hueco concreto y grave. INV-008 e INV-010 están enunciadas
 * **sobre rutas** —«paths escribibles ∩ paths de AUX monitor = …»— pero el
 * motor de seguridad decidía con la clase que declaraba quien proponía el
 * cambio, sin ninguna atadura entre una cosa y la otra. Una auditoría lo
 * comprobó ejecutando el motor:
 *
 *     path 'i.3.aux.1.value', kind 'CHANNEL_FADER' → { permitido: true }
 *
 * Es decir: un envío a un auxiliar de monitor, etiquetado como fader de canal,
 * pasaba. La invariante que existe para que un asistente no deje al músico sin
 * monitores en pleno show era una comprobación de honestidad, no un guardia.
 * Bastaba un error de tipeo en un asistente futuro.
 *
 * Devuelve `null` cuando la ruta no se reconoce. Eso también es un rechazo:
 * escribir en una ruta que el dominio no sabe clasificar es escribir a ciegas.
 */

interface Patron {
  readonly re: RegExp;
  readonly kind: ParameterKind;
}

/**
 * El orden importa: los patrones más específicos van primero.
 *
 * `i.N.aux.M.value` tiene que evaluarse antes que cualquier patrón general de
 * entrada, porque es justamente el que no se escribe nunca.
 */
const PATRONES: readonly Patron[] = [
  // --- Entradas: envíos a auxiliares. Nunca se escriben (INV-010). ---
  { re: /^i\.\d+\.aux\.\d+\.value$/, kind: 'MONITOR_AUX_SEND' },

  // --- Entradas: cadena de canal ---
  { re: /^i\.\d+\.eq\.hpf\./, kind: 'HPF' },
  { re: /^i\.\d+\.eq\./, kind: 'CHANNEL_EQ' },
  { re: /^i\.\d+\.dyn\./, kind: 'COMPRESSOR' },
  { re: /^i\.\d+\.gate\./, kind: 'GATE' },
  { re: /^i\.\d+\.deesser\./, kind: 'DEESSER' },
  { re: /^i\.\d+\.mix$/, kind: 'CHANNEL_FADER' },
  { re: /^i\.\d+\.pan$/, kind: 'CHANNEL_PAN' },
  { re: /^i\.\d+\.mute$/, kind: 'CHANNEL_MUTE' },
  // **Las dos rutas de fantasma, y no son la misma cosa.** La que manda es
  // `hw.N.phantom`, la del previo: medido el 2026-09-10, con el condensador
  // alimentado valía 1 mientras `i.N.phantom` valía 0 en el mismo instante.
  //
  // `i.N.phantom` estuvo devolviendo `null` con un comentario que la llamaba
  // «inventada». **No lo está**: existe en la consola y está en la
  // especificación. Clasificarla también deja que un intento de escribirla se
  // rechace por PARAMETRO_DEL_USUARIO (INV-007), que es el motivo verdadero, y
  // no por RUTA_DESCONOCIDA (INV-008), que manda a buscar el problema al lugar
  // equivocado. Las dos son del usuario y ninguna se escribe.
  { re: /^hw\.\d+\.phantom$/, kind: 'PHANTOM' },
  { re: /^i\.\d+\.phantom$/, kind: 'PHANTOM' },
  { re: /^hw\.\d+\.gain$/, kind: 'PREAMP_GAIN' },

  // --- Reproductor: solo dentro de la reserva ---
  { re: /^p\.\d+\.mute$/, kind: 'PLAYER_MUTE' },
  { re: /^p\.\d+\.mix$/, kind: 'PLAYER_FADER' },
  { re: /^p\.\d+\.aux\.\d+\.value$/, kind: 'PLAYER_SEND' },

  // --- General ---
  { re: /^m\.eq\./, kind: 'OUTPUT_EQ' },
  { re: /^m\.delay/, kind: 'OUTPUT_DELAY' },
  { re: /^m\.polarity/, kind: 'OUTPUT_POLARITY' },
  { re: /^m\.dyn\./, kind: 'OUTPUT_LIMITER' },
  { re: /^m\.mix$/, kind: 'MASTER_FADER' },
  { re: /^m\.mute$/, kind: 'MASTER_MUTE' },

  // --- Auxiliares y matrices como buses de salida ---
  { re: /^a\.\d+\.eq\./, kind: 'OUTPUT_EQ' },
  { re: /^a\.\d+\.delay/, kind: 'OUTPUT_DELAY' },
  { re: /^a\.\d+\.polarity/, kind: 'OUTPUT_POLARITY' },
  { re: /^a\.\d+\.mute$/, kind: 'PA_BUS_MUTE' },
  { re: /^a\.\d+\.mix$/, kind: 'MONITOR_AUX_SEND' },
  { re: /^v\.\d+\./, kind: 'VCA' },

  // --- Efectos y sistema ---
  { re: /^f\.\d+\./, kind: 'FX' },
  // `var.mtk.*` es el espacio de soundcheck y multipista, no un envío de bus:
  // lo decía la matriz de capacidades y acá estaba clasificado como el **único
  // routing escribible** que admite INV-008. No hay categoría para soundcheck
  // todavía, así que cae en RUTA_DESCONOCIDA y se rechaza, que es la respuesta
  // correcta mientras SPK-P0.7a no lo verifique.
  { re: /^var\.currentSnapshot$/, kind: 'SNAPSHOT' },

  // --- Supresión de realimentación ---
  //
  // **El patrón era `/^afs2\./` y esa familia no existe en la consola.** `AFS2`
  // es el nombre comercial de Soundcraft; las rutas que el aparato publica son
  // `m.afs.*` para el general, `a.B.afs.*` para cada auxiliar, y `var.afsdata`,
  // que trae los filtros ya puestos. Ninguna empieza con `afs2`, así que el
  // kind era **inalcanzable** y el supresor caía en RUTA_DESCONOCIDA.
  //
  // Es el mismo error que el comentario de `hw.N.phantom`, doce líneas más
  // arriba, describe y dice haber arreglado — en el mismo archivo. Se rechazaba
  // igual, pero citando INV-008 «ruta desconocida» en vez de la invariante de
  // propiedad, y el registro es lo que se lee después de un show.
  //
  // Y no es un parámetro cualquiera: el supresor le mete filtros de −18 dB al
  // audio por su cuenta, y `m.afs.enabled` es **el único de 45 campos que una
  // recuperación de instantánea no devuelve**. Lo encontró una auditoría.
  { re: /^m\.afs\./, kind: 'AFS2' },
  { re: /^a\.\d+\.afs\./, kind: 'AFS2' },
  { re: /^var\.afsdata$/, kind: 'AFS2' },
];

export interface OpcionesDeClasificacion {
  /**
   * Qué auxiliar es el bus de análisis.
   *
   * INV-008 admite un solo routing escribible: los envíos hacia ese bus. Cuál
   * es lo tiene que decir SPK-P0.5, así que no se puede escribir un número acá.
   * Sin este dato **todo** `i.N.aux.M.value` es un envío de monitor y no se
   * escribe nunca, que es el lado seguro: el caso permitido por la invariante
   * era hasta ahora inexpresable, y el patrón que decía cubrirlo cubría otra
   * cosa.
   */
  readonly busDeAnalisis?: number;
}

export function clasificarRuta(
  path: string,
  opciones: OpcionesDeClasificacion = {},
): ParameterKind | null {
  const bus = opciones.busDeAnalisis;
  if (bus !== undefined && new RegExp(`^i\\.\\d+\\.aux\\.${bus}\\.value$`).test(path)) {
    return 'ANALYSIS_BUS_SEND';
  }
  for (const p of PATRONES) {
    if (p.re.test(path)) return p.kind;
  }
  return null;
}

/**
 * Toda ruta que el dominio reconoce como de auxiliar de monitor.
 *
 * Lo usa el test estático que INV-010 promete: la intersección entre las rutas
 * escribibles y las de auxiliar de monitor tiene que ser la lista cerrada de
 * la invariante.
 */
export function esEnvioDeMonitor(path: string): boolean {
  return clasificarRuta(path) === 'MONITOR_AUX_SEND';
}
