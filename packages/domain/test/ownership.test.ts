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

// **Este test decía «nunca» y lo abrió ADR-028.** El usuario lo autorizó
// eligiendo «Sí, y también para el ajuste normal de monitores», y se abrió
// recién cuando la ley del envío quedó medida: sin ella no hay límite en
// decibeles que declarar, e INV-004 rechaza todo parámetro sin límite.
//
// **Lo que INV-010 protege ahora no es «nunca», y vive en el motor**: sólo la
// hoja `.value`, con techo en donde estaba el envío y fuera del show. Sus tests
// están en `packages/safety/test/`.
test('ADR-028: el envío a monitor es escribible por el asistente de canal', () => {
  assert.equal(ownership('MONITOR_AUX_SEND').owner, 'CHANNEL_ASSISTANT');
  assert.equal(esEscribible('MONITOR_AUX_SEND'), true);
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

test('qué routings son escribibles, y el envío a monitor entró por ADR-028', () => {
  const routings: ParameterKind[] = [
    'ANALYSIS_BUS_SEND', 'PLAYER_SEND', 'MONITOR_AUX_SEND', 'FX', 'SUBGROUP', 'VCA',
  ];
  const escribibles = routings.filter(esEscribible);
  assert.deepEqual(
    escribibles.sort(), ['ANALYSIS_BUS_SEND', 'MONITOR_AUX_SEND', 'PLAYER_SEND'],
    'si esta lista crece, algo que era del usuario dejó de serlo',
  );
  // **Y los que siguen cerrados importan tanto como los que se abrieron.** Un
  // envío a efecto, un subgrupo o un VCA mueven el sonido de un canal por un
  // camino que el operador no está mirando.
  assert.deepEqual(
    routings.filter((k) => !esEscribible(k)).sort(), ['FX', 'SUBGROUP', 'VCA'],
  );
});
