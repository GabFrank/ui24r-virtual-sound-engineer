import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmedStateStore, RUTA_INSTANTANEA_ACTIVA } from '../src/confirmed-store.ts';
import type { BulkExternalChange } from '../src/api.ts';
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

/**
 * Lo que llega por la conexion principal es SIEMPRE ajeno.
 *
 * Antes habia dos tests que fijaban lo contrario: que una linea coincidente en
 * ruta, valor y ventana temporal se etiquetaba SELF --el eco-- y que fuera de
 * la ventana pasaba a EXTERNAL. Medido el 2026-09-08: LA CONSOLA NO LE DEVUELVE
 * NADA A QUIEN ESCRIBE, asi que por este socket nuestra escritura no vuelve
 * nunca y esa rama no podia acertar por el motivo que decia.
 *
 * Peor: podia acertar por coincidencia. Si una escritura nuestra vencia sin
 * testigo quedaba pendiente hasta un segundo, y un cambio de OTRO operador a la
 * misma ruta y el mismo valor dentro de esa ventana se tragaba como propio y no
 * disparaba el aviso de cambio ajeno. Eso es lo que este test protege ahora.
 */
test('una linea que coincide con una escritura nuestra sigue siendo ajena', () => {
  const { store, reloj } = nuevoStore();
  const vistos: string[] = [];
  store.alCambioExterno((path) => vistos.push(path));

  store.registrarEscrituraPropia('i.3.mix', 0.7);
  reloj.avanzar(50);
  store.procesarLinea(codificarSetd('i.3.mix', 0.7));

  assert.equal(store.leer('i.3.mix')?.origen, 'EXTERNAL',
    'no hay eco: si llego por aca, lo escribio otro');
  assert.deepEqual(vistos, ['i.3.mix'], 'y tiene que avisar, que es lo que antes se perdia');
});

test('lo nuestro entra por el testigo, y ese si es propio', () => {
  const { store } = nuevoStore();
  const vistos: string[] = [];
  store.alCambioExterno((path) => vistos.push(path));

  store.registrarEscrituraPropia('i.3.mix', 0.7);
  store.confirmarPorTestigo('i.3.mix', 0.7);

  assert.equal(store.leer('i.3.mix')?.origen, 'SELF');
  assert.deepEqual(vistos, [], 'nuestro propio cambio no es un aviso de cambio ajeno');
});

test('un cambio de otro cliente se etiqueta como externo y avisa', () => {
  const { store } = nuevoStore();
  const vistos: string[] = [];
  store.alCambioExterno((path) => vistos.push(path));
  store.procesarLinea(codificarSetd('i.5.mix', 0.42));
  assert.equal(store.leer('i.5.mix')?.origen, 'EXTERNAL');
  assert.deepEqual(vistos, ['i.5.mix']);
});

test('un valor distinto al enviado tambien es ajeno', () => {
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

// --- INV-021: "cambio masivo O cambio de currentSnapshot" ------------------
//
// Solo estaba la primera mitad. Un recall desde el navegador de la consola
// cambia la instantanea activa y despues los parametros que difieran: si
// difieren menos de diez, la avalancha no se detectaba y el estado local se
// seguia dando por bueno. Es peor que la avalancha grande, porque un recall
// chico es el que nadie nota.

test('INV-021: cambiar la instantanea activa invalida, aunque cambie sola', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 3));

  assert.equal(rafagas.length, 1, 'una sola ruta, pero es la que cuenta');
  assert.equal(store.storeState, 'INVALID');
});

test('INV-021: un recall chico se detecta igual que uno grande', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  for (let canal = 1; canal <= 3; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }

  assert.equal(rafagas.length, 1);
  assert.equal(rafagas[0]?.probableCausa, 'SNAPSHOT_RECALL');
});

test('el volcado inicial incluye la instantanea activa y no es una avalancha', () => {
  // Al conectar, la consola manda tambien `var.currentSnapshot`. Si eso
  // disparara la invalidacion, cada conexion abriria una alerta.
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({ ahora: reloj.ahora });
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.volcadoIniciado();
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 1));
  store.volcadoCompletoRecibido();

  assert.equal(rafagas.length, 0);
  assert.equal(store.storeState, 'VALID');
});

