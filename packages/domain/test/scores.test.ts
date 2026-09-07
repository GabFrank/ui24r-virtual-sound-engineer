import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomScore, mixScore, toleranciaLazoCerrado } from '../src/rules/scores.ts';

test('el ejemplo documentado del puntaje de sala da 79', () => {
  // Es el ejemplo de docs/scores.md: si la fórmula cambia, este test avisa y
  // el documento hay que actualizarlo con él.
  const r = roomScore({
    desviacionRmsDb: 3.2,
    sigmaEntrePosicionesDb: 2.8,
    rugosidadDb: 1.1,
    snrDb: 44,
    bandasUsadas: 31,
    bandasTotales: 31,
  });
  assert.equal(r.total, 79);
});

test('el ejemplo documentado del puntaje de mezcla da 86', () => {
  const r = mixScore({
    errorRolRmsDb: 1.4,
    picoMasterDbfs: -6,
    canalesConSaturacion: 1,
    desviacionEspectralDb: 2.5,
  });
  assert.equal(r.total, 86);
});

test('todo puntaje viene con su desglose', () => {
  const r = roomScore({
    desviacionRmsDb: 3, sigmaEntrePosicionesDb: 3, rugosidadDb: 1,
    snrDb: 40, bandasUsadas: 31, bandasTotales: 31,
  });
  assert.equal(r.componentes.length, 4);
  assert.equal(r.componentes.reduce((a, c) => a + c.peso, 0), 100);
});

test('un puntaje calculado sobre pocas bandas se marca como parcial', () => {
  const r = roomScore({
    desviacionRmsDb: 2, sigmaEntrePosicionesDb: 2, rugosidadDb: 1,
    snrDb: 45, bandasUsadas: 12, bandasTotales: 31,
  });
  assert.equal(r.parcial, true);
});

test('los componentes quedan acotados entre cero y cien', () => {
  const pesimo = roomScore({
    desviacionRmsDb: 40, sigmaEntrePosicionesDb: 30, rugosidadDb: 25,
    snrDb: 0, bandasUsadas: 31, bandasTotales: 31,
  });
  assert.equal(pesimo.total, 0);
  for (const c of pesimo.componentes) assert.ok(c.valor >= 0 && c.valor <= 100);
});

test('el margen penaliza tanto quedarse corto como pasarse', () => {
  const base = { errorRolRmsDb: 0, canalesConSaturacion: 0, desviacionEspectralDb: 0 };
  const alto = mixScore({ ...base, picoMasterDbfs: -1 });
  const bajo = mixScore({ ...base, picoMasterDbfs: -20 });
  const bien = mixScore({ ...base, picoMasterDbfs: -6 });
  assert.ok(bien.total > alto.total, 'un pico a −1 dBFS arriesga saturar');
  assert.ok(bien.total > bajo.total, 'un pico a −20 dBFS desperdicia resolución');
  assert.equal(bien.total, 100);
});

test('INV-023: sin repetibilidad medida no hay tolerancia, y sin tolerancia no hay lazo cerrado', () => {
  assert.equal(toleranciaLazoCerrado(null), null);
});

test('INV-023: la tolerancia nunca baja de dos puntos', () => {
  assert.equal(toleranciaLazoCerrado(0.1), 2);
  assert.equal(toleranciaLazoCerrado(3), 6);
});
