import type { AutonomyLevel } from '../entities/transaction.ts';
import type { ParameterKind } from './ownership.ts';

/**
 * Límites de cambio. Implementa INV-004 y INV-005.
 *
 * El tope por transacción evita el movimiento brusco. El tope acumulado por
 * sesión evita algo más sutil: encadenar cinco transacciones de tres decibeles
 * cumple el límite cinco veces y mueve quince decibeles. Por eso una nueva
 * transacción sobre el mismo parámetro exige que haya una medición posterior
 * a la anterior: obliga a comprobar el efecto antes de seguir moviendo.
 */

export interface Limite {
  readonly porTransaccion: number;
  readonly acumuladoPorSesion: number;
  readonly unidad: string;
  /**
   * Tope sobre la magnitud **resultante**, no sobre el movimiento.
   *
   * Los otros dos topes acotan *cuánto se mueve* el parámetro; éste acota *dónde
   * queda*. Son especies distintas y por eso convive con ellos en vez de
   * reemplazarlos: un parámetro puede quedar dentro del techo y aun así haber
   * dado un salto brusco para llegar.
   *
   * **Decisión del usuario, 2026-09-17**, eligiendo entre cuatro opciones sobre
   * hasta dónde puede subir la aplicación la cuña de un músico
   * ([ADR-034](../../../../docs/adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md)):
   * hasta **nominal**, la posición 0 dB. El control llega a +10; pasar de nominal
   * queda como decisión suya, no de la aplicación.
   *
   * **Y rige siempre, también al retocar**, que es una segunda decisión del
   * usuario del mismo día. ADR-034 escribió el techo pensando en la subida desde
   * el piso y dejó el retoque con «los topes de ADR-028 sin cambios», y así un
   * nivel establecido apenas debajo de nominal se cruzaba con un retoque normal
   * —sin que el usuario decidiera nada—. Preguntado entre tres opciones, eligió
   * que el techo rija siempre: **el techo es del parámetro, no de la operación.**
   * Lo que sí distingue a las dos operaciones es el presupuesto acumulado; ver
   * `nivelEstablecido` en {@link ContextoCambio}.
   *
   * Sin declarar, el parámetro no tiene techo propio y se rige sólo por los otros
   * dos topes. Declararlo tiene una consecuencia más, y está en
   * `nivelEstablecido`: es lo único que autoriza a suspender el acumulado.
   */
  readonly techoAbsoluto?: number;
  /**
   * Cuántos segundos tiene que durar la medición posterior para que cuente como
   * que se escuchó.
   *
   * **Es una tercera especie, y convive con las otras dos a propósito.** Los dos
   * primeros topes acotan *cuánto se mueve* el parámetro, `techoAbsoluto` acota
   * *dónde queda*, y éste acota *cuánto hay que esperar antes de volver a
   * moverlo*. Están juntos porque los cuatro se preguntan por clase de
   * parámetro y separarlos sería una segunda tabla que envejece aparte.
   *
   * **Decisión del usuario, 2026-09-18**, eligiendo entre cuatro opciones sobre
   * cuánto tiene que durar la escucha entre un paso y el siguiente: *«que lo
   * decida el tipo de parámetro»*. La alternativa era un solo número para toda
   * la aplicación.
   *
   * **Obligatorio y no opcional, por la misma razón que `magnitudPropuesta` en
   * `CambioPropuesto`:** así el compilador señala cada clase que se agregue a
   * esta tabla. Un campo opcional dejaría que una clase nueva naciera sin
   * criterio de escucha, y el que no lo declara es el que falla abierto.
   *
   * **Cero no es «sin criterio»**: es la decisión de que para ese parámetro el
   * efecto es instantáneo y no hay ventana que esperar. La medición tiene que
   * existir, ser de esta sesión, ser posterior y tener señal igual.
   */
  readonly escuchaMinimaS: number;
}

