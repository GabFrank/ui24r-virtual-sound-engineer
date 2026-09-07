import type { PAProfileId, VenueProfileId } from '../ids.ts';

export type VenueType =
  | 'INDOOR_SMALL' | 'INDOOR_MEDIUM' | 'INDOOR_LARGE'
  | 'WAREHOUSE' | 'OUTDOOR' | 'CUSTOM';

export type BusRef =
  | { readonly tipo: 'MASTER' }
  | { readonly tipo: 'AUX'; readonly indice: number }
  | { readonly tipo: 'MTX'; readonly indice: number };

/**
 * Un componente del sistema de amplificación y por qué bus sale.
 *
 * Importa para la medición por componente: "solo el lado izquierdo" únicamente
 * es posible si ese lado tiene un bus con silencio propio. En un general
 * estéreo con un solo silencio, no se puede separar (INV-028).
 */
export interface PAComponentSpec {
  readonly nombre: string;
  readonly bus: BusRef;
  readonly silenciable: boolean;
}

export interface PAProfile {
  readonly id: PAProfileId;
  readonly nombre: string;
  readonly cajasPrincipales: string;
  readonly subgraves: string | null;
  /**
   * Rango donde el sistema entrega nivel útil, en hercios.
   *
   * Fuera de este rango no se generan recomendaciones: pedirle 20 Hz a un
   * sistema que empieza en 45 produce una corrección absurda y potencialmente
   * destructiva.
   */
  readonly rangoUtilHz: readonly [number, number];
  readonly crossoverHz: number | null;
  readonly componentes: readonly PAComponentSpec[];
  /** Buses sobre los que se permite escribir ecualización desde MVP4b. */
  readonly outputBuses: readonly BusRef[];
  /**
   * Nivel del fader del reproductor aceptado por el usuario en este lugar.
   *
   * Arranca en −30 dB y sube solo con acción explícita. Nunca se supera
   * automáticamente (INV-015).
   */
  readonly generatorFaderDb: number | null;
  readonly procesadorExterno: string | null;
}

export type HouseCurvePreset =
  | 'LIVE_MUSIC' | 'ACOUSTIC' | 'SPEECH' | 'BASS_ENHANCED' | 'CUSTOM' | 'BAND_SIGNATURE';

export interface VenueProfile {
  readonly id: VenueProfileId;
  readonly nombre: string;
  readonly tipo: VenueType;
  readonly dimensionesM: { readonly largo: number; readonly ancho: number; readonly alto: number } | null;
  readonly interior: boolean;
  readonly paProfileId: PAProfileId;
  readonly houseCurve: HouseCurvePreset;
  /** Curva personalizada por banda de tercio de octava, si el preset es propio. */
  readonly houseCurveCustom: Readonly<Record<string, number>> | null;
  /** Puntajes de sala de sesiones anteriores, para comparar con hoy. */
  readonly historicoRoomScore: readonly { readonly fecha: string; readonly score: number }[];
  /**
   * Desviación típica del puntaje medida en este lugar.
   *
   * Sin este número el lazo cerrado no tiene tolerancia y oscilaría sobre el
   * ruido de su propia medición. Una sala sin él no habilita automatización
   * (INV-023, spike de repetibilidad).
   */
  readonly sigmaRoomScore: number | null;
  readonly notas: string | null;
}
