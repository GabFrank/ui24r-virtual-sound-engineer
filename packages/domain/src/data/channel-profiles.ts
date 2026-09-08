import type { ChannelProfile, ChannelProfileType } from '../entities/musical.ts';
import type { ChannelProfileId } from '../ids.ts';

/**
 * Perfiles de canal iniciales. Reflejan docs/channel-profiles.md, y hay un
 * test que LEE esa tabla y la compara fila por fila: si alguien ajusta un número aquí
 * sin actualizar el documento, o al revés, el test avisa.
 *
 * **No son presets.** Un preset diría "filtro en 80 Hz". Un perfil dice "para
 * esta fuente el filtro suele estar entre 70 y 110 Hz, y el margen buscado es
 * de 14 dB". La recomendación concreta sale de la medición.
 *
 * Los valores son un punto de partida informado, todavía sin validar con la
 * banda. La historia del asistente de ganancia exige que el usuario los revise
 * y firme antes de cerrarse.
 */

function perfil(
  type: ChannelProfileType,
  nombre: string,
  defaultRole: ChannelProfile['defaultRole'],
  bandaUtilHz: [number, number],
  hpfRangoHz: [number, number],
  margenObjetivoDb: number,
  rangoDinamicoEsperadoDb: number,
  snrMinimoDb: number,
  compresorRatio: number | null,
  usaPuerta: boolean,
  usaDeesser: boolean,
): ChannelProfile {
  return {
    id: `perfil_${type.toLowerCase()}` as ChannelProfileId,
    type, nombre, defaultRole, bandaUtilHz, hpfRangoHz,
    margenObjetivoDb, rangoDinamicoEsperadoDb, snrMinimoDb,
    compresorRatio, usaPuerta, usaDeesser,
  };
}

export const PERFILES_DE_CANAL: readonly ChannelProfile[] = [
  perfil('LEAD_VOCAL', 'Voz principal', 'LEAD', [80, 16000], [80, 120], 12, 18, 30, 2.5, false, true),
  perfil('BACKING_VOCAL', 'Voz de acompañamiento', 'SUPPORT', [90, 14000], [90, 130], 12, 15, 28, 2.5, false, true),
  perfil('ACOUSTIC_GUITAR', 'Guitarra acústica', 'SUPPORT', [70, 16000], [70, 100], 14, 16, 30, 2, false, false),
  perfil('ELECTRIC_GUITAR', 'Guitarra eléctrica', 'SUPPORT', [80, 12000], [80, 110], 14, 14, 28, 2, false, false),
  perfil('BASS', 'Bajo', 'FOUNDATION', [35, 5000], [30, 45], 10, 10, 25, 3, false, false),
  perfil('CAJON', 'Cajón', 'RHYTHMIC', [45, 12000], [40, 60], 8, 20, 22, 3, true, false),
  perfil('CONGA', 'Conga', 'RHYTHMIC', [60, 12000], [60, 90], 8, 18, 22, 2.5, true, false),
  perfil('SHAKER', 'Shaker', 'RHYTHMIC', [300, 18000], [250, 400], 10, 12, 25, 2, true, false),
  perfil('FLUTE', 'Flauta', 'LEAD', [200, 16000], [150, 250], 12, 16, 28, 2, false, false),
  perfil('KEYBOARD', 'Teclado', 'SUPPORT', [40, 16000], [35, 60], 12, 12, 30, 2, false, false),
  perfil('PLAYBACK', 'Reproducción', 'FOUNDATION', [30, 18000], [20, 20], 14, 8, 40, null, false, false),
  perfil('SPEECH', 'Palabra', 'LEAD', [100, 12000], [100, 150], 14, 14, 30, 3, true, true),
  perfil('CUSTOM', 'Personalizado', 'SUPPORT', [20, 20000], [20, 200], 12, 15, 25, 2, false, false),
];

const PORTIPO = new Map(PERFILES_DE_CANAL.map((p) => [p.type, p]));

export function perfilPorTipo(type: ChannelProfileType): ChannelProfile {
  const p = PORTIPO.get(type);
  if (!p) throw new Error(`no hay perfil para el tipo ${type}`);
  return p;
}
