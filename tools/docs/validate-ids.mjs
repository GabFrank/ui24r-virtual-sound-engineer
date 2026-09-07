#!/usr/bin/env node
// Verifica que todo identificador referenciado en la documentación exista.
// Una auditoría encontró 22 referencias huérfanas en el backlog: este script
// evita que vuelva a pasar.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const DOCS = join(ROOT, 'docs');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

const files = walk(DOCS);
const contents = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const all = [...contents.values()].join('\n');

// Un identificador está DEFINIDO si aparece como encabezado, como nombre de
// archivo, o como primera celda de una fila de tabla.
const defined = new Set();

for (const f of files) {
  const base = f.split('/').pop().replace('.md', '');
  const m = base.match(/^(ADR-\d{3}|SPK-[A-Za-z0-9.'-]+|G-[A-E])/);
  if (m) defined.add(m[1].replace(/^SPK-/, 'SPK-'));
}
for (const [, text] of contents) {
  for (const m of text.matchAll(/^#{1,6}\s+(ADR-\d{3}|INV-\d{3}|SPK-[A-Za-z0-9.'-]+|G-[A-E]|EP-\d{2}|S-\d{2}\.\d+[a-z]?|R-\d{2}|DEC-\d+)/gm)) {
    defined.add(m[1]);
  }
  for (const m of text.matchAll(/^\|\s*\[?(ADR-\d{3}|INV-\d{3}|SPK-[A-Za-z0-9.'-]+|G-[A-E]|EP-\d{2}|S-\d{2}\.\d+[a-z]?|R-\d{2}|DEC-\d+)\]?/gm)) {
    defined.add(m[1]);
  }
  // Definiciones dentro del backlog: "### S-02.4 Título" ya cubierto arriba,
  // más las filas del orden de implementación "| 019 | S-02.5a | ..."
  for (const m of text.matchAll(/^\|\s*\d{3}\s*\|\s*([A-Za-z0-9.'-]+)\s*\|/gm)) {
    defined.add(m[1]);
  }
}

// Referencias: cualquier identificador citado en el texto.
const REF = /\b(ADR-\d{3}|INV-\d{3}|G-[A-E])\b/g;
const problems = [];

for (const [f, text] of contents) {
  const rel = relative(ROOT, f);
  for (const m of text.matchAll(REF)) {
    const id = m[1];
    if (defined.has(id)) continue;
    // Los rangos del tipo "INV-001 … INV-033" citan extremos, no cada valor.
    problems.push({ file: rel, id });
  }
}

// Deduplica por archivo e identificador.
const seen = new Set();
const unique = problems.filter((p) => {
  const k = `${p.file}::${p.id}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length > 0) {
  console.error('Identificadores referenciados que no están definidos en ningún documento:\n');
  for (const p of unique) console.error(`  ${p.file}  →  ${p.id}`);
  console.error(`\n${unique.length} referencias sin definir.`);
  process.exit(1);
}

console.log(`Documentación validada: ${files.length} archivos, ${defined.size} identificadores definidos, 0 referencias huérfanas.`);
