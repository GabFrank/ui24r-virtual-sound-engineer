import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '@vse/store';
import { analizarVentana, type MuestraVu } from '@vse/assistants';
import { historialDeLaSesion } from '@vse/safety';
import type { EntradaDiario } from '@vse/safety';
import type { Measurement } from '@vse/domain';
import {
  medicionDeLaCaptura, INTERVALO_DE_MUESTREO_MS, SIN_CALIBRACION,
} from '../src/app/core/medicion-de-la-captura.ts';
import { CONSULTA_DE_MEDICIONES, INSERCION_DE_MEDICION } from '../src/app/core/sql-de-mediciones.ts';

/**
 * La cadena entera: se escucha, se guarda, se anota, y el motor deja dar el paso
 * siguiente.
 *
 * **Por qué el test es de la cadena y no de las piezas.** El error más caro de
 * esta jornada fue medir funciones sueltas y concluir sobre el sistema, con la
 * suite entera en verde: la cadena se rompía en un eslabón que ninguna de las dos
 * funciones medidas tocaba. Acá se recorre todo lo que hay entre el medidor y el
 * veredicto, y con las piezas de producción:
 *
 *  1. `analizarVentana`, la misma que usa la pantalla.
 *  2. `medicionDeLaCaptura`, el mapeo de la ventana a medición.
 *  3. `INSERCION_DE_MEDICION`, el `INSERT` real, contra SQLite real y el esquema
 *     real de la migración.
 *  4. `CONSULTA_DE_MEDICIONES`, el `SELECT` real.
 *  5. `historialDeLaSesion`, el motor, con sus siete condiciones de escucha.
 *
 * Lo único que no está es el inyector de Angular, que este repositorio no monta
 * en ningún test: el cuerpo de los dos servicios es una llamada a estas constantes
 * y por eso hay además una guarda —`validate-escucha-anotada.mjs`— que mira que
 * producción siga llamándolas.
 *
 * **El test que importa es el negativo**, y de ahí que estén los dos: uno solo
 * afirmando «se puede dar el paso siguiente» no distingue el arreglo de un motor
 * que concede siempre.
 */

const SESION = 'ses-1';
/** La ganancia del previo del canal 3: `clasificarRuta` la da como `PREAMP_GAIN`. */
const RUTA = 'hw.3.gain';
/** La escucha mínima de esta clase de parámetro son diez segundos. */
const MINIMO_S = 10;

/** Dos minutos atrás: la escritura, y con eso la ventana, ya terminaron. */
const ENVIADO_MS = Date.now() - 120_000;
const ENVIADO = new Date(ENVIADO_MS).toISOString();
/** La captura empieza un segundo después de que la escritura llegó al cable. */
const EMPEZO_MS = ENVIADO_MS + 1000;
const EMPEZO = new Date(EMPEZO_MS).toISOString();

/**
 * Una ventana de medidor con el músico tocando.
 *
 * Los números son de la escala de la consola —0 es fondo de escala— y están por
 * encima del umbral de silencio de `analizarVentana`, que es −50. Son las
 * `muestras` que `MUESTRAS_MINIMAS` pide y algo más, repartidas cada
 * `INTERVALO_DE_MUESTREO_MS`, para que la ventana dure de verdad lo que dice.
 */
function ventanaTocando(segundos = 18): MuestraVu[] {
  const cuantas = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    // Oscila entre −18 y −10: una fuente real no da un número plano, y un pico
    // distinto del promedio es lo que hace que el factor de cresta signifique algo.
    db: -18 + (i % 9),
    reduccionDb: 0,
  }));
}

/** La misma ventana, con el canal en silencio: el medidor no se movió. */
function ventanaEnSilencio(segundos = 18): MuestraVu[] {
  const cuantas = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: -90,
    reduccionDb: 0,
  }));
}

function medicionDe(muestras: readonly MuestraVu[], empezoEl = EMPEZO): Measurement {
  return medicionDeLaCaptura({
    id: 'medicion-3-1', sessionId: SESION, empezoEl,
    channelId: 'asig-3', analisis: analizarVentana(muestras), muestras,
  });
}

/**
 * La transacción que ya movió la ganancia de ese canal, con la escucha anotada.
 *
 * Es la forma que deja el ejecutor: el cambio verificado y con su `enviadoEl`, y
 * `medicionPosteriorId` puesto después por `AplicarGananciaService.anotarEscucha`.
 */
