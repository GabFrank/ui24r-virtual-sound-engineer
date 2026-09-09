import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APRETON_TIMEOUT_MS, resolverDireccionUi24r } from '../src/transport.ts';

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

test('el apreton de manos lleva corte de tiempo', async () => {
  // Sin esto la reconexion no funciona, y el sintoma no señala hacia aca:
  // medido el 2026-09-08 en el telefono con la red cortada, el `fetch` se
  // quedaba colgado sin resolver ni fallar. El intento nunca terminaba, el
  // reintento siguiente se saltaba por haber uno en curso, y la aplicacion se
  // quedaba en RECONECTANDO aunque la red ya hubiera vuelto.
  let vistas: RequestInit | undefined;
  const espia: typeof fetch = async (_url, opciones) => {
    vistas = opciones;
    return new Response(APRETON_REAL, { status: 200 });
  };

  await resolverDireccionUi24r('192.168.0.49', espia);

  assert.ok(vistas?.signal instanceof AbortSignal, 'el pedido va con senal de corte');
  assert.ok(APRETON_TIMEOUT_MS > 0 && APRETON_TIMEOUT_MS <= 5000,
    'el corte tiene que ser holgado contra la consola y mas corto que los 10 s del criterio 1');
});

test('si el apreton se corta, el error se propaga y no se cuelga', async () => {
  const cortado: typeof fetch = async () => {
    throw new DOMException('The operation was aborted.', 'TimeoutError');
  };

  await assert.rejects(() => resolverDireccionUi24r('192.168.0.49', cortado), /aborted/);
});
