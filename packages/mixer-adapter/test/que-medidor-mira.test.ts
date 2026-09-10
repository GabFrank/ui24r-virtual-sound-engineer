import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comoConfirmarPorMedidor } from '../src/que-medidor-mira.ts';
import { faderADb, gananciaADb } from '../src/conversiones.ts';

test('el fader se juzga en la SALIDA, que es donde se ve', () => {
  const c = comoConfirmarPorMedidor('i.9.mix', 0.60, 0.50);
  assert.equal(c?.canal, 10);
  assert.equal(c?.punto, 'SALIDA');
  assert.ok(Math.abs(c!.esperadoDb - (faderADb(0.60) - faderADb(0.50))) < 1e-9);
});

test('la ganancia se juzga en la ENTRADA, que es donde se ve', () => {
  const c = comoConfirmarPorMedidor('hw.9.gain', 0.30, 0.25);
  assert.equal(c?.canal, 10);
  assert.equal(c?.punto, 'ENTRADA');
  assert.ok(Math.abs(c!.esperadoDb - (gananciaADb(0.30) - gananciaADb(0.25))) < 1e-9);
});

test('mirar el punto equivocado daria «no se movio» siempre', () => {
  // No es una comprobacion de estilo: el medidor de entrada esta DESPUES del
  // previo y ANTES del fader --medido el 2026-09-08--, asi que juzgar un fader
  // ahi daria cero movimiento y la escritura buena saldria rechazada. Este test
  // fija que los dos puntos sean distintos y no se puedan confundir.
  const fader = comoConfirmarPorMedidor('i.4.mix', 0.7, 0.6);
  const ganancia = comoConfirmarPorMedidor('hw.4.gain', 0.7, 0.6);
  assert.notEqual(fader?.punto, ganancia?.punto);
});

test('el signo del cambio esperado acompana al del movimiento', () => {
  const sube = comoConfirmarPorMedidor('i.0.mix', 0.70, 0.50);
  const baja = comoConfirmarPorMedidor('i.0.mix', 0.50, 0.70);
  assert.ok(sube!.esperadoDb > 0);
  assert.ok(baja!.esperadoDb < 0);
  assert.ok(Math.abs(sube!.esperadoDb + baja!.esperadoDb) < 1e-9);
});

test('el silencio queda afuera, y a proposito', () => {
  // No tiene un «cuanto tenia que moverse»: va al piso. Meterlo con un
  // esperadoDb inventado seria peor que no tenerlo, porque pareceria cubierto.
  assert.equal(comoConfirmarPorMedidor('i.9.mute', 1, 0), null);
});

test('lo que no mueve el nivel de forma conocida no se confirma asi', () => {
  for (const p of ['i.9.eq.b1.gain', 'i.9.gate.thresh', 'i.9.delay', 'i.9.pan',
                   'i.9.aux.0.value', 'm.mix', 'var.rta']) {
    assert.equal(comoConfirmarPorMedidor(p, 0.6, 0.5), null, p);
  }
});

test('el general no entra: m.mix no es i.N.mix', () => {
  // El general tiene su propio medidor en la cola de VU2 y no en la lista de
  // canales, asi que canal e indice no significan lo mismo. Entra el dia que se
  // mida, no por parecerse.
  assert.equal(comoConfirmarPorMedidor('m.mix', 0.6, 0.5), null);
});

test('el canal sale del indice mas uno, no del numero crudo', () => {
  assert.equal(comoConfirmarPorMedidor('i.0.mix', 0.6, 0.5)?.canal, 1);
  assert.equal(comoConfirmarPorMedidor('i.21.mix', 0.6, 0.5)?.canal, 22);
});
