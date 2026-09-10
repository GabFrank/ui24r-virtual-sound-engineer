import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarAjuste, TOLERANCIA_OBJETIVO_DB } from '../src/verificar-ajuste.ts';

const BASE = { objetivoDb: 14, ventanaPosteriorSuficiente: true };

test('quedar en el objetivo es el caso bueno', () => {
  const v = verificarAjuste({ ...BASE, margenAntesDb: 20, margenDespuesDb: 14.5 });
  assert.equal(v.estado, 'EN_EL_OBJETIVO');
});

test('acercarse sin llegar cuenta como mejora, y dice cuanto falta', () => {
  // De 24 a 18 con objetivo 14: se acerco 6 dB pero todavia sobran 4.
  const v = verificarAjuste({ ...BASE, margenAntesDb: 24, margenDespuesDb: 18 });
  assert.equal(v.estado, 'MEJORO');
  if (v.estado === 'MEJORO') assert.equal(v.faltaDb, 4);
});

test('si no se movio, no mejoro y se ofrece revertir', () => {
  // Es el caso que justifica volver a medir: el valor pudo haber entrado y el
  // efecto no llegar --previo en su tope, limite antes, fuente que cambio--.
  const v = verificarAjuste({ ...BASE, margenAntesDb: 24, margenDespuesDb: 24 });
  assert.equal(v.estado, 'NO_MEJORO');
  if (v.estado === 'NO_MEJORO') assert.equal(v.ofrecerRevertir, true);
});

test('alejarse del objetivo se distingue de no moverse', () => {
  // Para el operador son dos cosas distintas: 'no paso nada' invita a repetir,
  // 'quedo peor' invita a revertir.
  const v = verificarAjuste({ ...BASE, margenAntesDb: 18, margenDespuesDb: 24 });
  assert.equal(v.estado, 'EMPEORO');
});

test('sin senal en la segunda ventana NO es un fracaso del ajuste', () => {
  // Que el musico haya dejado de tocar no dice nada sobre si el cambio sirvio.
  // Tratarlo como fracaso llevaria a revertir cambios buenos.
  const v = verificarAjuste({ ...BASE, margenAntesDb: 24, margenDespuesDb: 18, ventanaPosteriorSuficiente: false });
  assert.equal(v.estado, 'SIN_MEDICION');

  const sinPico = verificarAjuste({ ...BASE, margenAntesDb: 24, margenDespuesDb: Infinity });
  assert.equal(sinPico.estado, 'SIN_MEDICION');
});

test('se compara la distancia al objetivo, no el margen a secas', () => {
  // Un canal que necesitaba SUBIR el margen: de 8 a 13 con objetivo 14.
  // El margen crecio, y eso es acercarse.
  const v = verificarAjuste({ ...BASE, margenAntesDb: 8, margenDespuesDb: 13 });
  assert.equal(v.estado, 'EN_EL_OBJETIVO', 'a 1 dB del objetivo, dentro de la tolerancia');

  const lejos = verificarAjuste({ ...BASE, margenAntesDb: 4, margenDespuesDb: 9 });
  assert.equal(lejos.estado, 'MEJORO', 'subio 5 dB hacia el objetivo pero todavia falta');
});

test('la tolerancia del objetivo son 2 dB', () => {
  assert.equal(TOLERANCIA_OBJETIVO_DB, 2);
  const justo = verificarAjuste({ ...BASE, margenAntesDb: 20, margenDespuesDb: 16 });
  assert.equal(justo.estado, 'EN_EL_OBJETIVO', '16 contra objetivo 14 son exactamente 2');
});
