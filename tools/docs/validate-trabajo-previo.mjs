#!/usr/bin/env node
/**
 * Comprueba presencia de una sección de trabajo previo en las ADR desde la
 * fecha acordada. No certifica la calidad ni exhaustividad de la investigación.
 * Una declaración de ausencia sin fuentes no sustituye esa sección.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lectorDe, intentar } from './guarda.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { leer, listar } = lectorDe(RAIZ);

/** Desde cuándo rige. Ver el comentario de arriba: la historia no se reescribe. */
const RIGE_DESDE = '2026-09-15';

/** El encabezado que hay que tener, en cualquiera de sus formas razonables. */
const SECCION = /^#{2,3} .*trabajo previo/im;

let revisadas = 0;
let sinSeccion = 0;
let anteriores = 0;
let reservadas = 0;

intentar(() => {
  const archivos = listar('docs/adr')
    .filter((f) => /^ADR-\d{3}.*\.md$/.test(f))
    .sort();

  for (const archivo of archivos) {
    intentar(() => {
      const texto = leer(join('docs/adr', archivo));
      const fecha = texto.match(/^\*\*Fecha:\*\*\s*(\d{4}-\d{2}-\d{2})/m);
      if (fecha === null) {
        // **Una reserva no tiene fecha porque todavía no se decidió nada**, y
        // ADR-019 es exactamente eso: un número apartado para después del control
        // G-B. Exigirle trabajo previo a una decisión que no se tomó es exigirlo
        // antes de que haya propuesta. Pero el hueco se cierra por arriba: para
        // quedar exenta tiene que **declararse** reservada, así que quitar la
        // fecha para esquivar la regla no alcanza.
        if (/^\*\*Estado:\*\*.*reservada/im.test(texto)) { reservadas++; return; }
        sinSeccion++;
        console.error(
          `${archivo} no declara su fecha con «**Fecha:** AAAA-MM-DD».\n` +
          '  Sin fecha no se puede saber si la regla del trabajo previo le toca, y\n' +
          '  sólo una ADR que se declara **Reservada** puede no tenerla.',
        );
        return;
      }
      if (fecha[1] < RIGE_DESDE) { anteriores++; return; }

      revisadas++;
      if (SECCION.test(texto)) return;
      sinSeccion++;
      console.error(
        `${archivo} no dice qué hicieron los demás.\n` +
        '  Toda ADR desde el ' + RIGE_DESDE + ' lleva una sección de **trabajo previo**:\n' +
        '  citar las fuentes consultadas y su alcance. Si no se encontró precedente,\n' +
        '  describir la búsqueda; no afirmar que no existe en otros proyectos.',
      );
    }, (e) => { sinSeccion++; console.error(e.message); });
  }
}, (e) => { sinSeccion++; console.error(e.message); });

if (sinSeccion > 0) {
  console.error(`\n${sinSeccion} ADR sin su trabajo previo.`);
  process.exit(1);
}
console.log(
  `Trabajo previo: ${revisadas} ADR desde el ${RIGE_DESDE} lo declaran `
  + `(${anteriores} anteriores a la regla, que no se reescriben; ${reservadas} reservada(s)).`,
);
