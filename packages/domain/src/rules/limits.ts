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

export type ResultadoLimite =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly codigo: 'DELTA_CAP' | 'CUMULATIVE_CAP' | 'SIN_LIMITE_DECLARADO' | 'SIN_MEDICION_INTERMEDIA'; readonly mensaje: string };

export interface ContextoCambio {
  readonly kind: ParameterKind;
  readonly deltaSolicitado: number;
  /** Cuánto se movió ya este parámetro en la sesión, respecto al valor inicial. */
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
  const acumulado = Math.abs(c.acumuladoEnSesion) + delta;
  if (acumulado > lim.acumuladoPorSesion) {
    return {
      permitido: false,
      codigo: 'CUMULATIVE_CAP',
      mensaje:
        `el acumulado de la sesión llegaría a ${acumulado.toFixed(1)} ${lim.unidad}, ` +
        `por encima del máximo de ${lim.acumuladoPorSesion}`,
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
