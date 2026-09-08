#!/usr/bin/env node
/**
 * Comprueba los números que la documentación afirma y se pueden contar.
 *
 * Una auditoría encontró ocho cifras falsas a la vez: 220 tests cuando eran
 * 283, veintiún pasos del recorrido cuando eran veinticuatro, once primitivas
 * cuando eran catorce, treinta y tres invariantes cuando eran treinta y cuatro.
 * Se corrigieron todas, y dos PR después la de los tests ya estaba mal otra vez.
 *
 * De ahí salieron dos reglas distintas, y las dos importan:
 *
 * - Un número que cambia con cada PR —la cuenta de tests— **no se escribe**. Se
 *   dice dónde consultarlo. Corregirlo es una tarea sin fin.
 * - Un número que cambia con una **decisión** —agregar un paso al recorrido,
 *   una invariante, una primitiva— sí vale la pena escribirlo, porque cambiarlo
 *   es parte de tomar la decisión. Pero entonces hay que comprobarlo, o vuelve
 *   a pudrirse.
 *
 * Esto comprueba los segundos. Cuenta en el código y compara con lo que dicen
 * los documentos.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const leer = (r) => readFileSync(join(RAIZ, r), 'utf8');

/** Las cifras que se pueden contar, con de dónde salen y quién las afirma. */
const HECHOS = [
  {
    que: 'pasos del recorrido de usuario',
    contar: () => (leer('tools/visual/flujo.mjs').match(/await paso\(/g) ?? []).length,
    afirmaciones: [
      ['docs/flujo-de-usuario.md', /estos (\w+) pasos en dos anchos/],
      ['docs/visual/README.md', /Los (\d+) pasos del camino de usuario/],
      ['.claude/skills/vse-experto/SKILL.md', /flujo\.mjs\s+# (\d+) pasos/],
    ],
  },
  {
    que: 'invariantes de seguridad',
    contar: () => (leer('docs/safety-invariants.md').match(/^\| INV-\d{3} \|/gm) ?? []).length,
    afirmaciones: [['docs/safety-invariants.md', /Estas (\d+) invariantes son la suite/]],
  },
  {
    que: 'primitivas de interfaz',
    contar: () => readdirSync(join(RAIZ, 'apps/mobile/src/app/ui'))
      .filter((f) => f.endsWith('.component.ts')).length,
    afirmaciones: [['CHANGELOG.md', /tacto; (\w+)\n  primitivas de componente/]],
  },
];

/** Los números que este repositorio escribe con letras. */
const EN_LETRAS = {
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16,
  veinte: 20, veintiún: 21, veintidós: 22, veintitrés: 23, veinticuatro: 24,
  veinticinco: 25, treinta: 30,
};
const aNumero = (t) => (/^\d+$/.test(t) ? Number(t) : EN_LETRAS[t.toLowerCase()]);

let fallos = 0;
let comprobadas = 0;
for (const hecho of HECHOS) {
  const real = hecho.contar();
  for (const [archivo, patron] of hecho.afirmaciones) {
    const m = leer(archivo).match(patron);
    if (m === null) {
      fallos++;
      console.error(
        `${archivo} ya no dice cuántos ${hecho.que} hay.\n` +
        '  O se quitó la frase, o cambió de forma y este comprobador dejó de verla:\n' +
        '  las dos cosas hacen que la cifra vuelva a poder pudrirse sin que nadie lo note.',
      );
      continue;
    }
    comprobadas++;
    const dicho = aNumero(m[1]);
    if (dicho !== real) {
      fallos++;
      console.error(
        `${archivo} dice ${m[1]} ${hecho.que}, y son ${real}.`,
      );
    }
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} cifra(s) que no cuadran.`);
  process.exit(1);
}
console.log(`Cifras validadas: ${comprobadas} afirmaciones contra el código, todas ciertas.`);
