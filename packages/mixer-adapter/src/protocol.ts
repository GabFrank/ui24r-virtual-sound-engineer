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
export interface MensajeOtro {
  readonly tipo: 'OTRO';
  readonly linea: string;
}

export type MensajeEntrante = MensajeSetd | MensajeSets | MensajeVu | MensajeOtro;

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
  return { tipo: 'OTRO', linea };
}

export function codificarSetd(path: string, valor: number): string {
  return `SETD^${path}^${valor}`;
}

export function codificarSets(path: string, texto: string): string {
  return `SETS^${path}^${texto}`;
}

/**
 * Conversión del valor del fader.
 *
 * La consola trabaja en un rango de 0 a 1 con una curva no lineal. Esta es
 * una aproximación razonable hasta que el spike de capacidades mida la curva
 * real: por eso el estado de la fila en la matriz es CONFIRMADO para la
 * existencia del parámetro pero la curva exacta se verifica aparte.
 */
export function faderADb(valor: number): number {
  if (valor <= 0) return -Infinity;
  if (valor >= 1) return 10;
  // Aproximación por tramos: la zona útil entre -20 y +10 dB ocupa la mayor
  // parte del recorrido, como en cualquier fader de mezcladora.
  if (valor < 0.0625) return -Infinity + 0; // por debajo del primer tramo
  const db = 20 * Math.log10(valor) * 2.2 + 10;
  return Math.max(-90, Math.min(10, db));
}

export function dbAFader(db: number): number {
  if (db <= -90) return 0;
  const v = Math.pow(10, (Math.min(10, db) - 10) / (20 * 2.2));
  return Math.max(0, Math.min(1, v));
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
 * Decodifica una trama de medidores.
 *
 * El formato real se confirma en el spike de capacidades. La estructura que
 * asumimos: un byte por canal, de 0 a 255, que mapea de -80 a 0 dB.
 */
export function decodificarVu(base64: string): number[] {
  return base64ABytes(base64).map((b) => (b === 0 ? -Infinity : -80 + (b / 255) * 80));
}

export function codificarVu(nivelesDb: readonly number[]): string {
  const bytes = nivelesDb.map((db) => {
    if (!Number.isFinite(db) || db <= -80) return 0;
    return Math.max(0, Math.min(255, Math.round(((db + 80) / 80) * 255)));
  });
  return bytesABase64(bytes);
}
