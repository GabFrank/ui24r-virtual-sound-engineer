import { test } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import {
  prefijoDeBus, prefijosPermitidos, ecualizacionPermitida, admiteFactorDeCalidad,
} from '../src/rules/buses-de-salida.ts';

/**
 * Las rutas de estos tests son **formas reales**, contrastadas contra las 6732
 * claves que la consola publica. Una muestra inventada haria que estos tests
 * tapen justo lo que vinieron a destapar: la lista blanca de INV-008 vivio meses
 * comparando contra `m.eq.b1.gain`, que el aparato no tiene.
 */

test('el general y los auxiliares tienen prefijo; la matriz no tiene ecualizador', () => {
  strictEqual(prefijoDeBus({ tipo: 'MASTER' }), 'm');
  strictEqual(prefijoDeBus({ tipo: 'AUX', indice: 3 }), 'a.3');
  // En las 6732 claves, `mtx` aparece SOLO como envio --`<fuente>.mtx.<destino>.value`--
  // y no hay ninguna `mtx.N.eq.*`. Devolver null es decir eso.
  strictEqual(prefijoDeBus({ tipo: 'MTX', indice: 0 }), null);
});

test('un bus sin ecualizador no llega a la lista de permitidos', () => {
  const p = prefijosPermitidos([{ tipo: 'MASTER' }, { tipo: 'MTX', indice: 2 }]);
  deepStrictEqual([...p].sort(), ['m']);
});

test('el grafico del general entra por su prefijo', () => {
  const p = prefijosPermitidos([{ tipo: 'MASTER' }]);
  // La forma real: 31 bandas por lado, un escalar por banda.
  strictEqual(ecualizacionPermitida('m.eq.peak.l.0', p), true);
  strictEqual(ecualizacionPermitida('m.eq.peak.r.30', p), true);
  strictEqual(ecualizacionPermitida('m.eq.hpf.l', p), true);
  // Y la ruta inventada que la lista blanca usaba tambien entraria, porque
  // empieza igual. Eso no la hace existir: lo que cambio es que ya no hace
  // falta enumerar rutas para autorizar un bus.
  strictEqual(ecualizacionPermitida('m.eq.b1.gain', p), true);
});

test('autorizar un bus para ecualizar NO autoriza a mover su nivel', () => {
  const p = prefijosPermitidos([{ tipo: 'AUX', indice: 3 }]);
  strictEqual(ecualizacionPermitida('a.3.eq.peak.12', p), true);
  strictEqual(ecualizacionPermitida('a.3.mix', p), false, 'el fader del auxiliar 3');
  strictEqual(ecualizacionPermitida('a.3.mute', p), false);
});

test('un bus que no esta declarado no pasa, aunque sea del mismo tipo', () => {
  const p = prefijosPermitidos([{ tipo: 'AUX', indice: 3 }]);
  strictEqual(ecualizacionPermitida('a.5.eq.peak.12', p), false);
  // Y el prefijo tiene que terminar donde termina: `a.30` no es `a.3`.
  strictEqual(ecualizacionPermitida('a.30.eq.peak.12', p), false);
});

test('solo el ecualizador parametrico admite factor de calidad', () => {
  strictEqual(admiteFactorDeCalidad('i.0.eq.b1.q'), true, 'el de canal es parametrico');
  strictEqual(admiteFactorDeCalidad('m.eq.peak.l.12'), false, 'el del general es grafico');
  strictEqual(admiteFactorDeCalidad('a.3.eq.peak.12'), false);
  strictEqual(admiteFactorDeCalidad('m.eq.hpf.l'), false);
});
