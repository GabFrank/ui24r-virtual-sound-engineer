import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MIGRACIONES } from '@vse/store';
import { analizarVentana, type MuestraVu } from '@vse/assistants';
import { historialDeLaSesion } from '@vse/safety';
import { MEDIDOR_RANGO_DB, VU_ESCALA } from '@vse/mixer-adapter';
import type { EntradaDiario, Veredicto } from '@vse/safety';
import { medicionEsConfiable, type Measurement, type CalibrationState } from '@vse/domain';
import {
  medicionDeLaCaptura, INTERVALO_DE_MUESTREO_MS, SIN_CALIBRACION,
} from '../src/app/core/medicion-de-la-captura.ts';
import {
  CONSULTA_DE_MEDICIONES, INSERCION_DE_MEDICION, valoresDeLaMedicion,
} from '../src/app/core/sql-de-mediciones.ts';

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
 *  5. `historialDeLaSesion`, con sus siete condiciones de escucha.
 *  6. `SafetyEngine.evaluar`, que es **el motor** y es quien dice que sí o que no.
 *     Hasta el 2026-09-19 la cadena terminaba en el punto 5 y este docblock le
 *     decía «el motor» igual, que es un nombre que el resto del repositorio usa
 *     para otra cosa.
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

/** La misma ventana, con el canal en silencio de verdad: nada por encima del piso. */
function ventanaEnSilencio(segundos = 18): MuestraVu[] {
  const cuantas = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: -90,
    reduccionDb: 0,
  }));
}

/**
 * La consola se cayó sola y el medidor quedó congelado en su último valor.
 *
 * **Es el caso que una auditoría adversarial midió el 2026-09-19**, y no es
 * hipotético: `MixerService` sólo vacía la lista de canales cuando el usuario
 * desconecta a propósito, así que una caída deja los últimos niveles ahí y la
 * captura los muestrea dieciocho segundos. El nivel es alto —bien por encima de
 * todos los umbrales— para que lo único que lo delate sea que **no se mueve**.
 */
function ventanaConMedidorCongelado(segundos = 18): MuestraVu[] {
  const cuantas = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: -14.6,
    reduccionDb: 0,
  }));
}

/**
 * El músico toca, pero el canal entró muy bajo: por encima del piso de ruido y
 * por debajo del umbral con que se analiza para recomendar.
 *
 * **Es el caso principal del asistente de ganancia** —el canal que hay que
 * levantar— y hasta el 2026-09-19 se guardaba como silencio, así que ese canal
 * justamente no podía subir en dos pasos.
 */
function ventanaQueEntroMuyBajo(segundos = 18): MuestraVu[] {
  const cuantas = Math.round((segundos * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    // **Este dato cambió el 2026-09-19, y hay que decirlo.** Oscilaba 1 dB, y con
    // la vara de movimiento en 3 dB dejó de pasar. Lo que este test prueba es el
    // **nivel** --debajo del umbral de análisis, encima del piso de ruido--, no
    // que el canal se mueva poco: la serie sigue abajo y ahora se mueve como una
    // fuente real. Cambiar un test para que pase es lo que hay que poder auditar.
    db: -56 + (i % 5),
    reduccionDb: 0,
  }));
}

