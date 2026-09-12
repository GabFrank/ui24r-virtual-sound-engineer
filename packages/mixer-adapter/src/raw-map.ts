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
  // entradas salen de mediciones. Las funciones de abajo estan **leidas del
  // `mixer.html` de la consola**, no medidas, y por eso van en estado INFERIDO.
  //
  // La del ratio importa por un motivo practico: el crudo 1 es **1:1, o sea sin
  // comprimir**, no el maximo. Suponerlo al reves costo una corrida entera,
  // hecha con el compresor puesto en "no comprimir" y concluyendo que la
  // reduccion no se veia.
  //
  // **Y el 2026-09-12 la medicion 97 REFUTO el modelo que estas dos describen.**
  // `docs/compromisos/97-leyes-del-compresor.md`: con `VtoTHRESH(a) = -90 + 96a`,
  // `VtoRATIO(a) = 1/a` y una rodilla dura, el exceso despejado va de 10,0 a
  // 25,6 dB **en la misma corrida, con fuente y umbral quietos**. Tiene que ser
  // constante y no lo es. Y no es culpa del instrumento: el medidor de reduccion
  // se calibro contra la caida real de nivel y sigue hasta 24,34 dB con 0,35 dB
  // de desvio.
  //
  // **Por que la entrada se queda igual.** `INFERIDO` ya impide escribir por
  // `aRaw()`, que es lo unico que podria sonar en la sala. Lo que hace falta
  // decir --y faltaba-- es que `fromRaw`, `fisicoMin` y `fisicoMax` de estas dos
  // entradas **se calculan con una ley refutada**: los -90 y +6 de `threshold`
  // son esa ley evaluada en 0 y en 1. O sea que leer un umbral por acá y
  // mostrarlo en decibeles muestra un numero que el aparato no respalda.
  //
  // Sacarlas seria peor: dejaria el parametro sin entrada, y una ruta sin
  // entrada no tiene unidad declarada, que es lo que INV-004 usa para rechazar.
  // Entran de vuelta con ley medida cuando el barrido de umbral x relacion este
  // hecho, que es el siguiente paso que la 97 declara.
  //
  // Lo encontro una auditoria de coherencia cruzada: la refutacion habia entrado
  // a la medicion y no a los dos lugares que la implementan.
  deLaConsola('i.N.dyn.threshold', 'dB', (a) => -90 + 96 * a, (db) => (db + 90) / 96),
  deLaConsola('i.N.gate.depth', 'dB', (a) => 60 * a - 60, (db) => (db + 60) / 60),
  deLaConsola('i.N.gate.thresh', 'dB', (a) => 96 * a - 90, (db) => (db + 90) / 96),
  // Del manual técnico del firmware 3.5.8328, que confirma las de arriba y
  // agrega estas. No están medidas contra el aparato: son del cliente, igual
  // que las otras de esta familia.
  deLaConsola('i.N.dyn.outgain', 'dB', (a) => 72 * a - 24, (db) => (db + 24) / 72),
  deLaConsola('i.N.deesser.freq', 'Hz', (a) => 2000 * Math.pow(7.5, a),
    (hz) => Math.log(hz / 2000) / Math.log(7.5)),
  // `i.N.dyn.ratio` **no esta en la tabla, a proposito**, y ahora hay dos
  // razones en vez de una.
  //
  // La primera: en 0 la razon seria infinita, asi que no hay rango fisico que
  // declarar sin inventarlo, y una entrada con el rango inventado es justamente
  // lo que se saco de aca.
  //
  // La segunda, del 2026-09-12: **`VtoRATIO(a) = 1/a` no describe este
  // aparato.** Este comentario decia «su funcion se conoce», que era demasiado.
  // La medicion 97 refuto el modelo entero: con `R = 1/a` el exceso despejado no
  // es constante, las pendientes por sustitucion dependen de la relacion
  // (22,2 / 32,1 / 47,3) y los cocientes salen 1,58 a 2,42 donde el modelo pide
  // 3,00. Aparece otra relacion que encaja en un corte --`-20*log10(a)`, dentro
  // de 0,48 dB hasta a = 0,15-- y **no se declara ley**: con otro umbral predice
  // 6,02 donde se midieron 2,98.
  //
  // O sea que hoy no se conoce la funcion. Lo que hace falta es el barrido de
  // umbral x relacion, que da la superficie en vez de dos cortes.
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
