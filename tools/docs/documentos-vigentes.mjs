import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Alcance declarado.
 *
 * **Las decisiones y los contratos entran; los cierres, los pedidos y el
 * backlog no.** Decisión del usuario del 2026-09-21, entre tres alcances: una
 * ADR se cita como vigente aunque tenga fecha, y un contrato es donde vive la
 * ley que la tabla publica. Los cierres y los pedidos son historia fechada.
 *
 * **Y hay que decir lo que la guarda miraba antes de este listado, porque se
 * afirmó mal el mismo día.** La disciplina decía que recorría «todos los .md
 * del repositorio»; su `listar` no entraba en subcarpetas, así que miraba los
 * de primer nivel de `docs/` y el README --unos treinta-- y ninguna ADR ni
 * ningún contrato. La primera versión de este listado no la achicó: la hizo
 * explícita y le sumó skills, AGENTS y CONTRIBUTING. Sumar ADR y contratos
 * --de 37 a 112 documentos-- encontró en el primer pase una cita de código
 * anterior a una medición, en el contrato 103.
 */
export function documentosVigentes(raiz) {
  const directos = (dir) => readdirSync(join(raiz, dir), { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.md')).map((f) => `${dir}/${f.name}`);
  return [
    'README.md', 'AGENTS.md', 'CONTRIBUTING.md',
    '.claude/skills/vse-experto/SKILL.md',
    '.claude/skills/vse-experto/referencia.md',
    '.claude/skills/vse-disciplina/SKILL.md',
    '.claude/skills/vse-disciplina/cicatrices.md',
    ...directos('docs'), ...directos('docs/desarrollo'), ...directos('docs/templates'),
    ...directos('docs/adr'), ...directos('docs/compromisos'),
  ];
}
