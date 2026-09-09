import { test } from 'node:test';
import assert from 'node:assert/strict';
import { companeroDe, paresEstereo, SIN_ENLACE } from '../src/pares-estereo.ts';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd } from '../src/protocol.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Medido el 2026-09-09 en el `mixer.html` de la consola:
 *
 *     setValue(this.name + "stereoIndex", 0);              // el primero
 *     setValue(this.linkTarget.name + "stereoIndex", 1);   // el segundo
 *
 * con `linkTarget = allStrips[this.id + 1]`. El numero es la POSICION dentro
 * del par, no un identificador de par: por eso los dos miembros valen distinto.
 */
test('el 0 mira al siguiente y el 1 al anterior', () => {
  const m = new Map([[5, 0], [6, 1]]);
  assert.equal(companeroDe(5, m), 6);
  assert.equal(companeroDe(6, m), 5);
});

test('sin enlace no hay companero', () => {
  const m = new Map([[5, SIN_ENLACE], [6, SIN_ENLACE]]);
  assert.equal(companeroDe(5, m), null);
  assert.equal(companeroDe(9, m), null, 'un canal del que no sabemos nada tampoco');
});

test('un valor que la consola no nos enseño no se interpreta', () => {
  // Emparejar mal es peor que decir que no hay par: abriria el panorama de dos
  // canales que no son un par.
  assert.equal(companeroDe(5, new Map([[5, 7]])), null);
});

test('un par a medias no cuenta como par', () => {
  // Las dos escrituras son independientes --medido: escribir i.4.stereoIndex
  // no movio i.5-- asi que un estado a medias es posible de verdad.
  assert.deepEqual(paresEstereo(new Map([[5, 0]])), []);
  assert.deepEqual(paresEstereo(new Map([[5, 0], [6, SIN_ENLACE]])), []);
  assert.deepEqual(paresEstereo(new Map([[5, 0], [6, 1]])), [{ izquierdo: 5, derecho: 6 }]);
});

test('varios pares salen ordenados por canal', () => {
  const m = new Map([[7, 0], [8, 1], [3, 0], [4, 1], [1, SIN_ENLACE]]);
  assert.deepEqual(paresEstereo(m), [
    { izquierdo: 3, derecho: 4 },
    { izquierdo: 7, derecho: 8 },
  ]);
});

test('el adaptador arma los pares desde el volcado, con la base cero traducida', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  try {
    await a.conectar('ws://prueba');
    // i.4 e i.5 son los canales 5 y 6.
    t.entra(codificarSetd('i.4.stereoIndex', 0));
    t.entra(codificarSetd('i.5.stereoIndex', 1));
    t.entra(codificarSetd('i.0.stereoIndex', -1));

    assert.deepEqual(a.paresEstereo(), [{ izquierdo: 5, derecho: 6 }]);
  } finally {
    await a.desconectar();
  }
});
