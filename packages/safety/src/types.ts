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
   * **Sólo se anota cuando la aplicación BAJA un envío**, y en ese momento se
   * guarda el valor que tenía antes de bajarlo. Si nadie bajó nada, la ruta no
   * figura acá y no tiene techo.
   *
   * **La primera versión lo llenaba en la primera escritura, fuera cual fuera, y
   * eso rompía el caso de uso principal.** Lo encontró el usuario el 2026-09-12
   * con una pregunta de una línea: «*¿qué pasa si al iniciar el soundcheck están
   * todos abajo? ¿La app podrá levantar?*». No podía: el techo se anclaba en el
   * piso y la aplicación no podía subir ni un decibel. El ajuste normal de
   * monitores —que el usuario autorizó explícitamente— quedaba imposible por una
   * regla que venía de otro contexto.
   *
   * **El contexto importa y se había perdido.** La pregunta que el usuario
   * respondió con «hasta donde estaba antes de que yo lo bajara» estaba en el
   * bloque de **diagnóstico de acoples**, entre «provocar el acople» y «acople
   * combinado». Era el techo para **restaurar algo que se bajó**, no un tope
   * general. La línea contigua de sus respuestas dice otra cosa: «*Sí, y también
   * para el ajuste normal de monitores*».
   *
   * Decisión del usuario, 2026-09-12: el techo existe **sólo si la app bajó**.
   *
   * **Queda una diferencia con sus palabras, y no se tapa.** Él dijo «antes de
   * que **yo** lo bajara»; esto se ancla en lo que bajó **la aplicación**. Si él
   * baja a mano, la app no se entera: haría falta seguir los cambios externos, y
   * eso no existe todavía.
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
  /**
   * Las rutas cuyo **nivel de trabajo** esta sesión ya estableció.
   *
   * **Es lo que separa las dos operaciones de ADR-034**: poner el nivel de un
   * monitor y retocarlo. Una ruta que no está acá está en la primera —la cuña
   * todavía no tiene nivel, la aplicación la está subiendo con el músico
   * escuchando entre paso y paso— y su presupuesto acumulado queda suspendido a
   * cambio del techo de nominal. Una que sí está, está en la segunda: vuelven los
   * 4 dB de ADR-028, medidos **desde el nivel establecido**.
   *
   * **No lo declara quien propone: sale del diario, y se cruza.** Es la
   * diferencia entre este conjunto y una bandera en el cambio, y no es cosmética.
   * Una etiqueta que suspende un presupuesto y que la pone quien quiere el
   * permiso es pedir la exención diciendo que se la merece —el defecto que
   * `correspondeExencionDeSistema` cerró cruzando lo declarado contra lo que la
   * transacción de verdad tocaba—.
   *
   * **Y esta frase estuvo escrita antes de ser cierta, que es peor que el
   * agujero que describía.** La primera versión aceptaba la lista del diario tal
   * cual: sin cruzarla contra las rutas que la transacción movió, sin exigir que
   * el cambio se hubiera aplicado, y sin mirar de qué parámetro se trataba. Una
   * auditoría adversarial del 2026-09-17 lo midió moviendo **30 dB de ganancia
   * de previo** con el motor viendo el acumulado siempre en cero, marcando
   * `hw.0.gain` en cada transacción. La autodeclaración no se había eliminado:
   * se había mudado de quien propone la transacción a quien escribe el diario.
   *
   * Ahora `historialDeLaSesion` exige las tres cosas: que **esa** transacción
   * haya movido la ruta **y que el cambio se haya verificado**, que el parámetro
   * **declare techo** —porque suspender el presupuesto sin un techo que lo
   * reemplace no es lo que ADR-034 decidió— y que la ruta **no estuviera ya
   * establecida**, porque volver a marcarla devolvía el presupuesto entero tantas
   * veces como uno quisiera.
   *
   * **Vacío significa «ninguna cuña tiene nivel todavía», que es lo cierto al
   * empezar un soundcheck** y lo que hace falta para que la aplicación pueda
   * levantarlas. No es el caso permisivo por descuido: el techo de nominal sigue
   * corriendo, el tope de 2 dB por paso sigue corriendo, y el motor sigue
   * exigiendo una medición entre un paso y el siguiente.
   *
   * **Quién lo llena, y qué falta.** `EntradaDiario.nivelEstablecidoEn` lo
   * registra y `historialDeLaSesion` lo reconstruye. Quien lo **marca** es la
   * pantalla de monitor, cuando el músico dice que así está bien: esa pantalla no
   * existe todavía, así que hoy ninguna ruta llega a establecerse. La
   * consecuencia está dicha con todas las letras en ADR-034 y en el `CHANGELOG`.
   */
  readonly rutasConNivelEstablecido: ReadonlySet<string>;
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
  /**
   * La magnitud que el motor juzga no es la que el crudo produce.
   *
   * Sólo se puede levantar en las rutas cuya ley de conversión está **medida
   * contra el aparato**. Ver `magnitud-atada.ts`: hasta el 2026-09-13 no había
   * ninguna, y por eso este código no podía existir.
   */
  | 'MAGNITUD_NO_ATADA'
  /**
   * Los decibeles de partida declarados no son los que produce el crudo de partida.
   *
   * **Dice eso y no «no es donde la consola tiene el parámetro»**, que es lo que
   * decía la primera versión de este comentario y una auditoría de fidelidad
   * corrigió el mismo día. El motor no lee la consola: compara dos números que
   * declara el mismo llamador. Quien compara contra la consola es el adaptador,
   * después, y devuelve `CONFLICT`. Entre las dos guardas **ninguna escritura
   * sale con el movimiento mal medido**, que es la garantía que se sostiene.
   *
   * **No es `MAGNITUD_NO_ATADA` y tiene código propio a propósito**, por la
   * misma razón que `TECHO_ABSOLUTO` no es `DELTA_EXCEDIDO`: son dos defectos
   * distintos y con un solo código un test de uno pasaría por el otro. El
   * destino mal declarado escribe en el cable un número que el motor no juzgó;
   * el origen mal declarado escribe el número correcto, y hace que el motor
   * mida el salto desde un punto donde el parámetro no está.
   *
   * Lo encontró una auditoría el 2026-09-17: **31 dB en la cuña de un músico
   * pasando el tope de 2 dB por paso con sólo declarar que venía de un decibel
   * más abajo.** Ver `verificarAtaduraDelOrigen` en `magnitud-atada.ts`, que
   * explica por qué el crudo de partida sí estaba atado y los decibeles no.
   */
  | 'ORIGEN_NO_ATADO'
  /**
   * Se pidió salir del silencio hacia un sitio que no es el mínimo escribible,
   * o sobre un parámetro que el usuario no autorizó para eso.
   *
   * **Es el borde que ADR-034 nombró y que hasta el 2026-09-19 no tenía salida.**
   * Desde el silencio la ley medida no da ningún punto de partida en decibeles
   * --ni finito, que no coincide, ni −∞, que no es un número-- así que una cuña
   * apagada no se podía levantar por ninguna vía. El caso con nombre propio la
   * levanta hasta **un solo destino**, el más bajo que la ley sabe escribir, y
   * este código es lo que sale cuando se pide cualquier otra cosa.
   *
   * **Código propio y no `ORIGEN_NO_ATADO`**, por la razón de siempre acá: son
   * dos defectos distintos --uno es un punto de partida falso, el otro un
   * destino no autorizado desde un punto de partida verdadero-- y con un solo
   * código un test de uno pasaría por el otro.
   *
   * **Por qué el destino es lo único que acota este movimiento.** El delta es
   * infinito y no hay tope que aplicarle; el destino, en cambio, es un punto
   * único leído de la ley, así que pincharlo acota tanto como un tope. Lo
   * decidió el usuario entre tres opciones.
   */
  | 'SALIDA_DEL_SILENCIO_NO_PERMITIDA'
  | 'RUTA_DESCONOCIDA'
  | 'Q_DEMASIADO_ESTRECHO'
  | 'REALCE_EXCESIVO'
  | 'PARAMETRO_DEL_USUARIO'
  | 'PARAMETRO_NO_ESCRIBIBLE'
  | 'DELTA_EXCEDIDO'
  | 'ACUMULADO_EXCEDIDO'
  /**
   * El parámetro quedaría por encima del techo que su tipo declara.
   *
   * **No es `DELTA_EXCEDIDO` y tiene código propio a propósito.** Los dos topes
   * de INV-004 dicen *cuánto se movió*; éste dice *dónde quedó*. Con el mismo
   * código, un test que compruebe el techo pasaría también si lo que frenó fue el
   * salto —que es exactamente la confusión que `techo-por-ruta.test.ts` tuvo que
   * desactivar a mano con un comentario.
   */
  | 'TECHO_ABSOLUTO'
  | 'SIN_MEDICION_INTERMEDIA'
  /**
   * La misma ruta aparece más de una vez en la misma transacción.
   *
   * **Código propio y no `DEMASIADOS_PARAMETROS`**, que cuenta cuántos
   * parámetros distintos se tocan: acá el problema no es la cantidad sino que
   * los topes se cobran por cambio y el movimiento real es la cadena. Con el
   * mismo código, un test de esto pasaría por el techo de cantidad de INV-005.
   *
   * Lo midió una auditoría adversarial el 2026-09-17b: **cuatro pasos honestos
   * de 2 dB en una transacción mueven la cuña 8 dB**, con el tope en 2, sin
   * mentir ningún número. Ver el comentario en `engine.ts`, que explica por qué
   * se rechaza en vez de acumular.
   */
  | 'RUTA_REPETIDA'
  /**
   * La transacción se declara «poner la banda» y no tiene esa forma.
   *
   * **Código propio y no `DEMASIADOS_PARAMETROS`**, por la razón de siempre acá:
   * un test de la forma pasaría por el techo de cantidad de INV-005. Lo que
   * falla puede ser la cantidad, el orden, la banda, el canal o la ganancia, y
   * el mensaje dice cuál.
   *
   * Es la misma familia que `correspondeExencionDeSistema`: la etiqueta la pone
   * quien quiere el permiso, así que el motor comprueba que el contenido la
   * respalde. Ver `poner-la-banda.ts` en `@vse/domain`, que explica por qué el
   * orden --la ganancia primero-- es parte de la decisión del usuario y no un
   * detalle de implementación.
   */
  | 'PONER_LA_BANDA_MAL_FORMADA'
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
