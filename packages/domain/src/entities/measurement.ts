import type { CalibrationStateId, ChannelAssignmentId, MeasurementId, MicProfileId,
  MixSceneId, SessionId, SnapshotId } from '../ids.ts';

/**
 * Punto de la cadena de la consola desde donde se toma la referencia eléctrica.
 *
 * El mapeo a envíos de la consola está confirmado por protocolo: entrada cruda
 * es un envío antes del fader y antes del proceso; después del proceso es antes
 * del fader y después del proceso; después del fader es el envío después del
 * fader; y la referencia del sistema completo es una matriz con el general
 * como fuente (ADR-003, ver capability-matrix.md).
 */
export type AnalysisReferenceMode =
  | 'RAW_INPUT'
  | 'POST_PROCESSING'
  | 'POST_FADER'
  | 'MASTER_REFERENCE';

/** Componente del sistema de amplificación bajo medición. */
export type PAComponent = 'LEFT' | 'RIGHT' | 'SUB' | 'LEFT_SUB' | 'RIGHT_SUB' | 'FULL';

export type SignalType = 'PINK' | 'SWEEP' | 'SINE' | 'BURST' | 'PERFORMANCE' | 'SILENCE';

/**
 * Estado de calibración vigente cuando se tomó una medición.
 *
 * Sin esto, dos mediciones de sesiones distintas no son comparables: el
 * potenciómetro de la interfaz no es legible por software y el usuario pudo
 * moverlo (ADR-004, INV-027).
 */
export interface CalibrationState {
  readonly id: CalibrationStateId;
  /** Nivel leído en la entrada 2 para el tono de referencia, en dBFS. */
  readonly scarlettGainRefDbfs: number | null;
  /** Ajuste fino aplicado por el fader del bus de análisis, en decibeles. */
  readonly analysisBusTrimDb: number | null;
  /** Diferencia de respuesta entre entrada 1 y entrada 2, por banda. */
  readonly in1In2OffsetDb: readonly number[] | null;
  /** Desplazamiento a nivel acústico absoluto. Sin esto no se afirma SPL. */
  readonly splOffsetDb: number | null;
  readonly loopbackId: string | null;
  readonly validoHasta: string | null;
  readonly estado: 'VALID' | 'INVALID' | 'NONE';
}

export interface MeasurementMicProfile {
  readonly id: MicProfileId;
  readonly modelo: string;
  readonly fabricante: string;
  readonly serie: string | null;
  /** Curva de calibración, por banda de tercio de octava. */
  readonly archivoCalibracion: readonly number[] | null;
  readonly sensibilidadMvPa: number | null;
  /**
   * Si es un micrófono de medición de verdad.
   *
   * Un condensador de estudio es direccional y su respuesta no es plana:
   * sirve para detectar problemas gruesos, pero sesga la medición de sala.
   * Cuando esto es falso, la confianza de toda recomendación de ecualización
   * de sala se limita, y por encima de 4 kHz se limita más (riesgo R-11).
   */
  readonly isMeasurementMic: boolean;
  readonly notas: string | null;
}

/** Métricas calculadas sobre una captura. Ver docs/dsp-spec.md. */
export interface MeasurementMetrics {
  readonly rmsDb: number;
  readonly picoMuestraDb: number;
  readonly picoRealDb: number | null;
  readonly factorCrestaDb: number;
  readonly ruidoFondoDb: number | null;
  readonly snrDb: number | null;
  readonly eventosSaturacion: number;
  /** Espectro por banda de tercio de octava, clave en hercios. */
  readonly tercioOctavaDb: Readonly<Record<string, number | null>> | null;
  /** Magnitud de la función de transferencia, por banda. */
  readonly transferMagnitudeDb: Readonly<Record<string, number | null>> | null;
  /** Coherencia por banda. Los bins por debajo del umbral no son confiables. */
  readonly coherencia: Readonly<Record<string, number | null>> | null;
  readonly retardoMuestras: number | null;
  /** Promedios usados. Con menos de 16 la coherencia está sesgada. */
  readonly promedios: number | null;
}

export interface Measurement {
  readonly id: MeasurementId;
  readonly sessionId: SessionId;
  readonly timestamp: string;
  readonly signalType: SignalType;
  readonly referenceMode: AnalysisReferenceMode | null;
  readonly paComponent: PAComponent | null;
  /** Canal medido, si la medición es de un canal concreto. */
  readonly channelId: ChannelAssignmentId | null;
  /** Posición dentro de la sala, si es una medición multiposición. */
  readonly posicion: string | null;
  readonly sceneId: MixSceneId | null;
  /** Estado de la construcción progresiva de mezcla, si aplica. */
  readonly buildState: string | null;
  readonly micProfileId: MicProfileId | null;
  readonly calibrationStateId: CalibrationStateId;
  readonly snapshotRef: SnapshotId | null;
  readonly sampleRate: number;
  readonly duracionS: number;
  /** Métricas de la referencia eléctrica directa, entrada 2. */
  readonly directRef: MeasurementMetrics | null;
  /** Métricas de lo que se oye en la sala, entrada 1. */
  readonly acousticRef: MeasurementMetrics | null;
  /** Métricas desde la telemetría de la consola. */
  readonly consoleTelemetry: MeasurementMetrics | null;
  readonly archivoAudio: string | null;
}

/**
 * Una medición sirve para recomendar solo si su calibración es válida.
 * Con calibración inválida, la confianza no puede superar el nivel medio.
 */
export function medicionEsConfiable(
  m: Measurement,
  cal: CalibrationState,
): boolean {
  return cal.estado === 'VALID' && m.calibrationStateId === cal.id;
}
