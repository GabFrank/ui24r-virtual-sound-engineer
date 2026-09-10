import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmarPorMedidor, TOLERANCIA_CONFIRMACION_DB, NIVEL_MINIMO_PARA_CONFIRMAR_DB,
} from '../src/confirmacion-por-medidor.ts';

test('el cambio esperado, dentro de la tolerancia, confirma', () => {
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -17, esperadoDb: 3 });
  assert.equal(r.estado, 'CONFIRMADO');
});

test('una fuente viva que no se queda quieta sigue confirmando', () => {
  // Subida de 3 dB medida como 2,1: dentro de 1,5 dB de tolerancia.
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -17.9, esperadoDb: 3 });
  assert.equal(r.estado, 'CONFIRMADO');
});

test('si el nivel no se movio, NO se confirma', () => {
  // Es el caso que importa: la escritura no llego y el medidor lo delata.
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -20, esperadoDb: 3 });
  assert.equal(r.estado, 'NO_CONFIRMADO');
  if (r.estado === 'NO_CONFIRMADO') {
    assert.equal(r.cambioDb, 0);
    assert.equal(r.esperadoDb, 3);
  }
});

test('quedarse quieto NUNCA confirma, ni con el cambio mas chico', () => {
  // 1 dB es la escritura mas chica que el asistente propone, y la tolerancia es
  // 1,5: solo con la comparacion contra el esperado, quedarse quieto daria
  // |0 - 1| = 1 y ENTRARIA. Por eso hace falta la segunda condicion --moverse
  // en la direccion correcta y al menos la mitad de lo pedido--. Este test
  // existe porque el limite se descubrio escribiendolo, y era inaceptable.
  const quieto = confirmarPorMedidor({ antesDb: -20, despuesDb: -20, esperadoDb: 1 });
  assert.equal(quieto.estado, 'NO_CONFIRMADO', 'un medidor que no se movio no confirma nada');

  const movido = confirmarPorMedidor({ antesDb: -20, despuesDb: -19, esperadoDb: 1 });
  assert.equal(movido.estado, 'CONFIRMADO');
});

test('moverse para el lado contrario no confirma', () => {
  // Se pidio subir y el nivel bajo: paso algo, pero no lo que se pidio.
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -21, esperadoDb: 1 });
  assert.equal(r.estado, 'NO_CONFIRMADO');
});

test('moverse mucho menos de lo pedido tampoco confirma', () => {
  // Subio 0,4 de los 3 pedidos: la escritura pudo haber entrado a medias, o el
  // previo estar en su tope. En cualquier caso no es lo que se pidio.
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -19.6, esperadoDb: 3 });
  assert.equal(r.estado, 'NO_CONFIRMADO');
});

test('sin senal no hay confirmacion posible', () => {
  assert.equal(confirmarPorMedidor({ antesDb: -Infinity, despuesDb: -20, esperadoDb: 3 }).estado, 'SIN_SENAL');
  assert.equal(confirmarPorMedidor({ antesDb: -20, despuesDb: -Infinity, esperadoDb: 3 }).estado, 'SIN_SENAL');
  assert.equal(
    confirmarPorMedidor({ antesDb: NIVEL_MINIMO_PARA_CONFIRMAR_DB - 1, despuesDb: -20, esperadoDb: 3 }).estado,
    'SIN_SENAL', 'por debajo del minimo lo que se mide es el piso de ruido');
});

test('la tolerancia es 1,5 dB y se puede ajustar', () => {
  assert.equal(TOLERANCIA_CONFIRMACION_DB, 1.5);
  const r = confirmarPorMedidor({ antesDb: -20, despuesDb: -18, esperadoDb: 3, toleranciaDb: 0.5 });
  assert.equal(r.estado, 'NO_CONFIRMADO', 'con tolerancia estrecha, 2 dB medidos contra 3 esperados no pasa');
});
