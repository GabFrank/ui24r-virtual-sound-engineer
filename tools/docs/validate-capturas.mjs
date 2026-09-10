/**
 * Que `docs/visual/` sea lo que los guiones producen hoy, ni más ni menos.
 *
 * **El error que lo trajo.** `flujo.mjs` ganó un paso y los que venían después
 * se corrieron un número: lo que era `24-paro-en-dialogo` pasó a ser el 25 y el
 * 24 pasó a ser el diagnóstico. Copiar las nuevas encima dejó las dos viejas
 * ahí, con su nombre de siempre, **describiendo un paso que ya no existe en ese
 * lugar del recorrido**. Una captura obsoleta no se ve obsoleta: se ve como
 * documentación.
 *
 * **Lo que NO hace, y conviene saberlo.** Recorre los archivos que hay en disco
 * y comprueba que estén en el índice. **No recorre el índice**, así que una
 * entrada del README que apunte a una imagen inexistente pasa limpia. El
 * comentario decía antes que sí lo hacía; una guarda que se describe de más es
 * peor que una que falta, porque nadie va a revisar lo que cree cubierto.
 *
 * No compara el contenido de las imágenes --eso cambiaría con cualquier
 * navegador distinto--, solo qué archivos hay. Corre únicamente si
 * `tools/visual/out/` existe, porque en integración continua nadie sacó
 * capturas y no habría con qué comparar.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(RAIZ, 'tools/visual/out');
const DOCS = join(RAIZ, 'docs/visual');

const pngs = (dir) => new Set(readdirSync(dir).filter((n) => n.endsWith('.png')));
const guardadas = pngs(DOCS);

// El índice del README tiene que nombrar lo que hay guardado.
const readme = readFileSync(join(DOCS, 'README.md'), 'utf8');
const sinIndice = [...guardadas].filter(
  (n) => !readme.includes(n) && !n.startsWith('flujo-') && !n.startsWith('ds-'),
).sort();

const problemas = [];
for (const n of sinIndice) problemas.push(`${n}  no aparece en el índice del README`);

if (existsSync(OUT)) {
  const recien = pngs(OUT);
  if (recien.size > 0) {
    for (const n of [...guardadas].sort()) {
      if (!recien.has(n)) problemas.push(`${n}  guardada, pero los guiones ya no la producen`);
    }
    for (const n of [...recien].sort()) {
      if (!guardadas.has(n)) problemas.push(`${n}  se produjo, pero no se copió a docs/visual/`);
    }
  }
} else {
  console.log('Capturas: sin `tools/visual/out/`, solo se revisa el índice.');
}

if (problemas.length > 0) {
  console.error(`\nCapturas desalineadas (${problemas.length}):\n`);
  for (const p of problemas) console.error(`  ✘ ${p}`);
  console.error('\nSe regeneran con `node tools/visual/capture.mjs` y `node tools/visual/flujo.mjs`,');
  console.error('y se copian de tools/visual/out/ a docs/visual/.\n');
  process.exit(1);
}
console.log(`Capturas: ${guardadas.size} guardadas, alineadas con los guiones y con el índice.`);
