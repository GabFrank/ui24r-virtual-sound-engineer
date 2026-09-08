import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmedStateStore } from '../src/confirmed-store.ts';
import { codificarSetd } from '../src/protocol.ts';

/** Reloj controlado: probar tiempo esperándolo es lento y frágil. */
function relojFalso(inicio = 1_000_000) {
  let t = inicio;
  return { ahora: () => t, avanzar: (ms: number) => { t += ms; } };
}

function nuevoStore(reloj = relojFalso()) {
  const store = new ConfirmedStateStore({ ahora: reloj.ahora });
  store.volcadoCompletoRecibido();
  return { store, reloj };
}

test('ADR-005: el estado arranca inválido hasta el volcado completo', () => {
  const store = new ConfirmedStateStore();
  assert.equal(store.storeState, 'INVALID');
  store.volcadoCompletoRecibido();
  assert.equal(store.storeState, 'VALID');
});

test('ADR-005: una escritura propia no aparece como confirmada hasta que vuelve', () => {
  const { store } = nuevoStore();
  store.registrarEscrituraPropia('i.3.mix', 0.7);
  assert.equal(store.leer('i.3.mix'), undefined,
    'registrar el envío no puede alterar el estado confirmado');
});

test('el eco de una escritura propia se etiqueta como propio', () => {
  const { store, reloj } = nuevoStore();
  store.registrarEscrituraPropia('i.3.mix', 0.7);
  reloj.avanzar(50);
  store.procesarLinea(codificarSetd('i.3.mix', 0.7));
  assert.equal(store.leer('i.3.mix')?.origen, 'SELF');
});

test('un eco que llega demasiado tarde ya no se reconoce como propio', () => {
  // Dirección segura: ante la duda, se trata como ajeno y se pide confirmación
  // humana, en vez de sobrescribir el cambio de otro.
  const { store, reloj } = nuevoStore();
  store.registrarEscrituraPropia('i.3.mix', 0.7);
  reloj.avanzar(400);
  store.procesarLinea(codificarSetd('i.3.mix', 0.7));
  assert.equal(store.leer('i.3.mix')?.origen, 'EXTERNAL');
});

test('un cambio de otro cliente se etiqueta como externo y avisa', () => {
  const { store } = nuevoStore();
  const vistos: string[] = [];
  store.alCambioExterno((path) => vistos.push(path));
  store.procesarLinea(codificarSetd('i.5.mix', 0.42));
  assert.equal(store.leer('i.5.mix')?.origen, 'EXTERNAL');
  assert.deepEqual(vistos, ['i.5.mix']);
});

test('un valor distinto al enviado no cuenta como eco propio', () => {
  const { store, reloj } = nuevoStore();
  store.registrarEscrituraPropia('i.3.mix', 0.7);
  reloj.avanzar(10);
  store.procesarLinea(codificarSetd('i.3.mix', 0.9));
  assert.equal(store.leer('i.3.mix')?.origen, 'EXTERNAL',
    'la consola devolvió otro valor: es un cambio ajeno, no nuestro eco');
});

test('INV-011: escribir exige que el valor actual sea el esperado', () => {
  const { store } = nuevoStore();
  store.procesarLinea(codificarSetd('i.3.mix', 0.5));
  assert.equal(store.coincideConEsperado('i.3.mix', 0.5).coincide, true);
  const r = store.coincideConEsperado('i.3.mix', 0.8);
  assert.equal(r.coincide, false);
  assert.equal(r.actual, 0.5);
  assert.match(r.motivo ?? '', /otro cliente/);
});

test('INV-011: con el estado inválido no se escribe nada', () => {
  const { store } = nuevoStore();
  store.procesarLinea(codificarSetd('i.3.mix', 0.5));
  store.invalidar();
  const r = store.coincideConEsperado('i.3.mix', 0.5);
  assert.equal(r.coincide, false);
  assert.match(r.motivo ?? '', /no es válido/);
});

