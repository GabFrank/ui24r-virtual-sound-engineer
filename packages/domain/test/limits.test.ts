import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PARAMETROS_POR_TRANSACCION, PACING_MS, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
  correspondeExencionDeSistema, esOperacionDeSistema, maximoDeParametros, pacingMs,
  verificarLimite,
} from '../src/rules/limits.ts';

test('INV-004: un cambio dentro del límite se permite', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 2, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  });
  assert.equal(r.permitido, true);
});

test('INV-004: un cambio que supera el límite por transacción se rechaza', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 4, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});

test('INV-004: tres cambios de tres decibeles no suman nueve', () => {
  // Cada uno cumple el límite por transacción. El tope acumulado es lo que
  // impide moverse nueve decibeles cumpliendo la regla tres veces.
  const primero = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  });
  assert.equal(primero.permitido, true);

  const segundo = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 3,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false,
  });
  assert.equal(segundo.permitido, true);

  const tercero = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 6,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false,
  });
  assert.equal(tercero.permitido, false);
  assert.equal(tercero.permitido === false && tercero.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: sin medición intermedia no se vuelve a mover el mismo parámetro', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 1, acumuladoEnSesion: 1,
    hayMedicionPosterior: false, esPrimerCambioDelParametro: false,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_MEDICION_INTERMEDIA');
});

test('un parámetro sin límite declarado no se escribe', () => {
  const r = verificarLimite({
    kind: 'FX', deltaSolicitado: 0.1, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_LIMITE_DECLARADO');
});

test('INV-004: el fader general tiene el límite más estrecho', () => {
  const r = verificarLimite({
    kind: 'MASTER_FADER', deltaSolicitado: 2, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  });
  assert.equal(r.permitido, false);
});

test('INV-005: el modo automático permite un solo parámetro por transacción', () => {
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.AUTO, 1);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.ASSISTED, 4);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.SUGGEST, 0);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.OBSERVE, 0);
});

test('INV-005: las transacciones de sistema tienen un ritmo más rápido', () => {
  // Seleccionar un canal en el bus exige 24 escrituras: a 100 ms cada una no
  // entra en el tiempo de conmutación exigido.
  assert.equal(pacingMs('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']), 20);
  assert.equal(pacingMs('ASSISTED'), 100);
  assert.equal(pacingMs('AUTO'), 100);
  assert.ok(24 * pacingMs('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']) < 1000,
    'veinticuatro envíos entran en un segundo');
});

test('INV-005: una operación que no es de sistema no se lleva la exención', () => {
  // La exención se deriva del tipo de operación y no de una bandera que quien
  // propone pueda encender: pedirla no puede ser tan fácil como merecerla.
  assert.equal(pacingMs('ASSISTED', 'BALANCE_DE_COROS'), 100);
  assert.equal(maximoDeParametros('ASSISTED', 'BALANCE_DE_COROS'), 4);
  assert.equal(esOperacionDeSistema('BALANCE_DE_COROS'), false);
  assert.equal(esOperacionDeSistema(undefined), false);
});

test('INV-005: las de sistema quedan exentas del límite de cuatro', () => {
  // Es la cláusula que no se podía ni expresar: el máximo se resolvía solo por
  // nivel de autonomía, así que una transacción de sistema de veinticuatro
  // envíos se rechazaba entera.
  assert.equal(maximoDeParametros('ASSISTED'), 4);
  assert.equal(maximoDeParametros('AUTO'), 1);
  assert.equal(
    maximoDeParametros('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']),
    Number.POSITIVE_INFINITY);
  assert.equal(
    maximoDeParametros('AUTO', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']),
    Number.POSITIVE_INFINITY);
});

test('los límites de ecualización de sala favorecen atenuar sobre realzar', () => {
  assert.equal(REALCE_MAXIMO_SALA_DB, 2);
  assert.equal(Q_MINIMO_SALIDA, 0.7);
});

test('INV-004: el tope acumulado no bloquea el movimiento que deshace', () => {
  // Antes sumaba magnitudes, asi que con +6 dB acumulados rechazaba un -3 dB
  // que dejaria el parametro en +3, dentro del tope. La regla prohibia
  // justamente la unica direccion segura: la que devuelve el parametro hacia
  // donde estaba.
  const base = {
    kind: 'CHANNEL_FADER' as const,
    hayMedicionPosterior: true,
    esPrimerCambioDelParametro: false,
  };
  const volver = verificarLimite({ ...base, deltaSolicitado: -3, acumuladoEnSesion: 6 });
  assert.equal(volver.permitido, true);

  // Y sigue bloqueando el que se aleja mas alla del tope.
  const alejarse = verificarLimite({ ...base, deltaSolicitado: 3, acumuladoEnSesion: 6 });
  assert.equal(alejarse.permitido, false);
  if (!alejarse.permitido) assert.equal(alejarse.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: el tope es simetrico', () => {
  const base = {
    kind: 'CHANNEL_FADER' as const,
    hayMedicionPosterior: true,
    esPrimerCambioDelParametro: false,
  };
  // -6 acumulado, -3 mas: quedaria en -9, fuera del tope de 6.
  assert.equal(
    verificarLimite({ ...base, deltaSolicitado: -3, acumuladoEnSesion: -6 }).permitido,
    false,
  );
  // -6 acumulado, +3: vuelve hacia el inicio.
  assert.equal(
    verificarLimite({ ...base, deltaSolicitado: 3, acumuladoEnSesion: -6 }).permitido,
    true,
  );
});

test('INV-005: la exencion se decide por lo que se toca, no por como se llama', () => {
  // `tipoDeOperacion` es una cadena libre que provee quien propone la
  // transaccion. Sin cruzarla con las clases reales -- las que salen de la
  // ruta -- pedir la exencion era tan facil como escribir su nombre.
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', ['PA_BUS_MUTE']), true);
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', ['CHANNEL_FADER']), false);
  assert.equal(correspondeExencionDeSistema('ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']), true);
  assert.equal(correspondeExencionDeSistema('ANALYSIS_BUS_SELECT', ['CHANNEL_FADER']), false);
  // Mezclar uno permitido con uno que no: no alcanza con que haya alguno.
  assert.equal(
    correspondeExencionDeSistema('MUTE_COMPONENTE', ['PA_BUS_MUTE', 'CHANNEL_FADER']), false);
});

test('INV-005: sin cambios no hay exencion, y una etiqueta inventada tampoco', () => {
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', []), false);
  assert.equal(correspondeExencionDeSistema('NO_EXISTE', ['PA_BUS_MUTE']), false);
  assert.equal(correspondeExencionDeSistema(undefined, ['PA_BUS_MUTE']), false);
  // La calibracion no declara todavia que parametro de consola toca, asi que
  // su etiqueta no concede nada.
  assert.equal(correspondeExencionDeSistema('CALIBRACION', ['PA_BUS_MUTE']), false);
});

test('INV-005: el ritmo y el maximo siguen a la exencion', () => {
  assert.equal(pacingMs('ASSISTED', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']), 20);
  assert.equal(pacingMs('ASSISTED', 'MUTE_COMPONENTE', ['CHANNEL_FADER']), 100);
  assert.equal(
    maximoDeParametros('ASSISTED', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']),
    Number.POSITIVE_INFINITY);
  assert.equal(maximoDeParametros('ASSISTED', 'MUTE_COMPONENTE', ['CHANNEL_FADER']), 4);
});
