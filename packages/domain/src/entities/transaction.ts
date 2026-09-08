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

/**
 * Nombre de una instantánea automática. Una sola definición del formato.
 *
 * `nombreSnapshotAutomatica` y `fechaDeSnapshotAutomatica` son inversas, y hay
 * un test que lo comprueba. Importa porque la retención decide **qué borrar**
 * a partir de la fecha que lee del nombre: si el que escribe y el que lee no
 * coincidieran, la aplicación borraría la instantánea equivocada, que es
 * justamente el punto al que se vuelve cuando algo sale mal.
 */
export function nombreSnapshotAutomatica(fecha: Date): string {
  return `${PREFIJO_SNAPSHOT_AUTOMATICA}${fecha.getTime()}`;
}

/** La fecha que lleva el nombre, o `null` si no se puede leer. */
export function fechaDeSnapshotAutomatica(nombre: string): Date | null {
  if (!nombre.startsWith(PREFIJO_SNAPSHOT_AUTOMATICA)) return null;
  const resto = nombre.slice(PREFIJO_SNAPSHOT_AUTOMATICA.length);
  if (!/^\d+$/.test(resto)) return null;
  const ms = Number(resto);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/**
 * Qué instantáneas automáticas hay que borrar para respetar la retención.
 *
 * INV-003 fija un máximo de veinte automáticas. La constante estaba escrita y
 * no la consultaba nadie: la retención existía como número en un archivo.
 *
 * Tres cosas que esta función **no** hace, y que son la mitad de la invariante:
 *
 * - No devuelve jamás un nombre ajeno. Una instantánea que el usuario guardó a
 *   mano es suya, y borrarla sería el peor fallo posible de esta aplicación.
 * - No devuelve una `VSE_` que no sea automática. El prefijo propio no alcanza:
 *   la retención habla de las que crea la aplicación sola.
 * - No devuelve una cuyo nombre no se pueda fechar. Sin poder ordenarla no se
 *   sabe si es la más vieja, y borrar a ciegas pierde un punto de retorno.
 *   Se prefiere conservar de más.
 *
 * Devuelve las más viejas primero, que es el orden en que conviene borrarlas:
 * si el borrado se corta a la mitad, lo que quedó eliminado es lo que menos
 * falta.
 */
export function snapshotsABorrar(
  nombres: readonly string[],
  maximo: number = MAX_SNAPSHOTS_AUTOMATICAS,
): readonly string[] {
  const automaticas = nombres
    .map((nombre) => ({ nombre, fecha: fechaDeSnapshotAutomatica(nombre) }))
    .filter((x): x is { nombre: string; fecha: Date } => x.fecha !== null)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const sobran = automaticas.length - Math.max(0, maximo);
  return sobran <= 0 ? [] : automaticas.slice(0, sobran).map((x) => x.nombre);
}

/**
 * Si una transacción puede pasar a APLICANDO (INV-001).
 *
 * Comprobaba que la referencia no fuera nula, que es literalmente el defecto
 * que INV-001 describe: la instantánea puede haberse borrado desde el navegador
 * de la consola entre que se guardó y ahora. El ejecutor ya relee la lista, así
 * que la invariante se cumple; esta función se quedó atrás, exportada y con
 * test propio, como una trampa para el próximo que la use creyendo que la
 * implementa.
 *
 * Ahora exige `existenciaVerificada`, que es el campo que el modelo declaraba
 * para esto y que tampoco escribía ni leía nadie. La comprobación pide la
 * instantánea, no su referencia.
 */
export function puedeAplicarse(t: ChangeTransaction, snapshot: Snapshot | null): boolean {
  if (t.state !== 'SNAPSHOTTED' || t.snapshotRef === null) return false;
  if (snapshot === null) return false;
  return snapshot.nombreEnConsola === t.snapshotRef && snapshot.existenciaVerificada;
}
