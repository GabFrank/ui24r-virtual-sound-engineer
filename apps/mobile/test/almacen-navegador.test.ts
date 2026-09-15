import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import { VERSION_ESQUEMA } from '@vse/store';
import { AlmacenEnNavegador } from '../src/app/core/almacen/almacen-navegador.ts';

/**
 * El almacén del navegador descarta lo que es de otra versión del esquema.
 *
 * **Acá no corren las migraciones**: son SQL y no hay forma de aplicarlas sobre
 * `localStorage` sin reimplementarlas, que serían dos verdades. Lo que eso
 * dejaba abierto lo encontró una auditoría: un perfil guardado antes de una
 * migración se lee después con el código nuevo, que espera otra forma.
 *
 * `localStorage` no existe bajo `node --test`, así que se usa uno de mentira —
 * el mismo contrato, sin navegador.
 */

function montarAlmacenFalso(): { quedan: () => string[] } {
  const mapa = new Map<string, string>();
  (globalThis as Record<string, unknown>)['localStorage'] = {
    getItem: (k: string) => mapa.get(k) ?? null,
    setItem: (k: string, v: string) => { mapa.set(k, v); },
    removeItem: (k: string) => { mapa.delete(k); },
    get length() { return mapa.size; },
    key: (i: number) => [...mapa.keys()][i] ?? null,
  };
  return { quedan: () => [...mapa.keys()] };
}

const CLAVE_VERSION = 'vse.almacen.__version';
const CLAVE_BANDAS = 'vse.almacen.band_profile';

test('lo guardado con otra versión del esquema se descarta', () => {
  const l = montarAlmacenFalso();
  localStorage.setItem(CLAVE_VERSION, '3');
  localStorage.setItem(CLAVE_BANDAS, JSON.stringify([{ id: 'b1', indices: {}, datos: {} }]));

  const avisos: unknown[][] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => { avisos.push(a); };
  try {
    void new AlmacenEnNavegador().abrir();
  } finally {
    console.warn = original;
  }

  strictEqual(localStorage.getItem(CLAVE_BANDAS), null, 'los datos viejos se van');
  strictEqual(localStorage.getItem(CLAVE_VERSION), String(VERSION_ESQUEMA), 'y queda la versión nueva');
  // **Y se avisa.** Perder datos de prueba no tiene consecuencias; perderlos sin
  // enterarse convierte un «desapareció mi banda» en media hora de búsqueda.
  strictEqual(avisos.length, 1, `tiene que avisar una vez y avisó ${avisos.length}`);
  ok(String(avisos[0]?.[0]).includes('no corren las migraciones'));
  ok(l.quedan().includes(CLAVE_VERSION));
});

test('lo guardado con la misma versión NO se toca', () => {
  // Control positivo: si descartara siempre, el test de arriba pasaría igual y
  // esto no sería un almacén sino un vaciador.
  montarAlmacenFalso();
  localStorage.setItem(CLAVE_VERSION, String(VERSION_ESQUEMA));
  const datos = JSON.stringify([{ id: 'b1', indices: {}, datos: { nombre: 'Alma' } }]);
  localStorage.setItem(CLAVE_BANDAS, datos);

  void new AlmacenEnNavegador().abrir();

  strictEqual(localStorage.getItem(CLAVE_BANDAS), datos, 'los datos de la versión actual se conservan');
});

test('sin marca de versión también se descarta, y sin avisar si no había nada', () => {
  // Son los datos de antes de que esta comprobación existiera: no se sabe con
  // qué forma se escribieron.
  const l = montarAlmacenFalso();
  localStorage.setItem(CLAVE_BANDAS, JSON.stringify([{ id: 'b1', indices: {}, datos: {} }]));
  const avisos: unknown[][] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => { avisos.push(a); };
  try { void new AlmacenEnNavegador().abrir(); } finally { console.warn = original; }
  strictEqual(localStorage.getItem(CLAVE_BANDAS), null);
  strictEqual(avisos.length, 1);

  // Un almacén vacío no tiene nada que descartar: se marca la versión y se
  // calla. Avisar ahí sería ruido en cada arranque limpio.
  montarAlmacenFalso();
  const callados: unknown[][] = [];
  console.warn = (...a: unknown[]) => { callados.push(a); };
  try { void new AlmacenEnNavegador().abrir(); } finally { console.warn = original; }
  strictEqual(callados.length, 0, 'un almacén vacío no avisa');
  strictEqual(localStorage.getItem(CLAVE_VERSION), String(VERSION_ESQUEMA));
  deepStrictEqual(l.quedan().length >= 0, true);
});
