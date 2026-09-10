import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaDeGanancia } from '../src/fuente-de-canal.ts';

/**
 * `i.N.src` no es un enumerado opaco: es una ruta. Medido el 2026-09-09,
 * `hw.0` a `hw.19` en los canales 1 a 20 y `none` en los cuatro ultimos.
 */
test('una fuente de previo da la ruta de su ganancia', () => {
  assert.equal(rutaDeGanancia('hw.0'), 'hw.0.gain');
  assert.equal(rutaDeGanancia('hw.19'), 'hw.19.gain');
});

test('un canal sin previo no tiene ganancia que leer', () => {
  // Los canales 21 a 24 son las entradas de linea y de medios.
  assert.equal(rutaDeGanancia('none'), null);
});

test('sin dato no se adivina la identidad', () => {
  // Este es el punto del cambio. Caer en `hw.${canal-1}` como respaldo seria
  // reintroducir la suposicion vieja justo donde no se puede comprobar.
  assert.equal(rutaDeGanancia(undefined), null);
});

test('una fuente que no sabemos leer no se interpreta', () => {
  // Preferimos no informar ganancia antes que informar la de otra cosa: si la
  // consola empieza a mandar una familia nueva, esto calla en vez de inventar.
  assert.equal(rutaDeGanancia('ua.3'), null);
  assert.equal(rutaDeGanancia('hw.'), null);
  assert.equal(rutaDeGanancia(''), null);
});
