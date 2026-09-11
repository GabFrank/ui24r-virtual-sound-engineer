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
  /**
   * Factor de calidad del filtro, solo para ecualización de salida.
   *
   * INV-004 exige Q ≥ 0,7 en salidas y la constante existía en el dominio,
   * pero el motor no la consultaba porque el cambio propuesto no traía el
   * dato. Un filtro estrecho de realce en un bus de salida es el camino corto
   * al acople: es justo lo que esa cláusula existe para impedir.
   */
  readonly q?: number;
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
  /**
   * Prefijos de los buses sobre los que el perfil permite ecualizar.
   *
   * **Prefijos de bus --`m`, `a.3`--, no rutas completas.** Un bus de salida en
   * esta consola son setenta claves de ecualización: el general es un gráfico de
   * 31 bandas por lado. Enumerarlas era inviable, y la lista terminó durante
   * meses con una sola ruta inventada, `m.eq.b1.gain`, que el aparato no publica.
   * Se traduce desde `PAProfile.outputBuses` con `prefijosPermitidos`.
   */
  readonly busesDeSalidaPermitidos: ReadonlySet<string>;
  readonly confianza: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  /** El usuario aprobó explícitamente, con una acción deliberada. */
  readonly aprobacionExplicita: boolean;
}

export type CodigoRechazo =
  | 'RUTA_INCONSISTENTE'
  | 'RUTA_DESCONOCIDA'
  | 'Q_DEMASIADO_ESTRECHO'
  | 'REALCE_EXCESIVO'
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
