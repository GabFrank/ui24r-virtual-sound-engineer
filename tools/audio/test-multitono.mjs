/**
 * El instrumento del multitono, contra un filtro cuyos parámetros se conocen.
 *
 * **Por qué no alcanza con leer el código.** `picoInterpolado` y `qPorAnchoMitad`
 * son aritmética con varias formas de estar sutilmente mal —un vértice bien y una
 * altura mal, un cruce buscado para el lado que no es— y todas producen números
 * con cara de razonables. La única manera de saberlo es pasarle una campana de la
 * que se sabe la respuesta y ver si la devuelve.
 *
 * Se sintetiza el biquad de campana del «Audio EQ Cookbook», que es el que usa
 * prácticamente todo el mundo, se le pasa el multitono **por la misma cadena de
 * medición que se usará con la consola**, y se comprueba que salgan el `f0` y el
 * `Q` que se pusieron.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frecuenciasPorOctava, picoInterpolado, qPorAnchoMitad } from './multitono.mjs';

/** La respuesta en dB de una campana, analítica: no hay simulación de por medio. */
function campanaDb(hz, f0, q, gananciaDb) {
  const A = Math.pow(10, gananciaDb / 40);
  const w0 = (2 * Math.PI * f0) / 48000;
  const alfa = Math.sin(w0) / (2 * q);
  const b = [1 + alfa * A, -2 * Math.cos(w0), 1 - alfa * A];
  const a = [1 + alfa / A, -2 * Math.cos(w0), 1 - alfa / A];
  const w = (2 * Math.PI * hz) / 48000;
  const ev = (c) => {
    const re = c[0] + c[1] * Math.cos(w) + c[2] * Math.cos(2 * w);
    const im = -(c[1] * Math.sin(w) + c[2] * Math.sin(2 * w));
    return Math.hypot(re, im);
  };
  return 20 * Math.log10(ev(b) / ev(a));
}

const FRECUENCIAS = frecuenciasPorOctava({ anchoDelBinHz: 48000 / 192000 });
const curvaDe = (f0, q, g) => FRECUENCIAS.map((hz) => ({ hz, db: campanaDb(hz, f0, q, g) }));

test('el pico interpolado recupera la frecuencia central de una campana conocida', () => {
  // Frecuencias elegidas A PROPOSITO entre dos tonos del multitono: si cayeran
  // justo en un tono, el test pasaria sin que la interpolacion hiciera nada.
  for (const f0 of [97, 213.7, 441, 1013, 2971, 6100]) {
    for (const q of [0.7, 1.0, 2.0]) {
      const pico = picoInterpolado(curvaDe(f0, q, 15));
      assert.ok(pico, `sin pico para f0=${f0} Q=${q}`);
      const error = Math.abs(pico.hz - f0) / f0;
      assert.ok(error < 0.015,
        `f0=${f0} Q=${q}: el instrumento dice ${pico.hz.toFixed(1)} Hz, `
        + `${(error * 100).toFixed(2)} % de error`);
    }
  }
});

test('la altura del pico es la ganancia que se puso', () => {
  // Si el vertice estuviera bien y la altura mal, el test de arriba pasaria y
  // este no. Es la mitad de la formula que nadie mira.
  for (const g of [6, 12, 15, 20]) {
    const pico = picoInterpolado(curvaDe(1013, 1.4, g));
    assert.ok(pico);
    assert.ok(Math.abs(pico.alturaDb - g) < 0.3,
      `con ${g} dB de ganancia el instrumento dice ${pico.alturaDb.toFixed(2)}`);
  }
});

test('el Q medido por ancho a mitad recupera el Q del biquad', () => {
  // El ancho a mitad de la ganancia EN DECIBELES es, para el biquad de campana,
  // exactamente f0/Q: es la definicion que usa el propio recetario. Asi que acá
  // el numero tiene que salir, y si sale otro es que el instrumento esta mal.
  for (const q of [0.5, 0.7, 1.0, 1.4, 2.0, 3.0]) {
    const curva = curvaDe(1013, q, 15);
    const pico = picoInterpolado(curva);
    assert.ok(pico);
    const medido = qPorAnchoMitad(curva, pico);
    assert.ok(medido, `sin ancho medible para Q=${q}`);
    const factor = Math.max(medido.q / q, q / medido.q);
    assert.ok(factor < 1.15,
      `Q=${q}: el instrumento dice ${medido.q.toFixed(3)}, factor ${factor.toFixed(3)}`);
  }
});

