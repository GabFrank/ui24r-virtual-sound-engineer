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
  // Las tres que siguen se agregaron el 2026-09-10 porque una auditoría las
  // encontró mal escritas el mismo día que se escribieron: «78 filas» cuando
  // son 74, «24 verificadas» cuando son 26, «7 de 13 criterios» en una línea
  // mientras el commit que la escribía decía 6. Son exactamente el caso que el
  // comentario de arriba describe --cambian con una decisión, no con cada PR--
  // así que valía escribirlas, y por eso mismo hay que comprobarlas.
  {
    que: 'filas con estado de la matriz de capacidades',
    contar: () => (leer('docs/capability-matrix.md').match(/^\|.*(✅|⬜).*\|$/gm) ?? []).length,
    afirmaciones: [
      ['docs/gates/G-A.md', /`docs\/capability-matrix\.md`, (\d+) filas con estado/],
      ['docs/spikes/SPK-P0.2a-capability-basica.md', /La matriz tiene \*\*(\d+) filas con estado/],
    ],
  },
  {
    que: 'filas verificadas de la matriz de capacidades',
    contar: () => (leer('docs/capability-matrix.md').match(/^\|.*✅.*\|$/gm) ?? []).length,
    afirmaciones: [
      ['docs/spikes/SPK-P0.2a-capability-basica.md', /filas con estado, (\d+) verificadas/],
    ],
  },
  {
    que: 'criterios del acta G-A en verde',
    contar: () => (leer('docs/gates/G-A.md').match(/^\| .*\| ✅ \|$/gm) ?? []).length,
    afirmaciones: [
      ['docs/gates/G-A.md', /Con esa definición son \*\*\d+\*\*: los \*\*(\w+) en ✅\*\*/],
    ],
  },
];

/** Los números que este repositorio escribe con letras. */
const EN_LETRAS = {
  // Los del uno al diez faltaban, y la primera cifra que los necesito --«los
  // cinco en verde» del acta-- fallo diciendo «dice cinco y son 5».
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8,
  nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciséis: 16,
  veinte: 20, veintiún: 21, veintidós: 22, veintitrés: 23, veinticuatro: 24,
  veinticinco: 25, veintiséis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30,
};
const aNumero = (t) => (/^\d+$/.test(t) ? Number(t) : EN_LETRAS[t.toLowerCase()]);

/**
 * Constantes medidas: el valor del código contra la tabla de la especificación.
 *
 * Los HECHOS de arriba cuentan cosas; esto compara **valores**. Hacía falta
 * porque la clase de número que más daño hizo en este repositorio no es una
 * cuenta sino una constante: el recorrido del medidor estuvo escrito como 84,5
 * dB en cuatro documentos a la vez, y lo encontró una relectura. Con esto,
 * cambiar la constante y no la tabla —o al revés— rompe la integración.
 */
const CONSTANTES = [
  ['MEDIDOR_RANGO_DB', 'packages/mixer-adapter/src/protocol.ts'],
  ['MEDIDOR_SATURACION', 'packages/mixer-adapter/src/protocol.ts'],
  ['VU_CABECERA_BYTES', 'packages/mixer-adapter/src/protocol.ts'],
  ['VU_BYTES_POR_CANAL', 'packages/mixer-adapter/src/protocol.ts'],
  ['CORRECCION_PREVIO_DB', 'packages/mixer-adapter/src/conversiones.ts'],
  ['CORRECCION_DESDE_DB', 'packages/mixer-adapter/src/conversiones.ts'],
  ['RETENCION_PICO_MS', 'packages/mixer-adapter/src/retencion-pico.ts'],
];

/** El menos de la tabla es un menos tipografico, no el del teclado. */
const aNumeroConSigno = (t) => Number(t.replace('\u2212', '-').replace(',', '.'));

