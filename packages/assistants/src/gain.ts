import type { ChannelProfile, Confidence } from '@vse/domain';
import { confianzaCanal } from '@vse/domain';

/**
 * Asistente de ganancia.
 *
 * Trabaja sobre la telemetría de la consola, no sobre la interfaz de audio
 * externa. La razón es que la cadena externa suma dos ganancias analógicas que
 * la aplicación no puede leer: el envío auxiliar y el preamplificador de la
 * interfaz, cuyo potenciómetro el usuario puede mover en cualquier momento.
 * El medidor de la consola, en cambio, es telemetría directa (ADR-004).
 *
 * Todo lo de este archivo son funciones puras: entra una ventana de medidas,
 * sale un análisis. Sin estado, sin red y sin framework, así que se prueba
 * entero con datos sintéticos.
 */

/** Una lectura del medidor previo al proceso, con su instante. */
export interface MuestraVu {
  readonly tMs: number;
  readonly db: number;
}

export interface AnalisisDeGanancia {
  readonly picoDb: number;
  /** Promedio energético, no promedio de decibeles: sumar decibeles no significa nada. */
  readonly promedioDb: number;
  /** Distancia entre el pico y el fondo de escala. */
  readonly margenDb: number;
  /** Fracción de muestras en zona de riesgo de saturación. */
  readonly probabilidadDeSaturacion: number;
  /** Desviación típica del nivel: cuánto varía la fuente. */
  readonly estabilidadDb: number;
  readonly rangoDinamicoDb: number;
  readonly muestras: number;
  readonly duracionS: number;
  readonly suficiente: boolean;
  readonly motivoInsuficiente: string | null;
}

/**
 * Umbral por encima del cual una muestra cuenta como riesgo de saturación.
 *
 * Provisional. El valor real se calibra en SPK-P0.10b enviando un tono de
 * −1 dBFS y leyendo qué marca el medidor: no está confirmado que la lectura
 * de cero del medidor corresponda al fondo de escala digital.
 */
export const UMBRAL_RIESGO_DB = -1;

/** Por debajo de esto se considera que la fuente no está sonando. */
export const UMBRAL_SILENCIO_DB = -50;

const DURACION_MINIMA_S = 10;
const MUESTRAS_MINIMAS = 60;

export function analizarVentana(muestras: readonly MuestraVu[]): AnalisisDeGanancia {
  if (muestras.length === 0) return vacio('la ventana no tiene ninguna muestra');

  const primera = muestras[0]!;
  const ultima = muestras[muestras.length - 1]!;
  const duracionS = (ultima.tMs - primera.tMs) / 1000;

  // Solo cuentan las muestras donde la fuente realmente sonó: promediar los
  // silencios entre frases hunde el promedio y arruina la recomendación.
  const conSenal = muestras.filter((m) => m.db > UMBRAL_SILENCIO_DB);

  if (conSenal.length < MUESTRAS_MINIMAS) {
    return {
      ...vacio(`solo ${conSenal.length} muestras con señal, hacen falta ${MUESTRAS_MINIMAS}`),
      muestras: conSenal.length,
      duracionS,
    };
  }

  let pico = -Infinity;
  let minimo = Infinity;
  let sumaPotencia = 0;
  let enRiesgo = 0;

  for (const m of conSenal) {
    if (m.db > pico) pico = m.db;
    if (m.db < minimo) minimo = m.db;
    // Promedio en potencia y de vuelta a decibeles. Promediar decibeles
    // directamente da un número que no corresponde a ninguna energía real.
    sumaPotencia += Math.pow(10, m.db / 10);
    if (m.db >= UMBRAL_RIESGO_DB) enRiesgo++;
  }

  const promedioDb = 10 * Math.log10(sumaPotencia / conSenal.length);
  const varianza =
    conSenal.reduce((acc, m) => acc + (m.db - promedioDb) ** 2, 0) / conSenal.length;

  return {
    picoDb: pico,
    promedioDb,
    margenDb: -pico,
    probabilidadDeSaturacion: enRiesgo / conSenal.length,
    estabilidadDb: Math.sqrt(varianza),
    rangoDinamicoDb: pico - minimo,
    muestras: conSenal.length,
    duracionS,
    suficiente: duracionS >= DURACION_MINIMA_S,
    motivoInsuficiente:
      duracionS >= DURACION_MINIMA_S
        ? null
        : `la ventana duró ${duracionS.toFixed(1)} s y hacen falta ${DURACION_MINIMA_S}`,
  };
}

function vacio(motivo: string): AnalisisDeGanancia {
  return {
    picoDb: -Infinity, promedioDb: -Infinity, margenDb: Infinity,
    probabilidadDeSaturacion: 0, estabilidadDb: 0, rangoDinamicoDb: 0,
    muestras: 0, duracionS: 0, suficiente: false, motivoInsuficiente: motivo,
  };
}

