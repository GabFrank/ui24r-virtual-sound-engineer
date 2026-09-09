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

/**
 * Conversión leída del `mixer.html` de la consola.
 *
 * No es lo mismo que `PROBADO` —nadie la comprobó contra el aparato midiendo—
 * pero tampoco es una suposición nuestra: es la función que usa el cliente
 * oficial. Queda en `INFERIDO`, que es lo que `aRaw()` sigue rechazando para
 * escribir, y con eso la tabla deja de mentir en las dos direcciones.
 */
function deLaConsola(
  path: string,
  unidad: string,
  fromRaw: (raw: number) => number,
  toRaw: (fisico: number) => number,
): RawMapEntry {
  return {
    path, unidad, rawMin: 0, rawMax: 1,
    fisicoMin: fromRaw(0), fisicoMax: fromRaw(1),
    estado: 'INFERIDO', spike: 'SPK-P0.2b',
    toRaw, fromRaw,
  };
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
  // **Estas tres NO son lineales, y las de antes estaban inventadas.** Decían
  // -60..0, 1..20 y -80..0, a ojo, en un archivo cuya cabecera promete que las
  // entradas salen de mediciones. Las funciones reales estan leidas del
  // `mixer.html` de la consola y escritas en `protocol-spec.md` §4.4.
  //
  // La del ratio es la que mas dano hace: el crudo 1 es **1:1, o sea sin
  // comprimir**, no el maximo. Suponerlo al reves costo una corrida entera de
  // esta sesion, hecha con el compresor puesto en "no comprimir" y concluyendo
  // que la reduccion no se veia.
  deLaConsola('i.N.dyn.threshold', 'dB', (a) => -90 + 96 * a, (db) => (db + 90) / 96),
  deLaConsola('i.N.gate.depth', 'dB', (a) => 60 * a - 60, (db) => (db + 60) / 60),
  // `i.N.dyn.ratio` **no esta en la tabla, a proposito.** Su funcion se conoce
  // --`VtoRATIO(a) = 1/a`-- pero el crudo minimo no: en 0 la razon es infinita,
  // asi que no hay rango fisico que declarar sin inventarlo, y una entrada con
  // el rango inventado es justamente lo que se acaba de sacar de aca. Entra
  // cuando SPK-P0.2b mida hasta donde llega el crudo contra el aparato.
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
