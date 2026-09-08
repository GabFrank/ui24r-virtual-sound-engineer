import { INDICES } from './esquema.ts';
import type { Coleccion, Documento, Filtro } from './tipos.ts';

/**
 * Traducción del filtro a SQL, en un solo sitio.
 *
 * Estaba escrita dentro del almacén de la tablet, que es justo el sitio donde
 * no se puede probar: hacía falta Android, Capacitor y un dispositivo para
 * saber si una consulta contestaba lo mismo que la implementación de
 * referencia. El resultado previsible fue que no contestaba lo mismo —el orden
 * de los valores ausentes divergía— y nadie podía verlo.
 *
 * Acá es TypeScript puro que devuelve texto y parámetros, así que
 * `test/sql.test.ts` lo corre contra SQLite de verdad y compara resultado a
 * resultado con `AlmacenEnMemoria`.
 */

export interface Sentencia {
  readonly sql: string;
  readonly valores: readonly unknown[];
}

/**
 * Comprueba que se pueda filtrar u ordenar por ese campo.
 *
 * El nombre de columna se interpola en el SQL —no se puede parametrizar— así
 * que se compara contra la lista conocida. Sin esto, un campo que viniera de
 * fuera podría inyectar SQL.
 */
export function validarCampo(coleccion: Coleccion, campo: string): void {
  if (campo !== 'id' && !INDICES[coleccion].includes(campo)) {
    throw new Error(`campo no indexado en ${coleccion}: ${campo}`);
  }
}

export function sentenciaGuardar(coleccion: Coleccion, doc: Documento): Sentencia {
  const columnas = ['id', ...INDICES[coleccion], 'datos'];
  const valores = [
    doc.id,
    ...INDICES[coleccion].map((c) => doc.indices[c] ?? null),
    JSON.stringify(doc.datos),
  ];
  const huecos = columnas.map(() => '?').join(', ');
  return {
    sql: `INSERT OR REPLACE INTO ${coleccion} (${columnas.join(', ')}) VALUES (${huecos});`,
    valores,
  };
}

export function sentenciaObtener(coleccion: Coleccion, id: string): Sentencia {
  return { sql: `SELECT * FROM ${coleccion} WHERE id = ? LIMIT 1;`, valores: [id] };
}

export function sentenciaBorrar(coleccion: Coleccion, id: string): Sentencia {
  return { sql: `DELETE FROM ${coleccion} WHERE id = ?;`, valores: [id] };
}

export function sentenciaListar(coleccion: Coleccion, filtro: Filtro = {}): Sentencia {
  const condiciones: string[] = [];
  const valores: unknown[] = [];
  for (const [campo, valor] of Object.entries(filtro.donde ?? {})) {
    validarCampo(coleccion, campo);
    if (valor === null) {
      // En SQL «columna = NULL» nunca es cierto, ni siquiera cuando la columna
      // es NULL. Hace falta IS NULL, y es exactamente la consulta con la que se
      // busca la sesión abierta: cerrada_el IS NULL.
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
    // «campo IS NULL» da 0 o 1, y ordenarlo ascendente deja los ausentes al
    // final en los dos sentidos. Sin esta primera clave, SQLite trata NULL
    // como el valor más bajo y los ausentes encabezan la lista al pedir orden
    // descendente, que es lo contrario de lo que hace `ordenar()`.
    sql += ` ORDER BY ${filtro.ordenarPor} IS NULL ASC,` +
      ` ${filtro.ordenarPor} ${filtro.descendente ? 'DESC' : 'ASC'}`;
  }
  if (filtro.limite !== undefined) {
    sql += ' LIMIT ?';
    valores.push(filtro.limite);
  }
  return { sql: `${sql};`, valores };
}

/** Reconstruye el documento desde la fila. Las columnas de índice se releen. */
export function aDocumento(coleccion: Coleccion, fila: Record<string, unknown>): Documento {
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
