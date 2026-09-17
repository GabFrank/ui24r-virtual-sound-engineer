#!/usr/bin/env node
/**
 * Que la matriz de capacidades nombre **exactamente** las rutas que el código
 * declara medidas.
 *
 * **El error que la trajo.** El primer principio del repositorio dice: «Ninguna
 * función se implementa sobre un parámetro que no esté probado en
 * `docs/capability-matrix.md`». O sea que ese documento es la puerta. El
 * 2026-09-16, auditando la madrugada, apareció que la puerta venía **atrasada
 * respecto del código**:
 *
 * - `i.N.eq.hpf.freq` figuraba como «desconocida / INFERIDO / ⬜» con su curva
 *   medida desde el ítem 103 y su entrada `PROBADO` en `raw-map.ts`.
 * - `i.N.eq.b1.{gain,q,freq}` igual, con tres leyes medidas (ítems 101 y 108).
 * - `i.N.eq.lpf.freq` y `i.N.aux.M.value` **no tenían fila**, medidas desde los
 *   ítems 103 y 104.
 *
 * Cuatro de ocho. Y ningún validador lo veía, porque los que había comparan
 * **cuentas**: `validate-numeros` comprueba que el README diga cuántas rutas
 * medidas hay. Una cuenta igual con una lista distinta pasa en verde, que es
 * exactamente lo que pasaba.
 *
 * **Por qué una guarda y no una corrección.** Corregir la tabla a mano arregla
 * hoy y se pudre la semana que viene: la regla del repositorio es que una
 * comprobación que llega después del hecho es un reproche, no una guarda. Esto
 * falla en el commit que agrega una ley medida sin nombrarla en la matriz.
 *
 * **Se probó contra su caso motivador:** sacando cualquier fila de la tabla, o
 * agregando una ruta a `RAW_MAP` sin fila, esto falla y dice cuál.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lectorDe, intentar, centinela, ProblemaDeLaGuarda } from './guarda.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { leer, listar, textoEjecutando } = lectorDe(RAIZ);

const MATRIZ = 'docs/capability-matrix.md';
const TITULO = '## Las rutas crudas con ley medida';

let problemas = 0;
/** Un defecto de la propia guarda se cuenta aparte: no es «la matriz está mal». */
let imposibles = 0;

