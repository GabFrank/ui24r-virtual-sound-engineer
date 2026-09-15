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
  //
  // **Se cuentan las APERTURAS, no todos los eventos.** Cada avalancha emite
  // dos: una al cruzar el umbral, con el numero corto, y otra al cerrarse la
  // ventana, con el total. Lo que esta prueba mira es que no se abra una alerta
  // por trama, y eso son las primeras.
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const todas: BulkExternalChange[] = [];
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => { todas.push(e); if (!e.definitivo) rafagas.push(e); });

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
  assert.equal(
    todas.filter((e) => e.definitivo).length, 1,
    'y la primera avalancha cerro con su total cuando vencio la ventana',
  );
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

/**
 * **El aviso mostraba nuestra constante, no el tamaño de la avalancha.**
 *
 * Medido contra la consola el 2026-09-10: se escribieron dieciseis rutas y la
 * pantalla dijo diez -- las diez vueltas exactas del umbral. El aviso sale en
 * el instante de cruzarlo, y lo que llega despues cae en la ventana de silencio
 * sin actualizar la cuenta. El operador leia el valor de una constante nuestra
 * creyendo que era una medicion de su consola.
 *
 * No se arreglo retrasando el aviso: enterarse tarde de que el estado dejo de
 * ser valido es peor que enterarse con un numero corto. Sale uno en el acto,
 * que dice «al menos», y otro al cerrarse la ventana, con el total.
 */
test('la avalancha informa su tamaño real, no el umbral', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  // Dieciseis rutas distintas, como en la medicion.
  for (let i = 0; i < 16; i++) {
    store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
    reloj.avanzar(5);
  }

  const primera = rafagas.filter((e) => !e.definitivo);
  assert.equal(primera.length, 1, 'una sola apertura para una sola avalancha');
  // **El numero corto sigue siendo el umbral, y esta bien que lo sea**: es lo
  // que se sabe en ese instante. Lo que cambia es que ahora se dice.
  assert.equal(primera[0]!.rutasAfectadas, 10, 'al cruzar el umbral se sabe eso y nada mas');
  assert.equal(primera[0]!.definitivo, false, 'y el evento lo declara');

  reloj.avanzar(1200);
  const cierre = rafagas.filter((e) => e.definitivo);
  assert.equal(cierre.length, 1, 'la ventana cierra con un solo aviso');
  assert.equal(cierre[0]!.rutasAfectadas, 16, 'y ese si es el tamaño de verdad');
});

/**
 * **Control positivo.** El test de arriba afirma que el cierre trae 16; sin
 * esto no distingue «se conto bien» de «se conto lo mismo que siempre». Con
 * cuatro rutas sobre el umbral, el total tiene que ser 14 y no 16.
 */
test('control positivo: el total sigue al tamaño, no a un numero fijo', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let i = 0; i < 14; i++) {
    store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
    reloj.avanzar(5);
  }
  reloj.avanzar(1200);
  const cierre = rafagas.filter((e) => e.definitivo);
  assert.equal(cierre.length, 1);
  assert.equal(cierre[0]!.rutasAfectadas, 14);
});

/**
 * **Una avalancha que se estira mas alla de la ventana no pierde su principio.**
 *
 * El total NO se cuenta sobre `cambiosRecientes`, que se poda a la ventana
 * contada desde el ULTIMO cambio: en una avalancha larga eso descartaria las
 * primeras rutas justo cuando hay que decir el total. Se acumula aparte.
 */
test('el total de una avalancha larga no pierde las primeras rutas', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  // Veinte rutas repartidas a lo largo de mas de una ventana entera.
  for (let i = 0; i < 20; i++) {
    store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
    reloj.avanzar(60);
  }
  reloj.avanzar(1200);
  const cierre = rafagas.filter((e) => e.definitivo);
  assert.equal(cierre.length, 1);
  assert.equal(
    cierre[0]!.rutasAfectadas, 20,
    'las primeras rutas cuentan aunque la poda por ventana ya no las tenga',
  );
});

// --- Los cuatro agujeros del conteo, que midio una auditoria ----------------

/**
 * **El agujero grave, y lo introdujo el propio arreglo del tamaño.**
 *
 * El aviso de cierre no se cancelaba nunca salvo al abrir otra avalancha, asi
 * que llegaba DESPUES de que el usuario releyera. La aplicacion lo toma como
 * nuevo: vuelve a poner el cartel y vuelve a invalidar el estado. El operador
 * toca «Releer», el cartel se va, y hasta un segundo despues reaparece solo con
 * las escrituras bloqueadas otra vez.
 */
