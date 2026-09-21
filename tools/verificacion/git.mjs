import { execFileSync } from 'node:child_process';

export function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
  }).trimEnd();
}

/** Incluye commits, índice, árbol de trabajo, archivos nuevos y eliminaciones. */
export function archivosCambiados(cwd, base = 'HEAD') {
  const desde = git(cwd, 'rev-parse', '--verify', '--end-of-options', `${base}^{commit}`);
  const listar = (...args) => git(cwd, ...args).split('\0').filter(Boolean);
  return [...new Set([
    ...listar('diff', '--no-renames', '--name-only', '-z', desde, 'HEAD', '--'),
    // Separar índice y árbol: cambios opuestos pueden cancelar el diff HEAD,
    // pero el próximo commit todavía incluiría lo que quedó en el índice.
    ...listar('diff', '--cached', '--no-renames', '--name-only', '-z', 'HEAD', '--'),
    ...listar('diff', '--no-renames', '--name-only', '-z', '--'),
    ...listar('ls-files', '--others', '--exclude-standard', '-z'),
  ])].sort();
}
