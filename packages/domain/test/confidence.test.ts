import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confianzaSala, confianzaCanal, confianzaMezcla } from '../src/rules/confidence.ts';

test('sala: consistencia alta y desviación por encima del ruido da confianza alta', () => {
  assert.equal(
    confianzaSala({
      consistencia: 0.9, desviacionDb: 4, sigmaBandaDb: 1,
      calibracionValida: true, coherenciaMedia: 0.9, promedios: 32,
    }),
    'HIGH',
  );
});

test('sala: una desviación que no supera el ruido de medición no llega a alta', () => {
  // Cuatro decibeles con una desviación típica de tres: puede ser la propia
  // variabilidad de la medición.
  assert.notEqual(
    confianzaSala({
      consistencia: 0.9, desviacionDb: 4, sigmaBandaDb: 3,
      calibracionValida: true, coherenciaMedia: 0.9, promedios: 32,
    }),
    'HIGH',
  );
});

test('sala: menos de dieciséis promedios da datos insuficientes', () => {
  // Con pocos promedios la coherencia está sesgada hacia uno y engaña.
  assert.equal(
    confianzaSala({
      consistencia: 1, desviacionDb: 8, sigmaBandaDb: 0.5,
      calibracionValida: true, coherenciaMedia: 0.99, promedios: 8,
    }),
    'INSUFFICIENT_DATA',
  );
});

test('sala: sin repetibilidad medida no se llega a confianza alta', () => {
  assert.equal(
    confianzaSala({
      consistencia: 1, desviacionDb: 8, sigmaBandaDb: null,
      calibracionValida: true, coherenciaMedia: 0.95, promedios: 32,
    }),
    'MEDIUM',
  );
});

test('sala: calibración inválida da datos insuficientes, mida lo que mida', () => {
  assert.equal(
    confianzaSala({
      consistencia: 1, desviacionDb: 10, sigmaBandaDb: 0.2,
      calibracionValida: false, coherenciaMedia: 0.99, promedios: 64,
    }),
    'INSUFFICIENT_DATA',
  );
});

test('canal: el criterio es repetición entre capturas, no consistencia espacial', () => {
  // Un canal se mide en una sola posición: aplicarle el criterio de sala daría
  // siempre datos insuficientes.
  assert.equal(
    confianzaCanal({
      repetidoEnDosCapturas: true, desviacionBandaOctavas: 0.1,
      snrDb: 25, calibracionValida: true,
    }),
    'HIGH',
  );
});

test('canal: sin repetición en dos capturas no pasa de baja', () => {
  assert.equal(
    confianzaCanal({
      repetidoEnDosCapturas: false, desviacionBandaOctavas: 0.05,
      snrDb: 40, calibracionValida: true,
    }),
    'LOW',
  );
});

test('canal: relación señal a ruido pobre da datos insuficientes', () => {
  assert.equal(
    confianzaCanal({
      repetidoEnDosCapturas: true, desviacionBandaOctavas: 0.05,
      snrDb: 6, calibracionValida: true,
    }),
    'INSUFFICIENT_DATA',
  );
});

test('mezcla: presente en dos de tres ventanas da confianza alta', () => {
  assert.equal(
    confianzaMezcla({ ventanasConHallazgo: 2, ventanasTotales: 3, calibracionValida: true }),
    'HIGH',
  );
});

test('mezcla: menos de tres ventanas no alcanza para decidir', () => {
  assert.equal(
    confianzaMezcla({ ventanasConHallazgo: 2, ventanasTotales: 2, calibracionValida: true }),
    'INSUFFICIENT_DATA',
  );
});
