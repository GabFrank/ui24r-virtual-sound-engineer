#!/usr/bin/env node
/**
 * Verifica los límites entre paquetes que el proyecto declara.
 *
 * Existe porque tres sitios afirmaban «hay una regla de lint que lo verifica» y
 * **no hay ESLint en el repositorio**: el script `lint` es `tsc --noEmit`. La
 * regla más importante —que ningún asistente hable con el protocolo— no la
 * sostenía nada más que la disciplina.
 *
 * Son pocas reglas y muy concretas, así que un script propio es más honesto que
 * una dependencia entera: hace exactamente lo que dice y se lee en un minuto.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Cada regla dice qué paquete no puede importar qué, y por qué.
 * El motivo se imprime cuando falla: un error que solo dice «prohibido» obliga
 * a buscar la razón en la documentación.
 */
const REGLAS = [
  {
    paquete: 'packages/assistants',
    prohibido: ['@vse/mixer-adapter', 'soundcraft-ui-connection'],
    motivo:
      'Los asistentes razonan sobre sonido y no hablan con la consola. Todo pasa por ' +
      'Assistant → Recommendation → Transaction → SafetyEngine → write(). Si un asistente ' +
      'pudiera escribir, el motor de seguridad dejaría de tener autoridad sobre él.',
  },
  {
    paquete: 'packages/domain',
    prohibido: ['@vse/mixer-adapter', '@vse/safety', '@vse/store', '@angular/core'],
    motivo:
      'El dominio no depende de nada: ni del protocolo, ni del almacén, ni del framework. ' +
      'Es lo que permite probarlo entero sin montar nada.',
  },
  {
    paquete: 'packages/updater',
    prohibido: ['@vse/mixer-adapter', '@capacitor/core', '@angular/core'],
    motivo:
      'La política de actualización es TypeScript puro, sin red ni Android: así se puede ' +
      'probar sin dispositivo, que es donde vive la mitad difícil.',
  },
  {
    paquete: 'packages/logging',
    prohibido: ['@vse/mixer-adapter', '@vse/safety', '@angular/core', '@capacitor/core'],
    motivo:
      'El registro guarda lo que otros hacen y no participa de lo que hacen. Depende del ' +
      'almacén y de nada más, que es lo que permite probar la cola, el volcado y la purga ' +
      'sin Angular, sin Android y sin esperar a que se llene una tabla.',
  },
  {
    paquete: 'packages/store',
    prohibido: ['@vse/mixer-adapter', '@vse/safety', '@angular/core', '@capacitor/core'],
    motivo:
      'El puerto del almacén define la semántica de las consultas y nada más. Sus dos ' +
      'implementaciones viven fuera.',
  },
];

function ficheros(dir) {
  const salida = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue;
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
    else if (e.endsWith('.ts')) salida.push(ruta);
  }
  return salida;
}

let total = 0;
for (const regla of REGLAS) {
  const dir = join(RAIZ, regla.paquete);
  let lista;
  try {
    lista = ficheros(dir);
  } catch {
    continue; // el paquete todavía no existe
  }
  for (const ruta of lista) {
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/from\s+'([^']+)'/g)) {
      const especificador = m[1];
      const choca = regla.prohibido.find(
        (p) => especificador === p || especificador.startsWith(`${p}/`),
      );
      if (choca === undefined) continue;
      total++;
      console.error(
        `${relative(RAIZ, ruta)} importa «${choca}», que ${regla.paquete} no puede importar.\n` +
        `  ${regla.motivo}`,
      );
    }
  }
}

if (total > 0) {
  console.error(`\n${total} importación(es) que cruzan un límite declarado.`);
  process.exit(1);
}
console.log(`Límites entre paquetes validados: ${REGLAS.length} reglas, ninguna violada.`);
