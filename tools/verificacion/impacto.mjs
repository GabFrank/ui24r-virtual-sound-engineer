/** Selección conservadora: lo desconocido y los contratos ejecutan todo. */
export const GRUPOS = Object.freeze({
  docs: 'validate:docs',
  templates: 'validate:templates',
  limites: 'validate:limites',
  lint: 'lint',
  unit: 'test',
  dsp: 'test:dsp',
  audio: 'test:audio',
  guardas: 'test:guardas',
  flujo: 'test:flujo',
});
export const COMPLETA = Object.freeze(Object.keys(GRUPOS));

/**
 * Grupos que pueden correr a la vez, y por qué sólo éstos.
 *
 * Medido el 2026-09-21 sobre la Mac del usuario: la suite completa tardaba
 * 265 s y **179 eran señal y audio, uno detrás del otro** --dos tercios--. La
 * selección por impacto no los toca, porque tres de cada cuatro commits de este
 * repositorio van a suite completa igual. Correrlos juntos es la palanca grande.
 *
 * Son independientes: señal escribe en `tools/spikes/p0-10a-dsp/out` y audio en
 * el temporal del sistema, y ninguno lee lo que escribe el otro. Los demás
 * grupos se quedan en serie a propósito: `lint` compila la aplicación, `unit`
 * corre los tests de todos los workspaces --varios procesos ya--, y `docs`
 * escribe en `.artifacts`. Poner uno más en paralelo pide medir que no se pisan.
 */
export const PARALELOS = Object.freeze(['dsp', 'audio']);

export function seleccionar(archivos) {
  const grupos = new Set();
  const motivos = [];
  for (const archivo of archivos) {
    let seleccion;
    // Contratos, evidencia y configuración no son edición de prosa, aunque
    // algunos terminen en .md. Sin una clasificación conocida, falla a completo.
    if (/^docs\/(?:adr|compromisos|spikes|gates)\//.test(archivo)
      || /^docs\/(?:safety-invariants|autonomy-matrix|capability-matrix|protocol-spec)\.md$/.test(archivo)) {
      seleccion = COMPLETA;
    } else if (archivo.endsWith('.md') && (
      archivo.startsWith('docs/') || archivo.startsWith('.claude/skills/')
      || ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'CHANGELOG.md'].includes(archivo)
    )) {
      seleccion = ['docs'];
    } else if (/^apps\/mobile\/(?:src|test)\//.test(archivo)) {
      seleccion = ['docs', 'templates', 'limites', 'lint', 'unit'];
    } else {
      seleccion = COMPLETA;
    }
    motivos.push({ archivo, grupos: [...seleccion] });
    seleccion.forEach((grupo) => grupos.add(grupo));
  }
  return { grupos: COMPLETA.filter((grupo) => grupos.has(grupo)), motivos };
}
