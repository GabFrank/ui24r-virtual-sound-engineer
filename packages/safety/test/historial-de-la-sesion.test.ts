import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historialDeLaSesion } from '../src/historial-de-la-sesion.ts';
import type { CambioRegistrado, EntradaDiario } from '../src/journal.ts';

function cambio(p: Partial<CambioRegistrado> & { path: string }): CambioRegistrado {
  return {
    unidad: 'dB',
    valorPrevio: 0.5, valorEsperado: 0.5, valorEnviado: 0.6,
    magnitudEsperada: -12, magnitudEnviada: -10,
    enviadoEl: '2026-09-17T10:00:00.000Z',
    confirmadoPor: 'WITNESS', verificado: true,
    ...p,
  };
}

function entrada(cambios: readonly CambioRegistrado[]): EntradaDiario {
  return {
    id: 't1', sessionId: 's1', estado: 'APLICADA', snapshotRef: null,
    razon: 'prueba', nivelAutonomia: 'ASSISTED',
    creadoEl: '2026-09-17T10:00:00.000Z', cerradoEl: null, cambios,
  };
}

const RUTA = 'i.9.aux.4.value';

test('suma el desplazamiento de cada ruta en su unidad, no en crudo', () => {
  // Dos pasos de 2 dB de una rampa. En crudo estos dos pasos son 0,1 cada uno;
  // si el historial sumara crudo daria 0,2 y el motor lo comparara contra un
  // tope en decibeles, que es el error que este modulo existe para no repetir.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4);
  assert.ok(h.rutasYaTocadas.has(RUTA));
});

test('volver hacia donde estaba DESCUENTA: es una suma con signo', () => {
  // El motor lo pide asi: «un movimiento que acerca el parametro a su valor
  // inicial siempre es admisible». Con magnitudes absolutas, subir 2 y bajar 2
  // gastaria 4 dB de presupuesto habiendo quedado donde empezo.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -12 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
  assert.ok(h.rutasYaTocadas.has(RUTA), 'quedo en cero y la ruta SI se toco');
});

test('un cambio que no se confirmo no gasta presupuesto: no sono', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false, confirmadoPor: 'TIMEOUT' })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), undefined);
  assert.equal(h.rutasYaTocadas.has(RUTA), false);
});

test('aplicar y revertir doce veces cuesta lo que sono, no cero', () => {
  // La reversion es otro par de escrituras que tambien sonaron. Lo que las
  // cancela es el signo. Aca se revierte a un valor distinto del de partida.
  const entradas = [];
  for (let i = 0; i < 12; i++) {
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]));
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -11 })]));
  }
  assert.equal(historialDeLaSesion(entradas).acumuladoPorRuta.get(RUTA), 12);
});

test('salir del silencio no envenena el acumulado de la ruta', () => {
  // ADR-034: desde el silencio cualquier nivel finito es un salto infinito. Si
  // ese infinito entrara al acumulado, la ruta quedaria inutilizable el resto
  // de la sesion --cualquier tope la rechazaria-- justo despues del primer paso.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -Infinity, magnitudEnviada: -32.14 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -32.14, magnitudEnviada: -30.14 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2, 'cuenta desde que dejo el silencio');
  assert.ok(h.rutasYaTocadas.has(RUTA), 'y la ruta quedo tocada igual');
});

test('cada ruta lleva su propia cuenta', () => {
  const otra = 'i.3.aux.1.value';
  const h = historialDeLaSesion([
    entrada([
      cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 }),
      cambio({ path: otra, magnitudEsperada: -20, magnitudEnviada: -21 }),
    ]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2);
  assert.equal(h.acumuladoPorRuta.get(otra), -1);
});

test('sin entradas, el historial esta vacio y no finge', () => {
  const h = historialDeLaSesion([]);
  assert.equal(h.acumuladoPorRuta.size, 0);
  assert.equal(h.rutasYaTocadas.size, 0);
});
