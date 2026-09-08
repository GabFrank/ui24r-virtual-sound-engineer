import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AlmacenEnMemoria } from '../src/memoria.ts';
import { INDICES, MIGRACIONES } from '../src/esquema.ts';
import { aDocumento, sentenciaBorrar, sentenciaGuardar, sentenciaListar, sentenciaObtener }
  from '../src/sql.ts';
import type { Almacen, Coleccion, Documento, Filtro } from '../src/tipos.ts';

/**
 * Almacén sobre SQLite de verdad, con el mismo SQL que corre en la tablet.
 *
 * Es el punto de estas pruebas: la implementación de Android no se puede
 * ejecutar acá —depende de Capacitor— pero las sentencias sí, y las sentencias
 * son donde estaba el error. Lo único que cambia entre esta clase y la de la
 * aplicación es quién ejecuta el texto.
 */
class AlmacenSqliteDePrueba implements Almacen {
  private readonly db = new DatabaseSync(':memory:');

  get descripcion(): string { return 'SQLite en memoria (prueba)'; }

  async abrir(): Promise<void> {
    for (const m of MIGRACIONES) for (const s of m.sentencias) this.db.exec(s);
  }

  async guardar(coleccion: Coleccion, doc: Documento): Promise<void> {
    const s = sentenciaGuardar(coleccion, doc);
    this.db.prepare(s.sql).run(...(s.valores as never[]));
  }

  async obtener(coleccion: Coleccion, id: string): Promise<Documento | null> {
    const s = sentenciaObtener(coleccion, id);
    const filas = this.db.prepare(s.sql).all(...(s.valores as never[]));
    const fila = filas[0] as Record<string, unknown> | undefined;
    return fila === undefined ? null : aDocumento(coleccion, fila);
  }

  async listar(coleccion: Coleccion, filtro: Filtro = {}): Promise<readonly Documento[]> {
    const s = sentenciaListar(coleccion, filtro);
    const filas = this.db.prepare(s.sql).all(...(s.valores as never[]));
    return (filas as Record<string, unknown>[]).map((f) => aDocumento(coleccion, f));
  }

  async borrar(coleccion: Coleccion, id: string): Promise<void> {
    const s = sentenciaBorrar(coleccion, id);
    this.db.prepare(s.sql).run(...(s.valores as never[]));
  }

  async exportar(): Promise<string> { return '{}'; }
}

function sesion(id: string, cerradaEl: string | null, iniciadaEl: string): Documento {
  return {
    id,
    indices: {
      state: cerradaEl === null ? 'ACTIVE' : 'CLOSED',
      band_profile_id: 'b1',
      venue_profile_id: 'v1',
      iniciada_el: iniciadaEl,
      cerrada_el: cerradaEl,
    },
    datos: { nota: id },
  };
}

/**
 * Los mismos documentos, en los dos almacenes, antes de cada comparación.
 *
 * La banda y el local se guardan primero porque `sound_session` los referencia
 * y `node:sqlite` aplica las claves foráneas. La tablet hoy no las aplica —nada
 * ejecuta «PRAGMA foreign_keys = ON»— así que acá la comprobación es más
 * estricta que en producción. Se deja así a propósito: los datos que escribe la
 * aplicación siempre tienen padre, y una prueba que exige integridad detecta
 * antes el día en que dejen de tenerlo.
 */
async function ambos(): Promise<readonly [Almacen, Almacen]> {
  const memoria = new AlmacenEnMemoria();
  const sqlite = new AlmacenSqliteDePrueba();
  await memoria.abrir();
  await sqlite.abrir();
  const padres: readonly (readonly [Coleccion, Documento])[] = [
    ['band_profile', { id: 'b1', indices: { nombre: 'Banda', actualizado_el: '2026-01-01' }, datos: {} }],
    ['venue_profile', { id: 'v1', indices: { nombre: 'Local', tipo: 'BAR', actualizado_el: '2026-01-01' }, datos: {} }],
  ];
  for (const [coleccion, doc] of padres) {
    await memoria.guardar(coleccion, doc);
    await sqlite.guardar(coleccion, doc);
  }
  const docs = [
    sesion('s1', '2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'),
    sesion('s2', null, '2026-01-03T00:00:00Z'),
    sesion('s3', '2026-01-05T00:00:00Z', '2026-01-04T00:00:00Z'),
    sesion('s4', null, '2026-01-06T00:00:00Z'),
  ];
  for (const d of docs) {
    await memoria.guardar('sound_session', d);
    await sqlite.guardar('sound_session', d);
  }
  return [memoria, sqlite];
}