test('un Q alto se declara no medible en vez de inventar un ancho', () => {
  // Con la campana mas angosta que la separacion entre tonos, el ancho no se
  // puede medir. Lo que NO puede pasar es que devuelva un numero igual: seria
  // una cifra con cara de medida sacada de dos o tres puntos.
  const curva = curvaDe(1013, 12, 15);
  const pico = picoInterpolado(curva);
  const medido = pico === null ? null : qPorAnchoMitad(curva, pico);
  if (medido !== null) {
    const factor = Math.max(medido.q / 12, 12 / medido.q);
    assert.ok(factor < 1.5,
      `con Q=12 y tonos cada 1/12 de octava el instrumento dice ${medido.q.toFixed(2)}: `
      + 'si no puede medirlo tiene que devolver null, no un numero cualquiera');
  }
});

test('el pico en el borde de la ventana se declara nulo', () => {
  // Un maximo en el extremo casi siempre quiere decir que el filtro esta afuera
  // y lo que se ve es el borde. Devolver ese borde como f0 seria inventar.
  assert.equal(picoInterpolado(curvaDe(25, 1, 15)), null,
    'una campana en 25 Hz cae abajo de la ventana de 40 Hz');
  assert.equal(picoInterpolado(curvaDe(19000, 1, 15)), null,
    'una campana en 19 kHz cae arriba de la ventana');
});

test('el Q se mide en el medio del espectro, y hay un motivo medido', () => {
  // **Cerca de Nyquist el ancho medido y el parametro Q dejan de coincidir**, y
  // no es culpa del instrumento: el biquad digital se deforma al acercarse a la
  // mitad de la frecuencia de muestreo, asi que la campana de 6 kHz realmente es
  // mas angosta que lo que su Q nominal diria. Medido acá: a 6 kHz el ancho da
  // hasta un 36 % de mas con Q bajo, mientras a 1 kHz y a 200 Hz el error se
  // queda en el 1 %.
  //
  // Por eso la medicion 101 barre el Q con la frecuencia fija en 1 kHz. Este test
  // existe para que ese «1 kHz» no parezca una eleccion de gusto: si alguien lo
  // mueve a 6 kHz, los numeros que saque van a estar sesgados y no lo va a ver.
  const peorEn = (f0) => {
    let peor = 1;
    for (const q of [0.4, 0.7, 1.0, 2.0, 4.0]) {
      const curva = curvaDe(f0, q, 15);
      const pico = picoInterpolado(curva);
      const medido = pico === null ? null : qPorAnchoMitad(curva, pico);
      if (medido === null) continue;
      peor = Math.max(peor, medido.q / q, q / medido.q);
    }
    return peor;
  };
  assert.ok(peorEn(1013) < 1.05, `a 1 kHz el instrumento deberia ser exacto: ${peorEn(1013)}`);
  assert.ok(peorEn(200) < 1.05, `a 200 Hz tambien: ${peorEn(200)}`);
  assert.ok(peorEn(6000) > 1.15,
    'si esto deja de fallar, la deformacion cerca de Nyquist desaparecio y este '
    + 'comentario ya no describe la realidad');
});

test('el rango de Q donde el instrumento sirve, fijado', () => {
  // Medido, no supuesto: a 1 kHz, entre 0,15 y 8 el error se queda por debajo de
  // x1,06. El umbral de la medicion 101 es x1,3, que queda comodamente afuera.
  // Si este test empieza a fallar, el umbral de la 101 dejo de tener margen.
  for (const q of [0.15, 0.25, 0.5, 1, 2, 4, 8]) {
    const curva = curvaDe(1013, q, 15);
    const pico = picoInterpolado(curva);
    assert.ok(pico);
    const medido = qPorAnchoMitad(curva, pico);
    assert.ok(medido, `Q=${q} tendria que ser medible a 1 kHz`);
    const factor = Math.max(medido.q / q, q / medido.q);
    assert.ok(factor <= 1.07, `Q=${q}: factor ${factor.toFixed(3)}`);
  }
});
