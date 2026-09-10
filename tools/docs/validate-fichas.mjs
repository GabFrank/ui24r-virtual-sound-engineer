/**
 * Que ninguna pantalla use una ficha de diseño que no existe.
 *
 * **El error que lo trajo.** La pantalla del espectro se escribió con
 * `--c-aviso`, `--c-senal`, `--c-superficie-2` y `--r-2`. Ninguna de las cuatro
 * existe: las fichas de verdad se llaman `--warn`, `--signal`, `--surface-2` y
 * `--radio-md`. La aplicación compiló, los tests pasaron y la pantalla se
 * dibujó igual, porque `var()` con valor de reserva no falla: cae al segundo
 * argumento y sigue.
 *
 * El resultado fue una barra que tenía que salir naranja para marcar la banda
 * que se está quedando colgada, y salía blanca como todas las demás. **La
 * pantalla decía «1 banda sostenida» y no señalaba cuál.** Se descubrió
 * mirando la captura, que es el único sitio donde se veía, y solo porque la
 * captura existía.
 *
 * Un valor de reserva es una decisión legítima cuando la ficha puede no estar.
 * Acá nunca puede no estar: `_tokens.scss` se carga siempre. Así que un
 * `var(--algo, otra-cosa)` que nunca usa la ficha es un nombre mal escrito
 * disfrazado de precaución.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKENS = join(RAIZ, 'apps/mobile/src/styles/_tokens.scss');
const FUENTES = join(RAIZ, 'apps/mobile/src/app');

const declaradas = new Set(
  [...readFileSync(TOKENS, 'utf8').matchAll(/^\s+(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
);

function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (nombre.endsWith('.ts') || nombre.endsWith('.scss')) salida.push(ruta);
  }
  return salida;
}

const problemas = [];
for (const ruta of archivos(FUENTES)) {
  const texto = readFileSync(ruta, 'utf8');
  texto.split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(/var\((--[a-z0-9-]+)/g)) {
      // Las que el propio archivo define --`--algo: valor` en un `:host`, por
      // ejemplo-- son suyas y no tienen por qué estar en las fichas.
      const propia = new RegExp(`${m[1]}\\s*:`).test(texto);
      if (!declaradas.has(m[1]) && !propia) {
        problemas.push(`${ruta.slice(RAIZ.length + 1)}:${i + 1}  ${m[1]}`);
      }
    }
  });
}

if (problemas.length > 0) {
  console.error(`\nFichas de diseño que no existen (${problemas.length}):\n`);
  for (const p of problemas) console.error(`  ✘ ${p}`);
  console.error(`\nLas fichas de verdad están en apps/mobile/src/styles/_tokens.scss.`);
  console.error('Un valor de reserva no arregla un nombre mal escrito: lo esconde.\n');
  process.exit(1);
}
console.log(`Fichas de diseño: ${declaradas.size} declaradas, todas las usadas existen.`);
