import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { GRUPOS } from '../impacto.mjs';

function repositorio(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'vse-ejecutar-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, 'tools/verificacion'), { recursive: true });
  for (const nombre of ['ejecutar.mjs', 'impacto.mjs', 'git.mjs']) {
    cpSync(new URL(`../${nombre}`, import.meta.url), join(cwd, 'tools/verificacion', nombre));
  }
  const scripts = Object.fromEntries(Object.values(GRUPOS).map((script) => [script, 'node -e "process.exit(0)"']));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts }));
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['add', '.'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=Prueba', '-c', 'user.email=p@example.invalid', 'commit', '-m', 'base'], { cwd, stdio: 'ignore' });
  return { cwd, scripts, correr: (...args) => spawnSync(process.execPath, ['tools/verificacion/ejecutar.mjs', ...args], { cwd, encoding: 'utf8' }) };
}

test('una suite fallida mantiene su código, log completo y alcance parcial', (t) => {
  const { cwd, scripts, correr } = repositorio(t);
  scripts['validate:docs'] = 'node -e "console.log(\'evidencia completa\'); process.exit(7)"';
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts }));
  const r = correr();
  assert.equal(r.status, 7);
  assert.match(r.stdout, /1\/9 grupos ejecutados/);
  const carpeta = join(cwd, '.artifacts/verificacion', readdirSync(join(cwd, '.artifacts/verificacion'))[0]);
  const resumen = JSON.parse(readFileSync(join(carpeta, 'resumen.json'), 'utf8'));
  assert.equal(resumen.resultados.length, 1);
  assert.equal(resumen.resultados[0].codigo, 7);
  assert.match(readFileSync(join(carpeta, 'docs.log'), 'utf8'), /evidencia completa/);
});

test('base inexistente falla; plan de prosa muestra sólo documentación sin ejecutarla', (t) => {
  const { cwd, correr } = repositorio(t);
  assert.equal(correr('--cambio', '--base', 'inexistente').status, 1);
  writeFileSync(join(cwd, 'README.md'), 'prosa');
  const r = correr('--cambio', '--plan');
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout).grupos, ['docs']);
  assert.throws(() => readdirSync(join(cwd, '.artifacts')));
});
