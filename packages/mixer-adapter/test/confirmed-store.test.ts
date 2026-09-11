import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmedStateStore, RUTA_INSTANTANEA_ACTIVA } from '../src/confirmed-store.ts';
import type { BulkExternalChange } from '../src/api.ts';
import { codificarSetd, codificarSets } from '../src/protocol.ts';

/** Reloj controlado: probar tiempo esperándolo es lento y frágil. */
/**
 * Reloj falso, y desde el 2026-09-10 tambien temporizadores falsos.
 *
 * La agrupacion de cambios externos --que junta un arrastre en un solo aviso--
 * necesita esperar a que el gesto termine. Con `setTimeout` de verdad, este
 * archivo dejaba de poder probar el tiempo sin esperarlo, que es justamente la
 * razon por la que el almacen tiene reloj inyectable. `avanzar()` mueve el
 * reloj Y dispara lo que venciera en ese tramo, en orden.
 */
function relojFalso(inicio = 1_000_000) {
  let t = inicio;
  let siguiente = 0;
  const pendientes = new Map<number, { en: number; fn: () => void }>();
  return {
    ahora: () => t,
    programar: (fn: () => void, ms: number) => {
      const id = siguiente++;
      pendientes.set(id, { en: t + ms, fn });
      return { cancelar: () => { pendientes.delete(id); } };
    },
    avanzar: (ms: number) => {
      t += ms;
      const vencidos = [...pendientes.entries()]
        .filter(([, p]) => p.en <= t)
        .sort((a, b) => a[1].en - b[1].en);
      for (const [id, p] of vencidos) { pendientes.delete(id); p.fn(); }
    },
  };
}

/**
 * El almacen listo para probar.
 *
 * **La ventana de agrupacion arranca en cero** para que los tests que miran el
 * etiquetado no tengan que pensar en ella: con cero, un `avanzar(0)` alcanza
 * para que el aviso salga. Los que prueban la agrupacion la piden explicita.
 */
function nuevoStore(reloj = relojFalso(), ventanaAgrupacionMs = 0) {
  const store = new ConfirmedStateStore({
    ahora: reloj.ahora, programar: reloj.programar, ventanaAgrupacionMs,
  });
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
  store.confirmarPropia('i.3.mix', 0.7);

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
// **Estos tests estuvieron verdes un mes probando algo que no pasa.** Construian
// la linea con `codificarSetd`, o sea `SETD^var.currentSnapshot^3`, y la consola
// manda `SETS^var.currentSnapshot^<nombre>`. La rama funcionaba con la forma
// inventada y era inalcanzable con la real. Lo destapo ejecutar un LOADSNAPSHOT
// contra el aparato el 2026-09-10 y ver la causa salir DESCONOCIDA.
//
// Ahora usan `codificarSets`. Un test que fabrica su propia entrada solo prueba
// lo que el que lo escribio creia del protocolo.
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

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));

  assert.equal(rafagas.length, 1, 'una sola ruta, pero es la que cuenta');
  assert.equal(store.storeState, 'INVALID');
});

test('INV-021: un recall chico se detecta igual que uno grande', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
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
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Prueba asistente'));
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
  assert.equal(rafagas[0]?.probableCausa, 'GRUPO_DE_CANALES',
    'doce canales, un solo parametro: un grupo movido a la vez. NO es un arrastre: eso es una sola ruta muchas veces');
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

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  reloj.avanzar(100);
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  assert.equal(rafagas.length, 1);

  reloj.avanzar(2000);
  // **Esta linea se habia quedado en `codificarSetd` cuando se corrigieron las
  // otras tres.** Entraba por el camino generico `aplicar()` --guardando una
  // entrada numerica para una clave de texto-- en vez de por la rama de la
  // instantanea. La unica asercion que prueba que la ventana de silencio de
  // INV-021 se reabre lo hacia por el camino equivocado. Lo encontro una
  // auditoria, no yo.
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Otra distinta'));
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
  assert.equal(rafagas[0]?.probableCausa, 'GRUPO_DE_CANALES', 'con lo visto hasta acá, eso parecía');

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Prueba asistente'));
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
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Prueba asistente'));
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  assert.equal(rafagas.length, 2);
});

