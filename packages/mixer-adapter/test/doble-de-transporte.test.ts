import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd, codificarSets } from '../src/protocol.ts';
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
  await conAdaptador({ esperaGuardadoMs: 5, esperaBorradoMs: 5 }, async (t, a) => {
    const antes = t.oyentes;
    listaQueContesta(t, []);
    await a.guardarInstantanea();
    assert.equal(t.oyentes, antes, 'la suscripcion de la lista se quita, la del adaptador queda');
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

    // **El eco llega DENTRO de la ventana de `pedirLista`, que es el caso que
    // el doble viejo no podia representar.** Con el eco cayendo antes de que
    // `pedirLista` se suscriba, este test pasaba igual con el oyente unico: lo
    // comprobe revirtiendo, y por eso el cronometraje esta elegido y no es
    // casual. La consola tardo 172 ms medidos en devolver el puntero, mas que
    // la espera del guardado, asi que esta es ademas la version realista.
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
