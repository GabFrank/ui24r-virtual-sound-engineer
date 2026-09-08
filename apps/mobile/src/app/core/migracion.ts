import { MIGRACIONES, type Migracion } from '@vse/store';

/**
 * Aplicación de las migraciones del esquema.
 *
 * Vive fuera de `DatabaseService` para poder probarse: el servicio depende de
 * Capacitor y de la inyección de Angular, y ninguna de las dos cosas existe
 * bajo `node --test`. Acá solo hace falta alguien que ejecute un lote de SQL,
 * y eso un test lo puede dar contra SQLite de verdad.
 *
 * **La transacción no se escribe acá.** El `execute()` del complemento de
 * SQLite ya abre una transacción propia y la cierra con `COMMIT`, y revierte
 * sola si algo del lote falla. Un `BEGIN;` explícito, que es lo que había
 * antes, cae dentro de esa transacción y SQLite lo rechaza:
 *
 *     Execute: cannot start a transaction within a transaction: BEGIN;
 *
 * Con eso, **ninguna migración se aplicaba nunca** —ni en una instalación
 * limpia ni en una vieja— y la base quedaba sin una sola tabla. Lo que se veía
 * después era `no such table: sound_session`, que no señala hacia acá. Por eso
 * cada migración se manda en **una sola llamada**: es la forma que el
 * complemento espera y la que conserva la atomicidad que hace falta, que una
 * migración a medio aplicar deja la base en un estado que nadie sabe leer.
 */

/** Lo único que la migración necesita del mundo: ejecutar un lote de SQL. */
export type EjecutarLote = (sql: string) => Promise<unknown>;

/**
 * El SQL de una migración, con su marca de versión al final.
 *
 * La marca va en el mismo lote a propósito: si viajara aparte y el proceso se
 * cortara en el medio, la base tendría las tablas y no la versión, y la
 * migración volvería a correr en el próximo arranque.
 */
export function loteDeMigracion(m: Migracion): string {
  return [...m.sentencias, `PRAGMA user_version = ${m.version};`].join('\n');
}

/**
 * Aplica en orden las migraciones posteriores a `desde`.
 *
 * Devuelve las que aplicó, para que quien llame las registre. Si una falla, se
 * propaga: la base queda en la última versión completa, nunca a medio camino.
 */
export async function aplicarMigraciones(
  ejecutar: EjecutarLote,
  desde: number,
): Promise<readonly Migracion[]> {
  const aplicadas: Migracion[] = [];
  for (const m of MIGRACIONES) {
    if (m.version <= desde) continue;
    await ejecutar(loteDeMigracion(m));
    aplicadas.push(m);
  }
  return aplicadas;
}
