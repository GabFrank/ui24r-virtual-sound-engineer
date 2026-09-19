import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '@vse/store';
import { analizarVentana, type MuestraVu } from '@vse/assistants';
import { historialDeLaSesion } from '@vse/safety';
import type { EntradaDiario } from '@vse/safety';
import type { Measurement } from '@vse/domain';
import {
  medicionDeLaCaptura, INTERVALO_DE_MUESTREO_MS, DURACION_CAPTURA_S,
} from '../src/app/core/medicion-de-la-captura.ts';
import {
  CONSULTA_DE_MEDICIONES, INSERCION_DE_MEDICION, valoresDeLaMedicion,
} from '../src/app/core/sql-de-mediciones.ts';

/**
 * La escucha de una cuña, de punta a punta: dos medidores, la base y el motor.
 *
 * **Por qué el test es de la cadena y no de las piezas.** El error más caro del
 * 2026-09-18 fue medir funciones sueltas y concluir sobre el sistema, con la
 * suite entera en verde. Acá se recorre todo lo que hay entre los dos medidores y
 * el veredicto, con las piezas de producción: el análisis, el mapeo, el `INSERT`
 * y el `SELECT` reales contra SQLite real con el esquema de la migración, y
 * `historialDeLaSesion` con sus siete condiciones.
 *
 * **Y lo que estos tests protegen que los de la ganancia no pueden.** Para la
 * ganancia alcanza el medidor del canal, porque la ganancia está aguas arriba de
 * él. El envío a una cuña deriva del canal hacia el bus y está antes del fader,
 * así que subirlo **no mueve el medidor del canal ni un escalón**: la mitad de
 * estos casos son escenarios en que el canal se ve perfecto y la cuña no suena,
 * que es justo lo que una escucha copiada de la ganancia dejaría pasar.
 *
 * Decisión del usuario del 2026-09-19 entre tres opciones, ADR-036.
 *
 * **Ocho de los nueve recorren la cadena entera; el noveno no, y hay que decirlo.**
 * El último —«la ganancia sigue escuchando sobre un solo medidor»— es una guarda de
 * regresión sobre el mapeo y no abre la base ni llega al motor. El mensaje del
 * commit `7ab9c59` dijo «los nueve», y era falso: lo cazó una auditoría de
 * fidelidad el mismo día.
 */

const SESION = 'ses-cuna';
/** `i.2.aux.4.value`: el envío del canal 3 al auxiliar 5, en forma canónica. */
const RUTA = 'i.2.aux.4.value';

const ENVIADO_MS = Date.now() - 120_000;
const ENVIADO = new Date(ENVIADO_MS).toISOString();
const EMPEZO = new Date(ENVIADO_MS + 1000).toISOString();

const CUANTAS = Math.round((DURACION_CAPTURA_S * 1000) / INTERVALO_DE_MUESTREO_MS);

/** Una serie de medidor que se mueve, como una fuente real. */
function sonando(segundos = DURACION_CAPTURA_S, desde = 0): MuestraVu[] {
  const hasta = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS) + desde;
  return Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    // Oscila: un medidor plano es un medidor congelado, y eso tiene su propio caso.
    db: i >= desde && i < hasta ? -18 + (i % 9) : -90,
    reduccionDb: 0,
  }));
}

/** Una serie por debajo del piso de ruido: nada que escuchar. */
function callada(): MuestraVu[] {
  return Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -90, reduccionDb: 0,
  }));
}

/**
 * Una serie alta y perfectamente quieta: el medidor congelado de una caída.
 *
 * `MixerService` sólo vacía sus listas cuando el usuario desconecta a propósito,
 * así que una caída deja los últimos niveles ahí. El nivel es alto para que lo
 * único que lo delate sea que no se mueve.
 */
function congelada(): MuestraVu[] {
  return Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -14.6, reduccionDb: 0,
  }));
}

function medicionDe(canal: readonly MuestraVu[], cuna: readonly MuestraVu[]): Measurement {
  return medicionDeLaCaptura({
    id: 'medicion-cuna-3-5', sessionId: SESION, empezoEl: EMPEZO,
    channelId: 'asig-3', analisis: analizarVentana(canal),
    muestras: canal, muestrasDeLaCuna: cuna,
  });
}

/** La transacción de monitor que ya movió la cuña, con la escucha anotada. */
function transaccion(medicionId: string | null): EntradaDiario {
  return {
    id: 'tx-cuna', sessionId: SESION, estado: 'APPLIED', snapshotRef: null,
    creadoEl: ENVIADO, cerradoEl: ENVIADO,
    medicionPosteriorId: medicionId,
    nivelEstablecidoEn: [],
    cambios: [{
      path: RUTA, kind: 'MONITOR_AUX_SEND',
      valorAnterior: 0.30, valorPropuesto: 0.35, magnitudPropuesta: 2,
      verificado: true, enviadoEl: ENVIADO,
    }],
  } as unknown as EntradaDiario;
}

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

/** Guarda y relee con el SQL de producción, igual que el camino de la ganancia. */
function guardarYLeer(db: DatabaseSync, m: Measurement): readonly Measurement[] {
  db.prepare(INSERCION_DE_MEDICION).run(...(valoresDeLaMedicion(m) as never[]));
  const filas = db.prepare(CONSULTA_DE_MEDICIONES).all(SESION) as { datos: string }[];
  const salida: Measurement[] = [];
  for (const f of filas) {
    const leido: unknown = JSON.parse(f.datos);
    if (leido !== null && typeof leido === 'object') salida.push(leido as Measurement);
  }
  return salida;
}

