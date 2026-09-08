/**
 * Codificación y decodificación de los mensajes del protocolo.
 *
 * Lo que sabemos hoy, sin verificar en hardware, está en
 * docs/capability-matrix.md con su estado de confianza. Este archivo se
 * corrige con lo que midan los spikes: es una hipótesis ejecutable, no una
 * especificación.
 */

export interface MensajeSetd {
  readonly tipo: 'SETD';
  readonly path: string;
  readonly valor: number;
}
export interface MensajeSets {
  readonly tipo: 'SETS';
  readonly path: string;
  readonly texto: string;
}
export interface MensajeVu {
  readonly tipo: 'VU2';
  readonly cargaBase64: string;
}
export interface MensajeRta {
  readonly tipo: 'RTA';
  readonly cargaBase64: string;
}
export interface MensajeOtro {
  readonly tipo: 'OTRO';
  readonly linea: string;
}

export type MensajeEntrante =
  | MensajeSetd | MensajeSets | MensajeVu | MensajeRta | MensajeOtro;

/** Qué trae una trama del transporte, ya separada de su envoltorio. */
export interface TramaSocketIo {
  /** `conectado`, `latido`, `desconectado` o `datos`. */
  readonly clase: 'conectado' | 'latido' | 'desconectado' | 'datos' | 'desconocida';
  /** Líneas de protocolo, solo en las de clase `datos`. */
  readonly lineas: readonly string[];
}

/**
 * Quita el envoltorio de socket.io 0.9 de una trama del WebSocket.
 *
 * **Esta función faltaba, y sin ella no funciona nada.** La Ui24R habla
 * socket.io 0.9, no WebSocket pelado: cada trama viene como
 * `<tipo>:<id>:<endpoint>:<datos>`, y una línea de protocolo llega como
 * `3:::SETD^i.0.mix^0.41`. Verificado en crudo el 2026-09-08: los bytes son
 * `33 3a 3a 3a` seguidos de la carga.
 *
 * Antes de este cambio, `decodificar()` recibía la trama entera, partía por `^`
 * y comparaba `partes[0]` contra `'SETD'` cuando lo que tenía era `'3:::SETD'`.
 * Todos los mensajes caían en `OTRO` y el estado confirmado quedaba vacío.
 *
 * Dos detalles medidos que conviene no perder:
 *
 * - **Una trama de datos puede traer varias líneas separadas por `\n`.** El
 *   volcado inicial llega en unos doscientos veinte mensajes de ~2 KB, cada uno
 *   con decenas de líneas.
 * - **El latido no se contesta.** La consola manda `2::` cada ~66 ms, no cada
 *   5 s como declara su propio apretón de manos. Probado con eco y sin eco: el
 *   flujo entrante es idéntico, así que responder solo agrega tráfico.
 */
export function despojarSocketIo(trama: string): TramaSocketIo {
  const coincidencia = /^(\d):([^:]*):([^:]*)(?::([\s\S]*))?$/.exec(trama);
  if (!coincidencia) return { clase: 'desconocida', lineas: [] };
  const tipo = coincidencia[1];
  if (tipo === '1') return { clase: 'conectado', lineas: [] };
  if (tipo === '2') return { clase: 'latido', lineas: [] };
  if (tipo === '0') return { clase: 'desconectado', lineas: [] };
  if (tipo !== '3') return { clase: 'desconocida', lineas: [] };
  const datos = coincidencia[4] ?? '';
  return { clase: 'datos', lineas: datos.split('\n').filter((l) => l.length > 0) };
}

/**
 * Mensaje que mantiene vivo el flujo, y que el cliente oficial manda cada segundo.
 *
 * No es opcional. `mixer.html` hace `setInterval(sendMessage("ALIVE"), 1000)`, y
 * medido el 2026-09-08: sin él la consola deja de emitir. En veinte segundos sin
 * `ALIVE` llegaron 148 tramas de analizador; en treinta segundos con `ALIVE`,
 * 905.
 */
export const MENSAJE_ALIVE = 'ALIVE';

/** Intervalo con el que el cliente oficial manda `ALIVE`. */
export const ALIVE_INTERVALO_MS = 1000;

