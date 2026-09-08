import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { coincide, consultar, filtrar, ordenar } from '../src/consulta.ts';
import type { Documento } from '../src/tipos.ts';

function doc(id: string, indices: Record<string, string | number | null>): Documento {
  return { id, indices, datos: { id } };
}

const SESIONES: readonly Documento[] = [
  doc('a', { iniciada_el: '2026-01-03', cerrada_el: '2026-01-03', state: 'CLOSED' }),
  doc('b', { iniciada_el: '2026-01-10', cerrada_el: null, state: 'MIX' }),
  doc('c', { iniciada_el: '2026-01-07', cerrada_el: '2026-01-07', state: 'CLOSED' }),
];

test('null y ausente son lo mismo al comparar', () => {
  // Es la trampa que motiva este modulo: en SQL "columna = NULL" nunca es
  // cierto y hay que escribir IS NULL; en JavaScript x === null si lo es.
  strictEqual(coincide(null, null), true);
  strictEqual(coincide(undefined, null), true);
  strictEqual(coincide('algo', null), false);
  strictEqual(coincide(null, 'algo'), false);
});

test('la sesion abierta se encuentra filtrando por cerrada_el nula', () => {
  const r = filtrar(SESIONES, { cerrada_el: null });
  deepStrictEqual(r.map((d) => d.id), ['b']);
});

test('un documento al que le falta el indice cuenta como nulo', () => {
  const sinCampo = [doc('x', { state: 'MIX' })];
  deepStrictEqual(filtrar(sinCampo, { cerrada_el: null }).map((d) => d.id), ['x']);
});

test('varias condiciones se combinan con Y', () => {
  deepStrictEqual(
    filtrar(SESIONES, { state: 'CLOSED', cerrada_el: '2026-01-07' }).map((d) => d.id),
    ['c'],
  );
});

test('un filtro vacio no filtra', () => {
  strictEqual(filtrar(SESIONES, {}).length, 3);
  strictEqual(filtrar(SESIONES, undefined).length, 3);
});

test('ordena ascendente y descendente', () => {
  deepStrictEqual(ordenar(SESIONES, 'iniciada_el').map((d) => d.id), ['a', 'c', 'b']);
  deepStrictEqual(ordenar(SESIONES, 'iniciada_el', true).map((d) => d.id), ['b', 'c', 'a']);
});

test('los ausentes van al final en los dos sentidos', () => {
  // Al reves de lo que hace SQLite por defecto, y a proposito: un documento
  // sin el dato por el que se ordena es el que menos ayuda a encontrar algo.
  const con = [...SESIONES, doc('z', { state: 'MIX' })];
  strictEqual(ordenar(con, 'iniciada_el').at(-1)?.id, 'z');
  strictEqual(ordenar(con, 'iniciada_el', true).at(-1)?.id, 'z');
});

test('ordenar no muta el arreglo original', () => {
  const original = [...SESIONES];
  ordenar(SESIONES, 'iniciada_el', true);
  deepStrictEqual(SESIONES.map((d) => d.id), original.map((d) => d.id));
});

test('sin campo de orden devuelve tal cual', () => {
  deepStrictEqual(ordenar(SESIONES, undefined).map((d) => d.id), ['a', 'b', 'c']);
});

test('el limite se aplica despues de ordenar, no antes', () => {
  // Si se aplicara antes, "las dos mas recientes" devolveria dos cualquiera.
  const r = consultar(SESIONES, { ordenarPor: 'iniciada_el', descendente: true, limite: 2 });
  deepStrictEqual(r.map((d) => d.id), ['b', 'c']);
});

test('ordena numeros como numeros', () => {
  const n = [doc('p', { n: 9 }), doc('q', { n: 10 }), doc('r', { n: 1 })];
  deepStrictEqual(ordenar(n, 'n').map((d) => d.id), ['r', 'p', 'q']);
});
