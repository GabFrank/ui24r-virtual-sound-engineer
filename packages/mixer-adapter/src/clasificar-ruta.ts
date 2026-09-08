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
  { re: /^var\.mtk\./, kind: 'ANALYSIS_BUS_SEND' },
  { re: /^var\.currentSnapshot$/, kind: 'SNAPSHOT' },
  { re: /^afs2\./, kind: 'AFS2' },
];

export function clasificarRuta(path: string): ParameterKind | null {
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
