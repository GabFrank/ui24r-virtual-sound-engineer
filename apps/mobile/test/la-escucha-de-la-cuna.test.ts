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
import { MEDIDOR_RANGO_DB, VU_ESCALA } from '@vse/mixer-adapter';
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
 * **Casi todos recorren la cadena entera, y los que no están dichos en su propio
 * comentario.** «La ganancia sigue escuchando sobre un solo medidor» es una guarda
 * de regresión sobre el mapeo y no abre la base ni llega al motor. El mensaje del
 * commit `7ab9c59` dijo «los nueve», y era falso: lo cazó una auditoría de
 * fidelidad el mismo día. **Acá había un conteo escrito a mano --«ocho de los
 * nueve»-- que se pudrió en cuanto este archivo creció**, que es la trampa que el
 * propio repositorio documenta: un número que nada comprueba no se corrige, se
 * deja de afirmar.
 *
 * **Y una corrección del mensaje de `593da56`, que no se puede editar:** dijo que
 * «siete tests fallan sin el arreglo, comprobado revirtiéndolo». **Son cuatro**,
 * medidos por una auditoría de fidelidad revirtiendo el mapeo y corriendo la suite
 * entera. El siete salió de correr los dos archivos por separado y sumar los
 * rojos, sin descontar que dos eran los tests de **límite** --que pasan igual con
 * el código viejo, porque describen lo que la regla no hace-- y dos, los que
 * cambiaron su dato. **Un número de mutación es justo con lo que este repositorio
 * dice «esto está probado de verdad»**, así que equivocarlo es de la familia
 * cara.
 */

const SESION = 'ses-cuna';
/** `i.2.aux.4.value`: el envío del canal 3 al auxiliar 5, en forma canónica. */
const RUTA = 'i.2.aux.4.value';

const ENVIADO_MS = Date.now() - 120_000;
const ENVIADO = new Date(ENVIADO_MS).toISOString();
const EMPEZO = new Date(ENVIADO_MS + 1000).toISOString();

const CUANTAS = Math.round((DURACION_CAPTURA_S * 1000) / INTERVALO_DE_MUESTREO_MS);

/** Lo más chico que puede cambiar el medidor. Sale del protocolo, no de acá. */
const ESCALON_DEL_MEDIDOR_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

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
  //
  // **El dato de este test cambió el 2026-09-19, y hay que decirlo.** Oscilaba
  // 1 dB, y con la vara de movimiento en 3 dB dejó de pasar. Lo que el test
  // prueba es el **nivel** bajo --por debajo del umbral de análisis y por encima
  // del piso de ruido--, no que la cuña se mueva poco, así que la serie sigue
  // abajo y ahora se mueve como una fuente real. Cambiar un test para que pase es
  // exactamente lo que hay que poder auditar: queda escrito qué se cambió, por
  // qué, y qué sigue probando.
  const bajito = Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -56 + (i % 5), reduccionDb: 0,
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

/**
 * Lo que sigue son los dos escenarios que una auditoría adversarial midió el
 * 2026-09-19 y que **la suite entera en verde no cazaba**, porque el criterio
 * viejo preguntaba presencia y no música.
 */

/** Las dos series planas, con UN solo escalón del medidor en la muestra 7. */
function unSoloEscalon(): MuestraVu[] {
  return Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: i === 7 ? -20 + ESCALON_DEL_MEDIDOR_DB : -20,
    reduccionDb: 0,
  }));
}

/**
 * El músico toca dos segundos y el resto es ambiente de escenario.
 *
 * El ambiente **no es plano** a propósito: si lo fuera, lo rechazaría la pregunta
 * del movimiento y este test no probaría lo que dice probar. Oscila más de un
 * escalón, así que lo único que lo saca es estar lejos del pico de la ventana.
 */
function dosSegundosYAmbiente(): MuestraVu[] {
  const tocando = Math.round((2 * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: i < tocando ? -18 + (i % 9) : -58 + (i % 5),
    reduccionDb: 0,
  }));
}

test('un solo escalón en toda la ventana NO es nadie tocando', () => {
  // **Medido antes de arreglarlo: declaraba 18,00 s y el motor daba el paso.** El
  // criterio viejo era `max > min` sobre la ventana entera, así que un único
  // escalón en cualquiera de los 360 instantes la satisfacía, y a partir de ahí
  // todo instante sobre el piso de ruido contaba como escucha.
  const m = medicionDe(unSoloEscalon(), unSoloEscalon());

  assert.equal(m.signalType, 'SILENCE');
  assert.equal(m.duracionS, 0, `declaró ${m.duracionS.toFixed(2)} s`);
  assert.equal(concedeOtroPaso(m), false);
});

test('dos segundos de música con ambiente alrededor son dos, no dieciocho', () => {
  // **El caso que se cumple solo en un escenario real**, con un micrófono abierto
  // entre frase y frase. Medido antes de arreglarlo: 18,00 s y paso concedido.
  const m = medicionDe(dosSegundosYAmbiente(), dosSegundosYAmbiente());

  assert.equal(m.signalType, 'PERFORMANCE', 'tocó: poco, pero tocó');
  assert.ok(m.duracionS > 1 && m.duracionS < 3, `declaró ${m.duracionS.toFixed(2)} s`);
  assert.equal(concedeOtroPaso(m), false, 'y dos segundos no compran el paso');
});

