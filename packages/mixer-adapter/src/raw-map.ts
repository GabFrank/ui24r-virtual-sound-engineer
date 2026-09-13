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
  /**
   * Estado de la evidencia. Solo `PROBADO` habilita escritura.
   *
   * **`REFUTADO` no es un grado más de «no verificado»: es lo contrario.**
   * `DESCONOCIDO` e `INFERIDO` dicen «nadie lo comprobó»; `REFUTADO` dice **se
   * comprobó contra el aparato y no dio**. Un lector que ve «no probado` supone
   * que la fórmula es lo mejor que hay; con «refutado» sabe que usarla es peor
   * que no tener nada, porque propone un número con cara de medido.
   *
   * El `protocol-spec` §6.3 tuvo que hacer exactamente esta distinción el
   * 2026-09-12, cuando la medición 97 tumbó dos fórmulas del compresor. **La
   * corrección se aplicó allá y no acá**, que es el patrón que este proyecto ya
   * se conoce: la corrección va donde se descubre y no donde se propagó.
   */
  readonly estado: 'PROBADO' | 'INFERIDO' | 'DESCONOCIDO' | 'REFUTADO';
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

/**
 * Conversión **medida contra el aparato**, con el rango que de verdad se midió.
 *
 * **La diferencia con `deLaConsola` no es el estado: es el rango.** Una medición
 * cubre los puntos que midió, y los extremos del recorrido casi nunca están entre
 * ellos — en la 101, `f0` se midió entre los crudos 0,25 y 0,90 porque afuera de
 * eso el pico de la campana cae en el borde del estímulo y lo que se mediría sería
 * el borde. Declarar `PROBADO` sobre 20 Hz … 22 050 Hz con eso sería afirmar dos
 * extremos que nadie vio.
 *
 * Así que la entrada declara **`rawMin` y `rawMax` medidos**, y `fisicoMin` y
 * `fisicoMax` salen de evaluarlos: `aRaw` rechaza con `FUERA_DE_RANGO` todo lo que
 * quede afuera, que es exactamente lo correcto. La función es la misma en todo el
 * recorrido; lo que está acotado es **hasta dónde se comprobó**.
 */
