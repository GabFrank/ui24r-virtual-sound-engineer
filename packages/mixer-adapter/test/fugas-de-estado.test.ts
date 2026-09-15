import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd, codificarSets } from '../src/protocol.ts';
import { RUTA_INSTANTANEA_ACTIVA } from '../src/confirmed-store.ts';
import { SHOW_DE_LA_APLICACION } from '../src/instantaneas.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Lo que un envio que NO sale deja atras.
 *
 * El commit anterior hizo que un envio fallido devolviera un resultado en vez
 * de una excepcion. Una auditoria midio que eso no alcanzaba: el camino que
 * devuelve el resultado deja **estado armado** detras suyo, y ese estado no es
 * basura inerte --interfiere con lo que pasa despues--.
 *
 * Son tres fugas distintas y ninguna rompe nada visible en el momento. Por eso
 * cada test de aca lleva su forma de verlas: o el numero de esperas del
 * testigo, o el numero de oyentes, o un escenario que sale mal mas tarde.
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

async function volcado(t: TransporteFalso): Promise<void> {
  t.entra(codificarSetd('i.0.mix', 0.5));
  await new Promise((r) => setTimeout(r, 60));
}

/**
 * **Fuga 1: el pendiente huerfano se come la confirmacion del reintento.**
 *
 * La espera del testigo se arma ANTES del envio --a 27 ms medidos, armarla
 * despues es una carrera perdida--. Cuando el envio no sale, esa espera quedaba
 * viva 500 ms. Y `recibir()` del testigo resuelve el PRIMER pendiente que
 * coincide, asi que el huerfano intercepta la difusion destinada al reintento.
 *
 * El escenario es el que mas pasa: parpadea la wifi, la escritura sale
 * rechazada, el operador repite el mismo movimiento, la consola SI lo aplica y
 * lo difunde, el testigo SI lo ve -- y el adaptador contesta «pudo aplicarse o
 * no».
 */
test('un envio que no sale no deja una espera armada', async () => {
  await conAdaptador({ timeoutConfirmacionMs: 60 }, async (t, a) => {
    await volcado(t);
    t.conectado = false;
    const r = await a.escribir('i.0.mix', 0.7, 0.5);

    assert.equal(r.status, 'REJECTED');
    assert.equal(
      a.esperasDelTestigo, 0,
      'la espera se arma antes del envio: si el envio no sale, hay que abandonarla',
    );
  });
});

/**
 * **Control positivo de la fuga 1**, porque el test de arriba afirma que algo
 * NO quedo, y una asercion asi no distingue «se limpio» de «nunca se armo».
 *
 * Aca se comprueba que el camino que SI escribe deja la espera puesta.
 */
test('control positivo: el camino que si escribe deja la espera armada', async () => {
  await conAdaptador({ timeoutConfirmacionMs: 200 }, async (t, a) => {
    await volcado(t);
    const enVuelo = a.escribir('i.0.mix', 0.7, 0.5);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(a.esperasDelTestigo, 1, 'la espera del testigo existe mientras se escribe');
    await enVuelo;
  });
});

/**
 * **Fuga 2: el token del puntero huerfano ciega un recall ajeno.**
 *
 * `guardarInstantanea()` avisa al almacen de que el cambio de
 * `var.currentSnapshot` es nuestro, porque la consola se lo devuelve a quien lo
 * provoco --172 ms medidos--. El token vive cinco segundos. Si la orden no
 * sale, nadie lo consume, y lo gasta el PRIMER cambio de puntero que llegue:
 * o sea un recall AJENO, que queda sin invalidar el estado.
 *
 * Y ese recall ajeno es el mas probable de todos: la etiqueta que no salio es
 * la instantanea del operador, asi que la consola queda apuntando a nuestra
 * automatica, el operador lo ve y recarga la suya a mano.
 */