/** El músico toca sólo los primeros `segundosTocando` de una ventana de 18. */
function ventanaConMusicaParcial(segundosTocando: number): MuestraVu[] {
  const cuantas = Math.round((18 * 1000) / INTERVALO_DE_MUESTREO_MS);
  const tocando = Math.round((segundosTocando * 1000) / INTERVALO_DE_MUESTREO_MS);
  return Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: i < tocando ? -18 + (i % 9) : -90,
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
 *
 * **Y la última de las tres no era cierta hasta el 2026-09-19.** El orden era una
 * copia a mano acá: una auditoría permutó `channelId` con `posicion` en el
 * servicio y la suite quedó entera en verde. Ahora sale de
 * `valoresDeLaMedicion`, que es la que usa producción, así que permutar dos
 * columnas rompe algo.
 */
function guardarYLeer(db: DatabaseSync, m: Measurement): readonly Measurement[] {
  db.prepare(INSERCION_DE_MEDICION).run(...(valoresDeLaMedicion(m) as never[]));
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
  // que se escucharon dieciocho y el freno del motor no se dispararía nunca.
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

test('el medidor congelado NO cuenta como escucha, aunque el nivel sea alto', () => {
  // **Medido el 2026-09-19 con la cadena entera, antes del arreglo**: una ventana
  // con la consola caída y el último nivel en −14,6 dB se guardaba como
  // `PERFORMANCE` de 17,95 segundos y **el motor autorizaba el paso siguiente**,
  // con cero segundos de música. El nivel pasa todos los umbrales; lo único que
  // delata al medidor muerto es que no se movió ni un escalón en dieciocho
  // segundos.
  const db = baseConEsquema();
  const m = medicionDe(ventanaConMedidorCongelado());

  assert.equal(
    m.signalType, 'SILENCE',
    'un medidor que no se movió en 18 s no es un músico tocando',
  );

  const leidas = guardarYLeer(db, m);
  const historial = historialDeLaSesion([transaccionConEscucha(m.id)], leidas, Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), false,
    'la consola caída no puede comprar el paso siguiente',
  );
});

test('el canal que entró MUY BAJO sí cuenta: es un músico tocando bajo', () => {
  // **Es la otra dirección del mismo defecto, y la que rompía el producto.** El
  // criterio viejo llamaba silencio a todo lo que no llegara a −50, así que el
  // canal que el asistente existe para levantar era justamente el que no podía
  // subir en dos pasos. «No entró nada» y «entró muy bajo» son dos cosas
  // distintas: el proyecto las separó el 2026-09-09 y el mapeo las había vuelto a
  // fundir.
  const db = baseConEsquema();
  const m = medicionDe(ventanaQueEntroMuyBajo());

  assert.equal(m.signalType, 'PERFORMANCE', 'entró bajo, pero entró y se movió');
  assert.equal(
    m.consoleTelemetry, null,
    'y no hay métricas que afirmar sobre él: «sin métricas» no es «no sonó nadie»',
  );

  const leidas = guardarYLeer(db, m);
  const historial = historialDeLaSesion([transaccionConEscucha(m.id)], leidas, Date.now());
  assert.equal(
    historial.rutasConMedicionPosterior.has(RUTA), true,
    'el canal bajo tiene que poder subir en más de un paso',
  );
});

test('la escucha que se declara es la MÚSICA, no el reloj de la ventana', () => {
  // **Decisión del usuario del 2026-09-19**, entre tres opciones. Medido antes de
  // cambiarlo: un músico que tocaba tres de los dieciocho segundos declaraba
  // **17,95 segundos** de escucha, indistinguible de uno que tocó los dieciocho.
  // Con eso lo que el motor comprobaba era «pasaron dieciocho segundos de reloj y
  // en algún momento hubo señal», no los diez segundos de escucha que el propio
  // usuario había elegido el 2026-09-18.
  const tres = medicionDe(ventanaConMusicaParcial(3));
  const diez = medicionDe(ventanaConMusicaParcial(10));

  assert.equal(tres.duracionS, 3, 'tres segundos de música son tres segundos');
  assert.equal(diez.duracionS, 10, 'y diez son diez');
  assert.equal(tres.signalType, 'PERFORMANCE', 'en los dos casos el músico tocó');
  assert.equal(diez.signalType, 'PERFORMANCE');

  assert.equal(
    historialDeLaSesion(
      [transaccionConEscucha(tres.id)], guardarYLeer(baseConEsquema(), tres), Date.now(),
    ).rutasConMedicionPosterior.has(RUTA),
    false,
    'tres segundos de música no compran el paso siguiente',
  );
  assert.equal(
    historialDeLaSesion(
      [transaccionConEscucha(diez.id)], guardarYLeer(baseConEsquema(), diez), Date.now(),
    ).rutasConMedicionPosterior.has(RUTA),
    true,
    'diez sí, que es lo que esta clase de parámetro pide',
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
  // De un medidor no salen decisiones de ecualización de sala.
  //
  // **La comprobación es contra `medicionEsConfiable` y no contra la constante**,
  // y la primera versión era contra la constante: `assert.equal(m.calibrationStateId,
  // SIN_CALIBRACION)` pasa igual si el centinela se cambia por `'cal-001'`, o sea
  // que probaba el campo y no la garantía. Lo midió una auditoría el 2026-09-19
  // cambiándole la forma al centinela con la suite en verde.
  const m = medicionDe(ventanaTocando());
  const calibracionVigente = {
    id: 'cal-001', scarlettGainRefDbfs: -18, analysisBusTrimDb: 0, in1In2OffsetDb: null,
    splOffsetDb: null, loopbackId: null, validoHasta: null, estado: 'VALID',
  } as unknown as CalibrationState;

  assert.equal(
    medicionEsConfiable(m, calibracionVigente), false,
    'con una calibración VÁLIDA vigente, esta medición sigue sin ser confiable',
  );
  assert.equal(m.micProfileId, null, 'no hubo micrófono');
  assert.equal(m.archivoAudio, null, 'no hubo audio');
  assert.equal(m.acousticRef, null, 'no hay métricas de sala');
  assert.equal(m.directRef, null, 'no hay referencia eléctrica directa');
  assert.equal(
    m.referenceMode, null,
    'los cuatro valores nombran un ENVÍO de la consola, y esto es el medidor propio',
  );
});

test('la cadena llega hasta el motor: permitido con escucha, rechazado sin ella', async () => {
  // **La suite medía hasta `historialDeLaSesion` y le decía «el motor».** No es
  // lo mismo: lo que el CHANGELOG le promete al usuario —«podés volver a aplicar
  // otro paso»— lo decide `SafetyEngine.evaluar`, y ningún test lo comprobaba.
  // Lo marcó una auditoría de fidelidad el 2026-09-19, que además lo midió a mano.
  // Acá queda medido en cada corrida.
  const { SafetyEngine } = await import('@vse/safety');

  const contexto = (medicionId: string | null, leidas: readonly Measurement[]) => ({
    sessionState: 'CHANNEL_SETUP',
    nivelAutonomia: 'ASSISTED',
    ...historialDeLaSesion([transaccionConEscucha(medicionId)], leidas, Date.now()),
    techoPorRuta: new Map(),
    hayTakeDeSoundcheckActivo: false,
    busesDeSalidaPermitidos: new Set(),
    confianza: 'HIGH',
    aprobacionExplicita: true,
  });

  /** El segundo paso: otros 3 dB sobre la misma perilla que ya se movió. */
  const segundoPaso = [{
    kind: 'PREAMP_GAIN', path: RUTA, unidad: 'dB',
    valorPropuesto: 0.4, valorEsperado: 0.35,
    magnitudPropuesta: 6, magnitudEsperada: 3,
  }];

  const db = baseConEsquema();
  const m = medicionDe(ventanaTocando());
  const leidas = guardarYLeer(db, m);

  /** Las mismas opciones con que `AplicarGananciaService` llama al motor. */
  const opciones = {
    conexionPermiteEscribir: true, snapshotVerificado: true,
    tipoDeOperacion: 'PREAMP_GAIN',
  };

  // `Veredicto` es una unión discriminada: `rechazos` sólo existe en la rama que
  // no permite, así que los códigos se leen con un estrechamiento y no con `any`.
  const codigos = (v: Veredicto): readonly string[] =>
    v.permitido ? [] : v.rechazos.map((r) => r.codigo);

  const con = new SafetyEngine()
    .evaluar(segundoPaso as never, contexto(m.id, leidas) as never, opciones);
  assert.equal(
    con.permitido, true,
    `con la escucha anotada el motor permite: ${codigos(con).join(', ')}`,
  );

  const sin = new SafetyEngine()
    .evaluar(segundoPaso as never, contexto(null, leidas) as never, opciones);
  assert.equal(sin.permitido, false, 'sin anotarla, no');
  assert.ok(
    codigos(sin).includes('SIN_MEDICION_INTERMEDIA'),
    `y el motivo es la medición intermedia: ${codigos(sin).join(', ')}`,
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

test('el defecto heredado se cerró también por el camino de la ganancia', () => {
  // **La auditoría comprobó que los dos agujeros eran heredados de acá**: la
  // misma ventana por este camino, sin cuña, daba `PERFORMANCE` y 18,00 s. Arreglar
  // el mapeo los arregla en las dos herramientas, y este test es el que lo sostiene:
  // si alguien hace la regla nueva exclusiva de la cuña, esto se pone en rojo.
  const cuantas = Math.round((18 * 1000) / INTERVALO_DE_MUESTREO_MS);

  // Un solo escalón del medidor en toda la ventana.
  const unEscalon = Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: i === 7 ? -20 + MEDIDOR_RANGO_DB * VU_ESCALA : -20,
    reduccionDb: 0,
  }));
  const m1 = medicionDe(unEscalon);
  assert.equal(m1.signalType, 'SILENCE', 'un escalón en 360 instantes no es un músico');
  assert.equal(m1.duracionS, 0);

  // Dos segundos de música y el resto ambiente de escenario.
  const tocando = Math.round((2 * 1000) / INTERVALO_DE_MUESTREO_MS);
  const conAmbiente = Array.from({ length: cuantas }, (_, i) => ({
    tMs: i * INTERVALO_DE_MUESTREO_MS,
    db: i < tocando ? -18 + (i % 9) : -58 + (i % 5),
    reduccionDb: 0,
  }));
  const m2 = medicionDe(conAmbiente);
  assert.equal(m2.signalType, 'PERFORMANCE');
  assert.ok(m2.duracionS > 1 && m2.duracionS < 3, `declaró ${m2.duracionS.toFixed(2)} s`);
  assert.equal(
    historialDeLaSesion(
      [transaccionConEscucha(m2.id)], guardarYLeer(baseConEsquema(), m2), Date.now(),
    ).rutasConMedicionPosterior.has(RUTA),
    false,
    'dos segundos con ambiente alrededor no compran el ajuste siguiente',
  );
});
