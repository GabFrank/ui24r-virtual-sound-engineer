import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **Ningún test usa una ruta que la consola no manda, salvo las declaradas.**
 *
 * El defecto que persigue ya apareció tres veces: los tests fabrican rutas a
 * mano, los patrones del clasificador las agarran por prefijo, y una ruta
 * inventada pasa en verde **probando el patrón y no el protocolo**. Así vivieron
 * meses `m.eq.b1.gain`, `m.delay.time`, `afs2.enable` y `i.24.aux.6.value` --un
 * canal que esta consola no tiene-- todas en tests que pasaban.
 *
 * Se contrasta contra el inventario capturado de la consola real, no contra lo
 * que uno recuerda: una lista de memoria mide al que la escribe.
 */

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const INVENTARIO = join(RAIZ, 'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt');

/**
 * Rutas fabricadas **a propósito**, cada una con su motivo.
 *
 * Una lista de excepciones sin motivo se convierte en el lugar donde se esconde
 * lo que molesta. Si algo entra acá, entra con su razón escrita.
 */
const DELIBERADAS = new Map<string, string>([
  ['a.30.eq.peak.12', 'el borde del prefijo: `a.30` no es `a.3`, y hay que probarlo'],
  ['m.eq.easy', 'una asercion NEGATIVA: que una ruta inexistente en el general se '
    + 'rechace. Existe como `l.N.eq.easy` y `i.N.eq.easy`, no como `m.eq.easy`'],
  ['m.eq.b3.gain', 'la clausula de Q de INV-004 solo se dispara sobre un parametrico '
    + 'de salida, que la Ui24R no tiene. El test dice cual es la forma que la activa'],
  ['i.mix', 'una ruta MAL FORMADA a proposito: familia sin indice de canal. Prueba '
    + 'que el clasificador no la agarra por parecido con `i.N.mix`'],
]);

function testsDe(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === 'dist' || n === '.git') continue;
    const r = join(dir, n);
    if (statSync(r).isDirectory()) testsDe(r, salida);
    else if (/\.test\.ts$/.test(n)) salida.push(r);
  }
  return salida;
}

test('ninguna ruta fabricada se cuela en los tests', () => {
  const reales = new Set(readFileSync(INVENTARIO, 'utf8').trim().split('\n'));
  const forma = /'([a-z]+\.[a-zA-Z0-9_.]*[a-zA-Z0-9])'/g;
  const sospechosas = new Set<string>();

  for (const f of testsDe(join(RAIZ, 'packages'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(forma)) {
      const ruta = m[1]!;
      if (!/^(i|l|hw|a|m|s|f|p|v|var|settings|hwout[a-z]*|mtk|casc|usbdaw|iso|mg|vg|automix|afs)\b/.test(ruta)) continue;
      if (reales.has(ruta) || DELIBERADAS.has(ruta)) continue;
      // Prefijos de fuente --`i.8`, `a.3`--: son el nombre de una tira, no una clave.
      if (/^[a-z]+\.\d+$/.test(ruta)) continue;
      // Patrones escritos con `N` a proposito, como los de `loQueNoSeVe()`.
      if (/\bN\b/.test(ruta)) continue;
      // Rutas invalidas a proposito: el nombre lo dice.
      if (/inventad|desconocid|falsa/.test(ruta)) continue;
      sospechosas.add(`${ruta}  (${f.slice(RAIZ.length + 1)})`);
    }
  }

  deepStrictEqual(
    [...sospechosas].sort(), [],
    'rutas que la consola no manda. O es un descuido, o entra en DELIBERADAS con su motivo.',
  );
});
