#!/usr/bin/env node
/**
 * Que la evidencia archivada corresponda al guion que dice.
 *
 * **Por qué existe.** `medir.mjs` escribe en cada evidencia la huella del guion
 * que la produjo, con esta promesa en el propio encabezado: *«si hoy no coincide,
 * el archivo es de otra version y lo que diga de si mismo no vale»*. **Nadie la
 * comprobaba.** Una auditoría de controles lo marcó el 2026-09-13 y midió el
 * daño: **20 de 30 evidencias con huella ya no coincidían** con su guion de
 * entonces, entre ellas la que `RAW_MAP` cita para haber promovido dos entradas
 * del ecualizador a `PROBADO`.
 *
 * Una promesa que nadie verifica es una promesa que se rompe sola.
 *
 * **Y la huella vieja cubría sólo el archivo de nivel superior**, así que cambiar
 * el instrumento que la medición importa no la movía: el mismo defecto que la
 * huella existe para impedir, entrando por la puerta de los imports. Desde el
 * 2026-09-13 cubre el cierre de imports locales, y esas evidencias llevan en su
 * encabezado cuántos archivos abarca.
 *
 * **Las dos listas son distintas a propósito:**
 *
 * - Las evidencias con huella **de formato viejo** no se pueden recomputar: su
 *   huella era de otro cálculo. Se cuentan y se informan, y no se acusa a nadie.
 * - Las de **formato nuevo** sí se recomputan, y una que no coincida es un
 *   hallazgo: o el guion cambió después de archivar, o la evidencia es de otra
 *   versión.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function cierreDeImports(entrada, vistos = new Set()) {
  const abs = resolve(entrada);
  if (vistos.has(abs) || !existsSync(abs)) return vistos;
  vistos.add(abs);
  const texto = readFileSync(abs, 'utf8');
  const base = dirname(abs);
  for (const m of texto.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const pedido = join(base, m[1]);
    for (const cand of [pedido, `${pedido}.ts`, `${pedido}.mjs`]) {
      if (existsSync(cand)) { cierreDeImports(cand, vistos); break; }
    }
  }
  return vistos;
}

function huellaDe(guion) {
  const archivos = [...cierreDeImports(join(RAIZ, guion))].sort();
  if (archivos.length === 0) return null;
  return {
    hex: createHash('sha256')
      .update(archivos.map((f) => `${relative(RAIZ, f)}\n${readFileSync(f)}`).join('\n'))
      .digest('hex').slice(0, 16),
    cuantos: archivos.length,
  };
}

function evidencias(dir, salida = []) {
  if (!existsSync(dir)) return salida;
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) evidencias(r, salida);
    else if (n.endsWith('.txt')) salida.push(r);
  }
  return salida;
}

let nuevas = 0;
let viejas = 0;
let sinHuella = 0;
const noCoinciden = [];
const guionQueNoEsta = [];

for (const ruta of evidencias(join(RAIZ, 'docs', 'spikes'))) {
  const texto = readFileSync(ruta, 'utf8').slice(0, 2000);
  const m = texto.match(/^# guion: (\S+) sha256:([0-9a-f]+)/m);
  if (m === null) { sinHuella += 1; continue; }
  const [, guion, hex] = m;
  // El formato nuevo declara cuántos archivos abarca. El viejo no, y su huella
  // salía de otro cálculo: recomputarla acusaría a todas en falso.
  if (!/^# la huella cubre \d+ archivo/m.test(texto)) { viejas += 1; continue; }
  nuevas += 1;
  if (!existsSync(join(RAIZ, guion))) {
    guionQueNoEsta.push(`${relative(RAIZ, ruta)} -> ${guion}`);
    continue;
  }
  const h = huellaDe(guion);
  if (h !== null && h.hex !== hex) {
    noCoinciden.push(`${relative(RAIZ, ruta)}\n     archivada ${hex}, hoy ${h.hex} `
      + `(${h.cuantos} archivos)`);
  }
}

console.log(`Huella de evidencia: ${nuevas} con huella nueva (guion + imports), `
  + `${viejas} con huella vieja (solo el guion), ${sinHuella} sin huella.`);

if (guionQueNoEsta.length > 0) {
  console.error('');
  console.error(`Evidencias que citan un guion que ya no esta (${guionQueNoEsta.length}):`);
  for (const x of guionQueNoEsta) console.error(`  ✘ ${x}`);
}
if (noCoinciden.length > 0) {
  console.error('');
  console.error(`Evidencias cuya huella NO coincide con su guion de hoy (${noCoinciden.length}):`);
  for (const x of noCoinciden) console.error(`  ✘ ${x}`);
  console.error('');
  console.error('El encabezado de cada una promete que si no coincide, «el archivo es de otra');
  console.error('version y lo que diga de si mismo no vale». O el guion cambio despues de');
  console.error('archivar --y hay que remedir-- o la evidencia es de otra version.');
  process.exit(1);
}
if (guionQueNoEsta.length > 0) process.exit(1);

console.log(`   ${viejas} de formato viejo no se pueden recomputar: su huella cubria solo el`);
console.log('   archivo de nivel superior, y recomputarlas las acusaria a todas en falso.');
console.log('   Cada medicion nueva entra con la huella que si se comprueba.');
