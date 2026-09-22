import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historialDeLaSesion } from '../src/historial-de-la-sesion.ts';
import type { CambioRegistrado, EntradaDiario } from '../src/journal.ts';
import type { Measurement } from '@vse/domain';

/**
 * Una medicion que cuenta como escucha: de esta sesion, posterior a la
 * escritura, con senal y de diez segundos.
 *
 * **Se construye entera y no a medias a proposito.** Las cinco condiciones de
 * `escuchaComprobada` se prueban una por una apartandose de ESTA, asi que si el
 * molde ya estuviera mal la suite probaria otra cosa.
 */
function medicion(p: Omit<Partial<Measurement>, 'id'> & { id: string }): Measurement {
  // Los identificadores del dominio son tipos marcados; en la suite son cadenas.
  const { id, ...resto } = p;
  return {
    sessionId: 's1',
    // Despues del `enviadoEl` por omision de `cambio`, que es a las 10:00:00.
    timestamp: '2026-09-17T10:00:30.000Z',
    signalType: 'PERFORMANCE',
    // Diez, que es lo que `LIMITES.MONITOR_AUX_SEND.escuchaMinimaS` pide.
    duracionS: 10,
    referenceMode: null, paComponent: null, channelId: null, posicion: null,
    sceneId: null, buildState: null, micProfileId: null,
    calibrationStateId: 'cal-1', snapshotRef: null,
    sampleRate: 48000,
    directRef: null, acousticRef: null, consoleTelemetry: null, archivoAudio: null,
    ...resto,
    id,
  } as unknown as Measurement;
}

/**
 * El instante en que los tests juzgan.
 *
 * La medicion por omision empieza a las 10:00:30 y dura diez segundos, asi que
 * su ventana termina a las 10:00:40. El reloj va despues: si no, ninguna escucha
 * contaria, porque desde el 2026-09-18 la ventana tiene que haber TERMINADO.
 */
const AHORA = Date.parse('2026-09-17T10:05:00.000Z');

/** Las dos que los tests de abajo citan por nombre. */
const MEDICIONES: readonly Measurement[] = [medicion({ id: 'm-1' }), medicion({ id: 'm-2' })];

function cambio(p: Partial<CambioRegistrado> & { path: string }): CambioRegistrado {
  return {
    unidad: 'dB',
    valorPrevio: 0.5, valorEsperado: 0.5, valorEnviado: 0.6,
    magnitudEsperada: -12, magnitudEnviada: -10,
    enviadoEl: '2026-09-17T10:00:00.000Z',
    confirmadoPor: 'WITNESS', verificado: true,
    ...p,
  };
}

function entrada(
  cambios: readonly CambioRegistrado[],
  medicionPosteriorId: string | null = null,
  nivelEstablecidoEn: readonly string[] = [],
): EntradaDiario {
  return {
    id: 't1', sessionId: 's1', estado: 'APLICADA', snapshotRef: null,
    razon: 'prueba', nivelAutonomia: 'ASSISTED',
    creadoEl: '2026-09-17T10:00:00.000Z', cerradoEl: null,
    medicionPosteriorId, nivelEstablecidoEn, cambios,
  };
}

const RUTA = 'i.9.aux.4.value';

test('suma el desplazamiento de cada ruta en su unidad, no en crudo', () => {
  // Dos pasos de 2 dB de una rampa. En crudo estos dos pasos son 0,1 cada uno;
  // si el historial sumara crudo daria 0,2 y el motor lo comparara contra un
  // tope en decibeles, que es el error que este modulo existe para no repetir.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4);
  assert.ok(h.rutasYaTocadas.has(RUTA));
});

test('volver hacia donde estaba DESCUENTA: es una suma con signo', () => {
  // El motor lo pide asi: «un movimiento que acerca el parametro a su valor
  // inicial siempre es admisible». Con magnitudes absolutas, subir 2 y bajar 2
  // gastaria 4 dB de presupuesto habiendo quedado donde empezo.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -12 })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
  assert.ok(h.rutasYaTocadas.has(RUTA), 'quedo en cero y la ruta SI se toco');
});

