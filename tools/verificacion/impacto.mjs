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
