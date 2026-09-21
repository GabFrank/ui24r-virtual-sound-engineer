import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { GRUPOS, PARALELOS } from '../impacto.mjs';

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

test('señal y audio corren a la vez, y los demás de a uno', (t) => {
  const { cwd, scripts, correr } = repositorio(t);
  // **Se mide el solapamiento, no el reloj total.** Una primera versión sumaba
  // los nueve grupos contra un umbral y falló en verde: cada `npm run` cuesta
  // unas décimas de arranque y siete de ellos ya superaban el margen. Lo que
  // hay que comprobar es que el intervalo de uno cae adentro del otro.
  for (const grupo of PARALELOS) {
    scripts[GRUPOS[grupo]] = `node -e "const f=require('fs');const a=Date.now();`
      + `setTimeout(()=>{f.writeFileSync('${grupo}.tiempos',a+' '+Date.now());process.exit(0)},700)"`;
  }
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts }));
  const r = correr();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /9\/9 grupos ejecutados/);
  assert.match(r.stdout, /dsp ‖ audio/);
  const [a, b] = PARALELOS.map((g) => readFileSync(join(cwd, `${g}.tiempos`), 'utf8').split(' ').map(Number));
  assert.ok(a[0] < b[1] && b[0] < a[1], `no se solaparon: dsp ${a}, audio ${b}`);
  const carpeta = join(cwd, '.artifacts/verificacion', readdirSync(join(cwd, '.artifacts/verificacion'))[0]);
  const resumen = JSON.parse(readFileSync(join(carpeta, 'resumen.json'), 'utf8'));
  assert.deepEqual(resumen.paralelos, [[...PARALELOS]]);
  // El orden de los resultados es el de la selección, no el de llegada.
  assert.deepEqual(resumen.resultados.map((x) => x.grupo), Object.keys(GRUPOS));
});

test('un fallo en un grupo paralelo deja terminar al vecino, anota los dos y corta', (t) => {
  const { cwd, scripts, correr } = repositorio(t);
  scripts[GRUPOS.dsp] = 'node -e "console.log(\'senal rota\'); process.exit(9)"';
  scripts[GRUPOS.audio] = 'node -e "setTimeout(() => { console.log(\'audio entero\'); process.exit(0); }, 300)"';
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ private: true, scripts }));
  const r = correr();
  assert.equal(r.status, 9);
  // Los cinco de antes, más los dos del lote: siete, y ninguno después.
  assert.match(r.stdout, /7\/9 grupos ejecutados/);
  assert.match(r.stderr, /senal rota/);
  const carpeta = join(cwd, '.artifacts/verificacion', readdirSync(join(cwd, '.artifacts/verificacion'))[0]);
  assert.match(readFileSync(join(carpeta, 'audio.log'), 'utf8'), /audio entero/);
  const resumen = JSON.parse(readFileSync(join(carpeta, 'resumen.json'), 'utf8'));
  assert.deepEqual(resumen.resultados.map((x) => [x.grupo, x.codigo]).slice(-2), [['dsp', 9], ['audio', 0]]);
});