test('un cambio que no se confirmo no gasta presupuesto: no sono', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false, confirmadoPor: 'TIMEOUT' })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), undefined);
  assert.equal(h.rutasYaTocadas.has(RUTA), false);
});

test('aplicar y revertir doce veces cuesta lo que sono, no cero', () => {
  // La reversion es otro par de escrituras que tambien sonaron. Lo que las
  // cancela es el signo. Aca se revierte a un valor distinto del de partida.
  const entradas = [];
  for (let i = 0; i < 12; i++) {
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]));
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -11 })]));
  }
  assert.equal(historialDeLaSesion(entradas, MEDICIONES, AHORA).acumuladoPorRuta.get(RUTA), 12);
});

test('salir del silencio no envenena el acumulado de la ruta', () => {
  // ADR-034: desde el silencio cualquier nivel finito es un salto infinito. Si
  // ese infinito entrara al acumulado, la ruta quedaria inutilizable el resto
  // de la sesion --cualquier tope la rechazaria-- justo despues del primer paso.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -Infinity, magnitudEnviada: -32.14 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -32.14, magnitudEnviada: -30.14 })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2, 'cuenta desde que dejo el silencio');
  assert.ok(h.rutasYaTocadas.has(RUTA), 'y la ruta quedo tocada igual');
});

test('cada ruta lleva su propia cuenta', () => {
  const otra = 'i.3.aux.1.value';
  const h = historialDeLaSesion([
    entrada([
      cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 }),
      cambio({ path: otra, magnitudEsperada: -20, magnitudEnviada: -21 }),
    ]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2);
  assert.equal(h.acumuladoPorRuta.get(otra), -1);
});

test('sin entradas, el historial esta vacio y no finge', () => {
  const h = historialDeLaSesion([], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.size, 0);
  assert.equal(h.rutasYaTocadas.size, 0);
});

// --- La tercera: si se escucho entre paso y paso ---------------------------

test('una ruta movida sin medicion despues NO esta en el conjunto', () => {
  const h = historialDeLaSesion([entrada([cambio({ path: RUTA })])], MEDICIONES, AHORA);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false,
    'nadie anoto haber escuchado: el motor tiene que frenar el proximo paso');
});

test('con la medicion anotada, la ruta queda habilitada para el proximo paso', () => {
  const h = historialDeLaSesion([entrada([cambio({ path: RUTA })], 'm-1')], MEDICIONES, AHORA);
  assert.ok(h.rutasConMedicionPosterior.has(RUTA));
});

test('haber escuchado hace tres pasos no autoriza el cuarto', () => {
  // Es el caso que hace que una rampa sea una rampa y no una corrida: gana la
  // ULTIMA transaccion que toco la ruta, no que alguna vez haya habido una.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })], 'm-1'),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], 'm-2'),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })], null),
  ], MEDICIONES, AHORA);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 6);
});

test('un cambio que no sono no cuenta como escucha de esa ruta', () => {
  // La transaccion tiene medicion anotada, pero su cambio no se confirmo. La
  // ruta no se movio, asi que tampoco hay nada que haya sonado para escuchar.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false })], 'm-1'),
  ], MEDICIONES, AHORA);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  assert.equal(h.rutasYaTocadas.has(RUTA), false);
});

test('cada ruta lleva su propia escucha dentro de la misma transaccion', () => {
  const otra = 'i.3.aux.1.value';
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA })], 'm-1'),
    entrada([cambio({ path: otra })], null),
  ], MEDICIONES, AHORA);
  assert.ok(h.rutasConMedicionPosterior.has(RUTA));
  assert.equal(h.rutasConMedicionPosterior.has(otra), false);
});

