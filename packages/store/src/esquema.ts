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
  {
    version: 3,
    descripcion: 'el registro se guarda como documento, igual que todo lo demas',
    sentencias: [
      // La tabla existia desde la version 1 y nunca se escribio: el registro
      // solo salia por consola. Al conectarle un sumidero se vio que su forma
      // no era la de las demas tablas -- clave entera autoincremental y una
      // columna `payload` en vez de `datos`-- asi que no se podia leer ni
      // escribir por el mismo puerto que el resto. Se rehace en vez de
      // adaptarse: no hay ninguna fila que conservar.
      `DROP TABLE IF EXISTS log_event;`,
      `CREATE TABLE log_event (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        session_id TEXT,
        category TEXT NOT NULL,
        level TEXT NOT NULL,
        event TEXT NOT NULL,
        datos TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_log_sesion ON log_event(session_id, id);`,
      `CREATE INDEX IF NOT EXISTS idx_log_nivel ON log_event(level);`,
    ],
  },
  {
    version: 4,
    descripcion: 'los instrumentos de cada integrante pasan de texto suelto a objeto',
    sentencias: [
      // `BandMember.instrumentos` era una lista de cadenas escritas a mano y
      // pasa a ser una lista de instrumentos con fuente, variante y rol. Las
      // columnas no cambian --el documento entero vive en `datos`-- pero la
      // forma del documento sí, y los perfiles ya guardados quedarían con
      // cadenas donde el dominio espera objetos.
      //
      // Esta migración **no clasifica**: SQL no sabe qué es un djembe. Lo
      // único que hace es darle forma al documento sin tocar el contenido,
      // dejando el texto en `textoOriginal` y las tres facetas en nulo. La
      // clasificación la hace `normalizarInstrumentos()` del dominio la
      // primera vez que el perfil se edita y se guarda. Separarlas es
      // deliberado: una conversión que sí interpreta es una conversión que
      // puede equivocarse, y equivocarse dentro de una migración deja al
      // usuario sin forma de volver atrás.
      //
      // Elemento por elemento y no fila por fila: se convierte lo que sea
      // texto y se deja igual lo que ya sea objeto. Así es idempotente, y una
      // base a medio migrar --por una instalación anterior o por un perfil
      // importado-- termina bien igual.
      //
      // `i.type` y no `json_type(i.value)`: para un elemento de texto,
      // `value` es la cadena ya sin comillas, y `json_type()` sobre «voz»
      // falla con «malformed JSON». La columna `type` de `json_each` da lo
      // mismo sin ese riesgo.
      //
      // `json_valid(datos)` deja fuera cualquier fila ilegible en vez de
      // hacer fallar la migración entera: una base que no abre cancela un
      // show, y una fila rota se ve y se corrige.
      `UPDATE band_profile SET datos = json_replace(datos, '$.integrantes', json((
         SELECT json_group_array(json_replace(m.value, '$.instrumentos', json((
           SELECT json_group_array(CASE WHEN i.type = 'text'
             THEN json_object('fuente', NULL, 'variante', NULL, 'rol', NULL,
                              'textoOriginal', i.value)
             ELSE json(i.value) END)
           FROM json_each(m.value, '$.instrumentos') i))))
         FROM json_each(band_profile.datos, '$.integrantes') m)))
       WHERE json_valid(datos);`,
    ],
  },
  {
    version: 5,
    descripcion: 'los componentes de amplificación ganan clase, modelo y lugar; el local gana escenario',
    sentencias: [
      // Tres campos nuevos en cada componente del sistema y uno en cada local.
      // El documento entero vive en `datos`, así que las columnas no cambian:
      // lo que cambia es la forma, y los perfiles guardados quedarían sin las
      // claves que el dominio ahora declara obligatorias.
      //
      // **Esta migración no interpreta nada.** No adivina que un componente
      // que sale por un auxiliar es un monitor --puede ser un envío a un
      // procesador externo, o a una grabadora-- ni inventa dónde está puesto.
      // Pone `OTRO`, `NULL` y `NULL`, que es exactamente lo que se sabe hoy de
      // un perfil cargado antes de que existiera la pregunta. Clasificar de
      // más acá sería fabricar la entrada de una inferencia geométrica, que es
      // el error que este modelo entero está tratando de no cometer.
      //
      // **`c.type = 'object'` o la base no vuelve a abrir nunca más.** Un
      // elemento de `componentes` que no sea objeto --texto, número, `null`--
      // es JSON perfectamente válido, así que `json_valid(datos)` no lo filtra,
      // y `json_set` sobre él falla con «malformed JSON». Como la aplicación
      // manda cada migración en **un solo lote junto con el
      // `PRAGMA user_version`**, ese error revierte todo: no migra ninguna
      // fila, la versión queda en 4, y en el arranque siguiente se reintenta y
      // vuelve a fallar. Una sola fila con esa forma deja la base atascada
      // para siempre — exactamente el desenlace que esta migración dice estar
      // evitando. La versión 4 previó el caso con `i.type = 'text'`; esta no lo
      // había copiado, y lo encontraron dos auditorías por separado. Los
      // elementos que no son objeto se dejan pasar tal cual: no se los puede
      // arreglar desde SQL y romper la base es peor que dejar una fila rara.
      //
      // **`json_set` y no `json_patch`.** `json_patch` es la fusión de la RFC
      // 7386, donde un `null` **borra la clave** en vez de escribirla: pedirle
      // que ponga `modelo: null` deja el componente exactamente igual que
      // antes, sin la clave, y la migración parece correr sin hacer nada. Es
      // justo el modo de fallar más caro --silencioso y con la versión del
      // esquema ya subida, así que no vuelve a intentarse--. `json_set` sí
      // escribe el nulo.
      //
      // Idempotente porque cada campo se reescribe con lo que ya tenía:
      // `json_extract` de una clave ausente y de una clave en `null` dan lo
      // mismo, y volver a poner `null` sobre `null` no cambia nada. `clase` es
      // el único que podría pisarse, y por eso se conserva **sólo si es texto no
      // vacío**: con `coalesce` a secas, una `clase` en `false` se guardaba
      // como `0` y una en cadena vacía sobrevivía como clase inválida, que es
      // interpretar al revés de lo que este bloque promete.
      //
      // El emplazamiento es un objeto y sobrevive el viaje **sin** envolverlo
      // en `json()`: `json_extract` le deja el subtipo JSON al valor y
      // `json_set` lo vuelve a insertar como objeto. Llegué a poner el `json()`
      // por las dudas y lo saqué al comprobar que el test pasaba igual con y
      // sin él: un arreglo sin consecuencia observable es ruido que después
      // alguien imita donde sí importa. Lo que sí se escaparía como cadena es
      // un texto literal --`json_set(..., '{\"x\":1}')` da `\"{\\\"x\\\":1}\"`--,
      // y por eso ninguna de estas tres ramas construye JSON a mano.
      //
      // `json_valid(datos)` deja fuera cualquier fila ilegible en vez de hacer
      // fallar la migración entera, por lo mismo que la versión 4: una base
      // que no abre cancela un show.
      `UPDATE pa_profile SET datos = json_replace(datos, '$.componentes', json((
         SELECT json_group_array(CASE WHEN c.type = 'object' THEN
           json_set(json_set(json_set(c.value,
             '$.clase', CASE WHEN json_type(c.value, '$.clase') = 'text'
                              AND json_extract(c.value, '$.clase') <> ''
                        THEN json_extract(c.value, '$.clase') ELSE 'OTRO' END),
             '$.modelo', json_extract(c.value, '$.modelo')),
             '$.emplazamiento', json_extract(c.value, '$.emplazamiento'))
           ELSE c.value END)
         FROM json_each(pa_profile.datos, '$.componentes') c)))
       WHERE json_valid(datos) AND json_type(datos, '$.componentes') = 'array';`,
      `UPDATE venue_profile SET datos = json_set(datos, '$.escenario', NULL)
       WHERE json_valid(datos) AND json_type(datos, '$.escenario') IS NULL;`,
    ],
  },
  {
    version: 6,
    descripcion: 'los componentes ganan identidad propia y el lugar se muda del equipo al local',
    sentencias: [
      // **Dónde está puesto un monitor es un dato de la sala, no del equipo.**
      // La versión 5 lo guardó dentro del componente, y una auditoría encontró
      // lo que eso significaba: dos locales que comparten el mismo sistema
      // --que la aplicación permite, y tiene un selector para eso-- se pisaban
      // las posiciones entre sí, en silencio. Ubicar las cuñas en un galpón
      // movía las del bar.
      //
      // Así que el emplazamiento se muda a `escenario.emisores` del local, y
      // para poder referenciar un componente desde afuera, el componente
      // necesita **identidad propia**: el nombre no alcanza --el propio modelo
      // nombra el caso de dos componentes homónimos, los dos lados de un
      // general estéreo-- y la posición en la lista se rompe en cuanto alguien
      // borra uno del medio.
      //
      // No se edita la 5, que ya está publicada: se agrega ésta.
      //
      // **El identificador se arma del `rowid` y la posición**, no al azar:
      // SQLite no tiene generador de identificadores y `random()` haría que
      // esta migración diera resultados distintos en cada corrida, o sea que
      // dejaría de ser reproducible. `comp_<rowid>_<indice>` es único dentro de
      // la base y estable.
      `UPDATE pa_profile SET datos = json_replace(datos, '$.componentes', json((
         SELECT json_group_array(CASE WHEN c.type = 'object' THEN
           json_remove(
             json_set(c.value, '$.id',
               coalesce(json_extract(c.value, '$.id'),
                        'comp_' || pa_profile.rowid || '_' || c.key)),
             '$.emplazamiento')
           ELSE c.value END)
         FROM json_each(pa_profile.datos, '$.componentes') c)))
       WHERE json_valid(datos) AND json_type(datos, '$.componentes') = 'array';`,
      // La lista de emisores del escenario. Arranca vacía: **no se hereda nada
      // del equipo**, porque un emplazamiento guardado en el perfil compartido
      // no dice a cuál de los locales pertenecía. Perder una posición que el
      // usuario puso a mano sería feo; adjudicársela al local equivocado es
      // peor, porque después contradice al analizador y nadie sabe por qué.
      // Al 2026-09-11 no hay ninguna cargada: la versión 5 es de hoy y el
      // editor todavía no se publicó.
      `UPDATE venue_profile SET datos = json_set(datos, '$.escenario.emisores', json('[]'))
       WHERE json_valid(datos)
         AND json_type(datos, '$.escenario') = 'object'
         AND json_type(datos, '$.escenario.emisores') IS NULL;`,
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
  // El identificador del evento es su marca de tiempo mas un contador, asi
  // que ordenar por `id` da el orden cronologico y no hace falta indexar
  // `ts` para eso. Se indexa igual porque un informe se recorta por fecha.
  log_event: ['ts', 'session_id', 'category', 'level', 'event'],
};
