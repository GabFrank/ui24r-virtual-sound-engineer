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
  /** En qué unidad están las magnitudes de abajo: `dB`, `octavas`, `ms`. */
  readonly unidad: string;
  /** Lo que se le manda a la consola, **en crudo**: es lo que va al cable. */
  readonly valorPropuesto: number;
  /** Valor esperado en la consola justo antes de escribir, también en crudo. */
  readonly valorEsperado: number;
  /**
   * Los mismos dos valores **en la unidad declarada**, y son obligatorios.
   *
   * **Sin esto INV-004 no se puede aplicar, y durante meses no se aplicó.** El
   * motor calculaba el delta como `valorPropuesto - valorEsperado` --crudo-- y
   * lo comparaba contra `LIMITES[kind].porTransaccion`, que está en decibeles.
   * El crudo del previo va de 0 a 1 y el tope es 3, así que **el tope por
   * transacción no se podía disparar nunca**: medido, el mayor salto que dejaba
   * pasar era de **61,9 dB**, de −6,0 a +55,9, el recorrido entero del previo.
   *
   * El campo `unidad` existía desde el principio y no lo leía nadie: se copiaba
   * al diario y ahí moría. O sea que el diario registraba «dB» al lado de un
   * número que no eran decibeles.
   *
   * **Y la suite estaba verde.** Todos los tests declaraban `unidad: 'dB'` y
   * pasaban valores que SÍ eran decibeles, así que modelaban un universo donde
   * el defecto no existe. El único llamador de producción
   * --`aplicar-ganancia.service.ts`-- pasaba crudo. Un test verde sobre un
   * mundo que no es el que corre.
   *
   * Son obligatorios y no opcionales **a propósito**: así el compilador señala
   * cada sitio de construcción. Un campo opcional habría dejado el fallo
   * silencioso exactamente donde estaba.
   */
  readonly magnitudPropuesta: number;
  readonly magnitudEsperada: number;
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
  /**
   * Techo por ruta, en la unidad declarada: hasta dónde se puede subir.
   *
   * **Existe por una regla que puso el usuario con estas palabras**, eligiendo
   * entre opciones, sobre hasta dónde volver a subir un envío después de haberlo
   * bajado para cazar un acople: «*Hasta donde estaba antes de que yo lo bajara,
   * y ni un paso más*» (2026-09-11).
   *
   * Es una regla que el motor tiene que poder hacer cumplir, no una nota en un
   * documento. Se llena con el valor que la ruta tenía **la primera vez que el
   * asistente la tocó en esta sesión**.
   *
   * **Y eso NO es lo que dijo el usuario, aunque se le parezca.** Él dijo «antes
   * de que **yo** lo bajara»: su ancla es el valor previo a que **él** bajara la
   * cuña. Ésta se ancla en la primera vez que entró **el asistente**. Las dos
   * coinciden sólo cuando el que bajó fue el asistente; si el usuario ya bajó a
   * mano y después entra la aplicación, el techo se fija en el valor ya bajado y
   * el techo del usuario queda inalcanzable.
   *
   * La regla del usuario, tal como la dijo, necesita seguir los cambios externos
   * para saber qué valor había antes de que él lo moviera, y eso hoy no existe.
   * **Esta es la operacionalización del agente**, y una auditoría de fidelidad
   * la encontró firmada como «palabras del usuario» — la tercera vez que un «yo»
   * suyo se convierte en autoridad de la aplicación.
   *
   * **En la unidad declarada del cambio, no en crudo.** Se compara contra
   * `magnitudPropuesta`, que va en decibeles para este tipo. Poner acá el crudo
   * de la consola (0 a 1) reproduce el defecto que INV-004 pagó durante meses:
   * un tope inalcanzable por comparar unidades distintas.
   *
   * Una ruta que no figura acá no tiene techo propio y se rige sólo por los
   * topes de {@link LIMITES}.
   */
  readonly techoPorRuta: ReadonlyMap<string, number>;
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
  | 'SIN_PERFIL_DE_SALA'
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