test('establecer el nivel mueve la referencia: el acumulado arranca de cero', () => {
  // La rampa de ADR-034: veinticinco decibeles desde el piso. Si el acumulado
  // siguiera contando desde donde estaba al empezar la sesion, el primer retoque
  // llegaria con el presupuesto de 4 dB agotado seis veces.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -32, magnitudEnviada: -30 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -30, magnitudEnviada: -28 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -28, magnitudEnviada: -26 })], null, [RUTA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0, 'seis movidos y la cuenta vuelve a cero');
  assert.ok(h.rutasConNivelEstablecido.has(RUTA));
  assert.ok(h.rutasYaTocadas.has(RUTA), 'establecer el nivel no borra que se toco');
});

test('los decibeles de la transaccion que establece el nivel son de la rampa', () => {
  // El reset va DESPUES de contar los cambios de esa transaccion: el ultimo paso
  // es el que alcanzo el nivel, y cobrarselo al retoque le comeria la mitad del
  // presupuesto antes de empezar.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -4, magnitudEnviada: -2 })], null, [RUTA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
});

test('despues del ancla el acumulado vuelve a contar', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [RUTA]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -6, magnitudEnviada: -4 })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4, 'cuatro decibeles desde el nivel establecido');
});

test('una entrada vieja sin el campo no rompe ni establece nada', () => {
  // El diario se serializa entero como JSON: las transacciones anteriores a esta
  // pieza vuelven de la base sin `nivelEstablecidoEn`. La ausencia es «ninguna».
  const vieja = entrada([cambio({ path: RUTA })]);
  const sinCampo = { ...vieja } as Record<string, unknown>;
  delete sinCampo['nivelEstablecidoEn'];
  const h = historialDeLaSesion([sinCampo as unknown as EntradaDiario], MEDICIONES, AHORA);
  assert.equal(h.rutasConNivelEstablecido.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2, 'y el acumulado se cuenta igual');
});

