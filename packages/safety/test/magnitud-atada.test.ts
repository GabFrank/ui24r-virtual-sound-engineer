import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarAtadura } from '../src/magnitud-atada.ts';
import { entrada } from '@vse/mixer-adapter';

/**
 * **El escenario que una auditoría de seguridad demostró midiendo.**
 *
 * `limits.ts` lo dejó escrito: *«una escritura de recorrido completo, crudo 0 a 1,
 * aprobada bajo un techo de −6 dB declarando magnitudes −31 a −30»*. El motor
 * juzgaba los decibeles declarados, los encontraba razonables, y dejaba pasar el
 * recorrido entero del parámetro.
 *
 * Hasta el 2026-09-13 no se podía cerrar porque no había ninguna ley medida:
 * `rutasProbadas()` devolvía la lista vacía. La medición 101 midió dos.
 */
test('un crudo de recorrido completo con una magnitud inventada se detecta', () => {
  // El ecualizador de la banda 1 está medido entre los crudos 0,25 y 0,90. Un
  // llamador que escriba el extremo declarando cualquier otra cosa queda visible.
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const crudoAlto = e.rawMax;
  const r = verificarAtadura('i.N.eq.b1.freq', crudoAlto, 200, 'Hz');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_COINCIDE');
  // Y dice cuál era el número de verdad, que es lo que permite arreglarlo.
  assert.ok(r.atada === false && 'magnitudDelCrudo' in r
    && Math.abs(r.magnitudDelCrudo - e.fromRaw(crudoAlto)) < 1e-9);
});

test('la magnitud que el crudo produce de verdad, pasa', () => {
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const crudo = e.toRaw(1000);
  const r = verificarAtadura('i.N.eq.b1.freq', crudo, 1000, 'Hz');
  assert.equal(r.atada, true, r.atada === false ? r.motivo : '');
});

test('la holgura escala con el recorrido, no es un numero fijo', () => {
  // **Por que importa.** Un absoluto no sirve para las dos entradas medidas: 0,5
  // seria enorme para un Q que va de 0,37 a 2,71 y ridiculo para una frecuencia
  // que va de 115 a 10 900 Hz. La tolerancia tiene que escalar con lo que se mide.
  const q = entrada('i.N.eq.b1.q');
  const f = entrada('i.N.eq.b1.freq');
  assert.ok(q && f);

  // En el Q, apartarse 0,5 es muchisimo y tiene que fallar.
  const crudoQ = q.toRaw(1.0);
  assert.equal(verificarAtadura('i.N.eq.b1.q', crudoQ, 1.5, 'Q').atada, false);
  // En la frecuencia, apartarse 0,5 Hz sobre 1000 es redondeo y tiene que pasar.
  const crudoF = f.toRaw(1000);
  assert.equal(verificarAtadura('i.N.eq.b1.freq', crudoF, 1000.5, 'Hz').atada, true);
});

test('declarar otra unidad se detecta', () => {
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const r = verificarAtadura('i.N.eq.b1.freq', e.toRaw(1000), 1000, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'UNIDAD_NO_COINCIDE');
});

/**
 * **Que una ruta no se pueda atar NO es un rechazo, y esa diferencia es el punto.**
 *
 * Para las rutas sin ley medida el motor sigue juzgando lo que el llamador
 * declara, igual que antes. Lo que cambia es que ahora eso es **visible** en vez
 * de silencioso. Devolver un rechazo aquí sería peor: bloquearía todo lo que
 * todavía no se midió, que es casi todo.
 */
test('sin ley verificada se dice, y no se rechaza', () => {
  // **Una entrada que existe pero no está medida.** Hasta el 2026-09-13 este
  // ejemplo era `i.N.eq.hpf.freq`; la medición 103 lo midió y lo promovió, así que
  // el ejemplo pasa a la ganancia del ecualizador, que sigue sin medirse. Que el
  // ejemplo tenga que cambiar es la señal de que el trabajo avanza.
  const r = verificarAtadura('i.N.eq.b1.gain', 0.5, 5, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'SIN_LEY_VERIFICADA');
  assert.match(r.atada === false ? r.motivo : '', /DESCONOCIDO/);

  // Y una que no está en la tabla.
  const s = verificarAtadura('i.3.mix', 0.5, -10, 'dB');
  assert.equal(s.atada === false && s.codigo, 'SIN_LEY_VERIFICADA');
});

test('una ley REFUTADA tampoco ata: se midio y no dio', () => {
  // El umbral del compresor cayó con la medición 97. Que exista una fórmula no la
  // hace una ley: usarla para atar sería atar a un número que se sabe incorrecto.
  const r = verificarAtadura('i.N.dyn.threshold', 0.5, -42, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'SIN_LEY_VERIFICADA');
  assert.match(r.atada === false ? r.motivo : '', /REFUTADO/);
});
