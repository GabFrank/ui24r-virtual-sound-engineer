#!/usr/bin/env node
/**
 * Pasa commitlint sobre los commits que esta rama agrega a `main`.
 *
 * Existe porque el mismo error costó dos ciclos de integración continua: un
 * asunto de 74 caracteres cuando el máximo es 72, descubierto después de
 * empujar. Comprobarlo antes cuesta dos segundos.
 *
 * Comprueba **el rango**, no el último commit: un asunto largo de hace tres
 * commits sigue rompiendo la comprobación de la rama, y eso es justo lo que
 * pasó — un commit ya corregido en `main` seguía vivo en otra rama.
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(...args) {
  return execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();
}

let base;
try {
  base = git('merge-base', 'origin/main', 'HEAD');
} catch {
  console.log('Sin origin/main a mano: no hay rango que comprobar.');
  process.exit(0);
}

if (base === git('rev-parse', 'HEAD')) {
  console.log('Esta rama no agrega commits sobre main.');
  process.exit(0);
}

try {
  execFileSync('npx', ['commitlint', '--from', base, '--to', 'HEAD', '--verbose'], {
    cwd: RAIZ, stdio: 'inherit',
  });
} catch {
  console.error(
    '\nUn commit de esta rama no cumple la convención.\n' +
    'Si ya está corregido en main, la rama puede llevar todavía la versión vieja:\n' +
    '  git rebase origin/main',
  );
  process.exit(1);
}
