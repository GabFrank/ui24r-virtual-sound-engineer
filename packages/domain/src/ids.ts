/**
 * Identificadores del dominio.
 *
 * Se tipan por separado para que el compilador impida pasar el identificador
 * de una medición donde se espera el de una recomendación. Una auditoría
 * encontró que medición, recomendación y transacción no se referenciaban
 * entre sí: sin enlaces por identificador, el lazo cerrado y el aprendizaje
 * posterior no son reconstruibles (ADR-014).
 */

declare const brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [brand]: B };

export type SessionId = Branded<string, 'SessionId'>;
export type BandProfileId = Branded<string, 'BandProfileId'>;
export type BandMemberId = Branded<string, 'BandMemberId'>;
export type VenueProfileId = Branded<string, 'VenueProfileId'>;
export type PAProfileId = Branded<string, 'PAProfileId'>;
export type ChannelProfileId = Branded<string, 'ChannelProfileId'>;
export type ChannelAssignmentId = Branded<string, 'ChannelAssignmentId'>;
export type MicProfileId = Branded<string, 'MicProfileId'>;
export type MeasurementId = Branded<string, 'MeasurementId'>;
export type FindingId = Branded<string, 'FindingId'>;
export type RecommendationId = Branded<string, 'RecommendationId'>;
export type TransactionId = Branded<string, 'TransactionId'>;
export type SnapshotId = Branded<string, 'SnapshotId'>;
export type CalibrationStateId = Branded<string, 'CalibrationStateId'>;
export type MixSceneId = Branded<string, 'MixSceneId'>;
export type TakeId = Branded<string, 'TakeId'>;
export type MixCandidateId = Branded<string, 'MixCandidateId'>;

/** Índice de entrada física de la Ui24R, de 1 a 24. */
export type Ui24rInputIndex = Branded<number, 'Ui24rInputIndex'>;

const UI24R_INPUT_MIN = 1;
const UI24R_INPUT_MAX = 24;

export function ui24rInput(n: number): Ui24rInputIndex {
  if (!Number.isInteger(n) || n < UI24R_INPUT_MIN || n > UI24R_INPUT_MAX) {
    throw new RangeError(
      `entrada de la Ui24R fuera de rango: ${n}. Válido: ${UI24R_INPUT_MIN} a ${UI24R_INPUT_MAX}`,
    );
  }
  return n as Ui24rInputIndex;
}

/** Crea un identificador. El prefijo hace legible el registro. */
export function makeId<T extends string>(prefix: string): Branded<string, T> {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}` as Branded<string, T>;
}