test('releer mata el aviso de cierre pendiente', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let i = 0; i < 10; i++) { store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3)); }
  assert.equal(rafagas.length, 1, 'la apertura si sale');
  assert.equal(store.storeState, 'INVALID');

  // El usuario relee y la consola contesta.
  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.0.mix', 0.5));
  store.volcadoCompletoRecibido();
  assert.equal(store.storeState, 'VALID', 'la relectura devolvio el estado');

  reloj.avanzar(1500);
  assert.equal(
    rafagas.length, 1,
    'el cierre de una avalancha que el usuario ya releyo no puede volver a hablar',
  );
  assert.equal(store.storeState, 'VALID', 'ni volver a invalidar lo que se releyo');
});

/**
 * **Control positivo.** El test de arriba afirma que algo NO llega, y una
 * asercion asi no distingue «se cancelo» de «nunca se armo».
 */
test('control positivo: sin releer, el cierre si llega', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));
  for (let i = 0; i < 10; i++) { store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3)); }
  reloj.avanzar(1500);
  assert.equal(rafagas.length, 2, 'apertura y cierre');
  assert.equal(rafagas[1]!.definitivo, true);
});

/**
 * **Dos avalanchas seguidas contaban las mismas rutas dos veces.**
 *
 * `enRafagaHastaMs` se fija al abrir y nunca se extiende, pero la lista de
 * cambios recientes se poda por ventana contada desde el ULTIMO cambio: al
 * vencer una avalancha sus rutas seguian ahi, y un solo cambio ajeno nuevo
 * abria otra que se las llevaba puestas.
 */
test('una avalancha no recuenta las rutas de la anterior', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  // **Espaciadas 90 ms, y el numero importa.** Con las veinte rutas juntas, la
  // poda por ventana se las lleva sola antes del cambio siguiente y el defecto
  // no se alcanza: el primer intento de este test pasaba con el defecto puesto
  // por esa razon. A 90 ms la ráfaga dura mas que la ventana de poda, asi que
  // al cerrar quedan diez rutas vivas listas para recontarse.
  for (let i = 0; i < 20; i++) {
    store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
    reloj.avanzar(90);
  }
  // **La ventana se abrio en la ruta diez, t = 810, y cierra exacto en 1810.**
  // El instante importa y hubo que buscarlo: con el cierre mas tarde, la poda
  // por ventana se lleva sola las rutas viejas y el defecto no se alcanza. El
  // primer intento de este test avanzaba 200 ms y pasaba con el defecto puesto.
  reloj.avanzar(10);
  const cierre = rafagas.filter((e) => e.definitivo);
  assert.equal(cierre.length, 1, 'la primera cerro');
  assert.equal(cierre[0]!.rutasAfectadas, 20, 'con sus veinte');

  // UN solo cambio ajeno nuevo. No es una avalancha, y no puede anunciarse como
  // once rutas de las que diez ya se contaron.
  rafagas.length = 0;
  store.procesarLinea(codificarSetd('i.20.mix', 0.4));
  reloj.avanzar(1500);
  // Con el defecto puesto, esto emite DOS eventos de doce rutas, once de ellas
  // ya contadas en la ráfaga anterior. Medido.
  assert.deepEqual(
    rafagas, [],
    'un cambio suelto no es una avalancha: las de la ráfaga cerrada ya se contaron',
  );
});

/**
 * **Una avalancha pegada a la otra se comia el cierre de la primera.**
 *
 * Antes se CANCELABA el cierre pendiente al abrir la siguiente, asi que el
 * total de la primera no se decia nunca y la pantalla quedaba en «al menos N».
 * Ahora se emite antes de instalar la nueva.
 */
