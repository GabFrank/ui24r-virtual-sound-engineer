import {
  aDocumento, sentenciaBorrar, sentenciaContar, sentenciaGuardar, sentenciaListar,
  sentenciaObtener,
  type Almacen, type Coleccion, type Documento, type Filtro,
} from '@vse/store';
import type { DatabaseService } from '../database.service';

/**
 * Almacén sobre SQLite. Es el del producto.
 *
 * No decide nada: el SQL —y con él la semántica de los filtros, del orden y de
 * los valores ausentes— vive en `@vse/store`, donde se prueba contra SQLite de
 * verdad y se compara resultado a resultado con la implementación de
 * referencia. Acá solo queda quién ejecuta el texto, que es lo único que esta
 * clase sabe hacer y lo único que no se puede probar fuera de Android.
 */
export class AlmacenSqlite implements Almacen {
  private readonly base: DatabaseService;

  constructor(base: DatabaseService) { this.base = base; }

  get descripcion(): string { return 'SQLite en el dispositivo'; }

  async abrir(): Promise<void> {
    await this.base.abrir();
  }

  async guardar(coleccion: Coleccion, doc: Documento): Promise<void> {
    const s = sentenciaGuardar(coleccion, doc);
    await this.base.ejecutar(s.sql, s.valores);
  }

  async obtener(coleccion: Coleccion, id: string): Promise<Documento | null> {
    const s = sentenciaObtener(coleccion, id);
    const filas = await this.base.consultar<Record<string, unknown>>(s.sql, s.valores);
    const fila = filas[0];
    return fila === undefined ? null : aDocumento(coleccion, fila);
  }

  async listar(coleccion: Coleccion, filtro: Filtro = {}): Promise<readonly Documento[]> {
    const s = sentenciaListar(coleccion, filtro);
    const filas = await this.base.consultar<Record<string, unknown>>(s.sql, s.valores);
    return filas.map((f) => aDocumento(coleccion, f));
  }

  async contar(coleccion: Coleccion, filtro: Filtro = {}): Promise<number> {
    const s = sentenciaContar(coleccion, filtro);
    const filas = await this.base.consultar<{ n: number }>(s.sql, s.valores);
    return filas[0]?.n ?? 0;
  }

  async borrar(coleccion: Coleccion, id: string): Promise<void> {
    const s = sentenciaBorrar(coleccion, id);
    await this.base.ejecutar(s.sql, s.valores);
  }

  async exportar(): Promise<string> {
    return this.base.exportar();
  }
}