/** Compara los identificadores devueltos, en orden, por los dos almacenes. */
async function mismosIds(filtro: Filtro): Promise<readonly string[]> {
  const [memoria, sqlite] = await ambos();
  const a = (await memoria.listar('sound_session', filtro)).map((d) => d.id);
  const b = (await sqlite.listar('sound_session', filtro)).map((d) => d.id);
  assert.deepEqual(b, a, `SQLite y memoria no contestan lo mismo para ${JSON.stringify(filtro)}`);
  return a;
}

test('sin filtro devuelven los mismos documentos', async () => {
  const ids = await mismosIds({});
  assert.equal(ids.length, 4);
});

test('la sesión abierta se busca por ausencia y los dos la encuentran', async () => {
  // En SQL «cerrada_el = NULL» no devuelve nada. Es el caso que motivó separar
  // la semántica de las consultas de sus dos implementaciones.
  const ids = await mismosIds({ donde: { cerrada_el: null } });
  assert.deepEqual([...ids].sort(), ['s2', 's4']);
});

test('los ausentes van al final también al ordenar descendente', async () => {
  // SQLite trata NULL como el valor más bajo: sin la primera clave de orden,
  // acá aparecerían s2 y s4 encabezando la lista.
  const ids = await mismosIds({ ordenarPor: 'cerrada_el', descendente: true });
  assert.deepEqual(ids, ['s3', 's1', 's2', 's4']);
});

test('los ausentes van al final al ordenar ascendente', async () => {
  const ids = await mismosIds({ ordenarPor: 'cerrada_el' });
  assert.deepEqual(ids, ['s1', 's3', 's2', 's4']);
});

test('el límite se aplica después de ordenar en los dos', async () => {
  const ids = await mismosIds({ ordenarPor: 'iniciada_el', descendente: true, limite: 2 });
  assert.deepEqual(ids, ['s4', 's3']);
});

test('filtro y orden combinados coinciden', async () => {
  const ids = await mismosIds({
    donde: { band_profile_id: 'b1', state: 'CLOSED' },
    ordenarPor: 'iniciada_el',
  });
  assert.deepEqual(ids, ['s1', 's3']);
});

test('obtener y borrar se comportan igual', async () => {
  const [memoria, sqlite] = await ambos();
  assert.deepEqual(await sqlite.obtener('sound_session', 's2'),
    await memoria.obtener('sound_session', 's2'));
  assert.equal(await sqlite.obtener('sound_session', 'no-existe'), null);
  await memoria.borrar('sound_session', 's2');
  await sqlite.borrar('sound_session', 's2');
  assert.equal(await sqlite.obtener('sound_session', 's2'), null);
  assert.equal((await sqlite.listar('sound_session')).length, 3);
});

test('guardar dos veces el mismo identificador reemplaza, no duplica', async () => {
  const [, sqlite] = await ambos();
  await sqlite.guardar('sound_session', sesion('s1', null, '2026-02-01T00:00:00Z'));
  const todas = await sqlite.listar('sound_session');
  assert.equal(todas.length, 4);
  const s1 = await sqlite.obtener('sound_session', 's1');
  assert.equal(s1?.indices['cerrada_el'], null);
});

test('el documento vuelve entero y los índices se releen de sus columnas', async () => {
  const [, sqlite] = await ambos();
  const d = await sqlite.obtener('sound_session', 's3');
  assert.deepEqual(d?.datos, { nota: 's3' });
  assert.equal(d?.indices['state'], 'CLOSED');
});

test('un campo no indexado se rechaza antes de llegar al SQL', async () => {
  const [, sqlite] = await ambos();
  await assert.rejects(
    () => sqlite.listar('sound_session', { donde: { "nombre'; DROP TABLE": 'x' } }),
    /campo no indexado/,
  );
  await assert.rejects(
    () => sqlite.listar('sound_session', { ordenarPor: 'datos' }),
    /campo no indexado/,
  );
});

test('cada índice declarado existe como columna en su tabla', async () => {
  // El DDL y la lista de índices son dos textos separados que tienen que decir
  // lo mismo. Cuando divergen, el fallo aparece como «no such column» en la
  // tablet y en ningún otro sitio.
  const sqlite = new AlmacenSqliteDePrueba();
  await sqlite.abrir();
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRACIONES) for (const s of m.sentencias) db.exec(s);
  for (const [coleccion, columnas] of Object.entries(INDICES)) {
    const info = db.prepare(`PRAGMA table_info(${coleccion});`).all() as { name: string }[];
    const existentes = info.map((f) => f.name);
    assert.ok(existentes.length > 0, `la tabla ${coleccion} no existe en el esquema`);
    for (const c of ['id', 'datos', ...columnas]) {
      assert.ok(existentes.includes(c), `${coleccion} no tiene la columna ${c}`);
    }
  }
});
