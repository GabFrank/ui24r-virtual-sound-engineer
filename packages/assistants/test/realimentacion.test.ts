import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VigilanteDeRealimentacion, CAIDA_ESPERADA_DB_POR_S, PISO_UTIL_DB,
} from '../src/realimentacion.ts';

const BANDAS = 122;
/** Un espectro plano en el piso, sobre el que se dibuja lo que haga falta. */
const plano = (db = 0): number[] => new Array<number>(BANDAS).fill(db);

/** Una campana estrecha centrada en `banda`, como la que da un tono. */
function campana(centro: number, altura: number, fondo = PISO_UTIL_DB + 2): number[] {
  const xs = plano(fondo);
  // Medido: un tono da unas 5 bandas de ancho a media altura.
  for (let d = -6; d <= 6; d++) {
    const b = centro + d;
    if (b < 0 || b >= BANDAS) continue;
    xs[b] = Math.max(xs[b]!, altura * Math.exp(-(d * d) / 4));
  }
  return xs;
}

test('una banda que cae como debe no es candidata', () => {
  const v = new VigilanteDeRealimentacion();
  v.observar(campana(67, 90), 0);
  // A los 300 ms tendria que haber caido 20 dB. Cae exactamente eso.
  const caida = CAIDA_ESPERADA_DB_POR_S * 0.3;
  assert.deepEqual(v.observar(campana(67, 90 - caida), 300), []);
  assert.deepEqual(v.observar(campana(67, 90 - caida * 2), 600), []);
});

test('una banda estrecha que no cae se avisa despues del tiempo de espera', () => {
  const v = new VigilanteDeRealimentacion();
  v.observar(campana(67, 90), 0);
  // Se sostiene: no baja nada, cuando deberia estar bajando ~67 dB por segundo.
  assert.deepEqual(v.observar(campana(67, 90), 200), [], 'todavia no cumplio el tiempo');
  const tarde = v.observar(campana(67, 90), 800);
  assert.equal(tarde.length, 1);
  assert.equal(tarde[0]?.banda, 67);
  assert.ok(Math.abs((tarde[0]?.hz ?? 0) - 1000) < 1, 'la banda 67 es 1 kHz');
  assert.ok((tarde[0]?.sostenidaMs ?? 0) >= 500);
});

test('algo ancho que se sostiene NO se avisa: es musica, no una resonancia', () => {
  const v = new VigilanteDeRealimentacion();
  // Una meseta ancha --media docena de bandas a cada lado-- que no cae.
  const ancho = (): number[] => {
    const xs = plano(PISO_UTIL_DB + 2);
    for (let b = 55; b <= 79; b++) xs[b] = 90;
    return xs;
  };
  v.observar(ancho(), 0);
  assert.deepEqual(v.observar(ancho(), 800), []);
});

test('el piso de ruido no genera candidatas', () => {
  const v = new VigilanteDeRealimentacion();
  const bajo = campana(67, PISO_UTIL_DB - 4, 0);
  v.observar(bajo, 0);
  assert.deepEqual(v.observar(bajo, 800), []);
});

test('volver a subir reinicia la cuenta: un golpe nuevo no arrastra sospecha', () => {
  const v = new VigilanteDeRealimentacion();
  v.observar(campana(67, 90), 0);
  v.observar(campana(67, 90), 400);      // sosteniendose, todavia sin avisar
  v.observar(campana(67, 100), 500);     // golpe nuevo, mas fuerte
  assert.deepEqual(v.observar(campana(67, 100), 700), [], 'la cuenta arranca de nuevo');
});

test('reiniciar borra el estado, como al cambiar de fuente', () => {
  const v = new VigilanteDeRealimentacion();
  v.observar(campana(67, 90), 0);
  v.reiniciar();
  assert.deepEqual(v.observar(campana(67, 90), 800), [], 'sin pico previo no hay con que comparar');
});