test('INV-011: un parámetro que nunca llegó no se puede escribir a ciegas', () => {
  const { store } = nuevoStore();
  const r = store.coincideConEsperado('i.9.mix', 0);
  assert.equal(r.coincide, false);
  assert.match(r.motivo ?? '', /no está en el estado confirmado/);
});

test('INV-021: recuperar una instantánea se detecta como avalancha', () => {
  const { store } = nuevoStore();
  const eventos: number[] = [];
  store.alCambioMasivo((e) => eventos.push(e.rutasAfectadas));

  // Una recuperación manda muchas rutas distintas de golpe.
  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
  }

  assert.equal(eventos.length, 1, 'una avalancha avisa una sola vez');
  assert.ok(eventos[0]! >= 10);
  assert.equal(store.storeState, 'INVALID',
    'tras una avalancha el estado deja de ser confiable hasta releer');
});

test('INV-021: arrastrar un fader no es una avalancha', () => {
  // Decenas de mensajes, pero sobre una sola ruta. Es un gesto, no un cambio
  // masivo: contarlo como avalancha llenaría la pantalla de falsas alarmas.
  const { store, reloj } = nuevoStore();
  const eventos: unknown[] = [];
  store.alCambioMasivo((e) => eventos.push(e));

  for (let i = 0; i < 40; i++) {
    store.procesarLinea(codificarSetd('i.3.mix', i / 40));
    reloj.avanzar(10);
  }

  assert.equal(eventos.length, 0);
  assert.equal(store.storeState, 'VALID');
});

test('cambios externos espaciados en el tiempo no acumulan avalancha', () => {
  const { store, reloj } = nuevoStore();
  const eventos: unknown[] = [];
  store.alCambioMasivo((e) => eventos.push(e));

  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
    reloj.avanzar(1200); // más que la ventana de avalancha
  }

  assert.equal(eventos.length, 0, 'doce cambios en catorce segundos es uso normal');
});

test('la versión de un parámetro se incrementa con cada cambio', () => {
  const { store } = nuevoStore();
  store.procesarLinea(codificarSetd('i.1.mix', 0.1));
  store.procesarLinea(codificarSetd('i.1.mix', 0.2));
  assert.equal(store.leer('i.1.mix')?.version, 2);
});

test('las líneas que no son cambios de parámetro se ignoran sin romper', () => {
  const { store } = nuevoStore();
  store.procesarLinea('ALIVE');
  store.procesarLinea('VU2^AAAA');
  store.procesarLinea('basura sin formato');
  assert.equal(store.volcar().size, 0);
});

test('el volcado inicial no se confunde con una avalancha de cambios ajenos', () => {
  // Al conectar, la consola manda su estado entero como cientos de mensajes.
  // Sin distinguirlo, cada conexión abriría una alerta de cambio masivo: lo
  // detectó la prueba visual contra el simulador.
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({ ahora: reloj.ahora });
  const rafagas: unknown[] = [];
  const externos: string[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));
  store.alCambioExterno((p) => externos.push(p));

  store.volcadoIniciado();
  for (let canal = 1; canal <= 24; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
    store.procesarLinea(codificarSetd(`hw.${canal}.gain`, 0.4));
  }
  store.volcadoCompletoRecibido();

  assert.equal(rafagas.length, 0, 'el volcado no es una avalancha');
  assert.equal(externos.length, 0, 'el volcado no son cambios de otra persona');
  assert.equal(store.storeState, 'VALID');
  assert.equal(store.leer('i.7.mix')?.valor, 0.5, 'pero el estado sí queda cargado');
});

test('terminado el volcado, una avalancha real sí se detecta', () => {
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({ ahora: reloj.ahora });
  const rafagas: unknown[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.volcadoIniciado();
  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
  }
  store.volcadoCompletoRecibido();
  assert.equal(rafagas.length, 0);

  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }
  assert.equal(rafagas.length, 1, 'ahora sí: alguien recuperó una instantánea');
});