const pudo = intentar(() => {
  const declaradas = new Set(
    textoEjecutando('packages/mixer-adapter/src/raw-map.ts',
      'm.rutasProbadas().slice().sort().join("\\n")')
      .split('\n').map((r) => r.trim()).filter((r) => r !== ''),
  );

  const texto = leer(MATRIZ);
  const i = texto.indexOf(TITULO);
  if (i === -1) {
    throw new ProblemaDeLaGuarda(
      `${MATRIZ} ya no tiene la sección «${TITULO}».\n`
      + '  Es la que esta guarda compara contra el código. Si se renombró, hay que\n'
      + '  actualizar el título acá; si se borró, la puerta del primer principio\n'
      + '  dejó de nombrar qué está medido y eso hay que decidirlo, no perderlo.');
  }
  // Hasta el próximo encabezado de nivel 2, para no arrastrar filas de otras tablas.
  const resto = texto.slice(i + TITULO.length);
  const fin = resto.indexOf('\n## ');
  const seccion = fin === -1 ? resto : resto.slice(0, fin);

  const nombradas = new Set(
    [...seccion.matchAll(/^\| `([^`]+)`/gm)].map((m) => m[1].trim()),
  );

  for (const r of [...declaradas].sort()) {
    if (!nombradas.has(r)) {
      problemas++;
      console.error(
        `${r} está PROBADO en raw-map.ts y no tiene fila en «${TITULO}».\n`
        + '  El primer principio dice que no se implementa sobre un parámetro que\n'
        + `  no esté probado en ${MATRIZ}. Si la ley está medida, la fila va con su\n`
        + '  ítem y su evidencia.');
    }
  }
  for (const r of [...nombradas].sort()) {
    if (!declaradas.has(r)) {
      problemas++;
      console.error(
        `${r} figura en «${TITULO}» y NO está PROBADO en raw-map.ts.\n`
        + '  O la medición no llegó a la tabla de conversión, o la fila afirma de\n'
        + '  más. Las dos cosas hay que decidirlas: la matriz es lo que alguien lee\n'
        + '  para saber si puede construir encima.');
    }
  }

  // **El mínimo se escribe a mano**, que es la regla del repositorio: uno
  // calculado de la misma lista que se recorre encoge junto con ella y no es un
  // mínimo. Eran 8 el 2026-09-16. Si alguna vez son menos, es una decisión.
  // --- la otra mitad: las filas narrativas ---------------------------------
  //
  // **La tabla de arriba no alcanza, y se vio el mismo dia que se escribio esta
  // guarda.** El 2026-09-16, con `i.N.gate.hold` ya medido y bien puesto en esa
  // tabla, la fila «Puerta de ruido» de la matriz seguia diciendo «desconocida /
  // INFERIDO» y ni siquiera nombraba `hold`. La guarda estaba en verde y el
  // documento mentia: comprobaba que lo medido estuviera NOMBRADO, no que las
  // filas que lo describen dijeran la verdad.
  //
  // Esto cierra ese hueco: una fila que enumere una ruta PROBADA no puede
  // declararse INFERIDO ni DESCONOCIDO. Se expanden las llaves --`i.N.gate.{a,b}`
  // son dos rutas-- porque asi es como la matriz las escribe.
  const filas = texto.split('\n').filter((l) => l.startsWith('| ') && l.includes(' | '));
  for (const fila of filas) {
    const celdas = fila.split('|').map((c) => c.trim());
    const rutas = [];
    for (const m of fila.matchAll(/`([A-Za-z][\w.]*\.)\{([^}]+)\}`/g)) {
      for (const hoja of m[2].split(',')) rutas.push(`${m[1]}${hoja.trim()}`);
    }
    for (const m of fila.matchAll(/`([A-Za-z][\w.]*)`/g)) rutas.push(m[1]);
    const probadasAqui = rutas.filter((r) => declaradas.has(r));
    if (probadasAqui.length === 0) continue;
    const dice = celdas.join(' | ');
    const niega = /\bINFERIDO\b|\bDESCONOCIDO\b|desconocida/.test(dice);
    const afirma = /\bMEDIDO\b|\bMEDIDA\b/.test(dice);
    if (niega && !afirma) {
      problemas++;
      console.error(
        `una fila de ${MATRIZ} enumera ${probadasAqui.join(', ')} --que esta PROBADO-- `
        + 'y se declara INFERIDO o desconocida.\n'
        + `  Fila: ${fila.slice(0, 110)}...\n`
        + '  La tabla de rutas medidas puede estar bien y esta fila seguir mintiendo:\n'
        + '  es lo que paso el 2026-09-16 con la puerta. Si la ley esta medida, la fila\n'
        + '  lo tiene que decir.');
    }
  }

  // --- y la MISMA comprobacion en todos los documentos ---------------------
  //
  // **La matriz no era el unico que se quedaba atras, y se vio el mismo dia.** El
  // 2026-09-16, con esta guarda ya extendida a las filas narrativas de la matriz,
  // `protocol-spec.md` seguia diciendo «sin probar» de dos formulas medidas desde
  // hacia tres dias y «REFUTADA» del umbral del compresor, que habia dejado de
  // estarlo unas horas antes. La guarda estaba en verde porque solo miraba un
  // archivo.
  //
  // Cualquier documento que nombre una ruta PROBADA y la describa con una palabra
  // de negacion --«sin probar», «REFUTADA», «desconocida», «INFERIDO»-- esta
  // mintiendo, salvo que en la misma linea diga tambien que esta medida: asi se
  // permiten las lineas que cuentan la historia --«figuraba como REFUTADA y esta
  // MEDIDA»--, que son las que este repositorio quiere que existan.
  const NIEGA = /\bsin probar\b|\bREFUTAD[AO]\b|\bDESCONOCIDO\b|\bINFERIDO\b|desconocida/;
  const AFIRMA = /\bMEDID[AO]\b|\bPROBADO\b|\bCONFIRMADA\b/;
  const docs = listar('docs').filter((f) => f.endsWith('.md'));
  let mirados = 0;
  for (const rel of ['README.md', ...docs.map((f) => `docs/${f}`)]) {
    let texto2;
    try { texto2 = leer(rel); } catch { continue; }
    mirados += 1;
    for (const linea of texto2.split('\n')) {
      if (!NIEGA.test(linea) || AFIRMA.test(linea)) continue;
      for (const r of declaradas) {
        // **La ruta con su indice concreto tambien cuenta.** `i.N.eq.b1.gain` e
        // `i.9.eq.b1.gain` son la misma para esto, y la primera version sacaba el
        // segmento en vez de generalizarlo: `i.gate.hold` no matchea nada y la
        // guarda pasaba en verde sobre una linea que decia `i.9.gate.hold`
        // DESCONOCIDO. Se vio probandola, que es para lo que se prueba.
        const patron = new RegExp(r
          .replace(/[.]/g, '\\.')
          .replace(/\\\.[NMK](?=\\\.|$)/g, '\\.(?:[NMK]|\\d+)'));
        if (!patron.test(linea)) continue;
        problemas++;
        console.error(
          `${rel} describe ${r} --que esta PROBADO-- con una palabra de negacion.\n`
          + `  Linea: ${linea.trim().slice(0, 110)}...\n`
          + '  Si la ley esta medida, el documento lo tiene que decir. Si la linea\n'
          + '  cuenta la historia --«figuraba como X y esta MEDIDA»-- alcanza con que\n'
          + '  nombre tambien el estado nuevo en la misma linea.');
      }
    }
  }
  centinela(mirados, 20, 'documentos revisados por estado contradictorio');

  centinela(nombradas.size, 8, `filas de «${TITULO}»`);
  console.log(problemas === 0
    ? `Rutas medidas: ${declaradas.size} en el código y las mismas ${declaradas.size} `
      + 'en la matriz de capacidades.'
    : `Rutas medidas: ${declaradas.size} en el código y ${nombradas.size} en la matriz.`);
}, (e) => { imposibles++; console.error(e.message); });

if (problemas > 0) {
  console.error(`\n${problemas} ruta(s) donde el código y la matriz no dicen lo mismo.`);
  process.exit(1);
}
// **Y una guarda que no pudo comprobar tampoco está en verde.** Es la distinción
// que `validate-numeros` ya tuvo que aprender: «no cuadra» y «no se pudo
// comprobar» son cosas distintas, y las dos son rojo.
if (!pudo || imposibles > 0) {
  console.error('\nesta guarda no pudo comprobar nada. No es verde.');
  process.exit(1);
}
