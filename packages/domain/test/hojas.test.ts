import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOJAS, OCTAVAS, OCTAVAS_DE_ANCHO_DE_BANDA, anchoDeBandaEnOctavas, hojaDe,
} from '../src/rules/hojas.ts';
import { LIMITES, limiteDe, movimientoDe, verificarLimite } from '../src/rules/limits.ts';

/**
 * El freno viaja con la hoja y se cuenta en octavas (ADR-039).
 *
 * **Las expectativas salen de la aritmética y de la ADR, no del código.** Una
 * octava es duplicar la frecuencia; un tercio de octava es multiplicar por
 * 2^(1/3) = 1,2599. El ancho de banda de una campana en octavas es
 * `(2/ln2)·asinh(1/2Q)`, y sobre el tramo medido del Q --0,368 a 2,710-- la ADR
 * lo calcula en 3,21 y 0,53 octavas.
 */
const cerca = (a: number, b: number, tol = 1e-3) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} no está a ${tol} de ${b}`);

test('ADR-039: una octava es duplicar, y el mismo salto vale lo mismo en todo el espectro', () => {
  cerca(OCTAVAS.movimiento(1000, 2000), 1);
  cerca(OCTAVAS.movimiento(2000, 1000), -1, 1e-9);
  cerca(OCTAVAS.movimiento(1000, 1000 * Math.cbrt(2)), 1 / 3, 1e-9);
  // Un tercio de octava son 26 Hz en 100 Hz y 1300 Hz en 5 kHz: al oído, el
  // mismo movimiento. En hercios no se parecen en nada.
  cerca(OCTAVAS.movimiento(100, 126), OCTAVAS.movimiento(5000, 6300), 0.002);
  cerca(OCTAVAS.movimiento(100, 126), 1 / 3, 0.002);
});

test('ADR-039: el ancho de banda en octavas da los números de la ADR sobre el tramo medido', () => {
  cerca(anchoDeBandaEnOctavas(0.368), 3.21, 0.005);
  cerca(anchoDeBandaEnOctavas(2.710), 0.53, 0.005);
  // Q = 1 es la campana de 1,39 octavas de los libros.
  cerca(anchoDeBandaEnOctavas(1), 1.388, 0.002);
  // Ensanchar --bajar el Q-- es un movimiento positivo; estrechar, negativo.
  assert.ok(OCTAVAS_DE_ANCHO_DE_BANDA.movimiento(2, 1) > 0);
  assert.ok(OCTAVAS_DE_ANCHO_DE_BANDA.movimiento(1, 2) < 0);
  cerca(OCTAVAS_DE_ANCHO_DE_BANDA.movimiento(1, 2), -0.6745, 0.002);
});

test('ADR-039: las hojas de frecuencia y Q de las cuatro bandas y el pasa-bajos tienen tope propio', () => {
  for (const b of [1, 2, 3, 4]) {
    const f = hojaDe(`i.9.eq.b${b}.freq`);
    assert.ok(f !== undefined, `b${b}.freq`);
    assert.equal(f.unidad, 'Hz');
    assert.equal(f.escala, OCTAVAS);
    assert.equal(f.kind, 'CHANNEL_EQ');
    const q = hojaDe(`i.9.eq.b${b}.q`);
    assert.ok(q !== undefined, `b${b}.q`);
    assert.equal(q.unidad, 'Q');
    assert.equal(q.escala, OCTAVAS_DE_ANCHO_DE_BANDA);
    // Un tercio de octava por paso y una por sesión: operacionalización del
    // agente en la ADR, sujeta a revisión.
    cerca(f.porTransaccion, 1 / 3, 1e-12);
    assert.equal(f.acumuladoPorSesion, 1);
    cerca(q.porTransaccion, 1 / 3, 1e-12);
    assert.equal(q.acumuladoPorSesion, 1);
  }
  const lpf = hojaDe('i.9.eq.lpf.freq');
  assert.ok(lpf !== undefined);
  assert.equal(lpf.escala, OCTAVAS);
  // El pasa-altos tiene hoja propia con los números del anexo B, no los del
  // retoque: una octava por transacción y dos por sesión.
  const hpf = hojaDe('i.9.eq.hpf.freq');
  assert.ok(hpf !== undefined);
  assert.equal(hpf.kind, 'HPF');
  assert.equal(hpf.unidad, 'Hz');
  assert.equal(hpf.escala, OCTAVAS);
  assert.equal(hpf.porTransaccion, 1);
  assert.equal(hpf.acumuladoPorSesion, 2);
  // Y lo que NO tiene hoja propia se rige por la familia: la ganancia, la banda
  // 5 --que no hace nada, medido-- y la pendiente del pasa-altos, que no es una
  // frecuencia y cuya conducta esta tarea no toca.
  assert.equal(hojaDe('i.9.eq.b1.gain'), undefined);
  assert.equal(hojaDe('i.9.eq.b5.freq'), undefined);
  assert.equal(hojaDe('i.9.eq.hpf.slope'), undefined);
  assert.equal(hojaDe('m.eq.peak.l.3'), undefined);
  // Ninguna hoja declara una familia que no exista en la tabla de familias.
  for (const h of HOJAS) assert.ok(LIMITES[h.kind] !== undefined, `${h.kind} sin familia`);
});

test('ADR-039: limiteDe resuelve la hoja si la hay y la familia si no', () => {
  const freq = limiteDe('CHANNEL_EQ', 'i.9.eq.b2.freq');
  assert.ok(freq !== undefined);
  assert.equal(freq.unidad, 'Hz');
  assert.equal(freq.escala.unidad, 'octavas');
  cerca(freq.porTransaccion, 1 / 3, 1e-12);
  // Lo que la hoja no declara lo pone la familia.
  assert.equal(freq.escuchaMinimaS, LIMITES.CHANNEL_EQ!.escuchaMinimaS);
  assert.equal(freq.techoAbsoluto, undefined);

  const gain = limiteDe('CHANNEL_EQ', 'i.9.eq.b2.gain');
  assert.ok(gain !== undefined);
  assert.equal(gain.unidad, 'dB');
  assert.equal(gain.escala.unidad, 'dB');
  assert.equal(gain.porTransaccion, 4);
  assert.equal(gain.escala.movimiento(-3, 1), 4);

  // La hoja del pasa-altos manda sobre su familia, que sigue en octavas: es lo
  // que hace que la pendiente --sin hoja propia-- no cambie de conducta.
  const filtro = limiteDe('HPF', 'i.9.eq.hpf.freq');
  assert.ok(filtro !== undefined);
  assert.equal(filtro.unidad, 'Hz');
  assert.equal(filtro.escala, OCTAVAS);
  assert.equal(filtro.porTransaccion, 1);
  assert.equal(limiteDe('HPF', 'i.9.eq.hpf.slope')!.unidad, LIMITES.HPF!.unidad);

  // Una hoja cuya familia no es la pedida se ignora: manda la familia pedida,
  // que para una frecuencia en hercios es rechazar por unidad. Fallar cerrado.
  const cruzada = limiteDe('CHANNEL_FADER', 'i.9.eq.b2.freq');
  assert.ok(cruzada !== undefined);
  assert.equal(cruzada.unidad, 'dB');

  assert.equal(limiteDe('FX', 'f.0.mix'), undefined);
});

test('ADR-039: movimientoDe cuenta en la escala de la hoja y NaN cuando no puede', () => {
  cerca(movimientoDe('CHANNEL_EQ', 'i.9.eq.b2.freq', 'Hz', 1000, 2000), 1);
  cerca(movimientoDe('CHANNEL_EQ', 'i.9.eq.b2.q', 'Q', 1, 2), -0.6745, 0.002);
  assert.equal(movimientoDe('CHANNEL_EQ', 'i.9.eq.b2.gain', 'dB', -3, 1), 4);
  // La unidad equivocada no se convierte ni se ignora: envenena.
  assert.ok(Number.isNaN(movimientoDe('CHANNEL_EQ', 'i.9.eq.b2.freq', 'dB', 1000, 2000)));
  assert.ok(Number.isNaN(movimientoDe('FX', 'f.0.mix', 'dB', 0, 1)));
  // Y un acumulado NaN es lo único que `verificarLimite` rechaza en vez de
  // dejar pasar: el veneno frena la ruta por el resto de la sesión.
  const r = verificarLimite({
    kind: 'CHANNEL_EQ', path: 'i.9.eq.b2.freq', magnitudEsperada: 1000, magnitudPropuesta: 1100,
    acumuladoEnSesion: NaN, hayMedicionPosterior: true, esPrimerCambioDelParametro: false,
    unidad: 'Hz',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'MAGNITUD_NO_NUMERICA');
});

test('ADR-039: una frecuencia de banda se acota en octavas y un Q en octavas de ancho', () => {
  const base = {
    kind: 'CHANNEL_EQ' as const, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  };
  // 1000 -> 1300 Hz son 0,379 octavas: más que un tercio. 1000 -> 1200 son 0,263.
  const grande = verificarLimite({
    ...base, path: 'i.9.eq.b2.freq', unidad: 'Hz', magnitudEsperada: 1000, magnitudPropuesta: 1300,
  });
  assert.equal(grande.permitido, false);
  assert.equal(grande.permitido === false && grande.codigo, 'DELTA_CAP');
  const chico = verificarLimite({
    ...base, path: 'i.9.eq.b2.freq', unidad: 'Hz', magnitudEsperada: 1000, magnitudPropuesta: 1200,
  });
  assert.equal(chico.permitido, true);
  // Y en hercios, declarar dB sobre una frecuencia es de otra especie: se rechaza.
  const enDb = verificarLimite({
    ...base, path: 'i.9.eq.b2.freq', unidad: 'dB', magnitudEsperada: 1000, magnitudPropuesta: 1200,
  });
  assert.equal(enDb.permitido === false && enDb.codigo, 'UNIDAD_NO_DECLARADA');

  // Q 1 -> 2 estrecha 0,67 octavas de ancho: se rechaza. Q 1 -> 1,2 son 0,22: pasa.
  // **Y una resta de Q lo habría dicho al revés**: 1 de diferencia contra un
  // tope de un tercio también rechaza, pero Q 0,37 -> 0,47 son 0,1 de resta y
  // 0,6 octavas de ancho, que un tope en Q dejaría pasar.
  const estrechar = verificarLimite({
    ...base, path: 'i.9.eq.b3.q', unidad: 'Q', magnitudEsperada: 1, magnitudPropuesta: 2,
  });
  assert.equal(estrechar.permitido === false && estrechar.codigo, 'DELTA_CAP');
  const poco = verificarLimite({
    ...base, path: 'i.9.eq.b3.q', unidad: 'Q', magnitudEsperada: 1, magnitudPropuesta: 1.2,
  });
  assert.equal(poco.permitido, true);
  const abajo = verificarLimite({
    ...base, path: 'i.9.eq.b3.q', unidad: 'Q', magnitudEsperada: 0.37, magnitudPropuesta: 0.47,
  });
  assert.equal(abajo.permitido === false && abajo.codigo, 'DELTA_CAP',
    'una décima de Q abajo del tramo son más de medio octava de ancho');

  // El acumulado, en octavas: con 0,9 acumuladas, 0,26 más pasan de 1.
  const acumulado = verificarLimite({
    ...base, path: 'i.9.eq.b2.freq', unidad: 'Hz', magnitudEsperada: 1000, magnitudPropuesta: 1200,
    acumuladoEnSesion: 0.9, esPrimerCambioDelParametro: false,
  });
  assert.equal(acumulado.permitido === false && acumulado.codigo, 'CUMULATIVE_CAP');
  // La ganancia sigue con sus 4 dB de siempre.
  const ganancia = verificarLimite({
    ...base, path: 'i.9.eq.b2.gain', unidad: 'dB', magnitudEsperada: 0, magnitudPropuesta: 4,
  });
  assert.equal(ganancia.permitido, true);
  const demasiada = verificarLimite({
    ...base, path: 'i.9.eq.b2.gain', unidad: 'dB', magnitudEsperada: 0, magnitudPropuesta: 4.5,
  });
  assert.equal(demasiada.permitido === false && demasiada.codigo, 'DELTA_CAP');
});

test('ADR-039: quien lee el tope POR FAMILIA no puede tener hojas propias', () => {
  // **La trampa que esto cierra.** `LIMITES[kind]` ya no es la última palabra
  // sobre una ruta: la hoja manda. Pero tres sitios fuera del motor siguen
  // leyendo por familia --el asistente que sube un envío a monitor, el que lo
  // baja y la pantalla de la cuña-- y para una familia sin hojas eso es
  // correcto. El día que alguien le agregue una hoja a esa familia, esos tres
  // sitios seguirían leyendo el tope de la familia **en silencio**, que es la
  // forma exacta de «la misma regla implementada dos veces» que este
  // repositorio ya pagó con el adaptador y la interfaz.
  //
  // Se fija acá y no con un comentario: un comentario no falla.
  const LEIDAS_POR_FAMILIA = ['MONITOR_AUX_SEND'];
  for (const kind of LEIDAS_POR_FAMILIA) {
    const conHoja = HOJAS.filter((h) => h.kind === kind);
    assert.deepEqual(
      conHoja.map((h) => String(h.ruta)), [],
      `${kind} se lee por familia en packages/assistants y apps/mobile. Si necesita una `
      + 'hoja propia, primero hay que pasar esos sitios a `limiteDe(kind, path)`.',
    );
  }
});
