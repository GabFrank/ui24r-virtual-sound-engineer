/**
 * Tabla de conversión entre las rutas crudas del protocolo y unidades físicas.
 *
 * Implementa ADR-006. La regla que hace este archivo necesario: la biblioteca
 * del protocolo no expone filtro, ecualizador, compresor ni puerta con interfaz
 * tipada. Sus claves existen en el modelo de estado, pero **el escalado de los
 * valores es desconocido**. Escribir un valor mal convertido en una consola
 * conectada a un sistema de amplificación produce un cambio extremo.
 *
 * Por eso: ninguna ruta sin entrada en esta tabla se escribe, y ningún valor
 * fuera de su rango físico se envía. Las entradas se llenan con los resultados
 * medidos en los spikes de capacidades, no a ojo.
 */

export interface RawMapEntry {
  readonly path: string;
  readonly unidad: string;
  readonly rawMin: number;
  readonly rawMax: number;
  readonly fisicoMin: number;
  readonly fisicoMax: number;
  /** Estado de la evidencia. Solo `PROBADO` habilita escritura. */
  readonly estado: 'PROBADO' | 'INFERIDO' | 'DESCONOCIDO';
  readonly spike: string;
  toRaw(fisico: number): number;
  fromRaw(raw: number): number;
}

/** Conversión lineal. Sirve de punto de partida hasta que un spike mida la curva real. */
function lineal(
  path: string,
  unidad: string,
  fisicoMin: number,
  fisicoMax: number,
  estado: RawMapEntry['estado'],
  spike: string,
): RawMapEntry {
  return {
    path, unidad, rawMin: 0, rawMax: 1, fisicoMin, fisicoMax, estado, spike,
    toRaw: (f) => (f - fisicoMin) / (fisicoMax - fisicoMin),
    fromRaw: (r) => fisicoMin + r * (fisicoMax - fisicoMin),
  };
}

/**
 * Tabla inicial.
 *
 * Está casi vacía a propósito: llenarla con conversiones inventadas sería
 * exactamente el riesgo que esta tabla existe para evitar. Las entradas se
 * agregan al cerrar cada spike, con su evidencia.
 */
export const RAW_MAP: readonly RawMapEntry[] = [
  // Pendiente de SPK-P0.2b: filtro, ecualizador, compresor, puerta, deesser.
  // Pendiente de SPK-P0.2c: ecualización de salida, retardo, polaridad.
  lineal('i.N.eq.hpf.freq', 'Hz', 20, 400, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.eq.b1.gain', 'dB', -15, 15, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.eq.b1.freq', 'Hz', 20, 20000, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.eq.b1.q', 'Q', 0.3, 10, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.dyn.threshold', 'dB', -60, 0, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.dyn.ratio', ':1', 1, 20, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.gate.thresh', 'dB', -80, 0, 'DESCONOCIDO', 'SPK-P0.2b'),
];

const PORPATH = new Map(RAW_MAP.map((e) => [e.path, e]));

export type ResultadoConversion =
  | { readonly ok: true; readonly raw: number }
  | { readonly ok: false; readonly codigo: 'SIN_MAPEO' | 'NO_PROBADO' | 'FUERA_DE_RANGO'; readonly mensaje: string };

/**
 * Convierte un valor físico a crudo, o explica por qué no se puede.
 *
 * Devolver un error en vez de lanzar es deliberado: quien llama tiene que
 * decidir qué hacer, y en varios casos la respuesta correcta es proponer el
 * valor absoluto para que el usuario lo aplique a mano.
 */
export function aRaw(path: string, fisico: number): ResultadoConversion {
  const e = PORPATH.get(path);
  if (!e) {
    return {
      ok: false,
      codigo: 'SIN_MAPEO',
      mensaje: `${path} no está en la tabla de conversión: no se escribe`,
    };
  }
  if (e.estado !== 'PROBADO') {
    return {
      ok: false,
      codigo: 'NO_PROBADO',
      mensaje:
        `${path} tiene estado ${e.estado}. La conversión no está verificada en ` +
        `hardware (${e.spike}): se propone el valor absoluto para aplicar a mano`,
    };
  }
  if (fisico < e.fisicoMin || fisico > e.fisicoMax) {
    return {
      ok: false,
      codigo: 'FUERA_DE_RANGO',
      mensaje: `${fisico} ${e.unidad} está fuera del rango físico [${e.fisicoMin}, ${e.fisicoMax}]`,
    };
  }
  return { ok: true, raw: e.toRaw(fisico) };
}

export function entrada(path: string): RawMapEntry | undefined {
  return PORPATH.get(path);
}

/** Rutas con conversión verificada. Son las únicas escribibles por vía cruda. */
export function rutasProbadas(): readonly string[] {
  return RAW_MAP.filter((e) => e.estado === 'PROBADO').map((e) => e.path);
}
