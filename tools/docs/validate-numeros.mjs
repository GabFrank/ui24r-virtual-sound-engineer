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

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lectorDe, intentar as intentarGuarda } from './guarda.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * **Dos cuentas, no una.** «La cifra dice 22 y son 23» es un documento que miente
 * y hay que corregirlo. «No pude leer el archivo» o «la frase cambió de forma» es
 * una comprobación que **no se hizo**, y el que lo lee tiene que decidir otra
 * cosa: mover la ruta, reescribir el patrón, o aceptar que esa cifra se quedó sin
 * quien la mire. Meter las dos abajo del titular «N cifra(s) que no cuadran»
 * --que es lo que hacía-- le pone al lector la etiqueta equivocada, y era la que
 * esta guarda más quería evitar.
 *
 * Las dos hacen fallar la verificación. Sólo se cuentan por separado.
 */
let fallos = 0;
let imposibles = 0;
let comprobadas = 0;

const { leer, listar, contarEjecutando } = lectorDe(RAIZ);

/** Avisa del problema, lo cuenta, y deja que la corrida siga. */
const anotar = (e) => { imposibles++; console.error(e.message); };
const intentar = (fn, alFallar = anotar) => intentarGuarda(fn, alFallar);

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
    contar: () => listar('apps/mobile/src/app/ui')
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
  // Las dos que siguen son las del README, que estuvo tres días diciendo «0 de
  // 22» con 23 charters y «0 rutas escribibles» con cinco medidas. Cambian con
  // una decisión --escribir un charter, medir una ley-- y por eso vale
  // escribirlas; y por eso mismo hay que contarlas.
  {
    que: 'charters de spike',
    contar: () => listar('docs/spikes')
      .filter((f) => f.startsWith('SPK-') && f.endsWith('.md')).length,
    // `\d+ de` y no `0 de`: el día que cierre un spike, la guarda tiene que
    // seguir comprobando el denominador en vez de decir que el README «ya no
    // dice» cuántos hay, que apunta al problema equivocado.
    afirmaciones: [['README.md', /\| Spikes cerrados \| \d+ de (\d+) \|/]],
  },
  {
    // **El numerador tampoco lo miraba nadie.** Se comprobaba el denominador --23
    // charters-- y no cuántos están cerrados: un auditor marcó P0.10b en ✅ dentro
    // de la tabla de estado, con el README raíz diciendo «0 de 23», y no lo vio
    // ninguno de los once validadores. Un spike que se cierra es una decisión, que
    // es justo la clase de número que este archivo dice que vale la pena escribir.
    que: 'spikes cerrados',
    contar: () => (leer('docs/spikes/README.md')
      .match(/^\| \[[^\]]+\]\([^)]+\)[^|]*\| [^|]+ \| [^|]+ \| ✅ \|$/gm) ?? []).length,
    afirmaciones: [['README.md', /\| Spikes cerrados \| (\d+) de \d+ \|/]],
  },
  {
    que: 'rutas crudas con conversión medida (PROBADO en RAW_MAP)',
    // Se ejecuta `rutasProbadas()`, que es la función que el adaptador expone
    // como «las únicas escribibles por vía cruda», en vez de contar su texto.
    contar: () => contarEjecutando('packages/mixer-adapter/src/raw-map.ts', 'm.rutasProbadas().length'),
    afirmaciones: [['README.md', /\| Rutas crudas con conversión medida \| (\d+) /]],
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
  // Del 17 al 19 faltaban, y el hueco no daba «no sé leer esto» sino «el
  // documento dice diecisiete y son 17», que acusa al documento de mentir.
  diecisiete: 17, dieciocho: 18, diecinueve: 19,
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

/**
 * Cuántas afirmaciones tiene que comprobar una corrida sana. **Escrito a mano, y
 * ése es el punto.**
 *
 * La primera versión de esta línea lo calculaba sumando las listas de acá abajo,
 * y un auditor midió que eso no sirve de piso: borrar un HECHO entero encoge el
 * cálculo junto con la corrida, así que la guarda quedaba **en verde diciendo
 * «Cifras validadas: 20 … todas ciertas»** y nadie se enteraba de que una cifra
 * se había quedado sin quien la mire. Es el mismo defecto que esta guarda existe
 * para atrapar, cometido por ella misma.
 *
 * Un número escrito a mano no se encoge solo. Si sube porque se agregó una
 * afirmación, hay que subirlo acá, que es parte de agregarla. Mismo trato que el
 * centinela del inventario en `rutas-de-los-tests.test.ts`.
 */
const AFIRMACIONES_ESPERADAS = 22;

/**
 * La evidencia contra la que se comparan las constantes de la consola.
 *
 * Se lee dentro de `intentar` porque es la única lectura de la que dependen
 * varias afirmaciones a la vez: si el archivo no está, eso es **un** fallo con
 * su frase, y las comprobaciones que no dependen de él siguen corriendo.
 */
let evidenciaConsola;
intentar(() => {
  evidenciaConsola = leer(
    'docs/spikes/SPK-P0.10b/evidence/constantes-mixer-html-2026-09-09.txt',
  );
});
if (evidenciaConsola === undefined) {
  console.error(
    `  Sin ella, las ${DE_LA_CONSOLA.length} constantes que se comparan contra el ` +
    'cliente de la consola quedan sin comprobar.',
  );
}
for (const c of evidenciaConsola === undefined ? [] : DE_LA_CONSOLA) intentar(() => {
  const enCodigo = leer(c.fuente).match(new RegExp(`export const ${c.nombre} = (-?[\\d.]+);`));
  const enConsola = evidenciaConsola.match(c.declaracion);
  if (enCodigo === null || enConsola === null) {
    imposibles++;
    console.error(
      `${c.nombre}: no se pudo comparar contra el cliente de la consola.\n` +
      `  ${enCodigo === null ? `${c.fuente} ya no la declara así` : 'la evidencia del mixer.html cambió de forma'}.\n` +
      '  Sin esta comparación, un error de lectura de la fuente vuelve a ser invisible.',
    );
    return;
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
});

let especificacion;
intentar(() => { especificacion = leer('docs/protocol-spec.md'); });
if (especificacion === undefined) {
  console.error(
    `  Sin ella, las ${CONSTANTES.length} constantes medidas quedan sin comparar ` +
    'contra su tabla.',
  );
}
for (const [nombre, fuente] of especificacion === undefined ? [] : CONSTANTES) intentar(() => {
  const enCodigo = leer(fuente).match(new RegExp(`export const ${nombre} = (-?[\\d.]+);`));
  const enTabla = especificacion.match(new RegExp(`\\\`${nombre}\\\` \\| ([^|]+?) \\|`));
  if (enCodigo === null) {
    imposibles++;
    console.error(`${fuente} ya no define ${nombre}, o cambió de forma.`);
    return;
  }
  if (enTabla === null) {
    imposibles++;
    console.error(
      `docs/protocol-spec.md ya no declara ${nombre} en su tabla de constantes medidas.\n` +
      '  Sin esa fila la constante puede volver a pudrirse sin que nadie lo note.',
    );
    return;
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
});
for (const hecho of HECHOS) {
  // **Cuántas se pierden, dicho.** Si `contar()` falla, caen con él todas las
  // afirmaciones de ese hecho, y hasta ahora eso salía como un solo aviso: faltar
  // `tools/visual/flujo.mjs` costaba tres comprobaciones y se informaba como una.
  let real;
  const seContó = intentar(() => { real = hecho.contar(); }, (e) => {
    imposibles++;
    console.error(
      `${e.message}\n`
      + `  Con eso quedan sin comprobar las ${hecho.afirmaciones.length} afirmación(es) `
      + `sobre ${hecho.que}.`,
    );
  });
  if (!seContó) continue;
  for (const [archivo, patron] of hecho.afirmaciones) intentar(() => {
    const m = leer(archivo).match(patron);
    if (m === null) {
      imposibles++;
      console.error(
        `${archivo} ya no dice cuántos ${hecho.que} hay.\n` +
        '  O se quitó la frase, o cambió de forma y este comprobador dejó de verla:\n' +
        '  las dos cosas hacen que la cifra vuelva a poder pudrirse sin que nadie lo note.',
      );
      return;
    }
    const dicho = aNumero(m[1]);
    if (dicho === undefined) {
      // **La guarda que no sabe leer no acusa al documento.** `EN_LETRAS` no
      // conoce todas las palabras: sin esto, un documento que escribe
      // correctamente «diecisiete» recibía «dice diecisiete y son 17», que se
      // lee como que el documento miente. Es un defecto de esta guarda y tiene
      // que decirlo así.
      imposibles++;
      console.error(
        `${archivo} dice «${m[1]}» ${hecho.que} y este comprobador no sabe leer esa palabra.\n` +
        '  Falta en la tabla EN_LETRAS de este archivo. Hasta que se agregue, esa\n' +
        '  cifra no tiene quien la compruebe.',
      );
      return;
    }
    comprobadas++;
    if (dicho !== real) {
      fallos++;
      console.error(
        `${archivo} dice ${m[1]} ${hecho.que}, y son ${real}.`,
      );
    }
  });
}

// **El piso.** Sin esto, una corrida que comprueba de menos y no falla en nada
// se declara en verde. Se mira sólo cuando no hubo ningún otro problema: cuando
// los hubo, la cuenta baja por un motivo que ya está dicho arriba.
if (fallos === 0 && imposibles === 0 && comprobadas !== AFIRMACIONES_ESPERADAS) {
  console.error(
    comprobadas < AFIRMACIONES_ESPERADAS
      ? `Esta guarda conoce ${AFIRMACIONES_ESPERADAS} afirmaciones y comprobó ${comprobadas}, `
        + 'sin fallar en ninguna.\n'
        + '  O se sacó una del alcance --y entonces esa cifra dejó de tener quien la\n'
        + '  compruebe--, o algo dejó de contarse sin decirlo. Las dos hay que mirarlas.'
      : `Esta guarda comprobó ${comprobadas} afirmaciones y tiene escritas `
        + `${AFIRMACIONES_ESPERADAS}.\n`
        + '  Se agregó una: actualizá AFIRMACIONES_ESPERADAS, que es parte de agregarla.',
  );
  process.exit(1);
}

if (fallos > 0 || imposibles > 0) {
  const partes = [];
  if (fallos > 0) partes.push(`${fallos} cifra(s) que no cuadran`);
  if (imposibles > 0) partes.push(`${imposibles} comprobación(es) que no se pudieron hacer`);
  console.error(
    `\n${partes.join(' y ')}. ${comprobadas} afirmaciones sí se comprobaron, de las `
    + `${AFIRMACIONES_ESPERADAS} que esta guarda conoce.`,
  );
  process.exit(1);
}
console.log(`Cifras validadas: ${comprobadas} afirmaciones contra el código, todas ciertas.`);
