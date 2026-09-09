import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAIDA_PICO_DB_POR_S, RETENCION_PICO_MS, actualizarPico } from '../src/retencion-pico.ts';

test('un pico nuevo salta enseguida', () => {
  const p = actualizarPico(undefined, -30, 1000);
  assert.equal(p.db, -30);
  assert.equal(actualizarPico(p, -12, 1100).db, -12, 'una lectura mas alta manda');
});

test('el pico cae con el tiempo, no se queda clavado', () => {
  // Es la diferencia con lo que habia antes: el maximo absoluto se quedaba
  // hasta que alguien tocaba «Reiniciar picos», y no se parecia a nada de lo
  // que muestra la consola.
  const inicial = actualizarPico(undefined, -12, 0);
  const unSegundoDespues = actualizarPico(inicial, -60, 1000 + RETENCION_PICO_MS);

  assert.ok(unSegundoDespues.db < -12, 'tiene que haber caido');
  assert.ok(
    Math.abs(unSegundoDespues.db - (-12 - CAIDA_PICO_DB_POR_S)) < 0.01,
    `en un segundo cae ${CAIDA_PICO_DB_POR_S} dB, dio ${unSegundoDespues.db}`,
  );
});

test('el pico nunca queda por debajo de la senal presente', () => {
  // Dibujar una marca de maximo por debajo de la barra que la produjo es peor
  // que no dibujarla.
  const inicial = actualizarPico(undefined, -12, 0);
  const muchoDespues = actualizarPico(inicial, -20, 60_000);

  assert.equal(muchoDespues.db, -20);
});

test('dentro de la retencion el pico no se mueve', () => {
  const inicial = actualizarPico(undefined, -12, 0);
  const enseguida = actualizarPico(inicial, -40, RETENCION_PICO_MS);

  assert.equal(enseguida.db, -12);
  assert.equal(enseguida.desdeMs, 0, 'y no se reinicia la cuenta de la retencion');
});

test('la caida sale de las constantes de la consola y de nuestros 60 cuadros por segundo', () => {
  // GLOBAL_VU_FALL_SPEED = 0.01 aplicada como la mitad al pico, a 60 cuadros
  // por segundo, sobre un recorrido de 80 dB.
  assert.ok(Math.abs(CAIDA_PICO_DB_POR_S - 24) < 0.001, `dio ${CAIDA_PICO_DB_POR_S}`);
});
