import type { Almacen, Coleccion, Documento, Filtro } from '@vse/store';
import type { DatabaseService } from '../database.service';

/**
 * Columnas indexadas por colección.
 *
 * Cada tabla guarda el documento entero en `datos` y repite en columnas propias
 * solo lo que hace falta para filtrar y ordenar. Duplicar un dato es aceptable
 * cuando el duplicado es un índice; deja de serlo si alguien empieza a leer de
 * la columna en vez de del documento, así que las columnas nunca se devuelven:
 * `obtener` y `listar` reconstruyen el documento desde `datos`.
 */
const INDICES: Readonly<Record<Coleccion, readonly string[]>> = {
  band_profile: ['nombre', 'actualizado_el'],
  venue_profile: ['nombre', 'tipo', 'actualizado_el'],
  pa_profile: ['nombre', 'actualizado_el'],
  sound_session: ['state', 'band_profile_id', 'venue_profile_id', 'iniciada_el', 'cerrada_el'],
  measurement: ['session_id', 'timestamp', 'signal_type', 'channel_id', 'posicion',
    'pa_component', 'calibration_state_id'],
  finding: ['session_id', 'assistant', 'confidence'],
  recommendation: ['session_id', 'finding_id', 'assistant', 'parameter', 'status', 'confidence'],
};

/** Columnas por las que se acepta filtrar u ordenar. */
function validarCampo(coleccion: Coleccion, campo: string): void {
  // El nombre de columna se interpola en el SQL —no se puede parametrizar— así
  // que se comprueba contra la lista conocida. Sin esto, un campo que viniera
  // de fuera podría inyectar SQL.
  if (campo !== 'id' && !INDICES[coleccion].includes(campo)) {
    throw new Error(`campo no indexado en ${coleccion}: ${campo}`);
  }
}

/**
 * Almacén sobre SQLite. Es el del producto.
 */
export class AlmacenSqlite implements Almacen {
  private readonly base: DatabaseService;

  constructor(base: DatabaseService) { this.base = base; }

  get descripcion(): string { return 'SQLite en el dispositivo'; }

  async abrir(): Promise<void> {
    await this.base.abrir();
  }

  async guardar(coleccion: Coleccion, doc: Documento): Promise<void> {
    const columnas = ['id', ...INDICES[coleccion], 'datos'];
    const valores = [
      doc.id,
      ...INDICES[coleccion].map((c) => doc.indices[c] ?? null),
      JSON.stringify(doc.datos),
    ];
    const huecos = columnas.map(() => '?').join(', ');
    await this.base.ejecutar(
      `INSERT OR REPLACE INTO ${coleccion} (${columnas.join(', ')}) VALUES (${huecos});`,
      valores,
    );
  }

  async obtener(coleccion: Coleccion, id: string): Promise<Documento | null> {
    const filas = await this.base.consultar<Record<string, unknown>>(
      `SELECT * FROM ${coleccion} WHERE id = ? LIMIT 1;`, [id],
    );
    const fila = filas[0];
    return fila === undefined ? null : this.aDocumento(coleccion, fila);
  }

  async listar(coleccion: Coleccion, filtro: Filtro = {}): Promise<readonly Documento[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    for (const [campo, valor] of Object.entries(filtro.donde ?? {})) {
      validarCampo(coleccion, campo);
      if (valor === null) {
        condiciones.push(`${campo} IS NULL`);
      } else {
        condiciones.push(`${campo} = ?`);
        valores.push(valor);
      }
    }
    let sql = `SELECT * FROM ${coleccion}`;
    if (condiciones.length > 0) sql += ` WHERE ${condiciones.join(' AND ')}`;
    if (filtro.ordenarPor) {
      validarCampo(coleccion, filtro.ordenarPor);
      sql += ` ORDER BY ${filtro.ordenarPor} ${filtro.descendente ? 'DESC' : 'ASC'}`;
    }
    if (filtro.limite !== undefined) {
      sql += ' LIMIT ?';
      valores.push(filtro.limite);
    }
    const filas = await this.base.consultar<Record<string, unknown>>(`${sql};`, valores);
    return filas.map((f) => this.aDocumento(coleccion, f));
  }

  async borrar(coleccion: Coleccion, id: string): Promise<void> {
    await this.base.ejecutar(`DELETE FROM ${coleccion} WHERE id = ?;`, [id]);
  }

  async exportar(): Promise<string> {
    return this.base.exportar();
  }

  private aDocumento(coleccion: Coleccion, fila: Record<string, unknown>): Documento {
    const indices: Record<string, string | number | null> = {};
    for (const c of INDICES[coleccion]) {
      const v = fila[c];
      indices[c] = typeof v === 'string' || typeof v === 'number' ? v : null;
    }
    return {
      id: String(fila['id']),
      indices,
      datos: JSON.parse(String(fila['datos'] ?? 'null')),
    };
  }
}
