import { Injectable, inject } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Logger } from './logger';
import { MIGRACIONES, VERSION_ESQUEMA } from '@vse/store';

const NOMBRE_BASE = 'vse';

/**
 * Acceso a la base local. Todo vive en el dispositivo: durante un show no hay
 * internet ni se necesita.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly log = inject(Logger);
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async abrir(): Promise<void> {
    if (this.db) return;
    const conn = await this.sqlite.createConnection(NOMBRE_BASE, false, 'no-encryption', 1, false);
    await conn.open();
    this.db = conn;
    const desde = await this.versionActual();
    await this.migrar(desde);
    this.log.info('system', 'base_abierta', { version: VERSION_ESQUEMA, desde });
  }

  async cerrar(): Promise<void> {
    if (!this.db) return;
    await this.db.close();
    await this.sqlite.closeConnection(NOMBRE_BASE, false);
    this.db = null;
  }

  private conexion(): SQLiteDBConnection {
    if (!this.db) throw new Error('la base no está abierta: llamar a abrir() primero');
    return this.db;
  }

  private async versionActual(): Promise<number> {
    const r = await this.conexion().query('PRAGMA user_version;');
    const fila = r.values?.[0] as { user_version?: number } | undefined;
    return fila?.user_version ?? 0;
  }

  /**
   * Aplica las migraciones pendientes en orden. Cada una corre en su propia
   * transacción: si una falla, la base queda en la última versión completa y
   * no a medio camino.
   */
  private async migrar(desde: number): Promise<void> {
    for (const m of MIGRACIONES) {
      if (m.version <= desde) continue;
      const db = this.conexion();
      try {
        await db.execute('BEGIN;');
        for (const s of m.sentencias) await db.execute(s);
        await db.execute(`PRAGMA user_version = ${m.version};`);
        await db.execute('COMMIT;');
        this.log.info('system', 'migracion_aplicada', {
          version: m.version,
          descripcion: m.descripcion,
        });
      } catch (e) {
        await db.execute('ROLLBACK;');
        this.log.error('system', 'migracion_fallida', {
          version: m.version,
          error: String(e),
        });
        throw e;
      }
    }
  }

  async ejecutar(sql: string, valores: readonly unknown[] = []): Promise<void> {
    await this.conexion().run(sql, valores as unknown[]);
  }

  async consultar<T>(sql: string, valores: readonly unknown[] = []): Promise<T[]> {
    const r = await this.conexion().query(sql, valores as unknown[]);
    return (r.values ?? []) as T[];
  }

  /**
   * Exporta la base a un objeto serializable, para adjuntar a un informe de
   * campo o a una consulta de soporte. Sin audio.
   */
  async exportar(): Promise<string> {
    // exportToJson vive en la conexión de la base, no en el gestor de
    // conexiones. Es un detalle fácil de confundir porque el gestor expone
    // métodos de nombre parecido.
    const r = await this.conexion().exportToJson('full');
    return JSON.stringify(r.export ?? {});
  }
}