test('INV-021: el estado invalido vuelve a ser valido con la relectura', () => {
  // La invariante dice "store INVALID hasta re-lectura". La primera mitad
  // estaba; la segunda no existia, y el estado se quedaba invalido para
  // siempre: la unica salida era desconectar y volver a conectar a mano.
  const { store } = nuevoStore();
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
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

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  assert.equal(rafagas.length, 1);

  store.volcadoIniciado();
  for (let canal = 1; canal <= 24; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.5));
  }
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
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
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
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

// --- Un arrastre ajeno se agrupa en un solo aviso ---------------------------
//
// EL DANO QUE ESTO EVITA ES CONCRETO. Cada cambio externo va al registro y a la
// lista de «ultimos veinte cambios» de la aplicacion. Un arrastre de fader desde
// otro dispositivo produce del orden de veinte lineas --medido contra la consola
// el 2026-09-10: de 40 escrituras cada 15 ms difunde 20-- y con eso UNA SOLA
// PASADA DE FADER AJENA BORRA TODO EL HISTORIAL RECIENTE, que es justo lo que el
// operador iba a mirar para entender que paso.

test('veinte lineas de un arrastre dan UN aviso, con el valor final', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  const vistos: { path: string; valor: number }[] = [];
  store.alCambioExterno((path, valor) => vistos.push({ path, valor }));

  // El ritmo es el de la consola: un tic de ~34 ms.
  for (let i = 0; i < 20; i++) {
    store.procesarLinea(codificarSetd('i.4.mix', 0.30 + i * 0.01));
    reloj.avanzar(34);
  }
  // `assert.equal` sobre la longitud y no `deepEqual` contra `[]`: lo segundo
  // hace que TypeScript estreche el array a `never` y las lineas siguientes
  // dejen de compilar.
  assert.equal(vistos.length, 0, 'mientras el gesto sigue, no se avisa nada');

  reloj.avanzar(250);
  assert.equal(vistos.length, 1, 'un gesto, un aviso');
  assert.ok(Math.abs(vistos[0]!.valor - 0.49) < 1e-9,
    'y con el valor DONDE QUEDO el fader, no donde arranco: el primero es el que ya no esta');
});

test('la ventana tiene que ser mayor que el tic de la consola', () => {
  // Durante un arrastre las lineas llegan cada ~34 ms. Con una ventana mas
  // chica que eso el gesto se partiria en pedazos y volveriamos al problema.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 20);   // demasiado chica a proposito
  const vistos: number[] = [];
  store.alCambioExterno((_p, v) => vistos.push(v));

  for (let i = 0; i < 5; i++) {
    store.procesarLinea(codificarSetd('i.4.mix', 0.30 + i * 0.01));
    reloj.avanzar(34);
  }
  assert.ok(vistos.length > 1,
    'con la ventana por debajo del tic, el gesto se parte: por eso el valor real es 250');
});

test('dos rutas distintas en el mismo gesto dan un aviso cada una', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  const vistos: string[] = [];
  store.alCambioExterno((path) => vistos.push(path));

  store.procesarLinea(codificarSetd('i.4.mix', 0.3));
  store.procesarLinea(codificarSetd('i.5.mix', 0.4));
  reloj.avanzar(300);

  assert.deepEqual([...vistos].sort(), ['i.4.mix', 'i.5.mix'],
    'agrupar es por ruta: dos faders movidos a la vez son dos cambios, no uno');
});

test('un movimiento deliberado cada medio segundo cuenta como cambios distintos', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  const vistos: number[] = [];
  store.alCambioExterno((_p, v) => vistos.push(v));

  store.procesarLinea(codificarSetd('i.4.mix', 0.3));
  reloj.avanzar(500);
  store.procesarLinea(codificarSetd('i.4.mix', 0.4));
  reloj.avanzar(500);

  assert.deepEqual(vistos, [0.3, 0.4],
    'agrupar un gesto no puede tragarse dos decisiones separadas del operador');
});

