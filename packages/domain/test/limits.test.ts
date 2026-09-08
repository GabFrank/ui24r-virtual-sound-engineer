import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  verificarLimite, MAX_PARAMETROS_POR_TRANSACCION, PACING_MS,
  Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
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
  assert.ok(PACING_MS.SYSTEM < PACING_MS.ASSISTED);
  assert.ok(24 * PACING_MS.SYSTEM < 1000, 'veinticuatro envíos entran en un segundo');
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