export const LIMITES: Readonly<Partial<Record<ParameterKind, Limite>>> = {
  CHANNEL_FADER: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB', escuchaMinimaS: 10 },
  PREAMP_GAIN: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB', escuchaMinimaS: 10 },
  CHANNEL_EQ: { porTransaccion: 4, acumuladoPorSesion: 6, unidad: 'dB', escuchaMinimaS: 10 },
  OUTPUT_EQ: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB', escuchaMinimaS: 10 },
  HPF: { porTransaccion: 1, acumuladoPorSesion: 2, unidad: 'octavas', escuchaMinimaS: 10 },
  OUTPUT_DELAY: { porTransaccion: 5, acumuladoPorSesion: 10, unidad: 'ms', escuchaMinimaS: 10 },
  // **Declarado y hoy inerte, a propósito y con su riesgo dicho.**
  // `MASTER_FADER` es `USER_ONLY` con `escribible: false` (INV-009), así que el
  // motor lo rechaza por propiedad antes de llegar acá y este tope no se evalúa
  // nunca. Se conserva porque es la decisión de cuánto se movería **si** alguna
  // vez se abriera, y borrarlo perdería esa decisión.
  //
  // El riesgo, que una auditoría marcó: **es un camino de 1 dB listo para el día
  // que alguien invierta el `escribible`**. Si eso pasa, el fader general queda
  // escribible con tope sin que nadie haya decidido abrirlo, porque el tope ya
  // estaba. La regla es que abrir `MASTER_FADER` necesita su propio ADR, igual
  // que la necesitó el envío a monitor; y el usuario ya decidió que la
  // aplicación pueda bajar el general para cazar un acople --«Los dos, con
  // techo»--, así que ese ADR está pendiente y no ausente. Ver
  // `docs/backlog/decision-bajar-buses-para-cazar-acoples.md`.
  MASTER_FADER: { porTransaccion: 1, acumuladoPorSesion: 1, unidad: 'dB', escuchaMinimaS: 10 },
  /**
   * **El silencio no tiene magnitud: es binario.** Un tope de «cuánto se mueve»
   * no significa nada acá, y por eso INV-004 lo rechazaba —con razón— hasta que
   * ADR-027 lo abrió para el diagnóstico.
   *
   * **Este `porTransaccion: 1` NO es «un canal por vez».** Acota la magnitud de
   * un cambio, y la magnitud de un silencio es siempre 1, así que dos silencios
   * en la misma transacción cumplen el tope los dos. La primera versión de este
   * comentario decía que sí lo hacía cumplir, y el test lo desmintió: la regla
   * de cuántos silencios entran en una transacción vive en el motor, que sí
   * cuenta.
   *
   * El acumulado es alto a propósito: un diagnóstico recorre varios candidatos
   * en la misma sesión, y cada uno es un silencio más su restauración. Doce
   * alcanza para probar seis canales, que es más de los que suelen estar
   * abiertos cuando aparece un acople.
   */
  //
  // **Y la escucha en cero, que es la única clase de esta tabla que lo lleva.**
  // Un silencio es binario y su efecto es instantáneo: el acople que se está
  // cazando o para o no para, y se oye en el momento. Exigir diez segundos de
  // ventana acá frenaría el diagnóstico justo cuando la sala está acoplando, que
  // es el momento en que nadie tiene diez segundos. Lo que sigue exigiéndose es
  // lo demás: que la medición exista, sea de esta sesión, sea posterior a la
  // escritura y tenga señal.
  CHANNEL_MUTE: {
    porTransaccion: 1, acumuladoPorSesion: 12, unidad: 'canales', escuchaMinimaS: 0,
  },
  /**
   * El envío a un monitor, en decibeles.
   *
   * **Se pudo declarar recién el 2026-09-12**, cuando la ley del envío quedó
   * **acotada**: `i.N.aux.M.value` no se desvía de `faderADb` más de **0,31 dB
   * —un escalón del medidor— sobre 27,87 dB** de recorrido.
   *
   * Las dos correcciones son de una auditoría. La cifra decía «0,25 dB sobre
   * 28 dB», que es el par del envío a **efectos** (medición 96b) y no el del
   * auxiliar: el 0,25 es el anteúltimo punto de la lista, no el máximo, y el 28
   * redondea 27,87 para arriba. Los dos ajustes iban en la dirección de la
   * conclusión. ADR-028 dice haberla propagado a tres archivos y quedaron dos
   * sin tocar, éste entre ellos.
   *
   * Y «medida» era de más: lo que hay es una **cota**, que dice que si hay
   * diferencia con `faderADb` es menor que la resolución del instrumento. No
   * dice que sean la misma ley --la medición 94 lo declara indecidible-- y para
   * declarar un límite en decibeles la cota alcanza. Antes de eso no había forma de convertir un pedido en
   * decibeles a un crudo, e INV-004 rechaza --con razón-- todo parámetro sin
   * límite declarado.
   *
   * **Más apretado que el fader de canal a propósito.** El fader de canal lo
   * escucha el operador, que está mirando; el monitor lo escucha el músico, que
   * está tocando y no puede avisar. Tres decibeles de golpe en una cuña son
   * mucho más de lo que parecen desde la consola.
   *
   * El techo de «hasta donde estaba» es una regla aparte y vive en el motor:
   * ver `techoPorRuta` en `ContextoSeguridad`.
   */
  MONITOR_AUX_SEND: {
    porTransaccion: 2, acumuladoPorSesion: 4, unidad: 'dB',
    // **Diez segundos, que es el número que la aplicación ya usa** para decidir
    // si una medición de ganancia duró lo suficiente para significar algo
    // (`DURACION_MINIMA_S` en `packages/assistants/src/gain.ts`). Reusarlo en vez
    // de elegir otro mantiene un solo criterio de «esto se midió lo bastante» en
    // toda la aplicación, y sobre todo **no inventa una cifra**: no hay ninguna
    // medición acústica que diga cuánto necesita un músico para juzgar su cuña.
    // El día que la haya, este número se cambia acá y el motor no se toca.
    escuchaMinimaS: 10,
    // Nominal. Ver `techoAbsoluto`: es el único tope de esta tabla que dice
    // **dónde queda** el parámetro y no cuánto se movió, y es lo que hace
    // posible la rampa de ADR-034 sin dejarla sin freno.
    techoAbsoluto: 0,
  },
};