test('la causa no se inventa: sin instantanea de por medio no es un recall', () => {
  // Estaba fija en SNAPSHOT_RECALL, y la causa se le muestra al usuario para
  // que decida que hacer.
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }

  assert.equal(rafagas.length, 1);
  assert.equal(rafagas[0]?.probableCausa, 'FADER_DRAG',
    'doce canales, un solo parametro: alguien arrastro un grupo de faders');
});

test('rutas de distinto parametro dan causa desconocida', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let canal = 1; canal <= 6; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
    store.procesarLinea(codificarSetd(`i.${canal}.pan`, 0.6));
  }

  assert.equal(rafagas.length, 1);
  assert.equal(rafagas[0]?.probableCausa, 'DESCONOCIDA');
});

test('dos cambios de instantanea seguidos no disparan dos alertas', () => {
  // La ventana de silencio evita que un recall que llega en varias tramas
  // abra una alerta por trama.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  reloj.avanzar(100);
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 3));
  assert.equal(rafagas.length, 1);

  reloj.avanzar(2000);
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 4));
  assert.equal(rafagas.length, 2, 'pasada la ventana, un recall nuevo sí avisa');
});

test('si la instantanea llega despues de los parametros, se corrige la causa', () => {
  // La consola no promete un orden. El simulador manda primero los doce
  // faders y despues `var.currentSnapshot`, que es un orden tan valido como el
  // otro: sin esto, un recall se anunciaba como un arrastre de faders, y eso
  // cambia lo que conviene hacer.
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }
  assert.equal(rafagas[0]?.probableCausa, 'FADER_DRAG', 'con lo visto hasta acá, eso parecía');

  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 1));
  assert.equal(rafagas.length, 2);
  assert.equal(rafagas[1]?.probableCausa, 'SNAPSHOT_RECALL');
});

test('la correccion de causa se avisa una sola vez', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 1));
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 3));
  assert.equal(rafagas.length, 2);
});

test('INV-021: el estado invalido vuelve a ser valido con la relectura', () => {
  // La invariante dice "store INVALID hasta re-lectura". La primera mitad
  // estaba; la segunda no existia, y el estado se quedaba invalido para
  // siempre: la unica salida era desconectar y volver a conectar a mano.
  const { store } = nuevoStore();
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  assert.equal(store.storeState, 'INVALID');

  // Lo que hace una relectura: el volcado entero, otra vez.
  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.1.mix', 0.5));
  store.volcadoCompletoRecibido();

  assert.equal(store.storeState, 'VALID');
});

test('la relectura no se anuncia como una avalancha nueva', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  assert.equal(rafagas.length, 1);

  store.volcadoIniciado();
  for (let canal = 1; canal <= 24; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
  }
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  store.volcadoCompletoRecibido();

  assert.equal(rafagas.length, 1, 'el volcado de la relectura no es un cambio de nadie');
});

test('una avalancha dentro de la ventana de silencio invalida igual', () => {
  // La ventana existe para no abrir un cartel por cada trama de un mismo
  // recall. Suprimir tambien la invalidacion hacia que una avalancha distinta,
  // caida dentro de esa ventana, dejara el estado dado por bueno -- y con el
  // estado valido se puede escribir.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  store.procesarLinea(codificarSetd(RUTA_INSTANTANEA_ACTIVA, 2));
  assert.equal(store.storeState, 'INVALID');

  // El usuario relee: el estado vuelve a ser valido dentro de la ventana.
  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.1.mix', 0.5));
  store.volcadoCompletoRecibido();
  assert.equal(store.storeState, 'VALID');

  // Y llega otra avalancha, todavia dentro del segundo de silencio.
  reloj.avanzar(100);
  for (let canal = 1; canal <= 12; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.3));
  }
  assert.equal(store.storeState, 'INVALID', 'no avisar no es lo mismo que no invalidar');
});
