import type { Coleccion } from './tipos.ts';

/**
 * Esquema de la base local: las migraciones y las columnas por las que se
 * puede filtrar y ordenar.
 *
 * Vive en `@vse/store` y no en la aplicación porque es lo que hace posible
 * probar el almacén de SQLite de verdad: los tests crean una base en memoria
 * con estas mismas sentencias y corren contra ella el mismo SQL que corre en
 * la tablet. Mientras el esquema estuvo del lado de Angular, la única forma de
 * comprobar una consulta era leerla.
 *
 * Migraciones: versionadas y en orden, la versión 0 es una base vacía y cada
 * migración lleva de N a N+1. Nunca se edita una ya publicada: se agrega otra.
 * Un show cancelado por una base que no abre es peor que cualquier deuda de
 * esquema.
 */

export interface Migracion {
  readonly version: number;
  readonly descripcion: string;
  readonly sentencias: readonly string[];
}

export const MIGRACIONES: readonly Migracion[] = [
  {
    version: 1,
    descripcion: 'esquema inicial: sesiones, perfiles, mediciones, recomendaciones y transacciones',
    sentencias: [
      `CREATE TABLE IF NOT EXISTS band_profile (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        datos TEXT NOT NULL,
        actualizado_el TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS venue_profile (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        tipo TEXT NOT NULL,
        datos TEXT NOT NULL,
        actualizado_el TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS sound_session (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        band_profile_id TEXT NOT NULL REFERENCES band_profile(id),
        venue_profile_id TEXT NOT NULL REFERENCES venue_profile(id),
        iniciada_el TEXT NOT NULL,
        cerrada_el TEXT,
        datos TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS measurement (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sound_session(id),
        timestamp TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        channel_id TEXT,
        posicion TEXT,
        pa_component TEXT,
        calibration_state_id TEXT NOT NULL,
        datos TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_measurement_session ON measurement(session_id);`,
      `CREATE TABLE IF NOT EXISTS finding (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sound_session(id),
        assistant TEXT NOT NULL,
        confidence TEXT NOT NULL,
        datos TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS recommendation (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sound_session(id),
        finding_id TEXT REFERENCES finding(id),
        assistant TEXT NOT NULL,
        parameter TEXT NOT NULL,
        status TEXT NOT NULL,
        confidence TEXT NOT NULL,
        datos TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_recommendation_session ON recommendation(session_id);`,
      // El diario se escribe ANTES de cada escritura (INV-020). Si la
      // aplicación se cae a mitad de una transacción, al arrancar se detecta
      // qué quedó aplicando y se compara contra el estado real de la consola.
      `CREATE TABLE IF NOT EXISTS transaction_journal (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sound_session(id),
        state TEXT NOT NULL,
        snapshot_ref TEXT,
        measurement_before_id TEXT,
        measurement_after_id TEXT,
        creado_el TEXT NOT NULL,
        cerrado_el TEXT,
        datos TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_journal_state ON transaction_journal(state);`,
      `CREATE TABLE IF NOT EXISTS log_event (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        session_id TEXT,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_log_session ON log_event(session_id, ts);`,
    ],
  },
  {
    version: 2,
    descripcion: 'perfiles de PA propios y columnas de indice que faltaban',
    sentencias: [
      // El perfil de PA vivia embebido en el perfil de local. Se separa porque
      // una banda que toca en tres lugares con el mismo equipo propio tenia
      // que describirlo tres veces, y porque al medir por componente hace
      // falta poder responder "que sistema es este" sin abrir el local.
      `CREATE TABLE IF NOT EXISTS pa_profile (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        actualizado_el TEXT NOT NULL,
        datos TEXT NOT NULL
      );`,
      // El listado del historial ordena por fecha y filtra por banda o local.
      `CREATE INDEX IF NOT EXISTS idx_sesion_inicio ON sound_session(iniciada_el);`,
      `CREATE INDEX IF NOT EXISTS idx_sesion_banda ON sound_session(band_profile_id);`,
      `CREATE INDEX IF NOT EXISTS idx_sesion_local ON sound_session(venue_profile_id);`,
      `CREATE INDEX IF NOT EXISTS idx_banda_nombre ON band_profile(nombre);`,
      `CREATE INDEX IF NOT EXISTS idx_local_nombre ON venue_profile(nombre);`,
    ],
  },
];

export const VERSION_ESQUEMA = MIGRACIONES[MIGRACIONES.length - 1]!.version;

/**
 * Columnas indexadas por colección.
 *
 * Cada tabla guarda el documento entero en `datos` y repite en columnas propias
 * solo lo que hace falta para filtrar y ordenar. Duplicar un dato es aceptable
 * cuando el duplicado es un índice; deja de serlo si alguien empieza a leer de
 * la columna en vez de del documento, así que las columnas nunca se devuelven:
 * la lectura reconstruye el documento desde `datos`.
 *
 * Esta lista y el DDL de arriba tienen que decir lo mismo. No es una promesa:
 * `test/sql.test.ts` crea la base con las migraciones y comprueba, columna por
 * columna, que cada índice declarado existe en la tabla.
 */
export const INDICES: Readonly<Record<Coleccion, readonly string[]>> = {
  band_profile: ['nombre', 'actualizado_el'],
  venue_profile: ['nombre', 'tipo', 'actualizado_el'],
  pa_profile: ['nombre', 'actualizado_el'],
  sound_session: ['state', 'band_profile_id', 'venue_profile_id', 'iniciada_el', 'cerrada_el'],
  measurement: ['session_id', 'timestamp', 'signal_type', 'channel_id', 'posicion',
    'pa_component', 'calibration_state_id'],
  finding: ['session_id', 'assistant', 'confidence'],
  recommendation: ['session_id', 'finding_id', 'assistant', 'parameter', 'status', 'confidence'],
};