test('abrir una avalancha nueva no se come el total de la anterior', () => {
  // **Un reloj que avanza SIN disparar los temporizadores.** Hace falta para
  // montar el orden exacto del defecto: una linea que se procesa despues del
  // vencimiento y ANTES de que el temporizador corra. En Node ese orden es
  // perfectamente posible --el temporizador esta en la cola de macrotareas y la
  // linea llega por el socket-- y con el reloj normal no se puede escribir,
  // porque dispara al avanzar.
  let t = 0;
  const dormidos: { en: number; fn: () => void }[] = [];
  const store = new ConfirmedStateStore({
    ahora: () => t,
    programar: (fn, ms) => {
      const p = { en: t + ms, fn };
      dormidos.push(p);
      return { cancelar: () => { const i = dormidos.indexOf(p); if (i >= 0) dormidos.splice(i, 1); } };
    },
    ventanaAgrupacionMs: 0,
  });
  store.volcadoCompletoRecibido();
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let i = 0; i < 12; i++) { store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3)); }
  assert.equal(rafagas.filter((e) => !e.definitivo).length, 1, 'la primera abrio');

  // Pasa la ventana, el temporizador NO corrio todavia, y llegan las de la
  // segunda avalancha: doce rutas nuevas, ninguna repetida.
  t = 1001;
  for (let i = 0; i < 12; i++) { store.procesarLinea(codificarSetd(`a.${i % 10}.mix`, 0.7)); }

  const cierres = rafagas.filter((e) => e.definitivo);
  assert.equal(cierres.length, 1, 'el total de la primera se dijo igual, no se descarto');
  assert.equal(cierres[0]!.rutasAfectadas, 12, 'y es el suyo, no el de la segunda');
  assert.equal(dormidos.length, 1, 'y queda armado el cierre de la segunda, uno solo');
});

/**
 * **La causa y la ventana sobrevivian a la relectura y tapaban un recall nuevo.**
 *
 * Un recall, el usuario relee, y otro recall DISTINTO dentro de la ventana
 * vieja: la guarda de ventana lo tomaba por el mismo y no avisaba nada. El
 * estado se invalidaba en silencio.
 */
test('un recall nuevo despues de releer si se avisa', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  assert.equal(rafagas.length, 1);

  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.0.mix', 0.5));
  store.volcadoCompletoRecibido();
  assert.equal(store.storeState, 'VALID');

  reloj.avanzar(100);   // todavia dentro de la ventana de la avalancha vieja
  rafagas.length = 0;
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Otra distinta'));
  assert.equal(
    rafagas.length, 1,
    'un recall ajeno posterior a la relectura tiene que avisar, no caer en la ventana vieja',
  );
  assert.equal(store.storeState, 'INVALID');
});

// --- Lo que quedo abierto del conteo, medido por una auditoria --------------

/** Un reloj que avanza SIN disparar temporizadores, y los dispara a pedido. */
function relojManual() {
  let t = 0;
  const dormidos: { en: number; fn: () => void }[] = [];
  return {
    ahora: () => t,
    programar: (fn: () => void, ms: number) => {
      const p = { en: t + ms, fn };
      dormidos.push(p);
      return { cancelar: () => { const i = dormidos.indexOf(p); if (i >= 0) dormidos.splice(i, 1); } };
    },
    poner: (v: number) => { t = v; },
    correr: () => {
      for (const p of [...dormidos].sort((a, b) => a.en - b.en)) {
        if (p.en <= t) { dormidos.splice(dormidos.indexOf(p), 1); p.fn(); }
      }
    },
  };
}
function storeManual(r: ReturnType<typeof relojManual>) {
  const store = new ConfirmedStateStore({
    ahora: r.ahora, programar: r.programar, ventanaAgrupacionMs: 0,
  });
  store.volcadoCompletoRecibido();
  const ev: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => ev.push(e));
  return { store, ev };
}

/**
 * **El recuento repetido seguia vivo a UN MILISEGUNDO de donde miraba su test.**
 *
 * El test anterior usaba `t = 1001`, justo donde la poda por ventana se lleva
 * las rutas viejas sola. Con la linea llegando en `t == enRafagaHastaMs`
 * EXACTO --y el temporizador todavia sin correr, un orden perfectamente
 * posible-- el cierre decia 12 y el cambio siguiente, UNO SOLO, se anunciaba
 * como 13 y con causa GRUPO_DE_CANALES. Lo midio una auditoria.
 */
test('un cambio suelto justo en el vencimiento no recuenta la rafaga anterior', () => {
  const r = relojManual();
  const { store, ev } = storeManual(r);
  for (let i = 0; i < 12; i++) store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));

  r.poner(1000);   // el vencimiento exacto, sin correr el temporizador
  store.procesarLinea(codificarSetd('a.0.mix', 0.7));

  const cierres = ev.filter((e) => e.definitivo);
  assert.equal(cierres.length, 1, 'la primera cerro');
  assert.equal(cierres[0]!.rutasAfectadas, 12, 'con sus doce, ni una mas');
  assert.equal(
    ev.filter((e) => !e.definitivo).length, 1,
    'un cambio suelto no abre una alerta nueva: no es una avalancha',
  );
});

