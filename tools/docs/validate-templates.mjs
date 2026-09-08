#!/usr/bin/env node
/**
 * Busca acentos graves dentro de las plantillas y las hojas de estilo en línea
 * de los componentes de Angular.
 *
 * Existe porque el mismo error se cometió tres veces: escribir `--line` o
 * `saturando()` en un comentario, dentro de un literal de plantilla delimitado
 * también por acentos graves, cierra la cadena a mitad de fichero. El
 * compilador entonces informa de un error de sintaxis cincuenta líneas más
 * abajo, en una línea que está perfectamente bien, y encontrar la causa cuesta
 * más que escribir esta comprobación.
 *
 * La convención del proyecto es usar comillas angulares —«así»— dentro de esos
 * comentarios.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = join(RAIZ, 'apps', 'mobile', 'src');

function ficheros(dir) {
  const salida = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
    else if (entrada.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

/**
 * Recorre el fichero contando delimitadores. Un acento grave dentro de un
 * literal ya abierto lo cierra: si al terminar el número es impar, o si dentro
 * de un bloque `template:` / `styles:` aparece uno antes de su cierre
 * esperado, hay un problema.
 */
function revisar(ruta) {
  const texto = readFileSync(ruta, 'utf8');
  const problemas = [];

  for (const marca of ['template: `', 'styles: [`']) {
    let desde = 0;
    for (;;) {
      const inicio = texto.indexOf(marca, desde);
      if (inicio === -1) break;
      const cuerpoDesde = inicio + marca.length;
      const fin = texto.indexOf('`', cuerpoDesde);
      if (fin === -1) break;
      const cuerpo = texto.slice(cuerpoDesde, fin);
      // Si el literal se cierra antes de la llave de cierre esperada, es que
      // un acento grave del contenido lo cortó.
      const cierreEsperado = marca.startsWith('styles') ? '`],' : '`,';
      const real = texto.slice(fin, fin + cierreEsperado.length);
      if (real !== cierreEsperado) {
        const linea = texto.slice(0, fin).split('\n').length;
        problemas.push({ linea, muestra: cuerpo.split('\n').pop()?.trim().slice(0, 60) ?? '' });
      }
      desde = fin + 1;
    }
  }
  return problemas;
}

let total = 0;
for (const ruta of ficheros(APP)) {
  for (const p of revisar(ruta)) {
    total++;
    console.error(
      `${relative(RAIZ, ruta)}:${p.linea} — acento grave dentro de un literal de plantilla.\n` +
      `  Cerca de: ${p.muestra}\n` +
      '  Usar comillas angulares «así» en los comentarios.',
    );
  }
}

if (total > 0) {
  console.error(`\n${total} literal(es) cortado(s) por un acento grave.`);
  process.exit(1);
}
console.log('Plantillas validadas: ningún acento grave dentro de un literal.');
