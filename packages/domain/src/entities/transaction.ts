import type { MeasurementId, RecommendationId, SnapshotId, TransactionId } from '../ids.ts';

/**
 * Cómo se confirmó que una escritura llegó.
 *
 * El protocolo no tiene confirmación explícita. Si la consola no devuelve eco,
 * solo el fader, el silencio y la ganancia se pueden verificar indirectamente
 * por los medidores (ADR-005, INV-011).
 */
export type ConfirmedBy = 'ECHO' | 'VU' | 'TIMEOUT' | 'NONE';

export type TransactionState =
  | 'DRAFT'
  | 'APPROVED'
  | 'SNAPSHOTTED'
  | 'APPLYING'
  | 'VERIFYING'
  | 'APPLIED'
  | 'PARTIAL'
  | 'CONFLICT'
  | 'SUSPENDED'
  | 'ROLLED_BACK';

export type AutonomyLevel = 'OBSERVE' | 'SUGGEST' | 'ASSISTED' | 'AUTO';

export interface Change {
  readonly parameter: string;
  readonly unidad: string;
  /**
   * Valor previo leído de la consola, nunca calculado.
   *
   * Un retroceso restaura este valor exacto y lo verifica por lectura
   * (INV-002). Un cambio sin este campo es un error de programación.
   */
  readonly previousValue: number;
  readonly expectedValue: number;
  readonly sentValue: number;
  readonly confirmedBy: ConfirmedBy;
  readonly verificado: boolean;
  readonly timestamp: string | null;
}

export interface ChangeTransaction {
  readonly id: TransactionId;
  readonly assistant: string;
  readonly razon: string;
  readonly nivelAutonomia: AutonomyLevel;
  readonly state: TransactionState;
  readonly recommendationIds: readonly RecommendationId[];
  /** Instantánea previa, verificada en la lista releída (INV-001). */
  readonly snapshotRef: SnapshotId | null;
  readonly measurementBeforeId: MeasurementId | null;
  readonly measurementAfterId: MeasurementId | null;
  readonly changes: readonly Change[];
  readonly resultado: 'KEEP' | 'REVERT' | null;
  readonly creadoEl: string;
  readonly cerradoEl: string | null;
}

export interface Snapshot {
  readonly id: SnapshotId;
  /** Nombre en la consola. La aplicación solo crea y borra el prefijo propio. */
  readonly nombreEnConsola: string;
  readonly show: string;
  readonly esAutomatica: boolean;
  readonly creadaEl: string;
  readonly transactionId: TransactionId | null;
  /** Verificado releyendo la lista de instantáneas de la consola. */
  readonly existenciaVerificada: boolean;
}

export const PREFIJO_SNAPSHOT_AUTOMATICA = 'VSE_AUTO_';
export const SHOW_RESERVADO = 'VSE';
export const MAX_SNAPSHOTS_AUTOMATICAS = 20;

/** La aplicación solo puede crear o borrar instantáneas propias (INV-003). */
export function esSnapshotDeLaApp(nombre: string): boolean {
  return nombre.startsWith('VSE_');
}

/** Una transacción no puede aplicarse sin instantánea verificada (INV-001). */
export function puedeAplicarse(t: ChangeTransaction): boolean {
  return t.state === 'SNAPSHOTTED' && t.snapshotRef !== null;
}
