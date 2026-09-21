import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMPLETA, seleccionar } from '../impacto.mjs';
import { archivosCambiados } from '../git.mjs';

test('la prosa no ejecuta audio; los contratos y lo desconocido sí', () => {
  assert.deepEqual(seleccionar(['docs/estado-actual.md']).grupos, ['docs']);
  for (const archivo of ['docs/safety-invariants.md', 'docs/compromisos/121.md',
    'docs/spikes/P0/evidence/medicion.txt', 'packages/safety/src/engine.ts',
    'package-lock.json', 'tools/verificacion/impacto.mjs', 'nuevo/formato.xyz']) {
    assert.deepEqual(seleccionar([archivo]).grupos, COMPLETA, archivo);
  }
});

test('un cambio mixto nunca oculta la comprobación más amplia', () => {
  const grupos = seleccionar(['docs/estado-actual.md', 'apps/mobile/src/app/pantalla.ts']).grupos;
  for (const requerido of ['docs', 'lint', 'unit', 'templates', 'limites']) assert.ok(grupos.includes(requerido));
  assert.ok(!grupos.includes('dsp'));
  assert.deepEqual(seleccionar(['README.md', 'packages/dsp-contract/src/index.ts']).grupos, COMPLETA);
});

test('el rango incluye commits, índice, nuevos, borrados y ambos lados de un traslado', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'vse-impacto-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Prueba'); git('config', 'user.email', 'prueba@example.invalid');
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'docs/base.md'), 'base');
  writeFileSync(join(cwd, 'eliminado.ts'), 'base');
  git('add', '.'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'confirmado.ts'), 'commit');
  git('add', '.'); git('commit', '-m', 'segundo');
  renameSync(join(cwd, 'docs/base.md'), join(cwd, 'docs/destino.md'));
  rmSync(join(cwd, 'eliminado.ts'));
  git('add', '.');
  writeFileSync(join(cwd, 'sin seguimiento.ts'), 'nuevo');
  assert.deepEqual(archivosCambiados(cwd, base), [
    'confirmado.ts', 'docs/base.md', 'docs/destino.md', 'eliminado.ts', 'sin seguimiento.ts',
  ]);
  assert.throws(() => archivosCambiados(cwd, 'base-inexistente'));
});

test('un cambio preparado no desaparece si el archivo vuelve a HEAD sin preparar', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'vse-indice-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init'); git('config', 'user.name', 'Prueba'); git('config', 'user.email', 'p@example.invalid');
  writeFileSync(join(cwd, 'limite.ts'), 'original');
  git('add', '.'); git('commit', '-m', 'base');
  writeFileSync(join(cwd, 'limite.ts'), 'cambio preparado');
  git('add', '.');
  writeFileSync(join(cwd, 'limite.ts'), 'original');
  assert.equal(git('diff', 'HEAD', '--name-only'), '');
  assert.deepEqual(archivosCambiados(cwd), ['limite.ts']);
  assert.deepEqual(seleccionar(archivosCambiados(cwd)).grupos, COMPLETA);
});