export function decodificar(linea: string): MensajeEntrante {
  const partes = linea.split('^');
  const cabecera = partes[0];
  if (cabecera === 'SETD' && partes.length >= 3) {
    const valor = Number(partes[2]);
    if (Number.isFinite(valor)) {
      return { tipo: 'SETD', path: partes[1]!, valor };
    }
  }
  if (cabecera === 'SETS' && partes.length >= 3) {
    return { tipo: 'SETS', path: partes[1]!, texto: partes.slice(2).join('^') };
  }
  if (cabecera === 'VU2' && partes.length >= 2) {
    return { tipo: 'VU2', cargaBase64: partes[1]! };
  }
  // El analizador de espectro. Se reconoce porque es la unica emision que la
  // consola mantiene pase lo que pase: 30 Hz medidos, tanto en silencio como
  // con señal. Es la señal de vida honesta de este aparato.
  if (cabecera === 'RTA' && partes.length >= 2) {
    return { tipo: 'RTA', cargaBase64: partes[1]! };
  }
  return { tipo: 'OTRO', linea };
}

export function codificarSetd(path: string, valor: number): string {
  return `SETD^${path}^${valor}`;
}

export function codificarSets(path: string, texto: string): string {
  return `SETS^${path}^${texto}`;
}

/**
 * Base64 sin depender de `Buffer` ni de `atob`.
 *
 * El mismo código corre en el navegador, en el WebView de Android y en Node
 * durante los tests. Una implementación propia de veinte líneas evita tener
 * tres caminos distintos que se comportan distinto justo en los bordes.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesABase64(bytes: readonly number[]): string {
  let salida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    salida += ALFABETO[(triple >> 18) & 63];
    salida += ALFABETO[(triple >> 12) & 63];
    salida += i + 1 < bytes.length ? ALFABETO[(triple >> 6) & 63] : '=';
    salida += i + 2 < bytes.length ? ALFABETO[triple & 63] : '=';
  }
  return salida;
}

export function base64ABytes(texto: string): number[] {
  const limpio = texto.replace(/[^A-Za-z0-9+/]/g, '');
  const salida: number[] = [];
  for (let i = 0; i < limpio.length; i += 4) {
    const c0 = ALFABETO.indexOf(limpio[i] ?? 'A');
    const c1 = ALFABETO.indexOf(limpio[i + 1] ?? 'A');
    const c2 = ALFABETO.indexOf(limpio[i + 2] ?? 'A');
    const c3 = ALFABETO.indexOf(limpio[i + 3] ?? 'A');
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    salida.push((triple >> 16) & 255);
    if (i + 2 < limpio.length) salida.push((triple >> 8) & 255);
    if (i + 3 < limpio.length) salida.push(triple & 255);
  }
  return salida;
}

/**
 * Cabecera de una trama `VU2`, en bytes.
 *
 * Medido el 2026-09-08 contra la consola: la cabecera vale 8 bytes y el primero
 * es la cantidad de canales de entrada. Los siguientes repiten la topología que
 * la consola publica en `curSetup` — para la Ui24R salieron
 * `[24, 2, 6, 4, 10, 2, 2, 0]` contra `input:24, linein:2, sub:6, fx:4, aux:10`.
 */
export const VU_CABECERA_BYTES = 8;

/** Bytes por canal dentro de una trama `VU2`. */
export const VU_BYTES_POR_CANAL = 6;

/**
 * Escala de los medidores, de `deconvertVU` en `mixer.html`.
 *
 * Un byte de 0 a ~240 se convierte en una posición de 0 a 1. **No son
 * decibeles**: es la misma posición normalizada con la que se dibuja un fader.
 */
export const VU_ESCALA = 0.004167508166392142;

/** Lectura de un canal dentro de una trama `VU2`, en posición normalizada. */
export interface MedidorCanal {
  /** Nivel previo a la ganancia del previo. */
  readonly pre: number;
  /** Nivel de entrada al canal. */
  readonly entrada: number;
  /** Nivel de salida, después del fader. */
  readonly salida: number;
  /** Entrada del procesador dinámico. Solo lo llena el canal seleccionado. */
  readonly dinamicoEntrada: number;
  /** Salida del procesador dinámico. Solo lo llena el canal seleccionado. */
  readonly dinamicoSalida: number;
  /** Byte crudo de reducción de ganancia y bandera, sin interpretar. */
  readonly byteReduccion: number;
}

