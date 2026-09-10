import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FUENTES } from '../src/data/instrumentos.ts';

/**
 * Lee las tablas de docs/instrumentos.md y las compara con el catálogo.
 *
 * Mismo motivo que en `channel-profiles-doc.test.ts`: una tabla escrita a mano
 * al lado de una lista de código diverge, y cuando diverge nadie se entera
 * hasta que alguien toma una decisión leyendo la versión equivocada. Acá el
 * daño sería peor que un número: la tabla dice qué combinaciones son posibles.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DOC = join(RAIZ, 'docs', 'instrumentos.md');

/** Las celdas vacías del documento llevan guion largo. */
const VACIO = '—';

function lista(celda: string): string[] {
  return celda.trim() === VACIO ? [] : celda.split(',').map((x) => x.trim());
}

function filasDe(cabecera: string): string[][] {
  const lineas = readFileSync(DOC, 'utf8').split('\n');
  const inicio = lineas.findIndex((l) => l.startsWith(cabecera));
  assert.notEqual(inicio, -1, `no se encontró la tabla que empieza con «${cabecera}»`);

  const filas: string[][] = [];
  for (let i = inicio + 2; i < lineas.length; i++) {
    const l = lineas[i]!;
    if (!l.startsWith('|')) break;
    filas.push(l.split('|').slice(1, -1).map((x) => x.trim()));
  }
  return filas;
}

test('el documento y el código tienen las mismas fuentes, en el mismo orden', () => {
  const filas = filasDe('| Fuente | Se muestra |');
  assert.deepEqual(filas.map((f) => f[0]), FUENTES.map((f) => f.id));
});

test('cada fuente del documento declara las mismas variantes, roles y perfil', () => {
  for (const fila of filasDe('| Fuente | Se muestra |')) {
    const [id, nombre, variantes, roles, perfil] = fila;
    const f = FUENTES.find((x) => x.id === id);
    assert.ok(f, `el documento tiene la fuente ${id} y el código no`);

    assert.equal(f.nombre, nombre, `${id}: el nombre que se muestra`);
    assert.deepEqual(f.variantes.map((v) => v.id), lista(variantes ?? ''), `${id}: variantes`);
    assert.deepEqual([...f.roles], lista(roles ?? ''), `${id}: roles`);
    assert.equal(f.perfil, (perfil ?? '') === VACIO ? null : perfil, `${id}: perfil de canal`);
  }
});

test('la tabla de afinado por faceta dice lo mismo que el catálogo', () => {
  const enElDocumento = filasDe('| Fuente | Faceta |')
    .map(([id, faceta, valor, perfil]) => `${id}/${faceta}/${valor}/${perfil}`);

  const enElCodigo: string[] = [];
  for (const f of FUENTES) {
    for (const [valor, perfil] of Object.entries(f.perfilPorRol ?? {})) {
      enElCodigo.push(`${f.id}/rol/${valor}/${perfil}`);
    }
    for (const [valor, perfil] of Object.entries(f.perfilPorVariante ?? {})) {
      enElCodigo.push(`${f.id}/variante/${valor}/${perfil}`);
    }
  }

  assert.deepEqual([...enElDocumento].sort(), [...enElCodigo].sort());
});

test('el documento dice cuántas fuentes hay y acierta', () => {
  // La cuenta cambia con una decisión --agregar una fuente-- así que vale la
  // pena escribirla; y por eso mismo hay que comprobarla, o se pudre.
  const texto = readFileSync(DOC, 'utf8');
  const enLetras: Readonly<Record<string, number>> = {
    once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16,
  };
  const m = texto.match(/## Las (\w+) fuentes/);
  assert.ok(m, 'el documento ya no dice cuántas fuentes hay');
  assert.equal(enLetras[m[1]!.toLowerCase()], FUENTES.length);
});

test('las fuentes sin perfil del documento son las del catálogo', () => {
  const texto = readFileSync(DOC, 'utf8');
  const seccion = texto.slice(texto.indexOf('## Las fuentes que no tienen perfil'));
  for (const f of FUENTES) {
    const nombrada = seccion.toLowerCase().includes(`**${f.nombre}**`);
    assert.equal(nombrada, f.perfil === null,
      `${f.id}: el documento y el código no coinciden en si tiene perfil`);
  }
});
