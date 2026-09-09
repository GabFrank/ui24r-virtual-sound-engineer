/**
 * Los medidores de las salidas: reproductor, subgrupos, efectos, auxiliares y general.
 *
 * **La cola de `VU2` es autodescriptiva, y eso es lo importante acá.** El mapa
 * se levantó primero a mano —moviendo señal sección por sección y viendo qué
 * bytes se despertaban— y dio 2 de reproductor, 6 subgrupos, 4 efectos y 10
 * auxiliares. Después, leyendo `parseVUdata` en el `mixer.html`, apareció que
 * **esos números vienen en la cabecera** y que el cliente los usa para avanzar:
 *
 *     e += 6*charCodeAt(0)   entradas
 *     e += 6*charCodeAt(1)   reproductor
 *     e += 7*charCodeAt(2)   subgrupos
 *     e += 7*charCodeAt(3)   efectos
 *            charCodeAt(4)   auxiliares, de a 5
 *
 * Comprobado contra el aparato: la cabecera trae `24 2 6 4 10 2 2 0`.
 *
 * **Y los 22 bytes finales no son «el general», como decía este comentario.**
 * Son **10 del general** —dos bloques de 5, izquierdo y derecho— y **12 de las
 * dos entradas de línea**, que van al final de todo. La cuenta cierra sin
 * resto: `8 + 6·24 + 6·2 + 7·6 + 7·4 + 5·10 + 5·2 + 6·2 = 306`.
 *
 * El tamaño del general lo declara el **byte 6** de la cabecera: la consola
 * hace `l = e += 5*charCodeAt(6)` justo antes de leer las entradas de línea.
 * El byte 5 vale 2 y no se sabe qué es. La cantidad de entradas de línea **no
 * está en la cabecera**: se deduce de los bytes que sobran.
 *
 * Por eso acá **no hay ninguna cuenta escrita a mano**: escribirlas sería
 * volver a la trampa del enrutamiento identidad, que coincide hasta que
 * alguien cambia la configuración de la consola.
 *
 * **Las secciones no comparten el paso** —6, 6, 7, 7, 5— así que leer la cola
 * con el paso de las entradas la desalinea, que es lo que la hizo parecer
 * indescifrable durante meses.
 */
import { base64ABytes, VU_ESCALA, dbDeReduccion } from './protocol.ts';

/** Un bus estéreo: subgrupo o efecto. Siete bytes. */
export interface MedidorBusEstereo {
  readonly preIzq: number;
  readonly preDer: number;
  readonly postIzq: number;
  readonly postDer: number;
  readonly reduccionDb: number;
  readonly indicadorDePuerta: boolean;
}

/** Un bus mono: auxiliar. Cinco bytes. */
export interface MedidorBusMono {
  readonly pre: number;
  readonly post: number;
  readonly reduccionDb: number;
  readonly indicadorDePuerta: boolean;
}

/**
 * El reproductor de medios: dos tiras con el **mismo formato de 6 bytes que
 * las entradas**, no el de los buses.
 *
 * La consola las lee igual que a un canal —`mediaStrips[0].setVU(n=+1, q=+2,
 * …)` y `+0` como previo— y avanza `e += 6*charCodeAt(1)`. Por eso no entran
 * en `MedidorBusEstereo`: comparten posición en la cola pero no formato.
 */
export interface MedidorReproductor {
  readonly pre: number;
  readonly entrada: number;
  readonly salida: number;
  readonly reduccionDb: number;
  readonly indicadorDePuerta: boolean;
}

/**
 * El general, en dos bloques de 5 bytes con formato de auxiliar.
 *
 * La consola lee `masterWidget.setVU2(n=+0, q=+1, h=+5, m=+6, …)`, o sea el
 * izquierdo en los primeros cinco bytes y el derecho en los cinco siguientes.
 * Confirmado con el paneo: `i.9.pan = 0` tiró los bytes del bloque derecho y
 * `pan = 1` los del izquierdo.
 *
 * Es la información que justificaba decodificar la cola: sin esto la
 * aplicación puede decir que un canal está bien puesto pero no que el general
 * esté saturando.
 */
export interface MedidorGeneral {
  readonly izquierdo: MedidorBusMono;
  readonly derecho: MedidorBusMono;
}

/** Todo lo que la cola de una trama `VU2` sabe decir. */
export interface MedidoresDeSalida {
  readonly reproductor: readonly MedidorReproductor[];
  readonly subgrupos: readonly MedidorBusEstereo[];
  readonly efectos: readonly MedidorBusEstereo[];
  readonly auxiliares: readonly MedidorBusMono[];
  /** `null` si la trama termina antes: no se inventa un general que no llegó. */
  readonly general: MedidorGeneral | null;
  /** Las entradas de línea, con el formato de 6 bytes de las entradas. */
  readonly entradasDeLinea: readonly MedidorReproductor[];
}

const CABECERA = 8;
const PASO_ENTRADA = 6;
const PASO_ESTEREO = 7;
const PASO_AUX = 5;

/**
 * El bloque de un bus estéreo.
 *
 * Medido el 2026-09-09, con el canal 10 asignado al subgrupo 1 y moviendo su
 * fader: `+2` y `+3` bajaron 94 → 50 → 0 y `+0` y `+1` no se movieron. Coincide
 * con lo que hace la consola —`setVU(n=+0, h=+2, q=+1, m=+3, …)` sobre una tira
 * de dos medidores, o sea `vu=(+0,+2)` y `vu2=(+1,+3)`—.
 *
 * `+4` y `+5` son la entrada y la salida del bloque dinámico, que la consola
 * solo dibuja para la tira seleccionada. `+6` lleva la reducción en sus siete
 * bits bajos y el indicador de puerta en el alto.
 */
