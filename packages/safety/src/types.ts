import type { AutonomyLevel, ChangeTransaction, TransactionState } from '@vse/domain';
import type { ParameterKind } from '@vse/domain';
import type { SessionState } from '@vse/domain';

/**
 * Un cambio propuesto, antes de convertirse en escritura.
 *
 * Lleva la clase de parámetro además de su ruta: la ruta es del protocolo y
 * cambia entre modelos de consola, la clase es del dominio y es lo que decide
 * quién puede escribirla.
 */
export interface CambioPropuesto {
  readonly kind: ParameterKind;
  /** Ruta del protocolo. */
  readonly path: string;
  readonly unidad: string;
  readonly valorPropuesto: number;
  /** Valor esperado en la consola justo antes de escribir. */
  readonly valorEsperado: number;
}

export interface ContextoSeguridad {
  readonly sessionState: SessionState;
  readonly nivelAutonomia: AutonomyLevel;
  /** Cuánto se movió ya cada parámetro en la sesión, por ruta. */
  readonly acumuladoPorRuta: ReadonlyMap<string, number>;
  /** Rutas con una medición posterior a su último cambio. */
  readonly rutasConMedicionPosterior: ReadonlySet<string>;
  /** Rutas ya tocadas alguna vez en esta sesión. */
  readonly rutasYaTocadas: ReadonlySet<string>;
  readonly hayTakeDeSoundcheckActivo: boolean;
  /** Buses sobre los que el perfil de amplificación permite escribir. */
  readonly busesDeSalidaPermitidos: ReadonlySet<string>;
  readonly confianza: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  /** El usuario aprobó explícitamente, con una acción deliberada. */
  readonly aprobacionExplicita: boolean;
}

export type CodigoRechazo =
  | 'PARAMETRO_DEL_USUARIO'
  | 'PARAMETRO_NO_ESCRIBIBLE'
  | 'DELTA_EXCEDIDO'
  | 'ACUMULADO_EXCEDIDO'
  | 'SIN_MEDICION_INTERMEDIA'
  | 'DEMASIADOS_PARAMETROS'
  | 'ESTADO_DE_SESION'
  | 'TAKE_ACTIVO'
  | 'BUS_NO_PERMITIDO'
  | 'CONFIANZA_INSUFICIENTE'
  | 'SIN_APROBACION'
  | 'SIN_INSTANTANEA'
  | 'CONEXION'
  | 'BLOQUEADO';

export interface Rechazo {
  readonly codigo: CodigoRechazo;
  /** Invariante que lo motiva. Aparece en el registro y en la interfaz. */
  readonly invariante: string;
  readonly mensaje: string;
  readonly path: string | null;
}

export type Veredicto =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly rechazos: readonly Rechazo[] };

/** Estados desde los que una transacción puede avanzar a aplicar. */
export const ESTADOS_APLICABLES: readonly TransactionState[] = ['SNAPSHOTTED'];

export type { ChangeTransaction };
