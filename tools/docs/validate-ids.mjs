#!/usr/bin/env node
/**
 * Verifica que todo identificador citado en la documentación exista.
 *
 * Una auditoría encontró 22 referencias huérfanas en el backlog. Este script
 * nació para evitar que volviera a pasar, y durante meses **no lo evitó**: el
 * conjunto de definiciones reconocía ocho familias de identificador y el de
 * referencias comprobaba tres. Una cita a un spike, a un epic, a una historia,
 * a un riesgo o a una decisión no se comparaba contra nada, y así sobrevivió
 * una referencia a EP-09 —que no existe— en un documento que este mismo script
 * daba por validado.
 *
 * Por eso ahora las dos listas salen de un solo sitio: si divergen, es porque
 * alguien las hizo divergir a propósito.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const DOCS = join(ROOT, 'docs');

/**
 * Las familias de identificador, una sola vez.
 *
 * El de los spikes es el único que no es trivial: el identificador es
 * `SPK-P0.6` o `SPK-ACK-POLICY`, y el nombre del archivo le agrega un título en
 * minúsculas detrás. La distinción es la caja: el identificador termina donde
 * empieza la primera palabra en minúsculas.
 */
const FAMILIAS = [
  'ADR-\\d{3}',
  'INV-\\d{3}',
  'G-[A-E]',
  'SPK-(?:P\\d+\\.\\d+[a-z]?|[A-Z0-9]+(?:-[A-Z0-9]+)*)',
  'EP-\\d{2}',
  'S-\\d{2}\\.\\d+[a-z]?',
  'R-\\d{2}',
  'DEC-\\d+',
];
const ALTERNATIVA = FAMILIAS.join('|');

/**
 * Los bordes, que no son `\b`.
 *
 * `\b` considera `_` parte de la palabra, así que en `_SPK-P0.2a_` -- una cita
 * en cursiva, que en este repositorio son muchas -- el borde derecho fallaba,
 * la alternativa larga se descartaba y quedaba capturado `SPK-P0`, un
 * identificador que no existe. El borde correcto es «ni letra, ni dígito, ni
 * guión»: el guión importa para que `R-19` no se lea dentro de `ADR-19`.
 */
const IZQ = '(?<![A-Za-z0-9-])';
const DER = '(?![A-Za-z0-9])';

/**
 * Citas deliberadas a identificadores que no existen, con su motivo.
 *
 * No es una lista de excepciones para acallar al script: cada entrada dice por
 * qué la cita es correcta. Un identificador condicional -- un spike que solo
 * existirá si otro sale PASS -- o el nombre viejo de una historia en el
 * registro de cambios son citas legítimas a algo que, por definición, no está
 * definido.
 */
const CITAS_DELIBERADAS = new Map([
  ['SPK-P0.3c', 'Spike condicional: solo se escribe si SPK-P0.3b sale PASS y se adopta el ' +
    'USB-B directo. Citarlo antes es el punto de la decisión DEC-19.'],
  ['SPK-P0.7', 'Nombre previo a la división en SPK-P0.7a y SPK-P0.7b. Se cita en el registro ' +
    'de cambios, que describe justamente esa división.'],
  ['S-02.9', 'Nombre previo a la división en S-02.9a y S-02.9b, citado en el registro de ' +
    'cambios que la describe.'],
  ['S-02.10', 'Nombre previo a la división en S-02.10a y S-02.10b, ídem.'],
]);

/**
 * Documentos que son registros fechados y no se editan.
 *
 * Una auditoría dice lo que dijo el día que se hizo. Corregirle las referencias
 * para que cuadren con el backlog de hoy sería falsificar el registro: si citó
 * un epic que después desapareció, eso *es* parte del hallazgo. Se los excluye
 * de la comprobación de referencias, no de la de definiciones.
 */
const REGISTROS_CONGELADOS = /^docs\/backlog\/(01-auditoria-integrada\.md|auditorias\/)/;

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

// Un identificador está DEFINIDO si titula un archivo, encabeza una sección, o
// abre una fila de tabla.
const defined = new Set();

for (const f of files) {
  const base = f.split('/').pop().replace('.md', '');
  const m = base.match(new RegExp(`^(${ALTERNATIVA})${DER}`));
  if (m) defined.add(m[1]);
}
for (const [, text] of contents) {
  for (const m of text.matchAll(new RegExp(`^#{1,6}\\s+(${ALTERNATIVA})${DER}`, 'gm'))) {
    defined.add(m[1]);
  }
  for (const m of text.matchAll(new RegExp(`^\\|\\s*\\[?(${ALTERNATIVA})${DER}`, 'gm'))) {
    defined.add(m[1]);
  }
  // Las filas del orden de implementación: "| 019 | S-02.5a | ...".
  for (const m of text.matchAll(/^\|\s*\d{3}\s*\|\s*([A-Za-z0-9.'-]+)\s*\|/gm)) {
    defined.add(m[1]);
  }
}

// Referencias: cualquier identificador citado en el texto, de las mismas ocho
// familias que se reconocen como definición.
const REF = new RegExp(`${IZQ}(${ALTERNATIVA})${DER}`, 'g');
const problems = [];
let congelados = 0;

for (const [f, text] of contents) {
  const rel = relative(ROOT, f);
  if (REGISTROS_CONGELADOS.test(rel)) { congelados++; continue; }
  for (const m of text.matchAll(REF)) {
    if (defined.has(m[1])) continue;
    if (CITAS_DELIBERADAS.has(m[1])) continue;
    problems.push({ file: rel, id: m[1] });
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

console.log(
  `Documentación validada: ${files.length} archivos, ` +
  `${defined.size} identificadores definidos, 0 referencias huérfanas ` +
  `(${CITAS_DELIBERADAS.size} citas deliberadas, ${congelados} registros congelados).`,
);