function busEstereo(b: readonly number[], o: number): MedidorBusEstereo {
  const crudoReduccion = b[o + 6] ?? 0;
  return {
    preIzq: (b[o] ?? 0) * VU_ESCALA,
    preDer: (b[o + 1] ?? 0) * VU_ESCALA,
    postIzq: (b[o + 2] ?? 0) * VU_ESCALA,
    postDer: (b[o + 3] ?? 0) * VU_ESCALA,
    reduccionDb: dbDeReduccion(crudoReduccion),
    indicadorDePuerta: (crudoReduccion & 128) !== 0,
  };
}

/**
 * El bloque de un auxiliar.
 *
 * La consola lo lee como una tira mono: `setVU(n=+0, q=+1, 0, 0, …)`. Medido
 * el 2026-09-09 moviendo `a.0.mix`: el `+1` siguió al fader y el `+0` no.
 * Los bytes `+2` y `+3` no los usa la tira. `+4` lleva reducción e indicador.
 */
function reproductor(b: readonly number[], o: number): MedidorReproductor {
  const crudoReduccion = b[o + 5] ?? 0;
  return {
    pre: (b[o] ?? 0) * VU_ESCALA,
    entrada: (b[o + 1] ?? 0) * VU_ESCALA,
    salida: (b[o + 2] ?? 0) * VU_ESCALA,
    reduccionDb: dbDeReduccion(crudoReduccion),
    indicadorDePuerta: (crudoReduccion & 128) !== 0,
  };
}

function busMono(b: readonly number[], o: number): MedidorBusMono {
  const crudoReduccion = b[o + 4] ?? 0;
  return {
    pre: (b[o] ?? 0) * VU_ESCALA,
    post: (b[o + 1] ?? 0) * VU_ESCALA,
    reduccionDb: dbDeReduccion(crudoReduccion),
    indicadorDePuerta: (crudoReduccion & 128) !== 0,
  };
}

/**
 * Los medidores de salida de una trama `VU2`.
 *
 * Devuelve listas vacías si la trama es más corta de lo que su propia cabecera
 * promete: preferimos no informar antes que informar un byte de otra sección.
 */
export function decodificarVuBuses(base64: string): MedidoresDeSalida {
  const b = base64ABytes(base64);
  const vacio: MedidoresDeSalida = {
    reproductor: [], subgrupos: [], efectos: [], auxiliares: [],
    general: null, entradasDeLinea: [],
  };
  if (b.length < CABECERA) return vacio;

  const cuantas = {
    entradas: b[0] ?? 0, reproductor: b[1] ?? 0, subgrupos: b[2] ?? 0,
    efectos: b[3] ?? 0, auxiliares: b[4] ?? 0,
    // **El byte 5 es la cantidad de generales y el 6 la de entradas de línea.**
    //
    // Antes acá se leía `b[6]`, siguiendo al `mixer.html`, que avanza el
    // general con `5*charCodeAt(6)`. Dos implementaciones de terceros
    // independientes entre sí —`MatthewInch/UI24RBridge` y el `DigiMixer` de
    // Jon Skeet— nombran la cabecera igual y ponen los generales en el **5**:
    // `NINPUTS, NMEDIA, NSUBGROUPS, NFX, NAUX, NMASTERS, NLINEIN, cero`. Ese
    // orden es además el de las secciones en la trama, que es lo coherente.
    //
    // En una Ui24R los dos valen 2, así que **no se puede distinguir midiendo**
    // y el `charCodeAt(6)` del cliente oficial nunca falla acá. Se sigue a las
    // dos implementaciones y al orden de las secciones, no al cliente.
    general: b[5] ?? 0,
  };

  let o = CABECERA + PASO_ENTRADA * cuantas.entradas;
  const leer = <T>(cuantos: number, paso: number, uno: (b: readonly number[], o: number) => T): T[] => {
    const xs: T[] = [];
    for (let i = 0; i < cuantos; i++, o += paso) {
      if (o + paso > b.length) return [];
      xs.push(uno(b, o));
    }
    return xs;
  };

  const medios = leer(cuantas.reproductor, PASO_ENTRADA, reproductor);
  const subgrupos = leer(cuantas.subgrupos, PASO_ESTEREO, busEstereo);
  const efectos = leer(cuantas.efectos, PASO_ESTEREO, busEstereo);
  const auxiliares = leer(cuantas.auxiliares, PASO_AUX, busMono);

  const bloquesGenerales = leer(cuantas.general, PASO_AUX, busMono);
  const general = bloquesGenerales.length >= 2
    ? { izquierdo: bloquesGenerales[0]!, derecho: bloquesGenerales[1]! }
    : null;

  // Las entradas de línea son lo que queda, de a 6. No están en la cabecera:
  // la consola las lee por índice fijo, acotadas por su propia configuración.
  const cuantasLineas = Math.floor((b.length - o) / PASO_ENTRADA);
  const entradasDeLinea = leer(cuantasLineas, PASO_ENTRADA, reproductor);

  return { reproductor: medios, subgrupos, efectos, auxiliares, general, entradasDeLinea };
}