/** ¿El motor deja dar otro paso sobre esta cuña? */
function concedeOtroPaso(m: Measurement): boolean {
  const db = baseConEsquema();
  const leidas = guardarYLeer(db, m);
  const historial = historialDeLaSesion([transaccion(m.id)], leidas, Date.now());
  return historial.rutasConMedicionPosterior.has(RUTA);
}

test('la cadena entera concede el paso: el músico tocó Y la cuña sonó', () => {
  const m = medicionDe(sonando(), sonando());

  assert.equal(m.signalType, 'PERFORMANCE');
  assert.ok(m.duracionS >= 10, `declaró ${m.duracionS.toFixed(1)} s de música`);
  assert.equal(concedeOtroPaso(m), true, 'es lo que desbloquea el segundo paso de la rampa');
});

test('la cuña muda NO concede el paso, aunque el músico haya tocado los 18 segundos', () => {
  // **El caso que decide si esta pieza existió para algo.** Con la escucha copiada
  // de la ganancia —sólo el medidor del canal— esta ventana pasaba: el músico
  // tocó, el canal se movió, y la aplicación habría subido la cuña paso tras paso
  // hasta el techo de nominal sin que nadie oiga nada.
  const m = medicionDe(sonando(), callada());

  assert.equal(m.signalType, 'SILENCE', 'sin cuña que suene no hay escucha que declarar');
  assert.equal(concedeOtroPaso(m), false);
});

test('el músico callado NO concede el paso, aunque la cuña esté sonando por otro', () => {
  // La otra mitad, y es el motivo por el que el usuario eligió los dos medidores
  // y no sólo el de la cuña: en una cuña entran varios instrumentos, así que
  // verla moverse no dice que se haya movido **por este músico**.
  const m = medicionDe(callada(), sonando());

  assert.equal(m.signalType, 'SILENCE');
  assert.equal(concedeOtroPaso(m), false);
});

test('la consola caída NO concede el paso: los dos medidores quedan congelados', () => {
  const m = medicionDe(congelada(), congelada());

  assert.equal(m.signalType, 'SILENCE', 'un medidor que no se movió ni un escalón no es nadie tocando');
  assert.equal(concedeOtroPaso(m), false);
});

test('tocar y que suene en momentos DISTINTOS no suma: se cruzan por instante', () => {
  // **Es lo que separa cruzar las series de contarlas por separado.** El músico
  // toca los primeros nueve segundos y la cuña suena los últimos nueve: contados
  // aparte son nueve y nueve, y el mínimo de los dos daría nueve. Cruzados son
  // **cero**, que es la verdad — en ningún instante pasaron las dos cosas.
  const mitad = Math.round((9 * 1000) / INTERVALO_DE_MUESTREO_MS);
  const m = medicionDe(sonando(9, 0), sonando(9, mitad));

  assert.equal(m.duracionS, 0, `declaró ${m.duracionS.toFixed(2)} s`);
  assert.equal(concedeOtroPaso(m), false);
});

test('tocar poco se guarda con su duración real, y no alcanza para otro paso', () => {
  // El motor pide diez segundos de música para esta clase de parámetro. Tres
  // segundos de los dieciocho son tres, no dieciocho: si se guardara la duración
  // declarada, el freno no se dispararía nunca.
  const m = medicionDe(sonando(3), sonando(3));

  assert.ok(m.duracionS > 2.5 && m.duracionS < 3.5, `declaró ${m.duracionS.toFixed(2)} s`);
  assert.equal(m.signalType, 'PERFORMANCE', 'tocó poco, pero tocó: no es silencio');
  assert.equal(concedeOtroPaso(m), false, 'y aun así no alcanza');
});

test('guardar sin anotar da el mismo veredicto que no guardar', () => {
  // La mitad que faltaba hasta hoy en este camino: la medición está en la base y
  // es buena, y el motor igual niega, porque resuelve el identificador que la
  // transacción declara y no «alguna medición posterior».
  const db = baseConEsquema();
  const leidas = guardarYLeer(db, medicionDe(sonando(), sonando()));

  const historial = historialDeLaSesion([transaccion(null)], leidas, Date.now());
  assert.equal(historial.rutasConMedicionPosterior.has(RUTA), false);
});

test('una cuña que entró bajo pero suena SÍ cuenta, igual que el canal flojo', () => {
  // El piso de ruido y no el umbral de análisis. Una cuña a −54 dB es una cuña
  // sonando bajo —que es exactamente la que hay que levantar—, no una cuña muda.
  // Es la misma distinción que el proyecto separó el 2026-09-09 y que una primera
  // versión de la escucha de ganancia volvió a fundir.
  const bajito = Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -54 + (i % 3) * 0.5, reduccionDb: 0,
  }));
  const m = medicionDe(sonando(), bajito);

  assert.equal(m.signalType, 'PERFORMANCE');
  assert.equal(concedeOtroPaso(m), true);
});

test('la ganancia sigue escuchando sobre un solo medidor, sin cambio de veredicto', () => {
  // **La guarda de que esta pieza no rompió la de al lado.** Sin cuña declarada,
  // el mapeo tiene que comportarse exactamente como antes: es el camino que la
  // pantalla de ganancia usa desde el 2026-09-19 y que ya está auditado.
  const soloCanal = medicionDeLaCaptura({
    id: 'medicion-3-1', sessionId: SESION, empezoEl: EMPEZO,
    channelId: 'asig-3', analisis: analizarVentana(sonando()), muestras: sonando(),
  });

  assert.equal(soloCanal.signalType, 'PERFORMANCE');
  assert.ok(soloCanal.duracionS >= 10);
});