/** Factor de calidad mínimo en salidas: filtros estrechos sin evidencia, no. */
export const Q_MINIMO_SALIDA = 0.7;

/** Realce máximo en ecualización de sala. Se prefieren atenuaciones. */
export const REALCE_MAXIMO_SALA_DB = 2;

export const MAX_PARAMETROS_POR_TRANSACCION: Readonly<Record<AutonomyLevel, number>> = {
  OBSERVE: 0,
  SUGGEST: 0,
  ASSISTED: 4,
  AUTO: 1,
};

/** Milisegundos mínimos entre escrituras consecutivas. */
export const PACING_MS: Readonly<Record<'ASSISTED' | 'AUTO' | 'SYSTEM', number>> = {
  ASSISTED: 100,
  AUTO: 100,
  // Las transacciones de sistema quedan exentas del límite de cuatro
  // parámetros: seleccionar un canal en el bus de análisis exige poner a menos
  // infinito los otros veintitrés envíos. A cien milisegundos cada uno serían
  // más de dos segundos, incompatible con el tiempo de conmutación exigido.
  SYSTEM: 20,
};

/**
 * Las operaciones que INV-005 llama «transacciones System».
 *
 * No es un nivel de autonomía: la autonomía dice cuánta libertad le dio el
 * usuario a la aplicación, y una operación de sistema es de otra naturaleza
 * —mover el bus de análisis, reservar el reproductor, silenciar un componente
 * para medirlo, calibrar—. Por eso se deriva del tipo de operación y no de una
 * bandera que quien propone pueda encender: pedir la exención no puede ser tan
 * fácil como decir que se la merece.
 */
export const OPERACIONES_DE_SISTEMA: ReadonlySet<string> = new Set([
  'ANALYSIS_BUS_SELECT', 'PLAYER_RESERVE', 'RESTAURAR_RESERVA',
  'MUTE_COMPONENTE', 'RESTAURAR_MUTES', 'CALIBRACION',
]);

