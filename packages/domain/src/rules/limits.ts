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
}

export const LIMITES: Readonly<Partial<Record<ParameterKind, Limite>>> = {
  CHANNEL_FADER: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB' },
  PREAMP_GAIN: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB' },
  CHANNEL_EQ: { porTransaccion: 4, acumuladoPorSesion: 6, unidad: 'dB' },
  OUTPUT_EQ: { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB' },
  HPF: { porTransaccion: 1, acumuladoPorSesion: 2, unidad: 'octavas' },
  OUTPUT_DELAY: { porTransaccion: 5, acumuladoPorSesion: 10, unidad: 'ms' },
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
  MASTER_FADER: { porTransaccion: 1, acumuladoPorSesion: 1, unidad: 'dB' },
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
  CHANNEL_MUTE: { porTransaccion: 1, acumuladoPorSesion: 12, unidad: 'canales' },
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
  MONITOR_AUX_SEND: { porTransaccion: 2, acumuladoPorSesion: 4, unidad: 'dB' },
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
    | 'SIN_LIMITE_DECLARADO' | 'SIN_MEDICION_INTERMEDIA' | 'UNIDAD_NO_DECLARADA';
    readonly mensaje: string };

export interface ContextoCambio {
  readonly kind: ParameterKind;
  readonly deltaSolicitado: number;
  /**
   * Desplazamiento **neto y con signo** respecto al valor inicial de la sesión.
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
  const delta = Math.abs(c.deltaSolicitado);
  if (delta > lim.porTransaccion) {
    return {
      permitido: false,
      codigo: 'DELTA_CAP',
      mensaje: `${delta} ${lim.unidad} supera el máximo por transacción de ${lim.porTransaccion}`,
    };
  }
  // El desplazamiento resultante, no la suma de magnitudes: un movimiento que
  // acerca el parámetro a su valor inicial siempre es admisible.
  const resultante = c.acumuladoEnSesion + c.deltaSolicitado;
  if (Math.abs(resultante) > lim.acumuladoPorSesion) {
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
