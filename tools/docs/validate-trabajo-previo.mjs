#!/usr/bin/env node
/**
 * Que toda ADR nueva diga qué hicieron los demás, o que no hay nadie.
 *
 * **El error que lo trajo.** El 2026-09-15 se le pidió al usuario que decidiera
 * hasta dónde puede volver a subir la aplicación el fader del general después de
 * bajarlo para cazar un acople, ofreciéndole cuatro opciones **sin haber mirado
 * qué hace nadie más**. Su respuesta: «¿no habíamos quedado en que nada iba a ser
 * implementado antes que se investigue en proyectos existentes?». Al mirar
 * apareció que el supresor de la propia consola ya contesta esa pregunta, y que
 * el argumento que el ADR daba para dudar tenía la acústica al revés.
 *
 * **Las dos formas valen, y la segunda también es un dato.** O se cita a alguien
 * que haga algo parecido, o se dice «no hay coincidencias en otros proyectos».
 * Que no haya nada significa que lo que se propone no tiene precedente y hay que
 * tener más cuidado, no menos. Lo que no vale es **no decir nada**, porque el que
 * lee no puede distinguir «no hay» de «no miré».
 *
 * **Las ADR anteriores a la regla no la llevan, y no se les agrega.** Escribirles
 * hoy una sección de trabajo previo sería simular que se investigó cuando se
 * decidieron, que es exactamente la clase de afirmación falsa que este
 * repositorio corrige. La regla rige desde su fecha.
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
/** O la declaración explícita de que no hay nadie, esté donde esté. */
const NO_HAY = /no hay coincidencias en otros proyectos/i;

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
      if (SECCION.test(texto) || NO_HAY.test(texto)) return;
      sinSeccion++;
      console.error(
        `${archivo} no dice qué hicieron los demás.\n` +
        '  Toda ADR desde el ' + RIGE_DESDE + ' lleva una sección de **trabajo previo**:\n' +
        '  o cita a alguien que resuelva algo parecido y cómo, o dice textualmente\n' +
        '  «no hay coincidencias en otros proyectos». Las dos son información; el\n' +
        '  silencio no, porque el que lee no puede distinguir «no hay» de «no miré».',
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