export interface PropuestaDeGanancia {
  readonly gainActualDb: number;
  readonly gainPropuestoDb: number;
  readonly deltaDb: number;
  /** Si el ajuste se recortó por el límite de cambio por transacción. */
  readonly recortadoPorLimite: boolean;
  readonly razon: string;
  readonly confianza: Confidence;
  readonly avisos: readonly string[];
}

/** Cambio máximo de ganancia en una sola propuesta (INV-004). */
export const DELTA_MAXIMO_DB = 3;

/**
 * Propone una ganancia a partir del análisis y del perfil de la fuente.
 *
 * El objetivo es dejar el pico a la distancia del fondo de escala que el
 * perfil pide. Un cajón necesita menos margen que una voz porque su dinámica
 * es más predecible; una voz necesita más porque el cantante va a gritar en el
 * estribillo aunque en la prueba no lo haya hecho.
 */
export function proponerGanancia(
  analisis: AnalisisDeGanancia,
  perfil: ChannelProfile,
  gainActualDb: number,
  opciones: {
    readonly repetidoEnDosCapturas: boolean;
    readonly snrDb: number;
    readonly calibracionValida: boolean;
  },
): PropuestaDeGanancia {
  const avisos: string[] = [];

  if (!analisis.suficiente && analisis.motivoInsuficiente) {
    avisos.push(analisis.motivoInsuficiente);
  }

  const margenObjetivo = perfil.margenObjetivoDb;

  // El signo importa y es fácil de invertir: si hay MENOS margen del que el
  // perfil pide, hay que BAJAR la ganancia para ganar margen. Un margen medido
  // de 4 dB contra un objetivo de 12 pide bajar 8, no subir 8. Escribirlo al
  // revés propondría empujar hacia la saturación justo el canal que ya está
  // cerca de ella.
  const deltaIdeal = analisis.margenDb - margenObjetivo;
  const recortado = Math.abs(deltaIdeal) > DELTA_MAXIMO_DB;
  const delta = recortado ? Math.sign(deltaIdeal) * DELTA_MAXIMO_DB : deltaIdeal;

  if (recortado) {
    avisos.push(
      `el ajuste ideal sería de ${deltaIdeal.toFixed(1)} dB, pero se propone ` +
      `${delta.toFixed(1)} y se vuelve a medir: un cambio grande de una sola vez ` +
      'no se puede verificar',
    );
  }

  if (analisis.probabilidadDeSaturacion > 0) {
    avisos.push(
      `${(analisis.probabilidadDeSaturacion * 100).toFixed(0)} % de las muestras ` +
      'estuvieron en zona de riesgo de saturación',
    );
  }

  if (analisis.rangoDinamicoDb > perfil.rangoDinamicoEsperadoDb + 6) {
    avisos.push(
      `la fuente varió ${analisis.rangoDinamicoDb.toFixed(0)} dB, más de lo esperado ` +
      `para ${perfil.nombre} (${perfil.rangoDinamicoEsperadoDb} dB). Puede ser una ` +
      'interpretación poco representativa, o hacer falta compresión',
    );
  }

  if (opciones.snrDb < perfil.snrMinimoDb) {
    avisos.push(
      `la relación señal a ruido es de ${opciones.snrDb.toFixed(0)} dB y el perfil ` +
      `espera al menos ${perfil.snrMinimoDb}. Puede haber ruido de fondo, o el ` +
      'micrófono estar lejos de la fuente',
    );
  }

  const confianza: Confidence = analisis.suficiente
    ? confianzaCanal({
        repetidoEnDosCapturas: opciones.repetidoEnDosCapturas,
        desviacionBandaOctavas: 0,
        snrDb: opciones.snrDb,
        calibracionValida: opciones.calibracionValida,
      })
    : 'INSUFFICIENT_DATA';

  const razon =
    `El pico llegó a ${analisis.picoDb.toFixed(1)} dBFS, lo que deja ` +
    `${analisis.margenDb.toFixed(1)} dB de margen. El perfil ${perfil.nombre} ` +
    `busca ${margenObjetivo} dB, así que la ganancia ` +
    (Math.abs(delta) < 0.05
      ? 'ya está donde corresponde'
      : `debería ${delta > 0 ? 'subir' : 'bajar'} ${Math.abs(delta).toFixed(1)} dB`) +
    '.';

  return {
    gainActualDb,
    gainPropuestoDb: gainActualDb + delta,
    deltaDb: delta,
    recortadoPorLimite: recortado,
    razon,
    confianza,
    avisos,
  };
}
