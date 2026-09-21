#!/usr/bin/env node
/** Compila decoradores para probar las clases reales sin navegador ni consola. */
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pruebas = join(raiz, 'apps/mobile/test/integration');
const archivos = readdirSync(pruebas).filter((f) => f.endsWith('.test.mjs'));
if (archivos.length === 0) throw new Error('No hay pruebas de integración: no es verde.');
mkdirSync(join(raiz, '.artifacts'), { recursive: true });
const salida = mkdtempSync(join(raiz, '.artifacts', 'mobile-integration-'));
try {
  await build({
    absWorkingDir: raiz,
    entryPoints: archivos.map((f) => join(pruebas, f)),
    outdir: salida, outExtension: { '.js': '.mjs' },
    bundle: true, platform: 'node', format: 'esm', target: 'node22',
    tsconfig: 'apps/mobile/tsconfig.json', sourcemap: 'inline',
    external: ['@angular/*', '@capacitor/*', '@capacitor-community/*', 'rxjs', 'rxjs/*'],
  });
  const r = spawnSync(process.execPath, [
    '--test', '--enable-source-maps', ...process.argv.slice(2),
    ...archivos.map((f) => join(salida, f)),
  ], { cwd: raiz, stdio: 'inherit' });
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(salida, { recursive: true, force: true });
}