/**
 * **Vaciar la lista al cerrar tapaba una avalancha real posterior.**
 *
 * La lista de cambios recientes contesta DOS preguntas: si hay avalancha y de
 * que tamaño. Vaciarla al cerrar quitaba las dos de un saque. Ahora las
 * ocurrencias se marcan como contadas en vez de borrarse -- marcar y no
 * comparar por reloj, porque una linea que llega en el mismo milisegundo del
 * cierre no se puede ordenar contra el.
 */
test('una avalancha nueva DESPUES de un cierre sigue detectandose', () => {
  const r = relojManual();
  const { store, ev } = storeManual(r);
  for (let i = 0; i < 12; i++) store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
  r.poner(1200); r.correr();
  ev.length = 0;

  for (let i = 0; i < 11; i++) {
    store.procesarLinea(codificarSetd(`a.${i}.mix`, 0.5));
    r.poner(r.ahora() + 10);
  }
  r.poner(r.ahora() + 1200); r.correr();

  assert.equal(ev.filter((e) => !e.definitivo).length, 1, 'once rutas nuevas SI son una avalancha');
  const cierre = ev.find((e) => e.definitivo);
  assert.equal(cierre?.rutasAfectadas, 11, 'y su total son las once nuevas, sin las doce viejas');
});

/**
 * **Control positivo del de arriba**: lo que NO llega al umbral por su cuenta
 * no abre alerta nueva. Sin esto, el test anterior no distingue «detecta lo
 * nuevo» de «alerta por cualquier cosa».
 */
test('control positivo: lo que no llega al umbral no abre alerta nueva', () => {
  const r = relojManual();
  const { store, ev } = storeManual(r);
  for (let i = 0; i < 12; i++) store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
  r.poner(1200); r.correr();
  ev.length = 0;

  for (let i = 0; i < 9; i++) {
    store.procesarLinea(codificarSetd(`a.${i}.mix`, 0.5));
    r.poner(r.ahora() + 10);
  }
  assert.deepEqual(ev, [], 'nueve rutas no son una avalancha, y el estado ya estaba invalido');
  assert.equal(store.storeState, 'INVALID', 'pero el estado sigue invalido, que es lo que importa');
});

/**
 * **`olvidarRafaga()` se escribio para el aviso de rafaga y dejo afuera al
 * vecino.** El aviso por ruta usa su propio temporizador: un cambio agrupado
 * sobrevivia a la relectura y disparaba 300 ms despues, hablando de un estado
 * que el usuario ya releyo. Es el mismo defecto, sin arreglar para el de al
 * lado.
 */
test('releer tambien se lleva los avisos de cambio externo pendientes', () => {
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({
    ahora: reloj.ahora, programar: reloj.programar, ventanaAgrupacionMs: 250,
  });
  store.volcadoCompletoRecibido();
  const vistos: string[] = [];
  store.alCambioExterno((p) => vistos.push(p));

  store.procesarLinea(codificarSetd('i.3.mix', 0.7));
  reloj.avanzar(50);
  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.0.mix', 0.5));
  store.volcadoCompletoRecibido();

  reloj.avanzar(400);
  assert.deepEqual(vistos, [], 'un aviso de antes de releer no puede hablar despues');
});

/** Control positivo: sin releer, ese mismo aviso SI llega. */
test('control positivo: sin releer, el aviso agrupado si llega', () => {
  const reloj = relojFalso();
  const store = new ConfirmedStateStore({
    ahora: reloj.ahora, programar: reloj.programar, ventanaAgrupacionMs: 250,
  });
  store.volcadoCompletoRecibido();
  const vistos: string[] = [];
  store.alCambioExterno((p) => vistos.push(p));

  store.procesarLinea(codificarSetd('i.3.mix', 0.7));
  reloj.avanzar(400);
  assert.deepEqual(vistos, ['i.3.mix']);
});

