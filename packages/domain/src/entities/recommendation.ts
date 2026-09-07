import type { ChannelAssignmentId, FindingId, MeasurementId, RecommendationId,
  TransactionId } from '../ids.ts';

export type Assistant = 'CHANNEL' | 'MIX' | 'ROOM' | 'SHOW_MONITOR' | 'SAFETY';

/**
 * Nivel de confianza. Solo el alto es elegible para automatización (INV-024).
 *
 * La definición es distinta por dominio, porque un canal se mide en una sola
 * posición y una sala en varias: ver `confidence.ts`.
 */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export type Risk = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Un problema detectado en una medición, antes de decidir qué lo causa.
 *
 * Separar el hallazgo de su causa es lo que permite decir "hay exceso de
 * energía entre 100 y 160 Hz en todas las posiciones, así que el problema es
 * del sistema o de la sala, no del canal de bajo" en vez de "125 Hz más cinco
 * decibeles". Sin esta entidad, esa explicación no se puede generar de forma
 * determinística.
 */
export interface Finding {
  readonly id: FindingId;
  readonly assistant: Assistant;
  readonly descripcion: string;
  /** Banda afectada, en hercios. */
  readonly bandaHz: number | null;
  /** Magnitud del problema, en decibeles. */
  readonly magnitudDb: number | null;
  readonly channelId: ChannelAssignmentId | null;
  /** Posiciones donde aparece, sobre el total medido. */
  readonly posicionesAfectadas: number | null;
  readonly posicionesTotales: number | null;
  /** Fracción de posiciones con el mismo signo y magnitud suficiente. */
  readonly consistencia: number | null;
  readonly confidence: Confidence;
  readonly evidenceMeasurementIds: readonly MeasurementId[];
  readonly hipotesis: readonly Hypothesis[];
}

export type Cause = 'CHANNEL' | 'ROOM' | 'PA' | 'SUB' | 'PLACEMENT' | 'GAIN_STRUCTURE';

export interface Hypothesis {
  readonly causa: Cause;
  /** Verosimilitud relativa, de 0 a 1. */
  readonly verosimilitud: number;
  readonly razon: string;
}

/**
 * Observación sobre un parámetro fuera del dominio del asistente.
 *
 * Un asistente puede señalar algo que no le corresponde tocar, pero no puede
 * proponer un valor: por eso no tiene `proposedValue` (ADR-010).
 */
export interface Observation {
  readonly id: RecommendationId;
  readonly assistant: Assistant;
  readonly target: string;
  readonly mensaje: string;
  readonly findingId: FindingId | null;
  readonly confidence: Confidence;
}

export type RecommendationStatus =
  | 'PROPOSED' | 'ACCEPTED' | 'DISMISSED' | 'EXPIRED' | 'APPLIED' | 'REVERTED';

export interface Recommendation {
  readonly id: RecommendationId;
  readonly assistant: Assistant;
  readonly findingId: FindingId | null;
  /** A qué se aplica: canal, bus o salida. */
  readonly target: string;
  /** Ruta del parámetro en el dominio, no la ruta cruda del protocolo. */
  readonly parameter: string;
  readonly unidad: string;
  /**
   * Valor actual leído de la consola. Es nulo cuando el parámetro no tiene
   * mapeo verificado: en ese caso se propone el valor absoluto y el usuario
   * lo aplica a mano.
   */
  readonly current: number | null;
  readonly currentUnknown: boolean;
  readonly proposed: number;
  readonly delta: number | null;
  readonly razon: string;
  readonly confidence: Confidence;
  readonly risk: Risk;
  readonly evidenceMeasurementIds: readonly MeasurementId[];
  readonly impactoEsperado: string;
  readonly status: RecommendationStatus;
  readonly transactionId: TransactionId | null;
  /** Medición posterior que verifica si el cambio funcionó. */
  readonly verificationMeasurementId: MeasurementId | null;
  /**
   * Advertencia visible cuando la sala todavía no se corrigió: hasta que
   * exista corrección de sala, una recomendación de canal puede estar
   * corrigiendo en el canal un problema que es del recinto.
   */
  readonly sinCorreccionDeSala: boolean;
}

/** Solo la confianza alta habilita automatización (INV-024). */
export function esAutoElegible(r: Recommendation): boolean {
  return r.confidence === 'HIGH';
}