test('agrupar no toca la deteccion de avalancha, que cuenta rutas distintas', () => {
  // La avalancha invalida el estado (INV-021) y se decide por RUTAS DISTINTAS.
  // Un arrastre es una sola ruta: no es una avalancha y no tiene que invalidar
  // nada, por mas lineas que mande.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let i = 0; i < 30; i++) {
    store.procesarLinea(codificarSetd('i.4.mix', 0.30 + i * 0.005));
    reloj.avanzar(10);
  }
  assert.deepEqual(rafagas, [], 'un gesto sobre un fader no es una avalancha');
  assert.equal(store.storeState, 'VALID', 'y no puede invalidar el estado');
});

test('lo que la agrupacion cuesta, fijado para que no sorprenda', () => {
  // Dos cambios sobre la misma ruta separados por MENOS que la ventana se
  // avisan como uno. Este test existe para que ese costo sea una decision
  // escrita y no un descubrimiento: se rompio el criterio 1 de SPK-P0.9 --100
  // cambios espaciados 120 ms daban 1 aviso-- y asi se encontro.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  const vistos: number[] = [];
  store.alCambioExterno((_p, v) => vistos.push(v));

  store.procesarLinea(codificarSetd('i.4.mix', 0.3));
  reloj.avanzar(120);
  store.procesarLinea(codificarSetd('i.4.mix', 0.4));
  reloj.avanzar(300);

  assert.deepEqual(vistos, [0.4], 'uno solo, con el ultimo valor');
});

test('agrupar NO retrasa lo que el estado confirmado sabe', () => {
  // Es la mitad que importa para la seguridad. La comprobacion de INV-011
  // --¿el valor sigue siendo el que creo?-- lee del estado, no del aviso. Si
  // agrupar retrasara tambien el estado, una escritura nuestra podria pisar un
  // cambio ajeno que todavia no «existe».
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj, 250);
  store.alCambioExterno(() => {});

  store.procesarLinea(codificarSetd('i.4.mix', 0.42));
  assert.equal(store.leer('i.4.mix')?.valor, 0.42,
    'el estado se actualiza con la linea, sin esperar a que el gesto termine');
  assert.equal(store.coincideConEsperado('i.4.mix', 0.30).coincide, false,
    'y por eso una escritura contra el valor viejo da conflicto en el acto');
});

// --- Presencia inferida del trafico ajeno ----------------------------------
//
// La consola NO publica presencia: medido el 2026-09-10, tres ciclos de un
// cliente entrando y saliendo dieron cero lineas difundidas y ninguna clave
// movida. Lo unico que la consola cuenta es quien TOCA algo, asi que se infiere
// de ahi. El limite --que no ve al que solo mira-- es parte del disenio y esta
// dicho en `PresenciaAjena`.

test('sin cambios ajenos no hay de donde inferir presencia', () => {
  const { store } = nuevoStore();
  assert.equal(store.desdeElUltimoAjenoMs(), null);
});

test('un cambio ajeno deja marca, y la marca envejece con el reloj', () => {
  const { store, reloj } = nuevoStore();
  store.procesarLinea(codificarSetd('i.1.mix', 0.5));
  assert.equal(store.desdeElUltimoAjenoMs(), 0);

  reloj.avanzar(12_000);
  assert.equal(store.desdeElUltimoAjenoMs(), 12_000);
});

test('el volcado inicial no cuenta como otro operador', () => {
  // Al conectar llegan miles de claves. Si eso contara, la aplicacion
  // arrancaria siempre diciendo que hay alguien mas.
  const { store } = nuevoStore();
  store.volcadoIniciado();
  for (let canal = 1; canal <= 20; canal++) {
    store.procesarLinea(codificarSetd(`i.${canal}.mix`, 0.4));
  }
  store.volcadoCompletoRecibido();

  assert.equal(store.desdeElUltimoAjenoMs(), null);
});

