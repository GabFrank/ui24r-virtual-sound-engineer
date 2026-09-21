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

const args = process.argv.slice(2);
if (args.length !== 0 && (args.length !== 2 || args[0] !== '--base')) {
  console.error('Uso: npm run verificar:commits -- [--base <ref>]');
  process.exit(1);
}
let base;
try {
  base = args.length === 2
    ? git('rev-parse', '--verify', '--end-of-options', `${args[1]}^{commit}`)
    : git('merge-base', 'origin/main', 'HEAD');
} catch {
  console.error('No se pudo resolver la base. Obtener origin/main o indicar --base <ref> existente. No se verificaron mensajes.');
  process.exit(1);
}

if (base === git('rev-parse', 'HEAD')) {
  console.log('Esta rama no agrega commits sobre la base indicada.');
  process.exit(0);
}

try {
  execFileSync('npx', ['--no-install', 'commitlint', '--from', base, '--to', 'HEAD', '--verbose'], {
    cwd: RAIZ, stdio: 'inherit',
  });
} catch {
  console.error(
    '\nUn commit de esta rama no cumple la convención.\n' +
    'Comprobar el rango y corregir sólo mensajes propios no publicados; no reescribir historia ajena.\n',
  );
  process.exit(1);
}