/**
 * Decodifica una trama de medidores a lecturas por canal.
 *
 * **Formato medido el 2026-09-08**, no supuesto. La versión anterior de este
 * archivo asumía «un byte por canal, de 0 a 255, que mapea de −80 a 0 dB», y las
 * tres partes eran incorrectas: hay cabecera, el paso es de seis bytes, y el
 * byte no son decibeles. Con aquella lectura el canal 1 devolvía el byte de la
 * cabecera —la cuenta de entradas, 24— informado como −72,5 dB.
 *
 * Comprobado contra una fuente conocida: con música entrando solo por las RCA,
 * la trama dio nivel en los canales 21 y 22 y cero en los otros veintidós. Las
 * RCA de esta consola son exactamente esos dos canales.
 */
export function decodificarVuCanales(base64: string): MedidorCanal[] {
  const bytes = base64ABytes(base64);
  if (bytes.length < VU_CABECERA_BYTES) return [];
  const cuantos = bytes[0] ?? 0;
  const canales: MedidorCanal[] = [];
  for (let c = 0; c < cuantos; c++) {
    const o = VU_CABECERA_BYTES + VU_BYTES_POR_CANAL * c;
    if (o + VU_BYTES_POR_CANAL > bytes.length) break;
    canales.push({
      pre: (bytes[o] ?? 0) * VU_ESCALA,
      entrada: (bytes[o + 1] ?? 0) * VU_ESCALA,
      salida: (bytes[o + 2] ?? 0) * VU_ESCALA,
      dinamicoEntrada: (bytes[o + 3] ?? 0) * VU_ESCALA,
      dinamicoSalida: (bytes[o + 4] ?? 0) * VU_ESCALA,
      byteReduccion: bytes[o + 5] ?? 0,
    });
  }
  return canales;
}

/**
 * Nivel de entrada de cada canal, en dB.
 *
 * Se mantiene la forma que ya consumía el adaptador —un dB por canal— pero el
 * número sale ahora del formato real y de la ley de fader de la consola.
 *
 * **Lo que este dB no es.** La consola dibuja sus medidores sobre la misma
 * regla que sus faders, así que convertir la posición con la ley del fader da
 * el número que muestra la consola. Que ese número corresponda a un nivel
 * digital real no está medido: es exactamente lo que pide SPK-P0.10b, con tonos
 * de −20, −6 y −1 dBFS por un bucle físico. Hasta que ese spike cierre, esto
 * sirve para coincidir con lo que ve el operador, no para afirmar dBFS.
 */
export function decodificarVu(base64: string): number[] {
  return decodificarVuCanales(base64).map((c) => posicionADb(c.entrada));
}

/**
 * Posición normalizada de medidor a dB, con la ley de fader de la consola.
 *
 * Duplica la fórmula de `conversiones.ts` a propósito: este módulo decodifica
 * el protocolo y no debería depender del que interpreta unidades físicas. Si
 * alguna vez divergen, el test de `protocol.test.ts` que las compara falla.
 */
function posicionADb(posicion: number): number {
  if (posicion <= 0) return -Infinity;
  const v = Math.min(1, posicion);
  const exponente = v * (23.90844819639692
    + v * (-26.23877598214595 + (12.195249692570245 - 0.4878099877028098 * v) * v));
  const base = 2.676529517952372e-4 * Math.exp(exponente);
  const lineal = v < 0.055 ? base * Math.sin(28.559933214452666 * v) : base;
  if (lineal <= 0) return -Infinity;
  return Math.max(-90, Math.min(10, 20 * Math.log10(lineal)));
}

/**
 * Arma una trama `VU2` con el formato real. La usa el simulador.
 *
 * Recibe posiciones normalizadas, no decibeles: es lo que viaja por el cable.
 */
export function codificarVu(posiciones: readonly number[]): string {
  const bytes: number[] = [posiciones.length, 0, 0, 0, 0, 0, 0, 0];
  for (const p of posiciones) {
    const byte = Math.max(0, Math.min(255, Math.round(Math.max(0, p) / VU_ESCALA)));
    bytes.push(byte, byte, byte, 0, 0, 247);
  }
  return bytesABase64(bytes);
}