test('establecer el nivel de una ruta no toca el de otra', () => {
  const OTRA = 'i.4.aux.1.value';
  const h = historialDeLaSesion([
    entrada([
      cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 }),
      cambio({ path: OTRA, magnitudEsperada: -10, magnitudEnviada: -8 }),
    ], null, [RUTA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
  assert.equal(h.acumuladoPorRuta.get(OTRA), 2, 'la otra cuña sigue sin nivel y sigue contando');
  assert.equal(h.rutasConNivelEstablecido.has(OTRA), false);
});

// --- El ancla no se cree lo que le dicen -----------------------------------
//
// Los cinco casos de abajo salen de una auditoria adversarial del 2026-09-17.
// La primera version aceptaba `nivelEstablecidoEn` tal cual, y con eso el ancla
// --que es de monitores-- le sacaba el presupuesto a cualquier parametro.

test('el ancla no rebasa una ruta que esta transaccion no movio', () => {
  // La marca nombra la ganancia del previo; la transaccion movio un monitor.
  //
  // **La ruta decia `i.3.gain`, que no existe**: la ganancia del previo es
  // `hw.N.gain`, y `clasificarRuta` devuelve `null` para la otra. No se notaba
  // porque el acumulado se sumaba por cadena sin mirar de que parametro era;
  // desde ADR-039 se cuenta en la escala de la hoja, hace falta la clase, y el
  // test empezo a medir una ruta desconocida en vez de la ganancia que nombra.
  const GANANCIA = 'hw.3.gain';
  const h = historialDeLaSesion([
    entrada([cambio({ path: GANANCIA, magnitudEsperada: 0, magnitudEnviada: 3 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [GANANCIA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(GANANCIA), 3, 'el presupuesto de la ganancia sigue gastado');
  assert.equal(h.rutasConNivelEstablecido.has(GANANCIA), false);
});

test('el ancla no rebasa un parametro que no tiene techo declarado', () => {
  // Aunque la transaccion SI la haya movido: suspender el presupuesto sin un
  // techo que lo reemplace deja al parametro sin ningun tope sobre el total.
  const GANANCIA = 'hw.3.gain';
  const h = historialDeLaSesion([
    entrada([cambio({ path: GANANCIA, magnitudEsperada: 0, magnitudEnviada: 3 })], null, [GANANCIA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(GANANCIA), 3, 'la ganancia no declara techo');
  assert.equal(h.rutasConNivelEstablecido.has(GANANCIA), false);
});

test('el ancla no cuenta si el cambio no llego a la consola', () => {
  // Una transaccion que dio conflicto, se revirtio o nunca salio no establece
  // nada: es el mismo criterio que el acumulado, y antes no se le aplicaba.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false, confirmadoPor: 'TIMEOUT' })], null, [RUTA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.rutasConNivelEstablecido.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), undefined);
});

test('volver a establecer el nivel NO devuelve el presupuesto', () => {
  // `journal.ts` razona que desestablecer seria peligroso porque devolveria la
  // rampa entera. Volver a establecer hacia lo mismo y nadie lo impedia: marcar
  // la ruta en cada transaccion devolvia los 4 dB enteros, sin limite.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [RUTA]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -6, magnitudEnviada: -4 })], null, [RUTA]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4, 'los cuatro decibeles del retoque siguen gastados');
});

test('una ruta inventada en la marca no entra al conjunto', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null,
      [RUTA, 'no.existe', '', 'i.03.aux.1.value']),
  ], MEDICIONES, AHORA);
  assert.equal(h.rutasConNivelEstablecido.size, 1, 'solo la que se movio de verdad');
  assert.ok(h.rutasConNivelEstablecido.has(RUTA));
});

test('sin medicion anotada la ruta NO queda escuchada, ni con el campo ausente', () => {
  // `undefined !== null` es `true`, asi que una entrada vieja del diario --que
  // no trae el campo-- marcaba la ruta como escuchada y el paso siguiente
  // pasaba sin que nadie hubiera escuchado. Fallaba ABIERTA.
  const vieja = entrada([cambio({ path: RUTA })]);
  const sinCampo = { ...vieja } as Record<string, unknown>;
  delete sinCampo['medicionPosteriorId'];
  const h = historialDeLaSesion([sinCampo as unknown as EntradaDiario], MEDICIONES, AHORA);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

// --- Que la escucha sea una escucha, y no una cadena ------------------------
//
// **Hasta el 2026-09-18 el historial miraba solo que `medicionPosteriorId` no
// fuera nulo.** Medido con el motor real ese dia: dieciseis transacciones
// honestas de 2 dB, cada una atada al crudo y cada una dentro del tope por
// paso, levantan una cuña **32 dB --de -32 a nominal-- en 24 ms**, anotando
// dieciseis mediciones que no existen. Lo que corta no es ningun freno de
// INV-004 sino el techo, o sea el final del recorrido.
//
// Decision del usuario, 2026-09-18, entre tres opciones: «una medicion real,
// posterior, y con el musico sonando». Cada test de abajo se aparta de UNA sola
// condicion del molde de `medicion()`, asi que si falla se sabe cual fallo.

test('un identificador que no resuelve a ninguna medicion no es una escucha', () => {
  // El caso exacto del agujero: la cadena esta, la medicion no.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'medicion-que-no-existe')], MEDICIONES, AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('sin mediciones que consultar, nada cuenta como escucha: falla cerrado', () => {
  // Es lo que la aplicacion pasa hoy --una lista vacia-- y tiene que frenar, no
  // aflojar: la duda sobre si se escucho se resuelve no moviendo.
  const h = historialDeLaSesion([entrada([cambio({ path: RUTA })], 'm-1')], [], AHORA);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('una medicion de otra sesion no dice nada de esta cuña', () => {
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'otra')],
    [medicion({ id: 'otra', sessionId: 'otra-sesion' as unknown as Measurement['sessionId'] })], AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('una medicion ANTERIOR a la escritura es la escucha de lo de antes', () => {
  // El cambio se envio a las 10:00:00 y la medicion es de las 09:59:00.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'vieja')],
    [medicion({ id: 'vieja', timestamp: '2026-09-17T09:59:00.000Z' })], AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('una medicion tomada en el mismo instante de la escritura SI cuenta', () => {
  // La frontera es «no anterior», no «estrictamente posterior»: el reloj de la
  // aplicacion tiene resolucion de milisegundo y exigir mas seria inventar un
  // margen. Va con su test para que el dia que alguien la endurezca sea a
  // proposito.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'justo')],
    [medicion({ id: 'justo', timestamp: '2026-09-17T10:00:00.000Z' })], AHORA,
  );
  assert.ok(h.rutasConMedicionPosterior.has(RUTA));
});

test('si nadie toco, nadie escucho la cuña: el silencio no cuenta', () => {
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'muda')],
    [medicion({ id: 'muda', signalType: 'SILENCE' })], AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('la escucha tiene que durar lo que su clase de parametro pide', () => {
  // El envio a monitor pide diez segundos, que es el mismo numero con que la
  // aplicacion ya decide si una medicion de ganancia alcanzo.
  const corta = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'corta')],
    [medicion({ id: 'corta', duracionS: 9.9 })], AHORA,
  );
  assert.equal(corta.rutasConMedicionPosterior.has(RUTA), false,
    'nueve segundos y pico no alcanzan para el envio a monitor');

  const justa = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'justa')],
    [medicion({ id: 'justa', duracionS: 10 })], AHORA,
  );
  assert.ok(justa.rutasConMedicionPosterior.has(RUTA), 'diez exactos SI alcanzan');
});

test('una duracion que no es un numero no concede: es el NaN de siempre', () => {
  // `NaN < 10` da `false`, asi que sin la guarda de finitud la comparacion
  // dejaria pasar. Es la misma forma que este repositorio ya pago en
  // `verificarLimite`, en `atar` sobre la magnitud, en `atar` sobre el crudo y
  // en `coincideConEsperado`.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'rara')],
    [medicion({ id: 'rara', duracionS: Number.NaN })], AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('un cambio sin fecha de envio no se puede ordenar, asi que no concede', () => {
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA, enviadoEl: null })], 'm-1')], MEDICIONES, AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('una ruta sin clase de parametro no tiene criterio de escucha, y no concede', () => {
  // Sin clase no hay `escuchaMinimaS` que consultar. Se rechaza en vez de
  // conceder, que es como INV-004 trata a todo parametro sin limite declarado.
  const INVENTADA = 'no.existe.esta.ruta';
  const h = historialDeLaSesion(
    [entrada([cambio({ path: INVENTADA })], 'm-1')], MEDICIONES, AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(INVENTADA), false);
});

test('la escucha se mide contra la ULTIMA escritura de la transaccion', () => {
  // Dos cambios en la misma transaccion, el segundo mas tarde. Una medicion
  // entre los dos escucho la cuña a medio mover.
  const OTRA = 'i.3.aux.1.value';
  const h = historialDeLaSesion(
    [entrada([
      cambio({ path: RUTA, enviadoEl: '2026-09-17T10:00:00.000Z' }),
      cambio({ path: OTRA, enviadoEl: '2026-09-17T10:00:10.000Z' }),
    ], 'entremedio')],
    [medicion({ id: 'entremedio', timestamp: '2026-09-17T10:00:05.000Z' })], AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false,
    'la transaccion siguio escribiendo despues de que se escuchara');
  assert.equal(h.rutasConMedicionPosterior.has(OTRA), false);
});

// --- Lo que encontro la auditoria adversarial del 2026-09-18 ---------------
//
// La primera version de esta guarda tenia cinco condiciones y **no cerraba la
// rafaga**: comprobaba que la medicion DIJERA durar diez segundos, no que esos
// diez segundos hubieran pasado. Corriendo la misma rampa con mediciones que SI
// existen, la cuña volvia a subir los 32 dB enteros. Estos tests son los que
// faltaban.

test('una medicion que dice durar diez segundos pero no termino todavia no cuenta', () => {
  // **El hallazgo central.** `duracionS` lo declara quien escribe la fila, no el
  // reloj. Una medicion creada en el mismo instante de la escritura, diciendo
  // diez segundos, cumplia las otras seis condiciones.
  const enCurso = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'en-curso')],
    [medicion({ id: 'en-curso', timestamp: '2026-09-17T10:00:00.000Z', duracionS: 10 })],
    // Un segundo despues de que empezara: la ventana termina a las 10:00:10.
    Date.parse('2026-09-17T10:00:01.000Z'),
  );
  assert.equal(enCurso.rutasConMedicionPosterior.has(RUTA), false,
    'la escucha esta empezada, no terminada');

  const terminada = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'terminada')],
    [medicion({ id: 'terminada', timestamp: '2026-09-17T10:00:00.000Z', duracionS: 10 })],
    Date.parse('2026-09-17T10:00:10.000Z'),
  );
  assert.ok(terminada.rutasConMedicionPosterior.has(RUTA),
    'justo cuando la ventana termina, si cuenta');
});

