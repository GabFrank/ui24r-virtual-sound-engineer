/**
 * Superficie única de contacto con la consola.
 *
 * Ningún asistente importa la biblioteca del protocolo ni construye comandos.
 * Hablan con esta interfaz, y solo a través del pipeline
 * `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
 * Hay una regla de lint que verifica que nadie fuera de este paquete importe
 * la biblioteca del protocolo (ADR-006, CONTRIBUTING.md).
 */

/** Estado del almacén de estado confirmado. Ver ADR-005. */
export type StoreState = 'VALID' | 'INVALID';

/**
 * Origen de un cambio de parámetro.
 *
 * El protocolo no identifica al cliente que escribió: es una limitación
 * verificada, no una omisión. Solo se puede distinguir un cambio propio de uno
 * ajeno, por correlación temporal. La interfaz nunca promete "lo cambió el
 * teléfono de fulano".
 */
export type ChangeSource = 'SELF' | 'EXTERNAL' | 'UNKNOWN';

export type ConnectionState = 'CONNECTED' | 'UNSTABLE' | 'RECONNECTING' | 'DISCONNECTED';

export interface ReadResult<T = number> {
  readonly value: T;
  /** Instante del último mensaje entrante que tocó este parámetro. */
  readonly confirmedAt: string | null;
  readonly source: ChangeSource;
  readonly version: number;
  readonly storeState: StoreState;
}

export type WriteStatus =
  | 'APPLIED'
  | 'CONFLICT'
  | 'UNVERIFIED'
  | 'REJECTED';

export type ConfirmedBy = 'ECHO' | 'VU' | 'TIMEOUT' | 'NONE';

export interface WriteResult {
  readonly status: WriteStatus;
  readonly confirmedBy: ConfirmedBy;
  /** Valor leído cuando el estado es de conflicto. */
  readonly actual: number | null;
  readonly motivo: string | null;
}

/** Cambio masivo externo: recuperación de instantánea o arrastre de fader. */
export interface BulkExternalChange {
  readonly rutasAfectadas: number;
  readonly ventanaMs: number;
  readonly probableCausa: 'SNAPSHOT_RECALL' | 'FADER_DRAG' | 'DESCONOCIDA';
  readonly timestamp: string;
}

export interface DeviceInfo {
  readonly modelo: string;
  readonly firmware: string;
}

export interface MixerDomainAPI {
  readonly estadoConexion: ConnectionState;

  conectar(host: string): Promise<void>;
  desconectar(): Promise<void>;
  infoDispositivo(): Promise<DeviceInfo>;

  /**
   * Lee del almacén de estado confirmado, alimentado solo por mensajes
   * entrantes. Nunca del estado optimista de la biblioteca: una escritura
   * propia no confirmada no puede aparecer como valor actual, o un retroceso
   * restauraría algo que nunca se aplicó.
   */
  leer(parametro: string): ReadResult;

  /**
   * Escribe comparando antes contra el valor esperado. Si difiere, devuelve
   * conflicto y no escribe (INV-011).
   */
  escribir(parametro: string, valor: number, esperado: number): Promise<WriteResult>;

  /**
   * Relee la lista de instantáneas que la consola dice tener.
   *
   * INV-001 exige que ninguna transacción pase a APLICANDO sin su instantánea
   * «verificada en la lista de snapshots re-leída». El campo del modelo que
   * guardaba ese hecho existía y no lo escribía nadie: «verificado» significaba
   * en la práctica «la cadena no es nula». El escenario que la propia
   * invariante describe —borrar la instantánea entre guardarla y aplicar— no
   * podía detectarse.
   *
   * Se relee, no se cachea: el punto de la invariante es que alguien pudo
   * borrarla desde el navegador de la consola mientras tanto.
   */
  listarSnapshots(): Promise<readonly string[]>;

  /** Suscripción a cambios externos y a avalanchas. */
  alCambiarExterno(cb: (parametro: string, valor: number) => void): () => void;
  alCambioMasivo(cb: (evento: BulkExternalChange) => void): () => void;
  alCambiarConexion(cb: (estado: ConnectionState) => void): () => void;
}

/**
 * Error que lanza el adaptador cuando se le pide escribir algo que no debe.
 * Es un tipo propio para que el Safety Engine lo distinga de un fallo de red.
 */
export class EscrituraProhibida extends Error {
  readonly parametro: string;
  readonly motivo: string;

  constructor(parametro: string, motivo: string) {
    super(`escritura prohibida en ${parametro}: ${motivo}`);
    this.name = 'EscrituraProhibida';
    this.parametro = parametro;
    this.motivo = motivo;
  }
}
