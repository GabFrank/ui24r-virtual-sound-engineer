import type { MeasurementId, MixCandidateId, SessionId, SnapshotId, TakeId } from '../ids.ts';

/**
 * Una interpretación grabada en multipista, para comparar mezclas sobre el
 * mismo material.
 *
 * Dos interpretaciones humanas nunca son iguales: comparar la mezcla A con la
 * B no significa nada si los músicos tocaron distinto. Con una toma grabada,
 * la única variable que cambia es la mezcla.
 */
export interface VirtualSoundcheckTake {
  readonly id: TakeId;
  readonly sessionId: SessionId;
  /** Dónde vive el audio. La aplicación solo guarda metadatos. */
  readonly ubicacion: 'UI24R_USB' | 'TABLET';
  readonly fileRef: string;
  /** Qué canal de la consola quedó en qué pista. */
  readonly channelMap: Readonly<Record<string, number>>;
  readonly sampleRate: number;
  readonly duracionS: number;
  readonly checksum: string | null;
  readonly grabadaEl: string;
  readonly snapshotRef: SnapshotId | null;
  /** El usuario confirmó que la banda sabe que se está grabando. */
  readonly consentimientoConfirmado: boolean;
}

/**
 * Una mezcla candidata: el conjunto de faders más lo que se midió con ella.
 *
 * Comparar dos candidatos solo tiene sentido si ambos se midieron sobre la
 * misma toma y con la misma calibración.
 */
export interface MixCandidate {
  readonly id: MixCandidateId;
  readonly sessionId: SessionId;
  readonly takeId: TakeId;
  readonly etiqueta: string;
  /** Faders y parámetros relevantes, por canal. */
  readonly parametros: Readonly<Record<string, number>>;
  readonly snapshotRef: SnapshotId | null;
  readonly measurementIds: readonly MeasurementId[];
  readonly mixScore: number | null;
}

/**
 * Dos candidatos se pueden comparar solo si comparten toma y calibración.
 * Si no, la diferencia observada puede venir de cualquier otro lado.
 */
export function sonComparables(a: MixCandidate, b: MixCandidate): boolean {
  return a.takeId === b.takeId && a.sessionId === b.sessionId;
}