test('una sola medicion del futuro no autoriza la rampa entera', () => {
  // Un reloj desfasado o una fila mal escrita ponia la medicion adelante de
  // todo, y como nada acotaba por arriba, la misma medicion valia para los
  // dieciseis pasos. Su ventana termina en el futuro, asi que ahora no pasa.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'futura')],
    [medicion({ id: 'futura', timestamp: '2026-09-17T23:00:00.000Z' })],
    AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('el tipo de señal se enumera por lista blanca: el campo ausente no concede', () => {
  // Era `signalType === 'SILENCE'`, o sea lista negra, asi que TODO lo demas
  // pasaba: `undefined`, `null`, `''`, `'UNKNOWN'` y hasta `'silence'` en
  // minusculas. Es la quinta repeticion de la misma forma en este repositorio.
  for (const raro of [undefined, null, '', 'UNKNOWN', 'NOISE', 'silence', 0]) {
    const h = historialDeLaSesion(
      [entrada([cambio({ path: RUTA })], 'rara')],
      [medicion({ id: 'rara', signalType: raro as never })],
      AHORA,
    );
    assert.equal(h.rutasConMedicionPosterior.has(RUTA), false,
      `signalType ${String(raro)} no tendria que conceder`);
  }
  // Y las cinco de la lista blanca si cuentan.
  for (const buena of ['PINK', 'SWEEP', 'SINE', 'BURST', 'PERFORMANCE'] as const) {
    const h = historialDeLaSesion(
      [entrada([cambio({ path: RUTA })], 'buena')],
      [medicion({ id: 'buena', signalType: buena })],
      AHORA,
    );
    assert.ok(h.rutasConMedicionPosterior.has(RUTA), `${buena} tendria que contar`);
  }
});

test('una fecha sin huso horario no se adivina: se rechaza', () => {
  // `Date.parse` sin zona interpreta hora LOCAL, asi que una medicion de un
  // minuto ANTES de la escritura quedaba horas despues segun donde corra el
  // proceso. Medido por la auditoria en America/Asuncion: concedia.
  const h = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'sinzona')],
    [medicion({ id: 'sinzona', timestamp: '2026-09-17T09:59:00.000' })],
    AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);

  // Y un huso explicito distinto de Z si se entiende, porque es un instante.
  const conOffset = historialDeLaSesion(
    [entrada([cambio({ path: RUTA })], 'offset')],
    [medicion({ id: 'offset', timestamp: '2026-09-17T07:00:30.000-03:00' })],
    AHORA,
  );
  assert.ok(conOffset.rutasConMedicionPosterior.has(RUTA),
    '07:00:30-03:00 son las 10:00:30Z, o sea despues de la escritura');
});

