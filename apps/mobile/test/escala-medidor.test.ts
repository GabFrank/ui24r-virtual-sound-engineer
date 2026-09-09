import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIDOR_SATURACION, VU_ESCALA, dbDeMedidor } from '@vse/mixer-adapter';
import {
  PISO_DB, UMBRAL_RIESGO_DB, UMBRAL_SATURACION_DB, porcentajeDeDb,
} from '../src/app/telemetry/escala-medidor.ts';

test('la escala del medidor va de -80 a 0, como la de la consola', () => {
  assert.equal(PISO_DB, -80);
  assert.equal(UMBRAL_SATURACION_DB, 0);
});

test('la punta de la escala es la misma que usa el adaptador para contar saturaciones', () => {
  // Una sola regla, en un solo sitio. Antes la barra se pintaba de roja a
  // -1 dB mientras el adaptador contaba el clip a 0: la pantalla podía decir
  // «saturando» con la cuenta de saturaciones en cero.
  assert.equal(UMBRAL_SATURACION_DB, dbDeMedidor(MEDIDOR_SATURACION));
});

test('la barra ocupa la misma fraccion que la de la consola', () => {
  // La consola dibuja `c = h * value`: el ancho es la posicion normalizada.
  // Se recorre el byte entero de la trama VU2, que es lo que llega por el
  // cable, y se compara contra lo que pinta esta escala.
  for (let byte = 1; byte <= 240; byte++) {
    const posicion = byte * VU_ESCALA;
    const esperado = Math.round(Math.min(1, posicion) * 100);
    assert.equal(
      porcentajeDeDb(dbDeMedidor(posicion)), esperado,
      `el byte ${byte} deberia pintar ${esperado} %`,
    );
  }
});

test('es lineal en decibeles: la mitad de la barra es la mitad del recorrido', () => {
  assert.equal(porcentajeDeDb(-40), 50);
  assert.equal(porcentajeDeDb(-20), 75);
  assert.equal(porcentajeDeDb(0), 100);
});

test('los veinte decibeles bajo -60 se dibujan, no se recortan', () => {
  // El piso anterior estaba en -60 dB: un canal en -70 daba barra vacia,
  // indistinguible del silencio, cuando la consola le dibuja un octavo.
  assert.ok(porcentajeDeDb(-70) > 0, 'un canal en -70 dB tiene que verse');
  assert.equal(porcentajeDeDb(-70), 13);
  assert.equal(porcentajeDeDb(-60), 25);
});

test('el silencio y el fondo de escala no pintan nada', () => {
  assert.equal(porcentajeDeDb(-Infinity), 0);
  assert.equal(porcentajeDeDb(PISO_DB), 0);
  assert.equal(porcentajeDeDb(-100), 0);
  assert.equal(porcentajeDeDb(Number.NaN), 0);
});

test('no se puede pasar de la punta', () => {
  // Con la ley del fader el medidor llegaba a +10 y la barra se desbordaba.
  // Con la de la consola el maximo es 0, pero el recorte se mantiene por si
  // alguien alimenta el componente con otra cosa.
  assert.equal(porcentajeDeDb(10), 100);
});

test('la marca de riesgo cae dentro de la barra y por debajo de la punta', () => {
  assert.ok(UMBRAL_RIESGO_DB < UMBRAL_SATURACION_DB);
  const marca = porcentajeDeDb(UMBRAL_RIESGO_DB);
  assert.ok(marca > 0 && marca < 100);
  assert.equal(marca, 85);
});