function transaccionConEscucha(medicionId: string | null): EntradaDiario {
  return {
    id: 'tx-1', sessionId: SESION, estado: 'APPLIED', snapshotRef: null,
    creadoEl: ENVIADO, cerradoEl: ENVIADO,
    medicionPosteriorId: medicionId,
    nivelEstablecidoEn: [],
    cambios: [{
      path: RUTA, kind: 'PREAMP_GAIN',
      valorAnterior: 0.3, valorPropuesto: 0.35, magnitudPropuesta: 3,
      verificado: true, enviadoEl: ENVIADO,
    }],
  } as unknown as EntradaDiario;
}

/** El esquema real, con la sesión a la que la medición apunta y sus dos perfiles. */
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

/**
 * Guarda y vuelve a leer, con el SQL de producción.
 *
 * **El cuerpo de `MedicionesService` se replica acá porque la clase lleva un
 * decorador de Angular** y el modo de eliminación de tipos de Node no lo parsea.
 * Lo que sí sale de producción es el `INSERT`, el `SELECT` y el orden de los
 * parámetros, que es donde vive el error que un test tiene que poder cazar.
 */
function guardarYLeer(db: DatabaseSync, m: Measurement): readonly Measurement[] {
  db.prepare(INSERCION_DE_MEDICION).run(
    m.id, m.sessionId, m.timestamp, m.signalType, m.channelId, m.posicion,
    m.paComponent, m.calibrationStateId, JSON.stringify(m),
  );
  const filas = db.prepare(CONSULTA_DE_MEDICIONES).all(SESION) as { datos: string }[];
  const salida: Measurement[] = [];
  for (const f of filas) {
    try {
      const leido: unknown = JSON.parse(f.datos);
      if (leido !== null && typeof leido === 'object') salida.push(leido as Measurement);
    } catch { /* una fila ilegible se descarta: tiene su propio test */ }
  }
  return salida;
}

test('la cadena entera concede el paso siguiente: se escuchó, se guardó, se anotó', () => {
  const db = baseConEsquema();
  const m = medicionDe(ventanaTocando());
  const leidas = guardarYLeer(db, m);

  assert.equal(leidas.length, 1, 'la medición sobrevive el viaje por la base');

  const historial = historialDeLaSesion(
    [transaccionConEscucha(m.id)], leidas, Date.now(),
  );
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), true,
    'es lo que desbloquea el segundo ajuste sobre el mismo canal',
  );
});

test('sin anotar la escucha, la misma medición guardada NO alcanza', () => {
  // **El comportamiento de hasta el 2026-09-19, y la mitad que faltaba.** La
  // medición está en la base y es buena; lo que falta es que la transacción diga
  // cuál fue. El motor no busca «alguna medición posterior»: resuelve el
  // identificador que la transacción declara.
  const db = baseConEsquema();
  const leidas = guardarYLeer(db, medicionDe(ventanaTocando()));

  const historial = historialDeLaSesion([transaccionConEscucha(null)], leidas, Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'guardar sin anotar da el mismo veredicto que no guardar',
  );
});

test('una ventana en silencio se guarda, y NO cuenta como escucha', () => {
  // Es la condición que esta pieza decide y podría mentir: si nadie tocó, nadie
  // oyó la cuña, y el motor lo comprueba por lista blanca de señales.
  const db = baseConEsquema();
  const m = medicionDe(ventanaEnSilencio());

  assert.equal(m.signalType, 'SILENCE', 'un medidor que no se movió es silencio');

  const leidas = guardarYLeer(db, m);
  const historial = historialDeLaSesion([transaccionConEscucha(m.id)], leidas, Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'una ventana sin señal no autoriza el paso siguiente',
  );
});

test('una ventana corta se guarda con su duración real, y NO alcanza', () => {
  // **La duración es la MEDIDA y no los dieciocho que la ventana declara.** Si se
  // guardara el valor declarado, una captura cortada a los tres segundos diría
  // que se escucharon dieciocho y el freno del motor no se disparía nunca.
  const db = baseConEsquema();
  const m = medicionDe(ventanaTocando(3));

  assert.equal(m.signalType, 'PERFORMANCE', 'hubo señal: lo que falta es tiempo');
  assert.ok(m.duracionS < MINIMO_S, `la duración guardada es la real: ${m.duracionS}`);

  const leidas = guardarYLeer(db, m);
  const historial = historialDeLaSesion([transaccionConEscucha(m.id)], leidas, Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'tres segundos no son los diez que esta clase de parámetro pide',
  );
});

