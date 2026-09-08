import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esSimulador, validarDireccionDeConsola } from '../src/rules/validacion.ts';

test('se acepta la maquina sola, que es lo que ahora se guarda', () => {
  // El identificador de sesion de socket.io se agota al usarlo, asi que no hay
  // direccion completa que se pueda guardar.
  assert.equal(validarDireccionDeConsola('10.10.1.1'), null);
  assert.equal(validarDireccionDeConsola('192.168.0.49'), null);
  assert.equal(validarDireccionDeConsola('consola.local'), null);
  assert.equal(validarDireccionDeConsola('192.168.0.49:80'), null);
});

test('se rechaza una direccion con ruta, que es el error que se venia cometiendo', () => {
  const e = validarDireccionDeConsola('192.168.0.49/socket.io/1/websocket/1234');
  assert.ok(e !== null);
  assert.match(e!, /solo la maquina|solo la máquina/i);
});

test('la direccion del simulador se sigue aceptando', () => {
  assert.equal(validarDireccionDeConsola('ws://localhost:8765'), null);
  assert.ok(esSimulador('ws://localhost:8765'));
  assert.ok(!esSimulador('192.168.0.49'));
});

test('lo que no se entiende se rechaza con un motivo', () => {
  assert.ok(validarDireccionDeConsola('') !== null);
  assert.ok(validarDireccionDeConsola('   ') !== null);
  assert.equal(validarDireccionDeConsola('  192.168.0.49  '), null);
  assert.ok(validarDireccionDeConsola('192.168.0.49:puerto') !== null);
  assert.ok(validarDireccionDeConsola('una maquina') !== null);
  assert.ok(validarDireccionDeConsola('ws://:::') !== null);
});