test('un recall tambien cuenta como alguien tocando', () => {
  // Llega como SETS y no como parametro, pero es una persona operando.
  const { store } = nuevoStore();
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  assert.equal(store.desdeElUltimoAjenoMs(), 0);
});

test('nuestra propia escritura confirmada no inventa un operador ajeno', () => {
  // `confirmarPropia` es el camino del testigo. Si dejara marca, la aplicacion
  // se veria a si misma cada vez que escribe.
  const { store } = nuevoStore();
  store.confirmarPropia('i.1.mix', 0.6);
  assert.equal(store.desdeElUltimoAjenoMs(), null);
});

// --- El eco del puntero de instantanea, que es NUESTRO --------------------
//
// Medido el 2026-09-10 con una sola conexion: `SAVESNAPSHOT` y a los 172 ms la
// consola devuelve `SETS^var.currentSnapshot^<nombre>` POR ESA MISMA CONEXION.
// No contradice lo del 2026-09-08 --que no devuelve un SETD de parametro a su
// autor--: es el efecto colateral de un comando, y nadie lo habia probado.
//
// Importa porque la aplicacion guarda una instantanea ANTES DE CADA ESCRITURA
// por INV-001. Sin esto, el arreglo de INV-021 la invalidaria en cada una.

test('el eco de nuestro propio guardado no invalida ni inventa un operador', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.registrarPunteroPropio('VSE_AUTO_123');
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'VSE_AUTO_123'));

  assert.equal(rafagas.length, 0, 'guardar nosotros no es una avalancha');
  assert.equal(store.storeState, 'VALID');
  assert.equal(store.desdeElUltimoAjenoMs(), null, 'ni un operador ajeno inventado');
});

test('un recall ajeno sigue invalidando aunque hayamos guardado antes', () => {
  // El caso que importa: que el arreglo no se coma tambien lo que si es ajeno.
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.registrarPunteroPropio('VSE_AUTO_123');
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'VSE_AUTO_123'));
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));

  assert.equal(rafagas.length, 1);
  assert.equal(rafagas[0]?.probableCausa, 'SNAPSHOT_RECALL');
  assert.equal(store.storeState, 'INVALID');
});

test('el eco propio se consume una sola vez', () => {
  // Si no se consumiera, un recall ajeno al MISMO nombre pasaria inadvertido
  // para siempre.
  const { store, reloj } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  //
  // **La primera version contaba alertas y fallaba con razon**: la segunda caia
  // dentro de la ventana de silencio de la avalancha, que existe para no abrir
  // un cartel por cada trama del mismo recall. Contar carteles mide el
  // antirrebote, no el consumo. Lo que hay que mirar es la invalidacion, que va
  // siempre.
  store.registrarPunteroPropio('VSE_AUTO_123');
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'VSE_AUTO_123'));
  assert.equal(store.storeState, 'VALID', 'el eco propio no invalida');

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Otra'));
  assert.equal(store.storeState, 'INVALID');

  reloj.avanzar(2000);
  store.volcadoIniciado();
  store.volcadoCompletoRecibido();
  assert.equal(store.storeState, 'VALID', 'releido');

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'VSE_AUTO_123'));
  assert.equal(store.storeState, 'INVALID', 'el segundo VSE_AUTO_123 ya no es nuestro');
});

test('el mismo puntero repetido no invalida: no es un cambio', () => {
  const { store } = nuevoStore();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));

  assert.equal(rafagas.length, 1, 'el segundo es el mismo valor');
});

test('si el eco tarda mas que la ventana, se lo trata como ajeno', () => {
  // Errar por exceso acá pierde un aviso; errar por defecto bloquea la
  // aplicacion entera. La ventana es holgada a proposito, pero no infinita.
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({
    ahora: reloj.ahora, programar: reloj.programar, ventanaPunteroPropioMs: 1000,
  });
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.registrarPunteroPropio('VSE_AUTO_123');
  reloj.avanzar(2000);
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'VSE_AUTO_123'));

  assert.equal(rafagas.length, 1);
});