test('una devolucion de etiqueta que no sale no ciega el recall ajeno', async () => {
  await conAdaptador({ esperaGuardadoMs: 40, esperaBorradoMs: 5 }, async (t, a) => {
    // El operador tenia cargada la suya: eso es lo que `anterior` va a valer.
    t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Alma caninde'));
    await volcado(t);
    assert.equal(a.leer('i.0.mix').storeState, 'VALID');

    // La consola acusa el guardado moviendo el puntero --172 ms medidos-- y
    // contesta la lista. Lo unico que NO sale es la devolucion de la etiqueta.
    const original = t.enviar.bind(t);
    t.enviar = (linea: string) => {
      if (linea.startsWith('SETS^var.currentSnapshot^')) {
        throw new Error('transporte no conectado');
      }
      original(linea);
      if (linea.startsWith('SAVESNAPSHOT^')) {
        const nombre = linea.split('^')[2]!;
        setTimeout(() => t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, nombre)), 2);
      }
      if (linea.startsWith('SNAPSHOTLIST^')) {
        setTimeout(() => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^`), 1);
      }
    };
    await a.guardarInstantanea();
    assert.equal(
      a.leer('i.0.mix').storeState, 'VALID',
      'el eco de nuestro propio guardado no invalida: ese token SI se consume',
    );

    // Ahora la consola quedo apuntando a nuestra automatica. El operador lo ve
    // y recarga la suya a mano: eso es un recall ajeno y cambia todo.
    t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Alma caninde'));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(
      a.leer('i.0.mix').storeState, 'INVALID',
      'un recall ajeno invalida: el token de una orden que no salio no puede taparlo',
    );
  });
});

/**
 * **Control positivo de la fuga 2.** El de arriba afirma que el estado SE
 * invalida; hay que comprobar que el token sigue funcionando cuando la orden si
 * sale, o el arreglo seria «invalidar siempre», que apaga INV-021 por el otro
 * lado.
 */
test('control positivo: la devolucion que SI sale sigue sin invalidar', async () => {
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5 }, async (t, a) => {
    t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, 'Alma caninde'));
    await volcado(t);

    const original = t.enviar.bind(t);
    t.enviar = (linea: string) => {
      original(linea);
      if (linea.startsWith('SNAPSHOTLIST^')) {
        setTimeout(() => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^`), 1);
      }
      // El eco de nuestra propia devolucion, que es lo que el token espera.
      if (linea.startsWith('SETS^var.currentSnapshot^')) {
        const nombre = linea.split('^')[2]!;
        setTimeout(() => t.entra(codificarSets(RUTA_INSTANTANEA_ACTIVA, nombre)), 2);
      }
    };
    await a.guardarInstantanea();
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(
      a.leer('i.0.mix').storeState, 'VALID',
      'nuestro propio guardado no puede invalidar el estado',
    );
  });
});

/**
 * **Fuga 3: cada intento de conexion fallido dejaba un par de oyentes vivo.**
 *
 * Las suscripciones se arman ANTES de conectar y tienen que estar ahi: el
 * transporte real dispara el aviso de cierre del intento fallido **mientras
 * `conectar()` todavia esta en vuelo**. Lo que faltaba era deshacerlas si el
 * intento falla.
 *
 * La consecuencia no es memoria: al reconectar, cada linea entrante se procesa
 * tantas veces como intentos fallidos hubo. Con eso el umbral de avalancha de
 * INV-021 se alcanza con una fraccion de los cambios.
 */
test('un intento de conexion fallido no deja oyentes atras', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t, { quietudVolcadoMs: 30 });
  const original = t.conectar.bind(t);
  t.conectar = async () => { throw new Error('no se pudo abrir'); };

  for (let i = 0; i < 3; i++) {
    await assert.rejects(() => a.conectar('ws://prueba'));
  }
  assert.equal(t.oyentes, 0, 'tres intentos fallidos, cero oyentes');

  t.conectar = original;
  await a.conectar('ws://prueba');
  try {
    assert.equal(t.oyentes, 1, 'y el que conecta de verdad se suscribe una sola vez');
    // La forma en que se notaba: una linea, una version.
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(
      a.leer('i.0.mix').version, 1,
      'una sola linea entrante tiene que mover la version una sola vez',
    );
  } finally { await a.desconectar(); }
});

// --- Las protecciones de `enviarSeguro` que no tenian quien las sujetara ----
//
// La auditoria midio que siete de las ocho se podian borrar enteras con la
// suite en 265 verde. Lo que sigue las ancla una por una.

test('guardar sin poder enviar devuelve null, no una excepcion', async () => {
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5 }, async (t, a) => {
    await volcado(t);
    t.conectado = false;
    assert.equal(await a.guardarInstantanea(), null, 'sin punto de retorno no hay transaccion');
  });
});

test('tomar el analizador sin poder enviar devuelve false y no lo marca prestado', async () => {
  await conAdaptador({}, async (t, a) => {
    await volcado(t);
    t.conectado = false;
    assert.equal(a.tomarAnalizador('i.9'), false);
    // Si lo hubiera marcado prestado, al cerrar intentaria devolver algo que
    // nunca tomo, y el registro diria que le cambiamos la pantalla a alguien.
    t.conectado = true;
    t.enviadas.length = 0;
    a.devolverAnalizador();
    assert.deepEqual(t.enviadasSinLatido, [], 'no se devuelve lo que no se tomo');
  });
});

test('pedir la lista sin poder enviar no cuelga: resuelve como «no contesto»', async () => {
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5, timeoutListaMs: 4000 },
    async (t, a) => {
      await volcado(t);
      t.conectado = false;
      const antes = Date.now();
      assert.deepEqual(await a.listarSnapshots(), []);
      assert.ok(
        Date.now() - antes < 1000,
        'tiene que resolver en el acto y no esperar los cuatro segundos del plazo',
      );
    });
});