test('la fecha es el PRINCIPIO de la ventana, y con el final no se concedería nunca', () => {
  // **Es el error que estaba a un paso de cometerse**: `ResultadoCaptura.capturadaEl`
  // ya existía, se toma al terminar la captura, y era lo más cómodo de reusar. El
  // motor hace `timestamp + duracionS` para saber si la escucha terminó: con la
  // fecha del final, esa suma cae una ventana entera más adelante.
  //
  // Se mide con la ventana recién terminada, que es el caso real de la pantalla:
  // aplica, mide dieciocho segundos, y anota.
  const db = baseConEsquema();
  const muestras = ventanaTocando();
  const ahora = Date.now();
  const empiezaAhora = new Date(ahora - 18_000).toISOString();
  const terminaAhora = new Date(ahora).toISOString();

  const conElPrincipio = medicionDeLaCaptura({
    id: 'med-principio', sessionId: SESION, empezoEl: empiezaAhora,
    channelId: 'asig-3', analisis: analizarVentana(muestras), muestras,
  });
  assert.equal(
    historialDeLaSesion([transaccionConEscucha('med-principio')],
      guardarYLeer(db, conElPrincipio), ahora)
      .rutasConMedicionPosterior.has(RUTA),
    true,
    'con el principio de la ventana, la escucha ya terminó y se concede',
  );

  const otra = baseConEsquema();
  const conElFinal = medicionDeLaCaptura({
    id: 'med-final', sessionId: SESION, empezoEl: terminaAhora,
    channelId: 'asig-3', analisis: analizarVentana(muestras), muestras,
  });
  assert.equal(
    historialDeLaSesion([transaccionConEscucha('med-final')],
      guardarYLeer(otra, conElFinal), ahora)
      .rutasConMedicionPosterior.has(RUTA),
    false,
    'con el final, la ventana declarada termina en el futuro y no se concede nunca',
  );
});

test('la medición guardada no se puede confundir con evidencia acústica', () => {
  // De un medidor no salen decisiones de ecualización de sala. Lo que lo impide
  // es que la calibración sea el centinela: `medicionEsConfiable` exige que
  // coincida con una calibración VÁLIDA, y ésta no coincide con ninguna.
  const m = medicionDe(ventanaTocando());
  assert.equal(m.calibrationStateId, SIN_CALIBRACION);
  assert.equal(m.micProfileId, null, 'no hubo micrófono');
  assert.equal(m.archivoAudio, null, 'no hubo audio');
  assert.equal(m.acousticRef, null, 'no hay métricas de sala');
  assert.equal(m.directRef, null, 'no hay referencia eléctrica directa');
  assert.equal(
    m.referenceMode, null,
    'dónde cae el medidor respecto del fader no se midió: declararlo sería inventarlo',
  );
});

test('ningún número de la medición vuelve de la base como nulo', () => {
  // **`JSON.stringify(-Infinity)` es `"null"`**, así que un pico infinito guardado
  // como JSON vuelve nulo en un campo declarado `number`: el registro le mentiría
  // al tipo. Por eso una ventana sin señal guarda las métricas en nulo enteras, en
  // vez de un objeto con infinitos.
  const db = baseConEsquema();
  const silencio = medicionDe(ventanaEnSilencio());
  assert.equal(silencio.consoleTelemetry, null, 'de un silencio no hay métricas que dar');

  const leidas = guardarYLeer(db, silencio);
  assert.equal(leidas[0]!.duracionS, silencio.duracionS, 'la duración sobrevive');
  assert.ok(Number.isFinite(leidas[0]!.duracionS), 'y sigue siendo un número');

  const otra = baseConEsquema();
  const tocando = medicionDe(ventanaTocando());
  const t = guardarYLeer(otra, tocando)[0]!.consoleTelemetry;
  assert.notEqual(t, null, 'con señal sí hay métricas');
  for (const [campo, valor] of Object.entries(t as object)) {
    if (valor === null) continue;
    assert.ok(
      Number.isFinite(valor as number),
      `${campo} volvió como ${String(valor)}: un infinito no sobrevive a JSON`,
    );
  }
});

test('la cadencia del medidor es la que declara la medición', () => {
  // Con el valor escrito en dos sitios, cambiar el temporizador dejaría todas las
  // mediciones declarando una cadencia que ya no es la suya.
  const m = medicionDe(ventanaTocando());
  assert.equal(m.sampleRate, 1000 / INTERVALO_DE_MUESTREO_MS);
});
