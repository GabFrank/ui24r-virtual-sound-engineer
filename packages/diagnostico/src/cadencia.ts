import type { EstadisticaDeCadencia } from './tipos.ts';

/**
 * Estadística de una cadencia a partir de las marcas de tiempo de los mensajes.
 *
 * Con menos de dos marcas no hay ningún intervalo que medir, y devuelve `null`
 * en vez de ceros. Un cero acá se leería como «llegan de golpe», que es lo
 * contrario de «no llegó nada»: la diferencia importa cuando el criterio que
 * decide es un umbral.
 */
export function estadisticaDeCadencia(marcasMs: readonly number[]): EstadisticaDeCadencia | null {
  return estadisticaDeSegmentos([marcasMs]);
}

/**
 * Lo mismo, pero sobre tramos separados por los cortes de conexión.
 *
 * El hueco entre la última trama antes de una caída y la primera de después
 * **no es cadencia**: es el corte. Medido contra el simulador, un corte de tres
 * segundos subía la media de 50 a 66 ms y dejaba un máximo de 3069 ms, y ese
 * número se habría presentado como si la consola hubiera tardado eso en mandar
 * una trama. Cada tramo aporta sus intervalos y el hueco entre tramos no aporta
 * ninguno.
 */
export function estadisticaDeSegmentos(
  segmentos: readonly (readonly number[])[],
): EstadisticaDeCadencia | null {
  const intervalos: number[] = [];
  for (const marcas of segmentos) {
    for (let i = 1; i < marcas.length; i++) {
      intervalos.push(marcas[i]! - marcas[i - 1]!);
    }
  }
  if (intervalos.length === 0) return null;

  const ordenados = [...intervalos].sort((a, b) => a - b);
  const suma = intervalos.reduce((a, b) => a + b, 0);
  const media = suma / intervalos.length;

  // Fluctuación: cuánto cambia un intervalo respecto del anterior. Una cadencia
  // de 50 ms exactos y otra que alterna 10 y 90 tienen la misma media y no se
  // comportan igual; esto las distingue.
  let fluctuacion = 0;
  if (intervalos.length > 1) {
    let acumulado = 0;
    for (let i = 1; i < intervalos.length; i++) {
      acumulado += Math.abs(intervalos[i]! - intervalos[i - 1]!);
    }
    fluctuacion = acumulado / (intervalos.length - 1);
  }

  return {
    muestras: intervalos.length,
    mediaMs: media,
    medianaMs: mediana(ordenados),
    p95Ms: percentil(ordenados, 95),
    fluctuacionMs: fluctuacion,
    minimoMs: ordenados[0]!,
    maximoMs: ordenados[ordenados.length - 1]!,
    umbralDeInestabilidadMs: media * 3,
  };
}

function mediana(ordenados: readonly number[]): number {
  const n = ordenados.length;
  const medio = Math.floor(n / 2);
  return n % 2 === 1 ? ordenados[medio]! : (ordenados[medio - 1]! + ordenados[medio]!) / 2;
}

/**
 * Percentil por rango más cercano, que es el que se puede explicar sin
 * ambigüedad: el valor por debajo del cual queda al menos ese porcentaje de
 * las muestras. Con pocas muestras cualquier interpolación inventa precisión
 * que no hay.
 */
function percentil(ordenados: readonly number[], p: number): number {
  const rango = Math.ceil((p / 100) * ordenados.length);
  const indice = Math.min(Math.max(rango - 1, 0), ordenados.length - 1);
  return ordenados[indice]!;
}

/**
 * Huella del estado leído, para comparar dos clientes conectados a la vez
 * (criterio 5 de SPK-P0.1).
 *
 * No es criptográfica y no pretende serlo: sirve para responder «¿los dos
 * clientes ven lo mismo?». Se construye ordenando las claves, para que dos
 * volcados con el mismo contenido en distinto orden den la misma huella.
 */
export function huellaDelEstado(valores: ReadonlyMap<string, number | string | boolean>): string {
  const claves = [...valores.keys()].sort();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (const clave of claves) {
    const texto = `${clave}=${String(valores.get(clave))};`;
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    }
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}
