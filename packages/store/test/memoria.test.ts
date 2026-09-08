import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { AlmacenEnMemoria } from '../src/memoria.ts';

function doc(id: string, indices: Record<string, string | number | null> = {}) {
  return { id, indices, datos: { id, marca: id.toUpperCase() } };
}

test('guardar y obtener devuelve el documento entero', async () => {
  const a = new AlmacenEnMemoria();
  await a.guardar('band_profile', doc('b1', { nombre: 'Los del Fondo' }));
  const r = await a.obtener('band_profile', 'b1');
  deepStrictEqual(r?.datos, { id: 'b1', marca: 'B1' });
});

test('obtener lo que no existe devuelve null, no lanza', async () => {
  const a = new AlmacenEnMemoria();
  strictEqual(await a.obtener('band_profile', 'no-existe'), null);
});

test('guardar dos veces el mismo identificador reemplaza, no duplica', async () => {
  const a = new AlmacenEnMemoria();
  await a.guardar('band_profile', doc('b1', { nombre: 'Antes' }));
  await a.guardar('band_profile', doc('b1', { nombre: 'Despues' }));
  const todos = await a.listar('band_profile');
  strictEqual(todos.length, 1);
  strictEqual(todos[0]?.indices['nombre'], 'Despues');
});

test('las colecciones no se mezclan', async () => {
  const a = new AlmacenEnMemoria();
  await a.guardar('band_profile', doc('x'));
  strictEqual((await a.listar('venue_profile')).length, 0);
});

test('borrar quita solo el que corresponde', async () => {
  const a = new AlmacenEnMemoria();
  await a.guardar('band_profile', doc('b1'));
  await a.guardar('band_profile', doc('b2'));
  await a.borrar('band_profile', 'b1');
  deepStrictEqual((await a.listar('band_profile')).map((d) => d.id), ['b2']);
});

test('borrar lo que no existe no lanza', async () => {
  const a = new AlmacenEnMemoria();
  await a.borrar('band_profile', 'fantasma');
  strictEqual((await a.listar('band_profile')).length, 0);
});

test('listar sobre una coleccion vacia devuelve vacio', async () => {
  strictEqual((await new AlmacenEnMemoria().listar('measurement')).length, 0);
});

test('exportar incluye el origen y las colecciones', async () => {
  const a = new AlmacenEnMemoria();
  await a.guardar('band_profile', doc('b1'));
  const v = JSON.parse(await a.exportar());
  strictEqual(v.origen, 'memoria');
  strictEqual(Array.isArray(v.colecciones.band_profile), true);
});
