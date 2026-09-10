import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES, VERSION_ESQUEMA } from '@vse/store';
import { aplicarMigraciones, loteDeMigracion } from '../src/app/core/migracion.ts';

/**
 * El `execute()` del complemento de SQLite, tal como está escrito en
 * `Database.java`: envuelve el lote en una transacción propia, lo ejecuta y
 * hace `COMMIT`; si algo falla, revierte.
 *
 * Se emula contra SQLite de verdad y no con un doble que diga que sí a todo,
 * porque el defecto que estos tests cubren **era** de SQLite: rechaza abrir
 * una transacción dentro de otra, y eso un doble complaciente no lo dice.
 */
class ComplementoFalso {
  readonly db = new DatabaseSync(':memory:');
  /** Los lotes que recibió, para poder afirmar cuántas llamadas hubo. */
  readonly lotes: string[] = [];

  ejecutar = async (sql: string): Promise<void> => {
    this.lotes.push(sql);
    this.db.exec('BEGIN;');
    try {
      this.db.exec(sql);
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
  };

  version(): number {
    const fila = this.db.prepare('PRAGMA user_version;').get() as { user_version: number };
    return fila.user_version;
  }

  tablas(): string[] {
    const filas = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;")
      .all() as { name: string }[];
    return filas.map((f) => f.name);
  }
}

test('desde una base vacía quedan las tablas y la versión del esquema', async () => {
  // El defecto que originó este test: la migración mandaba un `BEGIN;` propio
  // dentro de la transacción del complemento, SQLite lo rechazaba con «cannot
  // start a transaction within a transaction», y **ninguna migración se
  // aplicaba nunca**. La base quedaba sin una sola tabla y lo que se veía en
  // el teléfono era `no such table: sound_session`, que apunta a otro lado.
  const c = new ComplementoFalso();

  const aplicadas = await aplicarMigraciones(c.ejecutar, 0);

  assert.equal(aplicadas.length, MIGRACIONES.length, 'se aplican todas las pendientes');
  assert.equal(c.version(), VERSION_ESQUEMA, 'la base queda en la versión del esquema');
  for (const tabla of ['band_profile', 'venue_profile', 'sound_session']) {
    assert.ok(c.tablas().includes(tabla), `falta la tabla ${tabla}`);
  }
});

test('cada migración viaja en un solo lote, que es lo que el complemento espera', async () => {
  const c = new ComplementoFalso();

  await aplicarMigraciones(c.ejecutar, 0);

  assert.equal(c.lotes.length, MIGRACIONES.length, 'una llamada por migración, no una por sentencia');
  for (const lote of c.lotes) {
    assert.ok(
      !/\b(BEGIN|COMMIT|ROLLBACK)\b/i.test(lote),
      'el lote no lleva transacción propia: la abre el complemento',
    );
  }
});

test('la versión viaja con las tablas y no en una llamada aparte', () => {
  // Si la marca de versión fuera un lote suyo, un corte entre los dos dejaría
  // la base con las tablas y sin versión, y la migración volvería a correr.
  for (const m of MIGRACIONES) {
    assert.ok(
      loteDeMigracion(m).includes(`PRAGMA user_version = ${m.version};`),
      `la migración ${m.version} no marca su versión`,
    );
  }
});

test('una base ya migrada no vuelve a migrarse', async () => {
  const c = new ComplementoFalso();
  await aplicarMigraciones(c.ejecutar, 0);
  const lotesDeLaPrimera = c.lotes.length;

  const aplicadas = await aplicarMigraciones(c.ejecutar, c.version());

  assert.deepEqual(aplicadas, [], 'no hay nada pendiente');
  assert.equal(c.lotes.length, lotesDeLaPrimera, 'no se ejecutó ningún lote de más');
});

test('si una migración falla, la base no queda a medio camino', async () => {
  const c = new ComplementoFalso();
  const rota = async (sql: string) => {
    await c.ejecutar(sql + '\nCREATE TABLE band_profile (id TEXT);');
  };

  await assert.rejects(() => aplicarMigraciones(rota, 0), /band_profile/);
  assert.equal(c.version(), 0, 'sin versión nueva: la próxima apertura vuelve a intentarlo');
  assert.deepEqual(c.tablas(), [], 'y sin tablas a medias');
});