export function esOperacionDeSistema(tipoDeOperacion: string | undefined): boolean {
  return tipoDeOperacion !== undefined && OPERACIONES_DE_SISTEMA.has(tipoDeOperacion);
}

/**
 * Qué parámetros puede tocar cada operación de sistema.
 *
 * Sin esto, la exención se pedía diciendo que se la merecía:
 * `tipoDeOperacion` es una cadena libre que provee quien propone la
 * transacción, y nada la cruzaba con lo que la transacción de verdad tocaba.
 * Poner `'ANALYSIS_BUS_SELECT'` subía el máximo a infinito y bajaba el ritmo a
 * veinte milisegundos aunque los cambios fueran ocho faders de canal — y el
 * propio test que agregué para la exención hacía exactamente eso.
 *
 * La clase real sale de la ruta, que es lo que el motor ya deriva para
 * INV-008/INV-010. La declaración no se cree: se comprueba.
 */
export const PARAMETROS_DE_OPERACION_DE_SISTEMA:
  Readonly<Record<string, readonly ParameterKind[]>> = {
  ANALYSIS_BUS_SELECT: ['ANALYSIS_BUS_SEND'],
  PLAYER_RESERVE: ['PLAYER_MUTE', 'PLAYER_FADER', 'PLAYER_SEND'],
  RESTAURAR_RESERVA: ['PLAYER_MUTE', 'PLAYER_FADER', 'PLAYER_SEND'],
  MUTE_COMPONENTE: ['PA_BUS_MUTE'],
  RESTAURAR_MUTES: ['PA_BUS_MUTE'],
  // Vacío a propósito: la calibración es de la interfaz de audio y todavía no
  // se sabe qué parámetro de consola tocaría, si alguno. Hasta que un spike lo
  // diga, la etiqueta no concede exención.
  CALIBRACION: [],
};

/**
 * Si corresponde la exención de sistema para estos cambios.
 *
 * Se exige que la operación esté declarada **y** que cada cambio toque un
 * parámetro que esa operación puede tocar. Una transacción vacía no la obtiene:
 * no hay nada que la justifique.
 */
export function correspondeExencionDeSistema(
  tipoDeOperacion: string | undefined,
  clasesReales: readonly ParameterKind[],
): boolean {
  if (!esOperacionDeSistema(tipoDeOperacion)) return false;
  const permitidas = PARAMETROS_DE_OPERACION_DE_SISTEMA[tipoDeOperacion!] ?? [];
  if (permitidas.length === 0 || clasesReales.length === 0) return false;
  return clasesReales.every((k) => permitidas.includes(k));
}

/**
 * Cuántos parámetros admite una transacción.
 *
 * Las de sistema están exentas del límite de cuatro (INV-005): seleccionar un
 * canal en el bus de análisis exige poner a menos infinito los otros veintitrés
 * envíos, y con el límite de ASSISTED esa operación se rechazaría entera. La
 * exención estaba enunciada en la invariante y **no se podía ni expresar**,
 * porque el máximo se resolvía solo por nivel de autonomía.
 */
export function maximoDeParametros(
  nivel: AutonomyLevel,
  tipoDeOperacion?: string,
  clasesReales: readonly ParameterKind[] = [],
): number {
  return correspondeExencionDeSistema(tipoDeOperacion, clasesReales)
    ? Number.POSITIVE_INFINITY
    : MAX_PARAMETROS_POR_TRANSACCION[nivel];
}

/**
 * Milisegundos que hay que esperar entre dos escrituras de una transacción.
 *
 * `PACING_MS` estaba escrita en este archivo y **no la importaba ningún código
 * de producción**: el ejecutor llevaba un 100 a mano y nunca bajaba a 20. El
 * único test que la usaba comprobaba que dos literales del mismo archivo
 * guardaran entre sí la relación que el propio archivo escribió, que es una
 * tautología y no una conducta.
 */
export function pacingMs(
  nivel: AutonomyLevel,
  tipoDeOperacion?: string,
  clasesReales: readonly ParameterKind[] = [],
): number {
  if (correspondeExencionDeSistema(tipoDeOperacion, clasesReales)) return PACING_MS.SYSTEM;
  return nivel === 'AUTO' ? PACING_MS.AUTO : PACING_MS.ASSISTED;
}