test('las fechas de envio se comparan como instantes, no como texto', () => {
  // Con `09:00Z` y `07:00-05:00` --que son las 12:00Z, mas tarde-- la
  // comparacion de cadenas elegia la primera, y una medicion de las 09:30Z
  // pasaba aunque la cuña termino de moverse a las 12:00Z.
  const OTRA = 'i.3.aux.1.value';
  const h = historialDeLaSesion(
    [entrada([
      cambio({ path: RUTA, enviadoEl: '2026-09-17T09:00:00.000Z' }),
      cambio({ path: OTRA, enviadoEl: '2026-09-17T07:00:00.000-05:00' }),
    ], 'texto')],
    [medicion({ id: 'texto', timestamp: '2026-09-17T09:30:00.000Z' })],
    AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});

test('un cambio sin fecha no se lo presta un hermano de la misma transaccion', () => {
  // La regla escrita era «un cambio sin fecha de envio no concede», y el test la
  // probaba con un solo cambio. Con un segundo cambio fechado, la fecha del otro
  // autorizaba al primero.
  const OTRA = 'i.3.aux.1.value';
  const h = historialDeLaSesion(
    [entrada([
      cambio({ path: RUTA, enviadoEl: null }),
      cambio({ path: OTRA, enviadoEl: '2026-09-17T10:00:00.000Z' }),
    ], 'm-1')],
    MEDICIONES, AHORA,
  );
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  assert.equal(h.rutasConMedicionPosterior.has(OTRA), false,
    'sin saber cuando termino la rafaga, ninguna de las dos rutas tiene escucha');
});

test('un identificador repetido en la lista se descarta, no gana el ultimo', () => {
  // `porId.set` pisaba en silencio, asi que el resultado dependia del orden:
  // [buena, mala] negaba y [mala, buena] concedia. Una lista con ids repetidos
  // es una lista corrupta, y ante eso no se concede.
  const buena = medicion({ id: 'dup' });
  const mala = medicion({ id: 'dup', signalType: 'SILENCE' });
  for (const lista of [[buena, mala], [mala, buena]]) {
    const h = historialDeLaSesion(
      [entrada([cambio({ path: RUTA })], 'dup')], lista, AHORA,
    );
    assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  }
});

// --- El acumulado suma en la escala del movimiento (ADR-039) ----------------
//
// **Es el tercer paso de la tarea 1b, y es donde el defecto entraría por el
// productor.** El motor compara el acumulado contra un tope en octavas; si el
// historial lo sumara en hercios, los dos números serían de especies distintas
// otra vez, con el motor haciendo la comparación correcta sobre un dato mal
// contado.

/** Una hoja del ecualizador en el diario, con su unidad y sus dos magnitudes. */
function hojaEq(
  path: string, unidad: string, desde: number, hasta: number,
  extra: Partial<CambioRegistrado> = {},
): CambioRegistrado {
  return cambio({ path, unidad, magnitudEsperada: desde, magnitudEnviada: hasta, ...extra });
}

const FREQ = 'i.9.eq.b2.freq';

test('ADR-039: una frecuencia se acumula en octavas, no en hercios', () => {
  // 1000 -> 1250 Hz son log2(1,25) = 0,3219 octavas. En hercios serían 250, que
  // contra un tope de una octava es un número sin sentido.
  const h = historialDeLaSesion([
    entrada([hojaEq(FREQ, 'Hz', 1000, 1250)]),
  ], MEDICIONES, AHORA);
  const a = h.acumuladoPorRuta.get(FREQ)!;
  assert.ok(Math.abs(a - 0.3219) < 1e-3, `${a} deberia ser 0,3219 octavas y no 250 hercios`);
});

test('ADR-039: tres pasos de un tercio gastan la octava del presupuesto', () => {
  // Tres pasos honestos: 1000 -> 1250 -> 1560 -> 1950. Cada uno cabe en un
  // tercio de octava y los tres suman 0,9635, que todavia entra en la octava.
  const h = historialDeLaSesion([
    entrada([hojaEq(FREQ, 'Hz', 1000, 1250)]),
    entrada([hojaEq(FREQ, 'Hz', 1250, 1560)]),
    entrada([hojaEq(FREQ, 'Hz', 1560, 1950)]),
  ], MEDICIONES, AHORA);
  const a = h.acumuladoPorRuta.get(FREQ)!;
  assert.ok(Math.abs(a - 0.9635) < 2e-3, `${a} deberia ser 0,9635 octavas`);
  // **Y en hercios habrian sido 950**, o sea que el segundo paso ya habria
  // chocado contra un tope de 1. El numero delata la moneda.
  assert.ok(a < 1, 'todavia entra en el presupuesto de una octava');
});

test('ADR-039: volver hacia el origen descuenta, tambien en octavas', () => {
  // Ir y volver deja el acumulado en cero exacto: el motor y el historial usan
  // la misma funcion de escala. Con dos funciones distintas --una en octavas y
  // otra en hercios, o `log2(Q)` contra octavas de ancho-- esto no da cero.
  const h = historialDeLaSesion([
    entrada([hojaEq(FREQ, 'Hz', 1000, 1250)]),
    entrada([hojaEq(FREQ, 'Hz', 1250, 1000)]),
  ], MEDICIONES, AHORA);
  assert.ok(Math.abs(h.acumuladoPorRuta.get(FREQ)!) < 1e-12, 'ida y vuelta es cero');
});

test('ADR-039: el ancho se acumula en octavas de ancho de banda', () => {
  // Q 1,0 -> 1,3 son 0,3044 octavas de ancho --BW(1,0) = 1,3885 y BW(1,3) =
  // 1,0841--. Con `log2(Q2/Q1)` habrian sido 0,3785, que es MAS que el tercio
  // de octava: la moneda equivocada cambia el veredicto, no sólo el número.
  const Q = 'i.9.eq.b2.q';
  const h = historialDeLaSesion([
    entrada([hojaEq(Q, 'Q', 1.0, 1.3)]),
  ], MEDICIONES, AHORA);
  const a = h.acumuladoPorRuta.get(Q)!;
  assert.ok(Math.abs(a + 0.3044) < 1e-3, `${a} deberia ser -0,3044 octavas de ancho`);
});

test('ADR-039: una ganancia sigue sumando decibeles, como siempre', () => {
  // El control de que la escala por omision no cambio nada donde no tenia que
  // cambiarlo: la ganancia de una banda se mueve en su propia unidad.
  const G = 'i.9.eq.b2.gain';
  const h = historialDeLaSesion([
    entrada([hojaEq(G, 'dB', 0, 3)]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.get(G), 3);
});

test('ADR-039: una fila que no se puede contar envenena la ruta en vez de valer cero', () => {
  // Una frecuencia anotada en decibeles no se puede convertir a octavas. Antes
  // la guarda era `!Number.isFinite(delta)` y una fila asi caia por la misma
  // puerta que el primer paso de ADR-034: el acumulado quedaba en cero y la
  // ruta arrancaba con el presupuesto entero. Son dos cosas distintas.
  const h = historialDeLaSesion([
    entrada([hojaEq(FREQ, 'dB', 1000, 1250)]),
  ], MEDICIONES, AHORA);
  assert.ok(Number.isNaN(h.acumuladoPorRuta.get(FREQ)!), 'no se puede contar: envenena');
  assert.ok(h.rutasYaTocadas.has(FREQ), 'y la ruta quedo tocada igual: se movio');
});

test('ADR-039: salir del silencio sigue sin acumular, y se reconoce por el origen', () => {
  // El primer paso de ADR-034 no tiene delta que contar y es correcto que no
  // sume. Se distingue por `magnitudEsperada === -Infinity` --el origen que el
  // llamador declara-- y no por que la cuenta no de un numero, que es lo que
  // confundia los dos casos.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -Infinity, magnitudEnviada: -32.14 })]),
  ], MEDICIONES, AHORA);
  assert.equal(h.acumuladoPorRuta.has(RUTA), false, 'no acumula');
  assert.ok(h.rutasYaTocadas.has(RUTA), 'pero la cuña se movio');
});