/**
 * **Las dos mitades del arreglo de la relectura, cada una con su test.**
 *
 * `olvidarRafaga()` limpia la ventana Y la causa. Una auditoria midio que
 * revertir CUALQUIERA de las dos por separado dejaba la suite en verde: se
 * tapaban mutuamente, y el unico test que las cubria solo caia si se revertian
 * las dos. «Comprobado revirtiendo el arreglo» no valia para este.
 */
test('releer limpia la VENTANA: una avalancha dentro de la vieja si avisa', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));

  for (let i = 0; i < 12; i++) store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));
  assert.equal(rafagas.length, 1);

  store.volcadoIniciado();
  store.procesarLinea(codificarSetd('i.0.mix', 0.5));
  store.volcadoCompletoRecibido();

  // **Una avalancha de PARAMETROS, no un recall, y el detalle es el punto.**
  // Con el puntero de por medio, la rama de correccion de causa avisa igual y
  // el test no separa nada: la version anterior de esta prueba usaba un recall
  // y pasaba en verde con la ventana sin limpiar. Sin puntero, si la ventana
  // vieja sigue en pie esto cae en la rama de «misma avalancha» y se calla.
  reloj.avanzar(100);
  rafagas.length = 0;
  for (let i = 0; i < 12; i++) store.procesarLinea(codificarSetd(`a.${i % 10}.mix`, 0.7));
  assert.equal(
    rafagas.length, 1,
    'si la ventana no se limpia al releer, esta avalancha cae en la vieja y no avisa',
  );
});

/**
 * **Y de la otra mitad hay que decir que NO tiene test, y por que.**
 *
 * `olvidarRafaga()` tambien pone `causaAvisada` en null. Una auditoria midio
 * que revertir esa linea sola deja la suite entera en verde, y buscando el
 * escenario que la separe no aparece ninguno: todo camino que vuelve a abrir
 * una rafaga recalcula la causa antes de usarla, y `cerrarLaRafagaEnCurso()`
 * retorna sin emitir cuando la rafaga esta vacia, que es como queda despues de
 * olvidarla.
 *
 * O sea que limpiar la causa es **defensa por si acaso**, no una correccion con
 * consecuencia observable. Queda escrito asi en vez de inventarle una prueba:
 * un test que no distingue el arreglo de su ausencia no cubre nada, solo lo
 * aparenta. Si algun dia aparece el camino que la lee antes de recalcularla,
 * este parrafo es la deuda que hay que pagar.
 */
test('releer deja la causa en null, aunque hoy nadie la lea antes de recalcularla', () => {
  const reloj = relojFalso();
  const { store } = nuevoStore(reloj);
  store.procesarLinea(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche'));
  store.volcadoIniciado();
  store.volcadoCompletoRecibido();

  // Lo unico comprobable desde afuera: despues de olvidar la rafaga, cerrar no
  // emite nada -- ni con la causa vieja ni sin ella.
  const rafagas: BulkExternalChange[] = [];
  store.alCambioMasivo((e) => rafagas.push(e));
  reloj.avanzar(2000);
  assert.deepEqual(rafagas, [], 'una rafaga olvidada no habla despues, con causa o sin ella');
});

/**
 * **Cerrar al principio del metodo, y no al final: el test que faltaba.**
 *
 * Una auditoria midio que revertir esta linea NO hacia fallar ningun test, y el
 * commit que la introdujo declaraba dos. Tiene consecuencia observable y nadie
 * la cubria: si el cierre se hace DESPUES de anotar la linea nueva, esa linea
 * queda dentro de la rafaga que se cierra, y la rafaga siguiente la cuenta otra
 * vez. Medido: 10 contra 11.
 */
test('la rafaga nueva no recuenta la linea que disparo el cierre', () => {
  const r = relojManual();
  const { store, ev } = storeManual(r);
  for (let i = 0; i < 10; i++) store.procesarLinea(codificarSetd(`i.${i}.mix`, 0.3));

  // Justo en el vencimiento, sin correr el temporizador: diez rutas NUEVAS.
  r.poner(1000);
  for (let i = 0; i < 10; i++) store.procesarLinea(codificarSetd(`a.${i}.mix`, 0.7));

  const aperturas = ev.filter((e) => !e.definitivo);
  assert.equal(aperturas.length, 2, 'la primera y la segunda avalancha');
  assert.equal(
    aperturas[1]!.rutasAfectadas, 10,
    'diez rutas nuevas son diez: con el cierre al final, la que lo disparo se cuenta dos veces',
  );
});