export type ResultadoLimite =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly codigo: 'DELTA_CAP' | 'CUMULATIVE_CAP'
    | 'SIN_LIMITE_DECLARADO' | 'SIN_MEDICION_INTERMEDIA' | 'UNIDAD_NO_DECLARADA'
    | 'TECHO_ABSOLUTO' | 'SIN_MAGNITUD_RESULTANTE' | 'MAGNITUD_NO_NUMERICA';
    readonly mensaje: string };

export interface ContextoCambio {
  readonly kind: ParameterKind;
  readonly deltaSolicitado: number;
  /**
   * Desplazamiento **neto y con signo** respecto a la **referencia vigente**.
   *
   * **La referencia es el valor inicial de la sesión, salvo que alguien haya
   * establecido un nivel de trabajo para ese parámetro**; desde ahí se cuenta
   * desde el nivel establecido. Lo decide quien reconstruye el acumulado
   * --`historialDeLaSesion`--, no esta función. Este docblock decía «respecto al
   * valor inicial de la sesión» después de que el productor cambiara de
   * definición, así que el productor y el consumidor describían dos referencias
   * distintas; lo marcó una auditoría de fidelidad el 2026-09-17.
   *
   * Con signo, no en valor absoluto. La diferencia no es de estilo: INV-004
   * define el tope como «respecto al valor inicial», o sea que el parámetro
   * debe permanecer dentro de `inicial ± tope`. Sumando magnitudes, la regla
   * permitía seguir alejándose hasta agotar el presupuesto y después prohibía
   * **la única dirección segura**, la que devuelve el parámetro hacia donde
   * estaba: un canal que subió 6 dB en la prueba y resulta estar alto en el
   * show no se podía bajar.
   */
  readonly acumuladoEnSesion: number;
  /** Si hay una medición posterior a la última transacción sobre este parámetro. */
  readonly hayMedicionPosterior: boolean;
  readonly esPrimerCambioDelParametro: boolean;
  /**
   * La unidad en que quien propone dice que están sus magnitudes.
   *
   * **Se compara contra la declarada, y antes no se comparaba con nada.** El
   * campo `unidad` de `CambioPropuesto` existía, se copiaba al diario, y lo
   * único que hacía era aparecer en los mensajes de error de este archivo. Así
   * que un llamador podía declarar `dB` sobre un parámetro cuyo tope está en
   * octavas o en canales, y el tope se comparaba igual: un número contra otro
   * de otra especie.
   *
   * Es la mitad que faltaba del episodio de INV-004. La otra mitad --comparar
   * decibeles contra crudo-- se cerró el 2026-09-11 haciendo obligatorias las
   * magnitudes; ésta la encontró una auditoría de seguridad el 2026-09-12, y la
   * demostró midiendo: una escritura de recorrido completo, crudo 0 a 1,
   * aprobada bajo un techo de −6 dB declarando magnitudes −31 a −30.
   *
   * Lo que esto **no** cierra, y hay que decirlo: nada ata `magnitudPropuesta`
   * al `valorPropuesto` que va al cable. El motor juzga lo que el llamador
   * declara. Comparar la unidad hace que declarar mal sea un error visible en
   * vez de uno silencioso, y atar la magnitud al crudo necesita las leyes de
   * conversión verificadas, que para varios parámetros todavía no están.
   */
  readonly unidad: string;
  /**
   * A cuánto quedaría el parámetro si el cambio se aplica, en la unidad de arriba.
   *
   * Es lo que compara `techoAbsoluto`, y es un dato que el motor ya tiene
   * —`CambioPropuesto.magnitudPropuesta`— pero que hasta hoy no le llegaba a esta
   * función: los tres topes anteriores hablan de movimiento, y del movimiento
   * alcanza con el delta.
   *
   * **Opcional, pero obligatorio cuando el tope existe.** Si el parámetro declara
   * `techoAbsoluto` y esto viene sin declarar, el cambio se **rechaza**: no se
   * puede comprobar un techo contra un número que nadie mandó, y dejarlo pasar
   * sería tener el tope escrito y no corriendo, que es el defecto que este
   * proyecto ya pagó con `techoPorRuta` y con INV-034.
   */
  readonly magnitudResultante?: number;
  /**
   * Si esta sesión ya estableció un nivel de trabajo para este parámetro.
   *
   * **Es lo que separa poner el nivel de retocarlo** (ADR-034). El presupuesto
   * acumulado mide cuánto se corrió el parámetro respecto de una referencia, y
   * esa referencia sólo significa algo si alguien la puso ahí a propósito. Con
   * las cuñas de los monitores en el piso al empezar el soundcheck, la referencia
   * es el piso, y proteger 4 dB alrededor del piso no protege a nadie: deja al
   * músico sin monitor y al soundcheck sin terminar.
   *
   * Mientras el nivel **no** está establecido, el presupuesto acumulado se
   * suspende y lo que acota es `techoAbsoluto`. Una vez establecido, el
   * presupuesto vuelve entero y se mide **desde el nivel establecido**, que es
   * trabajo de quien reconstruye el acumulado y no de acá.
   *
   * **Sin declarar significa «establecido», y falla cerrado a propósito.** Lo
   * normal es que el presupuesto rija; suspenderlo es la excepción, y una
   * excepción que se obtiene por omisión es una excepción que alguien va a
   * obtener sin querer.
   *
   * **Y la suspensión sólo se concede si el parámetro declara `techoAbsoluto`.**
   * Un presupuesto suspendido sin un techo que lo reemplace deja el parámetro sin
   * ningún freno sobre el total, y eso no es lo que ADR-034 decidió: decidió
   * cambiar un freno por otro, no sacar uno.
   */
  readonly nivelEstablecido?: boolean;
}

