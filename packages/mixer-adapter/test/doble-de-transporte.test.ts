import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd, codificarSets, MENSAJE_ALIVE } from '../src/protocol.ts';
import { SHOW_DE_LA_APLICACION } from '../src/instantaneas.ts';
import { RUTA_INSTANTANEA_ACTIVA } from '../src/confirmed-store.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Lo que el doble de transporte NO podia probar hasta el 2026-09-10.
 *
 * `TransporteFalso` admitia **un solo oyente**: `alRecibir` hacia
 * `this.recibir = cb` y el desuscriptor lo ponia en `null`. El transporte real
 * hace `push`/`filter` sobre una lista.
 *
 * Con eso, `pedirLista()` --que se suscribe para esperar el `SNAPSHOTLIST`--
 * BORRABA el `procesar` del adaptador, y al terminar lo dejaba MUDO. Durante y
 * despues de cada `guardarInstantanea()`, el adaptador de los tests no
 * procesaba nada. Los tests pasaban porque casi todos miran `enviadas`.
 *
 * Y eso hizo estructuralmente intestable el defecto mas caro de la jornada: la
 * consola le devuelve al que guardo el cambio de `var.currentSnapshot` --medido
 * contra el aparato, vuelve a los 172 ms-- y el escenario «llega el eco
 * mientras guardamos» no se podia montar, porque el doble se desenchufaba justo
 * en esa ventana. Hubo que preguntarle al aparato.
 *
 * Estos tests existen para que la proxima vez no haga falta.
 */

/**
 * Adaptador con cierre garantizado.
 *
 * **El `finally` no es cortesia.** El adaptador deja un temporizador vigilando
 * la cadencia del analizador; si una asercion falla antes de cerrarlo, el
 * proceso de pruebas **se cuelga** en vez de informar el fallo. Lo dice el
 * comentario de `invalidacion.test.ts` desde hace tiempo, y esta tanda lo volvio
 * a comprobar de la peor manera: la suite entera se quedo muda seis minutos por
 * una asercion mal escrita.
 */
async function conAdaptador(
  opciones: Record<string, unknown>,
  fn: (t: TransporteFalso, a: Ui24rMixerAdapter) => Promise<void>,
): Promise<void> {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t, { quietudVolcadoMs: 30, ...opciones });
  await a.conectar('ws://prueba');
  try { await fn(t, a); } finally { await a.desconectar(); }
}

function listaQueContesta(t: TransporteFalso, nombres: string[]): void {
  const original = t.enviar.bind(t);
  t.enviar = (linea: string) => {
    original(linea);
    if (linea.startsWith('SNAPSHOTLIST^')) {
      setTimeout(
        () => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^${nombres.join('^')}`), 1,
      );
    }
  };
}

test('el adaptador NO queda mudo despues de pedir la lista', async () => {
  // La forma exacta del defecto, en una sola asercion: si pedirLista se lleva
  // puesto al adaptador, esta linea no llega a ningun lado.
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5 }, async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));

    listaQueContesta(t, []);
    await a.guardarInstantanea();

    // El valor de partida es 0.5; si la linea nueva llega, pasa a 0.42. Se
    // compara contra el valor CONCRETO y no contra «distinto de undefined»:
    // una asercion de no-nulidad habria pasado con el campo mal escrito.
    assert.equal(a.leer('i.0.mix').value, 0.5, 'antes de la linea nueva');
    t.entra(codificarSetd('i.0.mix', 0.42));
    assert.equal(
      a.leer('i.0.mix').value, 0.42,
      'despues de guardar, el adaptador tiene que seguir escuchando',
    );
  });
});

test('guardar no deja ni de mas ni de menos oyentes', async () => {
  // **Este test pasaba por vacio y lo encontro una auditoria.** Decia
  // `const antes = t.oyentes` y comparaba contra eso: con el doble viejo, que no
  // tiene el getter, `antes` era `undefined` y la asercion comparaba `undefined`
  // con `undefined`. Verde con el defecto puesto.
  //
  // Es exactamente lo que el archivo de al lado denuncia --una asercion que no
  // distingue «lo hizo bien» de «no llego a ejecutarse»-- cometido en el test
  // escrito para denunciarlo. Ahora se compara contra un numero CONCRETO: el
  // adaptador se suscribe una vez al conectar.
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5 }, async (t, a) => {
    assert.equal(t.oyentes, 1, 'el adaptador se suscribe una sola vez al conectar');
    listaQueContesta(t, []);
    await a.guardarInstantanea();
    assert.equal(
      t.oyentes, 1,
      'la suscripcion de la lista se quita y la del adaptador queda',
    );
  });
});

test('el eco del puntero durante el guardado no invalida el estado', async () => {
  // **El test que antes era imposible de escribir.** La consola devuelve
  // `SETS^var.currentSnapshot^<nombre>` a quien guardo, medido a los 172 ms. Sin
  // distinguirlo, la aplicacion se invalida a si misma en cada escritura,
  // porque INV-001 guarda antes de cada una.
  await conAdaptador({ esperaGuardadoMs: 40, esperaBorradoMs: 5 }, async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(a.leer('i.0.mix').storeState, 'VALID', 'el volcado deja el estado valido');

    // **El eco llega DENTRO de la ventana de `pedirLista`**, que es la version
    // realista: la consola tardo 172 ms medidos en devolver el puntero, mas que
    // la espera del guardado.
    //
    // **Este test pasa igual con el doble viejo, y hay que decirlo.** Afirma que
    // el estado queda VALIDO, y con el doble viejo el adaptador esta mudo, asi
    // que tambien queda valido. Una asercion de que algo NO pasa no distingue
    // «lo ignoro bien» de «nunca llego». Lo que lo salva es su gemelo de abajo,
    // que afirma lo contrario y si falla.
    let guardada: string | null = null;
    const original = t.enviar.bind(t);
    t.enviar = (linea: string) => {
      original(linea);
      if (linea.startsWith('SAVESNAPSHOT^')) guardada = linea.split('^')[2]!;
      if (linea.startsWith('SNAPSHOTLIST^')) {
        // El eco del puntero, mientras la lista todavia no contesto.
        setTimeout(() => t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, guardada!)), 5);
        setTimeout(() => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^`), 20);
      }
    };

    await a.guardarInstantanea();
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(
      a.leer('i.0.mix').storeState, 'VALID',
      'nuestro propio guardado no puede invalidar el estado',
    );
  });
});