function medido(
  path: string,
  unidad: string,
  fromRaw: (raw: number) => number,
  toRaw: (fisico: number) => number,
  rawMin: number,
  rawMax: number,
  spike: string,
): RawMapEntry {
  return {
    path, unidad, rawMin, rawMax,
    fisicoMin: fromRaw(rawMin), fisicoMax: fromRaw(rawMax),
    estado: 'PROBADO', spike,
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
  // **El ecualizador: dos de estas eran rectas donde la consola usa exponenciales.**
  //
  // Decian `lineal(20, 20000)` para la frecuencia y `lineal(0,3, 10)` para el Q,
  // en `DESCONOCIDO`. Las dos cosas estaban mal: el rango y, peor, **la forma de
  // la curva**. El `mixer.html` --el cliente de la propia consola-- usa
  // `20·1102,5^V` y `0,05·300^V`, y el manual del fabricante, que es una tercera
  // fuente independiente, coincide en los dos rangos.
  //
  // Con la recta, pedir 1 kHz aterrizaba en 28 Hz y un Q de 2 en 0,14. Hoy eso
  // no puede pasar --`aRaw` rechaza todo lo que no este en `PROBADO`, y
  // `rutasProbadas()` devuelve vacio--, pero el dia que alguien mida el
  // ecualizador y ponga la entrada en `PROBADO` iba a estar mirando una recta. Y
  // **comprobar los extremos no delata la curva**: una recta y una exponencial
  // que comparten extremos se separan en todo el medio.
  //
  // Van en `INFERIDO`, igual que las tres del compresor: leidas del cliente
  // oficial, no medidas contra el aparato. Ninguna de las dos esta probada --el
  // `protocol-spec` §6.3 las da como «sin probar»-- y la medicion es barata:
  // escribir un crudo y leer que frecuencia informa la consola.
  // **Medidas el 2026-09-13 contra el filtro, no contra lo que la consola guarda.**
  //
  // La medicion 101 barrio el crudo de la banda 1 y midio la respuesta en
  // frecuencia del canal con un multitono, por el bucle a la interfaz. El pico de
  // la campana es `f0`, y siguio a `20*1102,5^V` dentro del **0,24 %** en seis
  // crudos entre 116 Hz y 10,9 kHz. La recta que este archivo tenia hasta ayer
  // --`lineal(20, 20000)`-- se aparta hasta un **factor de 43,4**.
  //
  // El Q, medido como el ancho a mitad de la ganancia en decibeles con la
  // frecuencia fija en 1 kHz, siguio a `0,05*300^V` dentro de **x1,02** en cinco
  // crudos. La recta erra **x9,83**.
  //
  // **El rango declarado es el medido y no el del recorrido entero.** Los extremos
  // --crudo 0 y crudo 1-- caen fuera de la ventana del estimulo: ahi el pico de la
  // campana da contra el borde y lo que se mediria seria el borde. La familia de
  // exponenciales que tambien cae dentro del 5 % en los crudos medidos tiene la
  // base entre 949 y 1268, o sea que en el crudo 1,0 la frecuencia queda entre
  // 17 530 y 27 675 Hz: **el tope no esta medido**, y por eso no se declara.
  //
  // **Y dos salvedades que la entrada no puede expresar, escritas acá.**
  //
  // 1. **El Q se midio SOLO a 1 kHz.** La propia corrida documenta que arriba de
  //    ~3 kHz el ancho medido se despega del Q nominal --a 10,9 kHz un Q de 1,00
  //    se mide como 1,55, por la deformacion del biquad cerca de Nyquist--. La
  //    entrada no acota la frecuencia y `aRaw` acepta un Q para cualquiera. Lo que
  //    esta medido es la LEY crudo->Q; que el filtro se comporte igual arriba de
  //    3 kHz es otra pregunta.
  //
  // 2. **Se midio crudo -> fisico, y `PROBADO` habilita `toRaw`**, que es la
  //    direccion inversa. El contrato de la 101 lo declaro como no probado, y
  //    conviene decir por que igual se promueve en vez de dejar las dos
  //    afirmaciones en pie: las dos funciones son **monotonas** y el error esta
  //    acotado al 0,24 % sobre el tramo medido, asi que la cota se invierte. Lo
  //    que NO se invierte es fuera del tramo, y de eso se encarga
  //    `FUERA_DE_RANGO`.
  //
  // Evidencia:
  // `docs/spikes/SPK-P0.2b/evidence/curvas-del-ecualizador-2026-09-13b.txt`
  medido(
    'i.N.eq.b1.freq', 'Hz',
    (v) => 20 * Math.pow(1102.5, v),
    (f) => Math.log(f / 20) / Math.log(1102.5),
    0.25, 0.90, 'SPK-P0.2b',
  ),
  medido(
    'i.N.eq.b1.q', 'Q',
    (v) => 0.05 * Math.pow(300, v),
    (q) => Math.log(q / 0.05) / Math.log(300),
    0.35, 0.70, 'SPK-P0.2b',
  ),
  // **La ganancia: ahora hay DOS fuentes contra el codigo, y sigue sin medirse
  // bien.** El manual dice ±20 dB contra los ±15 de aca, y la medicion 101 vio la
  // campana subir **20,0 dB exactos** con el crudo de ganancia en 1,0, en los
  // ocho puntos del barrido. Eso es fuerte, pero **el pico de una campana no es
  // el parametro de ganancia** salvo que el filtro este normalizado de cierta
  // manera, y eso no se sabe. Ademas la 101 midio un solo crudo de ganancia --el
  // extremo--, asi que de la FORMA de la ley no se sabe nada: podria no ser
  // lineal. Queda DESCONOCIDO con el hallazgo anotado, y se mide aparte.
  //
  // Del filtro pasa-altos no hay ni manual ni formula, asi que su recta queda
  // como lo que es: un marcador de sitio.
  lineal('i.N.eq.hpf.freq', 'Hz', 20, 400, 'DESCONOCIDO', 'SPK-P0.2b'),
  lineal('i.N.eq.b1.gain', 'dB', -15, 15, 'DESCONOCIDO', 'SPK-P0.2b'),
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
  // **El umbral del compresor esta REFUTADO, y figuraba como INFERIDO.**
  //
  // `VtoTHRESH(a) = −90 + 96a` salio del `mixer.html`, y la **medicion 97** del
  // 2026-09-12 la tumbo: con ese umbral el exceso despejado no es constante y
  // los cocientes salen 1,58 a 2,42 donde el modelo pide 3,00. El
  // `protocol-spec` §6.3 ya lo dice --«REFUTADA por la medicion 97»-- y esta
  // tabla seguia diciendo INFERIDO, que es «nadie lo comprobo».
  //
  // Y el rango tampoco es un rango medido: **es la formula refutada evaluada en
  // 0 y en 1**. Se deja escrito para que nadie lo cite como si fuera otra cosa.
  { ...deLaConsola('i.N.dyn.threshold', 'dB', (a) => -90 + 96 * a, (db) => (db + 90) / 96),
    estado: 'REFUTADO' as const },
  deLaConsola('i.N.gate.depth', 'dB', (a) => 60 * a - 60, (db) => (db + 60) / 60),
  // **La puerta usa la MISMA funcion que quedo refutada en el compresor**, y eso
  // hay que decirlo aunque no cambie su estado: la 97 midio el compresor, no la
  // puerta, asi que declararla refutada seria afirmar mas de lo medido. Pero
  // apoyarse en ella sabiendo que la misma recta fallo al lado seria peor.
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
  | {
      readonly ok: false;
      readonly codigo: 'SIN_MAPEO' | 'NO_PROBADO' | 'REFUTADO' | 'FUERA_DE_RANGO';
      readonly mensaje: string;
    };

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
  // **Refutado y no probado no llevan el mismo consejo.** Con `NO_PROBADO` la
  // salida razonable es proponer el valor absoluto para que el usuario lo aplique
  // a mano. Con `REFUTADO` no: el numero que saldria de la formula tiene cara de
  // medido y se sabe que esta mal, asi que proponerlo es peor que no decir nada.
  if (e.estado === 'REFUTADO') {
    return {
      ok: false,
      codigo: 'REFUTADO',
      mensaje:
        `${path} tiene una conversión REFUTADA: se midió contra el aparato ` +
        `(${e.spike}) y no dio. No se propone ningún valor, porque el que saldría ` +
        `de esta fórmula se sabe incorrecto`,
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
