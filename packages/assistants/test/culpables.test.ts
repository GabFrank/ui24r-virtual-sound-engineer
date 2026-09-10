import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sospechososDeRealimentacion, type CanalSospechable } from '../src/culpables.ts';

const canal = (p: Partial<CanalSospechable> & { indice: number }): CanalSospechable => ({
  nombre: `CANAL ${p.indice}`, nivelDb: -20, silenciado: false, enVivo: false, ...p,
});

test('un canal mudo queda descartado, y eso SI es concluyente', () => {
  const r = sospechososDeRealimentacion([
    canal({ indice: 1, nivelDb: -12 }),
    canal({ indice: 2, nivelDb: -Infinity }),
    canal({ indice: 3, nivelDb: -70 }),
  ]);
  assert.deepEqual(r.map((s) => s.indice), [1], 'sin energia no hay nada que realimentar');
});

test('un canal silenciado no llega al general', () => {
  const r = sospechososDeRealimentacion([
    canal({ indice: 1, nivelDb: -12, silenciado: true }),
    canal({ indice: 2, nivelDb: -30 }),
  ]);
  assert.deepEqual(r.map((s) => s.indice), [2]);
});

test('se ordenan por nivel, que es lo mas cerca de probabilidad que hay', () => {
  const r = sospechososDeRealimentacion([
    canal({ indice: 1, nivelDb: -30 }),
    canal({ indice: 2, nivelDb: -8 }),
    canal({ indice: 3, nivelDb: -19 }),
  ]);
  assert.deepEqual(r.map((s) => s.indice), [2, 3, 1]);
});

test('con canales marcados en vivo, los demas quedan afuera', () => {
  // Una pista grabada o una entrada de linea no puede realimentar: no hay
  // microfono en el lazo.
  const r = sospechososDeRealimentacion([
    canal({ indice: 1, nivelDb: -8, enVivo: false }),
    canal({ indice: 2, nivelDb: -20, enVivo: true }),
  ]);
  assert.deepEqual(r.map((s) => s.indice), [2], 'aunque el 1 suene mas fuerte');
});

test('si NADIE esta marcado, la marca no descarta a nadie', () => {
  // Es el caso de una sesion sin configurar. Usar la marca ahi dejaria la
  // lista vacia justo cuando mas falta hace.
  const r = sospechososDeRealimentacion([
    canal({ indice: 1, nivelDb: -8 }),
    canal({ indice: 2, nivelDb: -20 }),
  ]);
  assert.deepEqual(r.map((s) => s.indice), [1, 2]);
});

test('sin ningun candidato la lista queda vacia, no inventa uno', () => {
  const r = sospechososDeRealimentacion([canal({ indice: 1, nivelDb: -80 })]);
  assert.deepEqual(r, []);
});