test('un recall ajeno durante el guardado SI invalida', async () => {
  // **La contraprueba, y hace mas falta de lo que parece.**
  //
  // El test de arriba afirma que el estado queda VALIDO. Con el doble viejo
  // tambien quedaba valido -- porque el mensaje no llegaba a ningun lado. O sea
  // que esa asercion sola **no distingue «lo ignoro bien» de «nunca llego»**:
  // comprobado revirtiendo el doble, ese test pasa igual con el defecto puesto.
  //
  // Este es el que lo separa, porque afirma lo contrario: si el mensaje no
  // llega, el estado se queda valido y el test falla. Los dos juntos prueban lo
  // que ninguno prueba solo.
  //
  // Es la misma forma que rompio la comprobacion de presencia esta misma
  // jornada: una prueba de que algo NO pasa necesita su gemela que muestre que
  // el camino existe.
  await conAdaptador({ esperaGuardadoMs: 40, esperaBorradoMs: 5 }, async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));

    const original = t.enviar.bind(t);
    t.enviar = (linea: string) => {
      original(linea);
      if (linea.startsWith('SNAPSHOTLIST^')) {
        setTimeout(() => t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Show de anoche')), 5);
        setTimeout(() => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^`), 20);
      }
    };

    await a.guardarInstantanea();
    await new Promise((r) => setTimeout(r, 40));

    assert.equal(
      a.leer('i.0.mix').storeState, 'INVALID',
      'un nombre que no es el nuestro es un recall ajeno',
    );
  });
});

// --- Los cuatro puntos en que el doble seguia apartandose del real -----------
//
// Los encontro una auditoria el 2026-09-11 comparando `TransporteFalso` con
// `WebSocketTransport` linea por linea, no un test. Cada apartamiento es un
// escenario que la suite entera no podia representar: no fallaba, faltaba.

/**
 * **1. El real LANZA con el socket cerrado; el doble aceptaba todo.**
 *
 * `WebSocketTransport.enviar()` arranca con
 * `if (!this.conectado) throw new Error('transporte no conectado')`. El
 * adaptador lo llamaba en nueve lugares sin proteccion, asi que contra la
 * consola `escribir()` --que promete un `WriteResult`-- tiraba una excepcion.
 *
 * El escenario no es raro: es el mas probable de una noche de show. La wifi se
 * carga, el socket muere, `onclose` todavia no llego y la aplicacion se cree
 * conectada. O alguien toca «Desconectar» con una escritura en vuelo, que deja
 * el transporte sin socket antes de que el cierre se propague.
 */
test('escribir con el socket muerto devuelve un resultado, no una excepcion', async () => {
  await conAdaptador({}, async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(a.estadoConexion, 'CONNECTED', 'la aplicacion se cree conectada');

    // El socket murio y nadie aviso todavia: ni `cae()` ni `desconectar()`.
    t.conectado = false;

    const r = await a.escribir('i.0.mix', 0.7, 0.5);
    assert.equal(r.status, 'REJECTED', 'no se aplico, y se puede afirmar');
    assert.equal(r.confirmedBy, 'NONE');
    assert.match(r.motivo ?? '', /no se pudo enviar/);
    assert.equal(a.leer('i.0.mix').value, 0.5, 'el valor viejo sigue siendo el valor');
  });
});

/**
 * **Control positivo del punto 1.** Sin esto, el test de arriba no distingue
 * «el adaptador lo maneja» de «el doble nunca lo provoco»: con el doble
 * permisivo la escritura sale como si nada, que es exactamente el punto ciego
 * que habia. Un doble complaciente da un test en verde sobre un mundo que no
 * existe.
 */
test('control positivo: un doble que acepta todo NO ve el escenario', async () => {
  const t = new TransporteFalso();
  // El doble de antes: enviar() sin comprobar si hay socket.
  t.enviar = (linea: string) => { (t.enviadas as string[]).push(linea); };
  // `timeoutConfirmacionMs` corto a proposito: sin el, este test se come los
  // 500 ms por defecto esperando una confirmacion que no va a llegar nunca, y
  // era el 43% del tiempo del fichero entero.
  const a = new Ui24rMixerAdapter(t, {
    quietudVolcadoMs: 30, esperaGuardadoMs: 5, esperaBorradoMs: 5, timeoutConfirmacionMs: 40,
  });
  await a.conectar('ws://prueba');
  try {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    t.conectado = false;
    const r = await a.escribir('i.0.mix', 0.7, 0.5);
    // **Sale como si nada y se queda esperando al testigo**, que nunca va a ver
    // nada porque nada se mando. O sea que el doble permisivo no solo escondia
    // el fallo: lo disfrazaba del OTRO modo de fallo, el que dice «pudo
    // aplicarse o no». El peor de los dos, porque deja la transaccion en
    // suspenso en vez de decir la verdad, que es que no se aplico nada.
    //
    // **Se afirma que NO es un rechazo, y no cual es exactamente.** Medido, hoy
    // da UNVERIFIED; fijar esa cadena congelaria un arreglo alternativo
    // legitimo --comprobar `conectado` al principio de `escribir()`, antes de
    // pagar una sesion de testigo-- sin decirlo en ningun lado. Lo que este
    // test tiene que sujetar es que el doble permisivo NO PUEDE dar la
    // respuesta afirmativa, no el nombre del sucedaneo.
    assert.notEqual(
      r.status, 'REJECTED',
      'con el doble permisivo la escritura sale igual: el fallo es INVISIBLE',
    );
  } finally { await a.desconectar(); }
});

/**
 * **2. `conectar()` del real dispara los callbacks de apertura.**
 *
 * `WebSocketTransport` los llama en su `onopen`. El doble los guardaba y no los
 * llamaba nunca: el unico camino era `abre()`, que no usaba nadie. O sea que
 * `alAbrir` era codigo muerto **de los dos lados**, y por eso nadie lo noto.
 */
test('conectar avisa a quien se suscribio a la apertura', async () => {
  const t = new TransporteFalso();
  let abierto = 0;
  const quitar = t.alAbrir(() => { abierto++; });
  await t.conectar();
  assert.equal(abierto, 1, 'el real llama a estos callbacks en onopen');
  quitar();
  await t.conectar();
  assert.equal(abierto, 1, 'y el desuscriptor tiene que funcionar');
});

/**
 * **3. El real manda `ALIVE` cada segundo; el doble no manda nada nunca.**
 *
 * Y no es opcional: medido el 2026-09-08, sin `ALIVE` la consola deja de
 * emitir. Siete aserciones de la suite decian `enviadas` vacio, que contra la
 * consola **no es cierto ni un segundo**.
 *
 * El doble no late solo a proposito --meteria el reloj en cada test-- pero
 * ahora se le puede meter un latido, y lo que esas siete aserciones miran es
 * `enviadasSinLatido`, que sigue significando lo mismo en los dos mundos.
 */
test('el latido no puede romper las aserciones de «no mando nada»', () => {
  const t = new TransporteFalso();
  t.conectado = true;
  t.latir();
  t.latir();

  assert.deepEqual(t.enviadas, [MENSAJE_ALIVE, MENSAJE_ALIVE],
    'contra la consola el socket NUNCA esta mudo');
  assert.deepEqual(t.enviadasSinLatido, [],
    'y «no mando ninguna orden» sigue siendo cierto');

  t.enviar('SETD^i.0.mix^0.5');
  assert.deepEqual(t.enviadasSinLatido, ['SETD^i.0.mix^0.5'], 'las ordenes si se ven');
});

/**
 * **4. El real pasa por `despojarSocketIo` y entrega de a varias lineas.**
 *
 * `entra()` toma una linea ya pelada: una llamada, una linea. Contra la consola
 * una sola trama puede traer **varias** --separadas por salto de linea, que es
 * lo que hace en cada volcado-- o **ninguna**: el latido `2::` y la
 * confirmacion `1::` no son protocolo y no tienen que llegarle a nadie.
 */
test('una trama cruda puede traer varias lineas, o ninguna', () => {
  const t = new TransporteFalso();
  const vistas: string[] = [];
  t.alRecibir((l) => vistas.push(l));

  t.llega(`3:::${codificarSetd('i.0.mix', 0.5)}\n${codificarSetd('i.1.mix', 0.25)}`);
  assert.deepEqual(vistas, [codificarSetd('i.0.mix', 0.5), codificarSetd('i.1.mix', 0.25)],
    'una trama, dos lineas');

  t.llega('2::');
  t.llega('1::');
  assert.equal(vistas.length, 2, 'el latido y la conexion no son protocolo');
});

/**
 * El volcado entero por el camino de verdad, para que el reparto de tramas
 * multiples no quede solo probado sobre el transporte suelto.
 */
test('el adaptador procesa un volcado que llega en una sola trama', async () => {
  await conAdaptador({}, async (t, a) => {
    t.llega(`3:::${codificarSetd('i.0.mix', 0.5)}\n${codificarSetd('i.1.mix', 0.25)}`);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(a.leer('i.0.mix').value, 0.5);
    assert.equal(a.leer('i.1.mix').value, 0.25);
  });
});

// --- Cuatro apartamientos mas, que encontro la auditoria de la tanda ---------

/**
 * **`desconectar()` del real avisa; el del doble solo bajaba la bandera.**
 *
 * `WebSocketTransport.desconectar()` llama a `ws.close()` y el `onclose` corre
 * despues llamando a los callbacks de cierre. El escenario «el usuario toca
 * Desconectar y el aviso llega despues» era irrepresentable.
 */
test('desconectar avisa a quien escucha el cierre', async () => {
  const t = new TransporteFalso();
  const motivos: string[] = [];
  t.alCerrar((m) => motivos.push(m));
  await t.conectar();
  await t.desconectar();
  assert.deepEqual(motivos, ['cerrado'], 'el real dispara el cierre al desconectar');
  await t.desconectar();
  assert.equal(motivos.length, 1, 'y no avisa dos veces de lo que ya estaba cerrado');
});

/**
 * **Un intento fallido deja el transporte cerrado, y avisa.**
 *
 * En el real el corte de tiempo hace `ws.close()` ANTES de rechazar, asi que el
 * aviso de cierre corre mientras `conectar()` todavia esta en vuelo. El doble
 * lanzaba a secas y encima dejaba `conectado` como estuviera: mentia justo al
 * reves que el real, y «reconexion fallida» es el escenario donde eso importa.
 */
test('un conectar fallido deja conectado en false y avisa del cierre', async () => {
  const padre = new TransporteFalso();
  padre.fallaLaSesionNueva = true;
  const hija = padre.nuevaSesion();
  const motivos: string[] = [];
  hija.alCerrar((m) => motivos.push(m));
  hija.abre();
  assert.equal(hija.conectado, true, 'estaba abierta');

  await assert.rejects(() => hija.conectar());
  assert.equal(hija.conectado, false, 'un intento fallido no puede dejarla diciendo que esta abierta');
  assert.equal(motivos.length, 1, 'y el real avisa del cierre antes de rechazar');
});

/**
 * **El latido del real se saltea el tick en silencio si no hay socket.**
 *
 * `if (this.conectado) this.enviar(MENSAJE_ALIVE)`. La primera version de
 * `latir()` llamaba a `enviar()` pelado, o sea que lanzaba donde el real no
 * puede: un apartamiento NUEVO, introducido por el cambio que vino a quitar
 * apartamientos.
 */
test('el latido no lanza con el socket caido', () => {
  const t = new TransporteFalso();
  t.abre();
  t.cae();
  t.latir();
  assert.deepEqual(t.enviadas, [], 'sin socket no sale nada, y no explota nada');
  t.abre();
  t.latir();
  assert.equal(t.enviadasSinLatido.length, 0);
  assert.equal(t.enviadas.length, 1, 'con socket, si late');
});

/**
 * **Si falla la sesion nueva, falla tambien la de la sesion nueva.**
 *
 * Sin esto no se podia montar «se cayo la red, asi que NINGUNA sesion abre»:
 * la hija fallaba y la nieta conectaba tan contenta. Es el escenario de una
 * wifi caida, no el de un socket con mala suerte.
 */
test('la red caida alcanza a la nieta, no solo a la hija', async () => {
  const padre = new TransporteFalso();
  padre.fallaLaSesionNueva = true;
  const hija = padre.nuevaSesion();
  await assert.rejects(() => hija.conectar());
  const nieta = hija.nuevaSesion();
  await assert.rejects(() => nieta.conectar(), 'la red sigue caida para la nieta');
});
