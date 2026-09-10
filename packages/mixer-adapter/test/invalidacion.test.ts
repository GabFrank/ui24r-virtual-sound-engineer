import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd } from '../src/protocol.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * INV-021: una avalancha de cambios invalida el estado confirmado, y el estado
 * **sigue invalido** hasta que alguien lo relea.
 *
 * Lo encontro el guion de capturas: despues de provocar una avalancha, la
 * insignia volvia sola a decir «Estado confirmado». El motivo estaba en el
 * temporizador de quietud, que existe porque la Ui24R no manda ningun
 * centinela de fin de volcado y hay que deducirlo del silencio. Se rearmaba
 * con cualquier linea de estado mientras el almacen no estuviera valido, y una
 * avalancha deja el almacen invalido.
 *
 * Los tests cierran el adaptador en `finally`: deja un temporizador vigilando
 * la cadencia del analizador, y si una asercion falla antes del cierre el
 * proceso de pruebas se queda colgado en vez de informar el fallo.
 */
async function conAdaptador(fn: (t: TransporteFalso, a: Ui24rMixerAdapter) => Promise<void>): Promise<void> {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t, { quietudVolcadoMs: 30 });
  await a.conectar('ws://prueba');
  try { await fn(t, a); } finally { await a.desconectar(); }
}

/** Mas rutas distintas que el umbral de avalancha, en la misma ventana. */
function avalancha(t: TransporteFalso): void {
  for (let i = 0; i < 15; i++) t.entra(codificarSetd(`i.${i}.mix`, 0.3));
}

test('INV-021: el estado sigue invalido despues de una avalancha', async () => {
  await conAdaptador(async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(a.leer('i.0.mix').storeState, 'VALID', 'el volcado inicial deja el estado valido');

    avalancha(t);
    assert.equal(a.leer('i.0.mix').storeState, 'INVALID', 'la avalancha invalida');

    await new Promise((r) => setTimeout(r, 120));
    assert.equal(
      a.leer('i.0.mix').storeState, 'INVALID',
      'no puede volver a valido solo: hace falta releer',
    );
  });
});

test('INV-021: releer si devuelve el estado a valido', async () => {
  await conAdaptador(async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    avalancha(t);
    assert.equal(a.leer('i.0.mix').storeState, 'INVALID');

    await a.releerEstado();
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(a.leer('i.0.mix').storeState, 'VALID', 'un INIT si vuelve a validar');
  });
});

/**
 * El segundo camino a la revalidacion, que la primera correccion no cubrio.
 *
 * `completarVolcado()` se alcanza por el temporizador de quietud --que solo se
 * arma con un volcado en curso-- y tambien por un `DUMP_END` suelto. Ese
 * segundo camino no comprobaba nada, asi que con el estado invalidado por una
 * avalancha bastaba un `DUMP_END` para declararlo valido sin que nadie
 * hubiera releido: INV-021 apagada por la otra puerta.
 *
 * Contra la consola real no pasa, porque no manda `DUMP_END`. Contra el
 * simulador si, y el simulador es donde se descubrio el defecto original: un
 * test que solo ejercite el temporizador no protege del escenario que ya
 * fallo una vez.
 */
test('INV-021: un DUMP_END suelto no revalida un estado invalidado', async () => {
  await conAdaptador(async (t, a) => {
    t.entra(codificarSetd('i.0.mix', 0.5));
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(a.leer('i.0.mix').storeState, 'VALID');

    avalancha(t);
    assert.notEqual(a.leer('i.0.mix').storeState, 'VALID', 'la avalancha invalida');

    t.entra('DUMP_END');
    await new Promise((r) => setTimeout(r, 60));
    assert.notEqual(
      a.leer('i.0.mix').storeState, 'VALID',
      'un DUMP_END sin volcado en curso no puede dar por bueno lo que nadie releyo',
    );
  });
});