export function verificarLimite(c: ContextoCambio): ResultadoLimite {
  const lim = LIMITES[c.kind];
  if (!lim) {
    return {
      permitido: false,
      codigo: 'SIN_LIMITE_DECLARADO',
      mensaje: `no hay límite declarado para ${c.kind}: no se escribe`,
    };
  }
  if (c.unidad !== lim.unidad) {
    return {
      permitido: false,
      codigo: 'UNIDAD_NO_DECLARADA',
      mensaje: `${c.kind} tiene su tope en ${lim.unidad} y el cambio declara ${c.unidad}: `
        + 'comparar los dos numeros seria comparar especies distintas',
    };
  }
  // **Un número que no es un número pasaba TODOS los topes de esta función.**
  // Toda comparación con `NaN` da `false`, así que `Math.abs(NaN) > tope` es
  // `false`, `Math.abs(NaN) > acumulado` es `false` y `NaN > techo` también:
  // un cambio que declarara `NaN` en su magnitud quedaba aprobado por INV-004
  // entera. Y no se quedaba ahí: `verificarAtadura` --la guarda que comprueba
  // que el motor juzgue el mismo número que va al cable-- devolvía `atada: true`
  // por el mismo motivo, así que el `NaN` pasaba **con cualquier crudo**.
  //
  // No estaba expuesto --los dos servicios de producción calculan magnitudes
  // finitas-- y el motor es justamente la pieza que no puede depender de que
  // quien lo llama haga las cosas bien. Comprobado de las dos puntas el
  // 2026-09-17 antes de taparlo.
  //
  // **Sólo `NaN`, y los infinitos se dejan como están, a propósito.** Un delta
  // infinito ya lo rechaza el tope de abajo --`Infinity > 2`-- y eso es lo
  // correcto mientras nadie sepa proponer un salto desde el silencio; cuando
  // ADR-034 lo construya, la excepción va a ser deliberada y con su nombre, no
  // un agujero heredado.
  // **Y no alcanza con mirar `NaN`, que fue la primera versión de esta guarda.**
  // Una auditoría del mismo día la midió: `null`, `[]` y `{}` pasaban el techo
  // igual que `NaN` --`null > 0` es `false`, y `null ?? 0` ni siquiera llegaba a
  // la comprobación--, y una cadena o un booleano hacían estallar el mensaje del
  // rechazo con `TypeError: ….toFixed is not a function`, o sea fallando cerrado
  // pero como caída, que es lo que `engine.ts` dice explícitamente que no quiere.
  // Se tapó `NaN` y se dejó abierto al vecino de al lado.
  //
  // Se comprueba **el tipo y después el valor**: lo que no es un número no se
  // compara con un tope, y lo que es `NaN` tampoco.
  for (const [que, n] of [
    ['el movimiento pedido', c.deltaSolicitado],
    ['lo acumulado en la sesión', c.acumuladoEnSesion],
    // Sin `?? 0`: ese valor por omisión escondía el `null`. La ausencia de
    // verdad --`undefined`-- la contesta `SIN_MAGNITUD_RESULTANTE` más abajo, y
    // sólo para los tipos que declaran techo.
    ...(c.magnitudResultante === undefined
      ? [] : [['a cuánto quedaría', c.magnitudResultante] as const]),
  ] as const) {
    if (typeof n !== 'number' || Number.isNaN(n)) {
      return {
        permitido: false,
        codigo: 'MAGNITUD_NO_NUMERICA',
        mensaje: `${que} no es un número (${String(n)}) en ${c.kind}: un tope no se `
          + 'comprueba contra algo que no se puede comparar, y toda comparación con '
          + '`NaN` --o con lo que no es un número-- es falsa',
      };
    }
  }

  const delta = Math.abs(c.deltaSolicitado);
  if (delta > lim.porTransaccion) {
    return {
      permitido: false,
      codigo: 'DELTA_CAP',
      mensaje: `${delta} ${lim.unidad} supera el máximo por transacción de ${lim.porTransaccion}`,
    };
  }
  // **El techo va antes que el acumulado porque el acumulado puede no correr.**
  // Mientras el nivel no está establecido, el techo es lo ÚNICO que acota el
  // total: comprobarlo después de un `return` que no ocurre lo dejaría sin
  // correr justo en el caso para el que se escribió.
  if (lim.techoAbsoluto !== undefined) {
    if (c.magnitudResultante === undefined) {
      return {
        permitido: false,
        codigo: 'SIN_MAGNITUD_RESULTANTE',
        mensaje: `${c.kind} tiene un techo de ${lim.techoAbsoluto} ${lim.unidad} y el cambio `
          + 'no declara a cuánto quedaría: un techo no se comprueba contra un número ausente',
      };
    }
    if (c.magnitudResultante > lim.techoAbsoluto) {
      return {
        permitido: false,
        codigo: 'TECHO_ABSOLUTO',
        mensaje:
          `el parámetro quedaría en ${c.magnitudResultante.toFixed(1)} ${lim.unidad} y el `
          + `techo es ${lim.techoAbsoluto}: pasar de ahí es decisión del usuario`,
      };
    }
  }

  // **El presupuesto acumulado se suspende mientras no haya un nivel del que
  // desviarse**, y sólo si hay un techo que lo reemplace. Ver `nivelEstablecido`.
  const presupuestoRige = c.nivelEstablecido !== false || lim.techoAbsoluto === undefined;
  // El desplazamiento resultante, no la suma de magnitudes: un movimiento que
  // acerca el parámetro a su valor inicial siempre es admisible.
  const resultante = c.acumuladoEnSesion + c.deltaSolicitado;
  if (presupuestoRige && Math.abs(resultante) > lim.acumuladoPorSesion) {
    return {
      permitido: false,
      codigo: 'CUMULATIVE_CAP',
      mensaje:
        `el parámetro quedaría a ${resultante.toFixed(1)} ${lim.unidad} de su valor ` +
        `inicial, y el máximo por sesión es ${lim.acumuladoPorSesion}`,
    };
  }
  if (!c.esPrimerCambioDelParametro && !c.hayMedicionPosterior) {
    return {
      permitido: false,
      codigo: 'SIN_MEDICION_INTERMEDIA',
      mensaje:
        'no hay una medición posterior al último cambio de este parámetro. ' +
        'Hay que comprobar el efecto antes de volver a moverlo.',
    };
  }
  return { permitido: true };
}
