/**
 * Cuánto del vocabulario real de la consola sabe nombrar la aplicación.
 *
 * Se corre contra el inventario capturado, no contra una lista escrita a mano:
 * una lista a mano mide lo que uno recuerda, no lo que el aparato manda.
 *
 * Uso: node --experimental-strip-types tools/inventario/cobertura.ts [inventario.txt]
 */
import { readFileSync } from 'node:fs';
import { clasificarRuta } from '../../packages/mixer-adapter/src/clasificar-ruta.ts';

const ruta = process.argv[2] ?? 'docs/inventario/3.4.8318-ui24-2026-09-11/keys-observed.txt';
const claves = readFileSync(ruta, 'utf8').trim().split('\n');
const sin = claves.filter((k) => clasificarRuta(k) === null);
console.log(`claves: ${claves.length}, sin clasificar: ${sin.length} (${(100 * sin.length / claves.length).toFixed(1)} %)`);

const cuenta = (xs: readonly string[], f: (k: string) => string): [string, number][] => {
  const m = new Map<string, number>();
  for (const k of xs) { const c = f(k); m.set(c, (m.get(c) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};

console.log('');
console.log('familias sin clasificar:');
for (const [f, n] of cuenta(sin, (k) => k.split('.')[0]!)) console.log(`  ${f.padEnd(12)} ${String(n).padStart(5)}`);
console.log('');
console.log('patrones sin clasificar, los 30 mas frecuentes:');
for (const [p, n] of cuenta(sin, (k) => k.replace(/\b\d+\b/g, '{n}')).slice(0, 30)) {
  console.log(`  ${String(n).padStart(4)}  ${p}`);
}
