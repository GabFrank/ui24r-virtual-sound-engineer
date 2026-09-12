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
  | { readonly permitido: false; readonly codigo: 'DELTA_CAP' | 'CUMULATIVE_CAP' | 'SIN_LIMITE_DECLARADO' | 'SIN_MEDICION_INTERMEDIA'; readonly mensaje: string };

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
