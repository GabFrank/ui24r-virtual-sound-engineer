/**
 * Qué rutas usan los tests, y cuáles no existen en la consola.
 *
 * **El defecto que persigue.** Los tests fabrican rutas a mano y los patrones
 * del clasificador las agarran por prefijo, así que una ruta inventada pasa en
 * verde probando el patrón y no el protocolo. Ya se encontraron siete así, y
 * una auditoría dice que quedan más.
 *
 * Se contrasta contra el inventario capturado, no contra lo que uno recuerda.
 *
 * Uso: node --experimental-strip-types tools/inventario/rutas-de-los-tests.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const reales = new Set(
  readFileSync('docs/inventario/3.4.8318-ui24-2026-09-11/keys-observed.txt', 'utf8').trim().split('\n'),
);
/** Los patrones reales, con los índices normalizados. */
const patrones = new Set([...reales].map((k) => k.replace(/\b\d+\b/g, 'N')));

function archivos(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (n === 'node_modules' || n === 'dist' || n === '.git') continue;
    if (statSync(r).isDirectory()) archivos(r, salida);
    else if (/\.test\.ts$/.test(n)) salida.push(r);
  }
  return salida;
}

/** Algo con forma de ruta de la consola dentro de comillas. */
const FORMA = /'([a-z]+\.[a-zA-Z0-9_.]*[a-zA-Z0-9])'/g;

const sospechosas = new Map<string, string[]>();
for (const f of archivos('packages')) {
  const texto = readFileSync(f, 'utf8');
  for (const m of texto.matchAll(FORMA)) {
    const ruta = m[1]!;
    // Solo lo que parece una clave de la consola: familia conocida y un punto.
    if (!/^(i|l|hw|a|m|s|f|p|v|var|settings|hwout[a-z]*|mtk|casc|usbdaw|iso|mg|vg|automix|afs)\b/.test(ruta)) continue;
    if (reales.has(ruta)) continue;

    // **Tres clases de falso positivo, y las tres son legitimas.** La primera
    // version las reportaba todas y dio 28 lineas de las que casi ninguna era
    // un hallazgo: una guarda con esa proporcion de ruido se desactiva sola.
    //
    // 1. Prefijos de fuente --`i.8`, `hw.0`, `a.3`--: son el nombre de una tira,
    //    no una clave. Se reconocen porque no tienen nada despues del indice.
    if (/^[a-z]+\.\d+$/.test(ruta)) continue;
    // 2. Patrones escritos con `N` a proposito, como los de `loQueNoSeVe()`.
    if (/\bN\b/.test(ruta)) continue;
    // 3. Rutas invalidas a proposito, para probar que se rechazan. Se reconocen
    //    por el nombre: si alguien escribe `i.1.inventado` esta diciendo lo que
    //    hace.
    if (/inventad|desconocid|falsa|mixer$|^i\.mix$/.test(ruta)) continue;
    const patron = ruta.replace(/\b\d+\b/g, 'N');
    // Un índice fuera de rango es una ruta inventada aunque el patrón exista.
    const razon = patrones.has(patron) ? 'indice fuera de rango' : 'no existe en la consola';
    const clave = `${ruta}  (${razon})`;
    const donde = sospechosas.get(clave) ?? [];
    if (!donde.includes(f)) donde.push(f);
    sospechosas.set(clave, donde);
  }
}

console.log(`rutas con forma de clave en los tests que NO existen tal cual: ${sospechosas.size}`);
console.log('');
for (const [k, donde] of [...sospechosas].sort()) {
  console.log(`  ${k}`);
  for (const d of donde) console.log(`      ${d}`);
}
