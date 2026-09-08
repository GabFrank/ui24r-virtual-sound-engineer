#!/usr/bin/env node
/**
 * Busca funciones llamadas desde las plantillas de Angular.
 *
 * La regla del proyecto es que una plantilla no llame funciones: se reevalúan
 * en cada ciclo de detección de cambios. Estaba escrita en tres sitios y aun
 * así se había colado seis veces, incluida la pantalla de telemetría, que es
 * la que más ciclos genera porque los medidores llegan varias veces por
 * segundo.
 *
 * Las señales y los `computed` se llaman igual, con paréntesis, así que la
 * comprobación es por lista: se consideran válidos los nombres declarados como
 * `signal(`, `computed(`, `input(`, `input.required(`, `model(`, `viewChild(`
 * y `contentChild(`, más los métodos que se enlazan a eventos —que sí pueden
 * ser funciones, porque no se evalúan al pintar—.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(RAIZ, 'apps', 'mobile', 'src');

/** Métodos nativos sobre valores, que también se reevalúan. */
const METODOS_PROHIBIDOS = ['toFixed', 'join', 'toUpperCase', 'toLowerCase', 'slice', 'map', 'filter'];

function ficheros(dir) {
  const salida = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
    else if (e.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

function plantilla(texto) {
  const i = texto.indexOf('template: `');
  if (i === -1) return null;
  const fin = texto.indexOf('`,\n  styles', i);
  return texto.slice(i + 'template: `'.length, fin === -1 ? undefined : fin);
}

/** Nombres que sí se pueden llamar: señales, entradas y consultas de vista. */
function reactivos(texto) {
  const nombres = new Set();
  const re = /(?:readonly|protected|private|public)?\s*(\w+)\s*=\s*(?:this\.)?[\w.]*(signal|computed|input|model|viewChild|contentChild|toSignal|visible)\b/g;
  for (const m of texto.matchAll(re)) nombres.add(m[1]);
  // Las señales que se reexportan desde un servicio (`readonly x = this.s.y;`)
  // no se pueden distinguir estáticamente de un método, así que se aceptan.
  for (const m of texto.matchAll(/readonly\s+(\w+)\s*=\s*this\.\w+\.\w+;/g)) nombres.add(m[1]);
  return nombres;
}

let total = 0;
for (const ruta of ficheros(APP)) {
  const texto = readFileSync(ruta, 'utf8');
  const tpl = plantilla(texto);
  if (tpl === null) continue;

  const validos = reactivos(texto);
  /**
   * Todo lo que Angular evalúa al pintar.
   *
   * Faltaban `@else if`, `@switch`, `@case` y `@for`, que es donde el flujo de
   * control moderno pone la mayor parte de las condiciones. La regla más cara
   * de este repositorio no se comprobaba justo en la rama que las pantallas
   * nuevas usan: `@else if (cargando())` no lo miraba nadie.
   *
   * `@else if` va primero porque `@if` también casa con él y se quedaría con
   * la mitad de la expresión.
   */
  const expresiones = [
    ...[...tpl.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/\[[\w.\-]+\]="([^"]*)"/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/@else\s+if\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/@if\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/@switch\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/@case\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[...tpl.matchAll(/@for\s*\(([^)]*)\)/g)].map((m) => m[1]),
  ];

  for (const expr of expresiones) {
    for (const m of expr.matchAll(/(?:^|[\s.(])(\w+)\s*\(/g)) {
      const nombre = m[1];
      if (validos.has(nombre)) continue;
      if (!METODOS_PROHIBIDOS.includes(nombre) && !texto.includes(`  ${nombre}(`)) continue;
      total++;
      console.error(
        `${relative(RAIZ, ruta)} — «${nombre}()» se llama desde la plantilla.\n` +
        `  En: ${expr.trim().slice(0, 70)}\n` +
        '  Se reevalúa en cada ciclo de detección. Calcularlo en un computed().',
      );
    }
  }
}

if (total > 0) {
  console.error(`\n${total} llamada(s) desde plantilla.`);
  process.exit(1);
}
console.log('Plantillas validadas: ninguna función llamada desde una plantilla.');
