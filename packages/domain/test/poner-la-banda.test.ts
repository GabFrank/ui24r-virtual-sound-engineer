import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PONER_LA_BANDA, formaDePonerLaBanda } from '../src/rules/poner-la-banda.ts';

/**
 * La forma de «poner la banda» (ADR-039, decisión 3): tres cambios, misma
 * banda, mismo canal, ganancia primero y en cero exacto.
 *
 * Se prueba sobre el contenido y no sobre la etiqueta: la etiqueta la mira el
 * motor, y sólo para exigir que el contenido la respalde.
 */
const gain = (canal = 9, banda = 2, db = 0) =>
  ({ path: `i.${canal}.eq.b${banda}.gain`, unidad: 'dB', magnitudPropuesta: db });
const freq = (canal = 9, banda = 2) =>
  ({ path: `i.${canal}.eq.b${banda}.freq`, unidad: 'Hz', magnitudPropuesta: 2500 });
const q = (canal = 9, banda = 2) =>
  ({ path: `i.${canal}.eq.b${banda}.q`, unidad: 'Q', magnitudPropuesta: 1.4 });

test('la etiqueta existe y es una cadena que quien propone declara', () => {
  assert.equal(PONER_LA_BANDA, 'PONER_LA_BANDA');
});

test('ganancia a cero, frecuencia y ancho de la misma banda del mismo canal: bien formada', () => {
  const f = formaDePonerLaBanda([gain(), freq(), q()]);
  assert.deepEqual(f, { bienFormada: true, canal: '9', banda: 'b2' });
});

test('el orden es parte de la decisión: la ganancia va primero', () => {
  // Con la frecuencia antes, el salto sale al cable con la campana en su
  // ganancia vieja, y una campana de hasta 4 dB barriendo el espectro se oye.
  const f = formaDePonerLaBanda([freq(), gain(), q()]);
  assert.equal(f.bienFormada, false);
  assert.ok(!f.bienFormada && /orden/.test(f.motivo), !f.bienFormada ? f.motivo : '');
  const g = formaDePonerLaBanda([gain(), q(), freq()]);
  assert.equal(g.bienFormada, false);
});

test('la ganancia tiene que quedar exactamente en cero', () => {
  // Medio decibel ya es una campana, y −0 tampoco cuenta como truco: es 0.
  assert.equal(formaDePonerLaBanda([gain(9, 2, 0.5), freq(), q()]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([gain(9, 2, -0.1), freq(), q()]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([gain(9, 2, NaN), freq(), q()]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([gain(9, 2, -0), freq(), q()]).bienFormada, true);
  // Y en decibeles: cero en otra unidad no es cero de ganancia.
  assert.equal(
    formaDePonerLaBanda([{ ...gain(), unidad: 'Hz' }, freq(), q()]).bienFormada, false,
  );
});

test('las tres hojas tienen que ser de la misma banda y del mismo canal', () => {
  assert.equal(formaDePonerLaBanda([gain(9, 2), freq(9, 3), q(9, 2)]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([gain(9, 2), freq(9, 2), q(10, 2)]).bienFormada, false);
  // El alias con ceros a la izquierda no es el mismo canal para esta forma:
  // el estado por ruta se indexa por la cadena cruda, y mezclar `9` con `09`
  // sería la misma trampa que `techoPorRuta` ya pagó.
  assert.equal(formaDePonerLaBanda([gain(9, 2), { ...freq(), path: 'i.09.eq.b2.freq' }, q(9, 2)]).bienFormada, false);
});

test('ni dos cambios, ni cuatro, ni una hoja que no sea de una banda', () => {
  assert.equal(formaDePonerLaBanda([gain(), freq()]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([gain(), freq(), q(), gain(9, 3)]).bienFormada, false);
  assert.equal(formaDePonerLaBanda([]).bienFormada, false);
  // La banda 5 no está en la ley medida y el pasa-altos no es una banda.
  assert.equal(formaDePonerLaBanda([gain(9, 5), freq(9, 5), q(9, 5)]).bienFormada, false);
  assert.equal(
    formaDePonerLaBanda([gain(), { path: 'i.9.eq.hpf.freq', unidad: 'Hz', magnitudPropuesta: 100 }, q()]).bienFormada,
    false,
  );
  // Y la misma hoja repetida en el lugar de otra: tres ganancias no son una banda.
  assert.equal(formaDePonerLaBanda([gain(), gain(), gain()]).bienFormada, false);
});