test('una sala QUIETA, sin nadie tocando, no declara nada', () => {
  // Con nadie tocando el pico de la ventana **es** el ambiente, así que la vara
  // relativa no filtra nada: lo único que decide es el movimiento. Una sala
  // quieta --2 dB de recorrido-- no llega a los 3 dB que se piden.
  //
  // **El mensaje de esta aserción decía «se mueve menos de un escalón», y era
  // falso**: 2 dB son seis escalones del medidor. Lo que la rechaza es la vara
  // elegida de 3 dB, no la resolución del instrumento --que es justamente el
  // argumento que se retiró al elegir la vara--. Lo cazó una auditoría de
  // fidelidad el 2026-09-19.
  const ambiente = (): MuestraVu[] => Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -58 + (i % 5) * 0.5, reduccionDb: 0,
  }));
  const m = medicionDe(ambiente(), ambiente());

  assert.equal(
    m.duracionS, 0,
    `una sala que recorre 2 dB no llega a la vara de 3; declaró ${m.duracionS.toFixed(2)} s`,
  );
});

test('AGUJERO ABIERTO: una sala VIVA, sin nadie tocando, concede el paso', () => {
  // **Esto NO es una garantía: es el defecto, escrito para que se vea.** Una
  // auditoría adversarial lo midió el 2026-09-19 sobre la cadena completa, con
  // ambientes correlacionados como se mueve un medidor de sala de verdad: una sala
  // viva declara entre 11 y 16 segundos de música y **el motor concede el paso de
  // 2 dB, sin que nadie haya tocado una nota**.
  //
  // **El test hermano de arriba no lo veía porque su ambiente es más manso que la
  // realidad** --2 dB, justo por debajo del corte--. Ése es el género de agujero
  // que este repositorio ya pagó, y estaba cometido dentro de la defensa contra
  // él. Por eso el caso de verdad vive acá, en rojo conceptual y en verde
  // mecánico: **el día que esto pase a `false`, el agujero se cerró.**
  //
  // Lo que sigue es comparar contra una ventana de referencia del mismo canal con
  // el músico callado. Decisión del usuario del 2026-09-19.
  const salaViva = (desfase: number): MuestraVu[] => Array.from(
    { length: CUANTAS },
    (_, i) => ({
      tMs: i * INTERVALO_DE_MUESTREO_MS,
      db: -45 + ((i + desfase) % 5),
      reduccionDb: 0,
    }),
  );
  const m = medicionDe(salaViva(0), salaViva(2));

  assert.equal(m.signalType, 'PERFORMANCE', 'nadie tocó, y la aplicación dice que sí');
  assert.ok(m.duracionS >= 10, `declaró ${m.duracionS.toFixed(2)} s de música que no hubo`);
  assert.equal(
    concedeOtroPaso(m), true,
    'AGUJERO ABIERTO: cuando esto pase a false, borrar el test y cerrar el hallazgo 1',
  );
});

test('LÍMITE ESCRITO: una fuente perfectamente quieta no cuenta, aunque suene', () => {
  // **No es un defecto encontrado: es el precio de la decisión, y va escrito para
  // que el que lo encuentre sepa que estaba previsto.** Pedir que el medidor se
  // mueva deja afuera una fuente que entregue un nivel absolutamente constante
  // --un tono sostenido, un generador--. Un instrumento real no lo hace, y la
  // aplicación no reproduce audio todavía; el día que reproduzca tonos para medir,
  // esta regla hay que volver a mirarla.
  const quieta = (): MuestraVu[] => Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -12, reduccionDb: 0,
  }));
  const m = medicionDe(quieta(), quieta());

  assert.equal(m.signalType, 'SILENCE', 'previsto, no descubierto');
});

test('LÍMITE ESCRITO: la cuña movida por OTRA fuente sigue concediendo', () => {
  // **Este agujero NO lo cierra esta tarea, y decirlo importa más que taparlo.**
  // El medidor del auxiliar es la suma del bus: que el músico toque y que su cuña
  // se mueva **a la vez** no dice que se haya movido por él. En una cuña con una
  // voz adentro, las dos cosas pasan a la vez siempre. Es la misma familia que
  // ADR-035 --«el tope es por clave y el oído es por parlante»-- y está anotado en
  // el hallazgo 1 de la tanda de la cuña.
  //
  // **Las dos series son DISTINTAS a propósito**, y una auditoría lo marcó: usar
  // la misma para las dos era el dato menos discriminante posible. Acá el canal y
  // la cuña se mueven con ritmos que no tienen nada que ver, que es justamente el
  // caso «la cuña la mueve otro», y el motor concede igual.
  const canal = Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -30 + (i % 7) * 2, reduccionDb: 0,
  }));
  const otraFuente = Array.from({ length: CUANTAS }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS, db: -20 + (i % 11), reduccionDb: 0,
  }));
  const m = medicionDe(canal, otraFuente);

  assert.equal(
    concedeOtroPaso(m), true,
    'la cuña pudo haberla movido otro músico y esto no lo distingue',
  );
});
