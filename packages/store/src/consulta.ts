import type { Documento, Filtro, ValorIndice } from './tipos.ts';

/**
 * Semántica de las consultas, en un solo sitio.
 *
 * Existe porque hay dos implementaciones del almacén —SQLite y el navegador— y
 * tienen que contestar exactamente lo mismo. La trampa concreta es `null`: en
 * SQL, `columna = NULL` nunca es cierto y hay que escribir `IS NULL`, mientras
 * que en JavaScript `x === null` sí lo es. Si cada implementación resolviera
 * eso por su cuenta, «la sesión abierta» —que se busca precisamente por
 * `cerrada_el IS NULL`— funcionaría en un sitio y no en el otro, y el fallo
 * aparecería solo en la tablet.
 */

/**
 * El valor por el que se filtra o se ordena.
 *
 * `id` no está en `indices` —es una propiedad del documento— pero en SQLite sí
 * es una columna más, así que ordenar por `id` funcionaba allá y acá no hacía
 * nada. Es exactamente la consulta con la que se lee el registro, que se ordena
 * por identificador porque el identificador lleva la marca de tiempo.
 */
export function valorDe(doc: Documento, campo: string): ValorIndice | undefined {
  return campo === 'id' ? doc.id : doc.indices[campo];
}

/** Un índice ausente y uno guardado como `null` son lo mismo. */
export function coincide(valor: ValorIndice | undefined, buscado: ValorIndice): boolean {
  if (buscado === null) return valor === null || valor === undefined;
  return valor === buscado;
}

export function filtrar(
  docs: readonly Documento[],
  donde: Readonly<Record<string, ValorIndice>> | undefined,
): readonly Documento[] {
  if (donde === undefined) return docs;
  const pares = Object.entries(donde);
  if (pares.length === 0) return docs;
  return docs.filter((d) => pares.every(([k, v]) => coincide(valorDe(d, k), v)));
}

/**
 * Ordena por un índice.
 *
 * Los ausentes van siempre al final, en ambos sentidos. Es lo contrario de lo
 * que hace SQLite por defecto —donde `NULL` es el valor más bajo— y está
 * elegido a propósito: en las listas de esta aplicación, un documento sin el
 * dato por el que se ordena es el que menos ayuda a encontrar algo, así que no
 * debería encabezar la lista al invertir el orden.
 */
export function ordenar(
  docs: readonly Documento[],
  campo: string | undefined,
  descendente = false,
): readonly Documento[] {
  if (campo === undefined) return docs;
  const signo = descendente ? -1 : 1;
  return [...docs].sort((a, b) => {
    const x = valorDe(a, campo);
    const y = valorDe(b, campo);
    const xFalta = x === null || x === undefined;
    const yFalta = y === null || y === undefined;
    if (xFalta && yFalta) return 0;
    if (xFalta) return 1;
    if (yFalta) return -1;
    if (x === y) return 0;
    return (x < y ? -1 : 1) * signo;
  });
}

export function consultar(docs: readonly Documento[], filtro: Filtro = {}): readonly Documento[] {
  const ordenados = ordenar(filtrar(docs, filtro.donde), filtro.ordenarPor, filtro.descendente);
  return filtro.limite === undefined ? ordenados : ordenados.slice(0, filtro.limite);
}
