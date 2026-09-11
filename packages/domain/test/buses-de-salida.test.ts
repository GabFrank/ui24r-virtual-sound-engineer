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
  // **Acá había una aserción que defendía el bug.** Afirmaba que la ruta
  // paramétrica que la lista blanca de INV-008 usó durante meses --la que la
  // consola no manda, con banda y ganancia-- está AUTORIZADA, «para dejar
  // constancia de que un paramétrico de salida entraría por el mismo camino».
  //
  // El día que alguien acote esto a las 66 claves reales del general, que es el
  // apriete correcto, ese test habría fallado y empujado en contra. **Una guarda
  // que defiende el bug.** La constancia queda en este comentario, que no vota.
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

test('el prefijo autoriza FILTROS, no todo lo que vive bajo .eq.', () => {
  // **Lo encontro una auditoria.** `path.startsWith('<bus>.eq.')` autorizaba
  // cuatro cosas que no son filtros, y el docstring del modulo las ENUMERA:
  //
  // - `bypass` anula la correccion de sala entera en una escritura, y su delta
  //   de 0 a 1 pasa por debajo del tope de realce sin que nadie lo vea;
  // - `linked` ata los dos lados del estereo;
  // - `prmod`/`prname` recuperan un preset: reemplazan las 62 bandas de golpe,
  //   y el tope por banda no ve nada porque el valor es un indice, no dB.
  //
  // INV-008 admite «filtros PEQ/GEQ (gain, freq, Q) y HPF». Nada mas.
  const p = prefijosPermitidos([{ tipo: 'MASTER' }]);
  strictEqual(ecualizacionPermitida('m.eq.peak.l.12', p), true, 'una banda del grafico');
  strictEqual(ecualizacionPermitida('m.eq.hpf.l', p), true, 'el pasa-altos');
  strictEqual(ecualizacionPermitida('m.eq.lpf.r', p), true, 'el pasa-bajos');

  strictEqual(ecualizacionPermitida('m.eq.bypass', p), false, 'anula la correccion entera');
  strictEqual(ecualizacionPermitida('m.eq.linked', p), false);
  strictEqual(ecualizacionPermitida('m.eq.prmod', p), false, 'recall de preset');
  strictEqual(ecualizacionPermitida('m.eq.prname', p), false);
  // **Esta asercion se borro y el CHANGELOG la conto como arreglada.** El motivo
  // declarado --que `m.eq.easy` no existe en el general-- no aplica a una
  // asercion NEGATIVA: probar que una ruta inexistente se rechaza es
  // exactamente lo que la lista de deliberadas existe para permitir. A las otras
  // dos rutas del mismo hallazgo se les cambio el nombre conservando la
  // asercion; a esta se la elimino.
  strictEqual(ecualizacionPermitida('m.eq.easy', p), false);
});
