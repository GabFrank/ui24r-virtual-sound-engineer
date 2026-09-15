import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonizarRuta, entrada, aRaw, CANALES_DE_ENTRADA, AUXILIARES } from '../src/index.ts';

/**
 * **La tabla de conversión no resolvía ninguna ruta real, y eso dejaba muerta una
 * guarda de seguridad.**
 *
 * `RAW_MAP` se indexa por plantillas —`i.N.eq.b1.freq`— y `entrada()` era un
 * `Map.get` de la cadena cruda, así que `entrada('i.3.eq.b1.freq')` daba
 * `undefined`. Consecuencia medida el 2026-09-13:
 *
 * - `verificarAtadura`, que ata la magnitud que el motor juzga al crudo que va al
 *   cable, devolvía `SIN_LEY_VERIFICADA` **en los 24 canales**. Eso está
 *   documentado como «no es un rechazo»: la guarda estaba enchufada al motor y no
 *   podía disparar nunca.
 * - `aRaw('i.3.eq.b1.freq', 1000)` contestaba «no se escribe», así que las cuatro
 *   leyes del ecualizador medidas contra el filtro real no servían para escribir.
 *
 * Nadie lo vio porque **ningún llamador de producción usa `aRaw`** y las pruebas
 * usaban la plantilla, que sí resolvía.
 */
test('una ruta concreta resuelve, y la plantilla sigue resolviendo', () => {
  assert.equal(entrada('i.N.eq.b1.freq')?.estado, 'PROBADO');
  assert.equal(entrada('i.3.eq.b1.freq')?.estado, 'PROBADO');
  assert.equal(entrada('i.0.eq.b1.freq')?.estado, 'PROBADO');
  assert.equal(entrada(`i.${CANALES_DE_ENTRADA - 1}.eq.b1.freq`)?.estado, 'PROBADO');
});

test('las cuatro leyes medidas ya sirven para escribir un canal de verdad', () => {
  const r = aRaw('i.3.eq.b1.freq', 1000);
  assert.equal(r.ok, true);
  // Y vuelve: la conversión de ida y de vuelta cierra sobre la ruta concreta.
  assert.ok(r.ok && Math.abs(entrada('i.3.eq.b1.freq')!.fromRaw(r.raw) - 1000) < 1e-6);
});

test('fuera del rango real no resuelve: escribir a ciegas es lo que se evita', () => {
  assert.equal(canonizarRuta(`i.${CANALES_DE_ENTRADA}.eq.b1.freq`), undefined);
  assert.equal(canonizarRuta('i.99.eq.b1.freq'), undefined);
  assert.equal(canonizarRuta(`i.3.aux.${AUXILIARES}.value`), undefined);
});

/**
 * **El alias con ceros, que es el problema grave y no el de rango.** El techo por
 * ruta, el acumulado y las rutas ya tocadas se indexan por la cadena cruda: con un
 * techo puesto en `i.3.…`, que `i.03.…` resolviera sería la misma ruta que suena
 * en la sala alcanzada por una clave que el estado no cuenta.
 */
test('la forma no canónica no resuelve', () => {
  assert.equal(canonizarRuta('i.03.eq.b1.freq'), undefined);
  assert.equal(canonizarRuta('i.003.eq.b1.freq'), undefined);
  assert.equal(canonizarRuta('i.3.aux.01.value'), undefined);
  assert.equal(canonizarRuta('i. 3.eq.b1.freq'), undefined);
});

test('un indice de familia desconocida falla cerrado, no adivina', () => {
  // Nadie acotó cuántos `x` hay, así que no se canoniza: dar una conversión para
  // una ruta que nadie acotó es lo que la auditoría de la lista blanca castigó.
  assert.equal(canonizarRuta('x.3.eq.b1.freq'), undefined);
  assert.equal(canonizarRuta('a.4.mix'), undefined);
  assert.equal(canonizarRuta('f.1.aux.2.value'), undefined);
});

test('lo que no tiene indices pasa igual, y `b1` no es un indice', () => {
  assert.equal(canonizarRuta('m.mix'), 'm.mix');
  // `b1` lleva un dígito y NO es un segmento numérico: si se tocara, la plantilla
  // `i.N.eq.b1.freq` dejaría de encontrarse a sí misma.
  assert.equal(canonizarRuta('i.3.eq.b1.freq'), 'i.N.eq.b1.freq');
});
