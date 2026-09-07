import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OWNERSHIP, ownership, esEscribible, parametrosSoloDelUsuario,
  type ParameterKind,
} from '../src/rules/ownership.ts';

/**
 * INV-008 e INV-010. Este es el test que impide que un refactor descuidado
 * deje al músico sin monitores en pleno show.
 */

test('INV-010: ningún parámetro de la categoría solo del usuario es escribible', () => {
  for (const kind of parametrosSoloDelUsuario()) {
    assert.equal(
      esEscribible(kind), false,
      `${kind} pertenece al usuario y quedó marcado como escribible`,
    );
  }
});

test('INV-010: los envíos de monitores nunca son escribibles', () => {
  assert.equal(ownership('MONITOR_AUX_SEND').owner, 'USER_ONLY');
  assert.equal(esEscribible('MONITOR_AUX_SEND'), false);
});

test('INV-009: el fader general no es escribible', () => {
  assert.equal(esEscribible('MASTER_FADER'), false);
});

test('INV-007: la alimentación fantasma no es escribible', () => {
  assert.equal(ownership('PHANTOM').owner, 'USER_ONLY');
  assert.equal(esEscribible('PHANTOM'), false);
});

test('el limitador de salida no se automatiza: protege el sistema', () => {
  assert.equal(esEscribible('OUTPUT_LIMITER'), false);
});

test('la supresión de realimentación es manual', () => {
  assert.equal(ownership('AFS2').owner, 'USER_ONLY');
  assert.equal(esEscribible('AFS2'), false);
});

test('todo parámetro declarado tiene dueño, y no hay duplicados', () => {
  const vistos = new Set<ParameterKind>();
  for (const e of OWNERSHIP) {
    assert.ok(!vistos.has(e.kind), `${e.kind} está declarado dos veces`);
    vistos.add(e.kind);
    assert.ok(e.owner, `${e.kind} sin dueño`);
  }
});

test('un parámetro no declarado lanza en vez de asumir que se puede escribir', () => {
  assert.throws(
    () => ownership('NO_EXISTE' as ParameterKind),
    /sin propiedad declarada/,
  );
});

test('los únicos routings escribibles son el bus de análisis y el reproductor', () => {
  const routings: ParameterKind[] = [
    'ANALYSIS_BUS_SEND', 'PLAYER_SEND', 'MONITOR_AUX_SEND', 'FX', 'SUBGROUP', 'VCA',
  ];
  const escribibles = routings.filter(esEscribible);
  assert.deepEqual(escribibles.sort(), ['ANALYSIS_BUS_SEND', 'PLAYER_SEND']);
});