/**
 * Constantes que salen del cliente de la consola, comprobadas CONTRA LA FUENTE.
 *
 * **Por qué esto no podía ser una fila más de la tabla de arriba.** Aquella
 * compara el código contra un documento del mismo repositorio, y eso solo
 * detecta que nos contradigamos a nosotros mismos. `RETENCION_PICO_MS` estuvo
 * en 3 cuando la consola dice 3000: código y documento coincidían, el
 * validador pasaba en verde, y el error de factor mil sobrevivió hasta que un
 * auditor fue a leer el `mixer.html`.
 *
 * La fuente está transcrita literal en
 * `docs/spikes/SPK-P0.10b/evidence/constantes-mixer-html-2026-09-09.txt`, con
 * el sha256 del archivo del que salió. Esto compara contra eso.
 */
const DE_LA_CONSOLA = [
  {
    nombre: 'RETENCION_PICO_MS',
    fuente: 'packages/mixer-adapter/src/retencion-pico.ts',
    declaracion: /PEAK_HOLD_TIME=(\S+)/,
    // `3E3` en el archivo de la consola son 3000 ms.
    interpretar: (txt) => Number(txt),
  },
  {
    nombre: 'MEDIDOR_RANGO_DB',
    fuente: 'packages/mixer-adapter/src/protocol.ts',
    declaracion: /VU_RANGE=(\S+)/,
    interpretar: (txt) => Number(txt),
  },
  {
    nombre: 'COMP_ZOOM',
    fuente: 'packages/mixer-adapter/src/protocol.ts',
    declaracion: /COMP_ZOOM=(\S+)/,
    interpretar: (txt) => Number(txt),
  },
];

let fallos = 0;
let comprobadas = 0;

const evidenciaConsola = leer(
  'docs/spikes/SPK-P0.10b/evidence/constantes-mixer-html-2026-09-09.txt',
);
for (const c of DE_LA_CONSOLA) {
  const enCodigo = leer(c.fuente).match(new RegExp(`export const ${c.nombre} = (-?[\\d.]+);`));
  const enConsola = evidenciaConsola.match(c.declaracion);
  if (enCodigo === null || enConsola === null) {
    fallos++;
    console.error(
      `${c.nombre}: no se pudo comparar contra el cliente de la consola.\n` +
      `  ${enCodigo === null ? `${c.fuente} ya no la declara así` : 'la evidencia del mixer.html cambió de forma'}.\n` +
      '  Sin esta comparación, un error de lectura de la fuente vuelve a ser invisible.',
    );
    continue;
  }
  comprobadas++;
  const codigo = Number(enCodigo[1]);
  const consola = c.interpretar(enConsola[1]);
  if (codigo !== consola) {
    fallos++;
    console.error(
      `${c.nombre}: el código dice ${codigo} y el cliente de la consola dice ${consola} ` +
      `(${enConsola[0]}).`,
    );
  }
}

const especificacion = leer('docs/protocol-spec.md');
for (const [nombre, fuente] of CONSTANTES) {
  const enCodigo = leer(fuente).match(new RegExp(`export const ${nombre} = (-?[\\d.]+);`));
  const enTabla = especificacion.match(new RegExp(`\\\`${nombre}\\\` \\| ([^|]+?) \\|`));
  if (enCodigo === null) {
    fallos++;
    console.error(`${fuente} ya no define ${nombre}, o cambió de forma.`);
    continue;
  }
  if (enTabla === null) {
    fallos++;
    console.error(
      `docs/protocol-spec.md ya no declara ${nombre} en su tabla de constantes medidas.\n` +
      '  Sin esa fila la constante puede volver a pudrirse sin que nadie lo note.',
    );
    continue;
  }
  comprobadas++;
  const codigo = Number(enCodigo[1]);
  const tabla = aNumeroConSigno(enTabla[1].trim());
  if (codigo !== tabla) {
    fallos++;
    console.error(
      `${nombre}: el código dice ${codigo} y docs/protocol-spec.md dice ${enTabla[1].trim()}.`,
    );
  }
}
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
