import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuenta } from '../src/app/ui/plural.ts';

test('uno va en singular', () => {
  // Es el caso que estaba mal en la pantalla de perfiles: «1 integrantes».
  assert.equal(cuenta(1, 'integrante', 'integrantes'), '1 integrante');
  assert.equal(cuenta(1, 'canal asignado', 'canales asignados'), '1 canal asignado');
});

test('cero va en plural, como en castellano', () => {
  assert.equal(cuenta(0, 'integrante', 'integrantes'), '0 integrantes');
});

test('mas de uno va en plural', () => {
  assert.equal(cuenta(2, 'local', 'locales'), '2 locales');
  assert.equal(cuenta(24, 'componente', 'componentes'), '24 componentes');
});
