import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDireccionUi24r } from '../src/transport.ts';

/** Respuesta literal de la consola real, 2026-09-08. */
const APRETON_REAL = '10454688205293084044:5:5:websocket';

const fetchFalso = (cuerpo: string, ok = true, status = 200): typeof fetch =>
  (async (url: string) => {
    assert.ok(String(url).endsWith('/socket.io/1/'),
      `pidio ${url}, no la ruta del apreton de manos`);
    return {
      ok, status,
      text: async () => cuerpo,
    } as Response;
  }) as unknown as typeof fetch;

test('la direccion se deriva de la maquina, no se guarda entera', () => {
  // El campo de Ajustes guardaba una URL completa. No puede: el identificador
  // de sesion es de un solo uso y hay que pedir uno nuevo en cada conexion.
  return resolverDireccionUi24r('192.168.0.49', fetchFalso(APRETON_REAL))
    .then((url) => {
      assert.equal(url, 'ws://192.168.0.49/socket.io/1/websocket/10454688205293084044');
    });
});

test('se acepta la maquina con esquema o barra sobrante', async () => {
  for (const entrada of ['ws://192.168.0.49', '192.168.0.49/', 'wss://192.168.0.49//']) {
    const url = await resolverDireccionUi24r(entrada, fetchFalso(APRETON_REAL));
    assert.equal(url, 'ws://192.168.0.49/socket.io/1/websocket/10454688205293084044',
      `fallo con ${entrada}`);
  }
});

test('cada llamada pide un identificador nuevo', async () => {
  // Reusar el identificador es el error que dejaria la reconexion muerta.
  let n = 0;
  const contando = (async () => {
    n++;
    return { ok: true, status: 200, text: async () => `sesion${n}:5:5:websocket` } as Response;
  }) as unknown as typeof fetch;
  const a = await resolverDireccionUi24r('192.168.0.49', contando);
  const b = await resolverDireccionUi24r('192.168.0.49', contando);
  assert.notEqual(a, b);
  assert.equal(n, 2);
});

test('un apreton ininteligible falla con un mensaje que se entiende', async () => {
  await assert.rejects(
    () => resolverDireccionUi24r('192.168.0.49', fetchFalso('')),
    /ininteligible/,
  );
});

test('un error HTTP dice el codigo', async () => {
  await assert.rejects(
    () => resolverDireccionUi24r('192.168.0.49', fetchFalso('', false, 404)),
    /respondio 404/,
  );
});
