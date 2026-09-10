#!/usr/bin/env node
/**
 * Documentos y evidencia que nadie referencia.
 *
 * **Por qué existe.** Dos veces en la misma sesión se escribió un documento
 * bueno y nadie lo enlazó: las ADR 024, 025 y 026 quedaron fuera del índice, y
 * dos mediciones de la curva de ganancia estuvieron archivadas dentro del spike
 * equivocado sin que ningún documento las citara. En los dos casos el trabajo
 * estaba hecho y era como si no existiera.
 *
 * El validador de identificadores comprueba lo contrario —que toda referencia
 * apunte a algo— y esa dirección no atrapa esto. Un archivo huérfano no rompe
 * ninguna referencia: simplemente no lo lee nadie.
 *
 * Se comprueban dos cosas:
 *
 * 1. **Toda ADR está en el índice.** Es el único lugar donde alguien busca una
 *    decisión sin saber su número.
 * 2. **Todo archivo de evidencia está citado** desde algún documento o desde el
 *    código. La evidencia sin citar es un número medido que nadie va a
 *    encontrar cuando lo necesite.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Todos los archivos bajo `dir`, recursivo. */
function archivos(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else salida.push(ruta);
  }
  return salida;
}

/** El texto de todo lo que puede citar: documentación, código y herramientas. */
function textoDondeSeCita() {
  const partes = [];
  for (const base of ['docs', 'packages', 'apps/mobile/src', 'tools', '.claude']) {
    const dir = join(RAIZ, base);
    let lista = [];
    try { lista = archivos(dir); } catch { continue; }
    for (const f of lista) {
      if (!/\.(md|ts|mjs|js|html)$/.test(f)) continue;
      // Un archivo no se cita a sí mismo.
      partes.push({ ruta: f, texto: readFileSync(f, 'utf8') });
    }
  }
  return partes;
}

const fuentes = textoDondeSeCita();
const citadoEnOtroLado = (ruta, nombre) =>
  fuentes.some((f) => f.ruta !== ruta && f.texto.includes(nombre));

let fallos = 0;

// --- 1. Toda ADR en el índice ---
const dirAdr = join(RAIZ, 'docs', 'adr');
const indice = readFileSync(join(dirAdr, 'README.md'), 'utf8');
const adrs = readdirSync(dirAdr).filter((f) => /^ADR-\d{3}-.+\.md$/.test(f));
for (const adr of adrs) {
  if (!indice.includes(adr)) {
    fallos++;
    console.error(
      `${adr} no está en docs/adr/README.md.\n` +
      '  Una decisión que no está en el índice es una decisión que nadie va a encontrar\n' +
      '  cuando quiera saber por qué el código hace lo que hace.',
    );
  }
}

// --- 2. Toda evidencia citada ---
for (const f of archivos(join(RAIZ, 'docs', 'spikes'))) {
  if (!f.includes(`${'evidence'}/`)) continue;
  const nombre = f.slice(f.lastIndexOf('/') + 1);
  if (citadoEnOtroLado(f, nombre)) continue;
  fallos++;
  console.error(
    `${relative(RAIZ, f)} no lo cita nadie.\n` +
    '  Es una medición archivada que nadie va a encontrar. O se cita desde el charter\n' +
    '  del spike, desde la especificación o desde el código que la usa, o no sirve de nada.',
  );
}

if (fallos > 0) {
  console.error(`\n${fallos} documento(s) que nadie lee.`);
  process.exit(1);
}
console.log(`Sin huérfanos: ${adrs.length} ADR en el índice y toda la evidencia citada.`);
