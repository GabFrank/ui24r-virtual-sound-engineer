import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '@vse/store';
import { historialDeLaSesion } from '@vse/safety';
import type { EntradaDiario } from '@vse/safety';
import type { Measurement } from '@vse/domain';

/**
 * El segundo paso de una rampa sólo pasa si la medición de en medio existe.
 *
 * **Qué se está probando, en una línea:** que leer las mediciones de la base y
 * pasárselas al historial cambia el veredicto. Hasta el 2026-09-18 los dos
 * servicios pasaban `[]` y el historial no podía resolver `medicionPosteriorId`,
 * así que **ninguna ruta quedaba con escucha comprobada** y la rampa que la
 * pieza de monitor necesita —2 dB, escuchar, otros 2 dB— se frenaba en el
 * segundo paso.
 *
 * **El test que importa es el negativo, y por eso están los dos.** Uno solo
 * afirmando «con mediciones, pasa» no distingue el arreglo de una guarda que
 * concede siempre: pasaría igual con el código viejo si el viejo concediera. El
 * par —vacío no concede, poblado sí— es el que falla al revertir la corrección,
 * que es lo que este repositorio pide comprobar.
 *
 * Se corre contra SQLite de verdad y con el esquema real, no con un doble: la
 * mitad de lo que se prueba es que la fila **se lee de donde se guarda**.
 */

const SESION = 'ses-1';
const RUTA = 'i.3.aux.1.value';
/** Diez segundos antes de ahora, para que la ventana de escucha haya terminado. */
const EMPEZO = new Date(Date.now() - 60_000).toISOString();
const ENVIADO = new Date(Date.now() - 120_000).toISOString();

function medicion(): Measurement {
  return {
    id: 'med-1', sessionId: SESION,
    // Con huso explícito: `toISOString` termina en `Z`. Sin huso, `instante()`
    // devuelve nulo y la guarda no concede --y ese caso tiene su propio test en
    // el paquete de seguridad--.
    timestamp: EMPEZO,
    signalType: 'PERFORMANCE', referenceMode: null, paComponent: null,
    channelId: null, posicion: null, sceneId: null, buildState: null,
    micProfileId: null, calibrationStateId: 'cal-1', snapshotRef: null,
    sampleRate: 48_000,
    // La escucha mínima de un envío a monitor son diez segundos.
    duracionS: 10,
    directRef: null, acousticRef: null, consoleTelemetry: null, archivoAudio: null,
  } as Measurement;
}

function transaccionQueYaMovio(): EntradaDiario {
  return {
    id: 'tx-1', sessionId: SESION, estado: 'APPLIED', snapshotRef: null,
    creadoEl: ENVIADO, cerradoEl: ENVIADO,
    medicionPosteriorId: 'med-1',
    cambios: [{
      path: RUTA, kind: 'MONITOR_AUX_SEND',
      valorAnterior: -34, valorPropuesto: -32, magnitudPropuesta: 2,
      verificado: true, enviadoEl: ENVIADO,
    }],
  } as unknown as EntradaDiario;
}

/**
 * El esquema real, con la tabla `measurement` tal como está en la migración,
 * y la sesión a la que la medición apunta.
 *
 * **La sesión hace falta de verdad, no es decorado del test.** `measurement`
 * declara `session_id ... REFERENCES sound_session(id)`, y la primera versión de
 * este test insertaba la medición sola: SQLite la rechazó con `FOREIGN KEY
 * constraint failed`. O sea que **la base ya garantiza que no puede haber una
 * medición huérfana**, y el cruce por sesión de `escuchaComprobada` no es la
 * única línea de defensa. Vale dejarlo dicho: se descubrió acá.
 *
 * La sesión arrastra a su vez los dos perfiles, por la misma razón.
 */
function baseConEsquema(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const lote of MIGRACIONES) {
    for (const sql of lote.sentencias ?? []) db.exec(sql);
  }
  db.prepare('INSERT INTO band_profile (id, nombre, datos, actualizado_el) VALUES (?,?,?,?)')
    .run('banda-1', 'Banda', '{}', ENVIADO);
  db.prepare('INSERT INTO venue_profile (id, nombre, tipo, datos, actualizado_el) VALUES (?,?,?,?,?)')
    .run('sala-1', 'Sala', 'INDOOR', '{}', ENVIADO);
  db.prepare(
    `INSERT INTO sound_session
       (id, state, band_profile_id, venue_profile_id, iniciada_el, cerrada_el, datos)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(SESION, 'SETUP', 'banda-1', 'sala-1', ENVIADO, null, '{}');
  return db;
}

test('la fila se guarda y se lee de la tabla measurement', () => {
  const db = baseConEsquema();
  const m = medicion();
  db.prepare(
    `INSERT INTO measurement
       (id, session_id, timestamp, signal_type, channel_id, posicion,
        pa_component, calibration_state_id, datos)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(m.id, m.sessionId, m.timestamp, m.signalType, null, null, null,
        m.calibrationStateId, JSON.stringify(m));

  const filas = db.prepare(
    'SELECT datos FROM measurement WHERE session_id = ?',
  ).all(SESION) as { datos: string }[];

  assert.equal(filas.length, 1, 'la fila tiene que estar en la tabla');
  const leida = JSON.parse(filas[0].datos) as Measurement;
  assert.equal(leida.id, 'med-1');
  assert.equal(leida.duracionS, 10, 'la duración sobrevive al viaje por JSON');
  assert.equal(leida.timestamp, EMPEZO, 'el huso sobrevive al viaje por JSON');
});

test('con la lista vacía la ruta NO queda con escucha comprobada', () => {
  const historial = historialDeLaSesion([transaccionQueYaMovio()], [], Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'es el comportamiento viejo: sin mediciones, el segundo paso se rechaza',
  );
});

test('con la medición leída de la base, la ruta SÍ queda con escucha comprobada', () => {
  const historial = historialDeLaSesion(
    [transaccionQueYaMovio()], [medicion()], Date.now(),
  );
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), true,
    'es lo que desbloquea el segundo paso de la rampa',
  );
});

test('una medición de otra sesión no sirve, aunque el identificador coincida', () => {
  const ajena = { ...medicion(), sessionId: 'otra-sesion' } as Measurement;
  const historial = historialDeLaSesion([transaccionQueYaMovio()], [ajena], Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'leer de la base no puede aflojar el cruce por sesión',
  );
});
