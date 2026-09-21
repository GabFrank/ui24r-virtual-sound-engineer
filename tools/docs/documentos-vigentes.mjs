import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Alcance declarado. Los cierres y contratos fechados conservan su historia. */
export function documentosVigentes(raiz) {
  const directos = (dir) => readdirSync(join(raiz, dir), { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => `${dir}/${f.name}`);
  return [
    'README.md', 'AGENTS.md', 'CONTRIBUTING.md',
    '.claude/skills/vse-experto/SKILL.md',
    '.claude/skills/vse-experto/referencia.md',
    '.claude/skills/vse-disciplina/SKILL.md',
    ...directos('docs'), ...directos('docs/desarrollo'), ...directos('docs/templates'),
  ];
}
