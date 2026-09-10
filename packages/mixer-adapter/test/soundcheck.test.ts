import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tomaPistaGrabada } from '../src/fuente-de-canal.ts';

/**
 * Con el soundcheck virtual encendido el canal reproduce lo grabado, asi que
 * la ganancia del previo NO afecta lo que suena. Un consejo de ganancia ahi no
 * es impreciso: es inaplicable.
 */
test('con el modo apagado nunca toma pista, aunque tenga una asignada', () => {
  // Es lo normal: en esta consola los 24 canales tienen scsrc asignado y el
  // modo apagado. Mirar solo scsrc daria un falso positivo permanente.
  assert.equal(tomaPistaGrabada(false, 'ua.9'), false);
});

test('con el modo encendido y pista asignada, si toma pista', () => {
  assert.equal(tomaPistaGrabada(true, 'ua.9'), true);
  assert.equal(tomaPistaGrabada(true, 'ub.25'), true);
});

test('con el modo encendido pero sin pista, sigue tomando su entrada', () => {
  assert.equal(tomaPistaGrabada(true, 'none'), false);
  assert.equal(tomaPistaGrabada(true, ''), false);
  assert.equal(tomaPistaGrabada(true, undefined), false);
});
