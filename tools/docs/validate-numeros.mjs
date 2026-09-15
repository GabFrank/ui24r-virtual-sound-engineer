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
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Un problema que esta guarda **sabe explicar**: cuenta como fallo y se imprime
 * como frase, sin stack.
 *
 * **Por qué hizo falta.** Si un documento se renombraba o se movía, `leer` tiraba
 * el ENOENT crudo de Node y el proceso moría en el primer hecho: catorce líneas
 * de `node:fs` en vez de «`docs/capability-matrix.md` ya no está», y ninguna de
 * las otras veinte afirmaciones llegaba a comprobarse. Una guarda cuyo trabajo es
 * dar mensajes legibles no puede fallar de esa manera, y `contarEjecutando`
 * --que arranca un proceso hijo-- amplió la superficie: un módulo que no compila
 * daba el stack del hijo.
 *
 * Ahora cada afirmación se intenta por separado: la que no se puede comprobar
 * dice por qué, y las demás siguen.
 */
class ProblemaDeLaGuarda extends Error {}

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

const leer = (r) => {
  try {
    return readFileSync(join(RAIZ, r), 'utf8');
  } catch (e) {
    if (e?.code === 'ENOENT') {
      throw new ProblemaDeLaGuarda(
        `${r} no existe, y esta guarda cuenta algo que vive ahí.\n` +
        '  O se movió y hay que actualizar la ruta acá, o se borró y la cifra que\n' +
        '  sostenía dejó de tener quien la compruebe. Las dos cosas hay que decidirlas.',
      );
    }
    throw new ProblemaDeLaGuarda(`no se pudo leer ${r}: ${e?.message ?? e}`);
  }
};

const listar = (r) => {
  try {
    return readdirSync(join(RAIZ, r));
  } catch (e) {
    if (e?.code === 'ENOENT') {
      throw new ProblemaDeLaGuarda(
        `la carpeta ${r} no existe, y esta guarda cuenta lo que hay adentro.\n` +
        '  Si se movió, hay que actualizar la ruta acá; si se vació, la cifra que\n' +
        '  contaba dejó de significar lo mismo.',
      );
    }
    throw new ProblemaDeLaGuarda(`no se pudo listar ${r}: ${e?.message ?? e}`);
  }
};

/**
 * Corre `fn` y convierte un `ProblemaDeLaGuarda` en un fallo contado y legible.
 * Cualquier otro error sigue subiendo: un defecto de esta guarda no se disfraza
 * de cifra que no cuadra.
 */
const intentar = (fn) => {
  try {
    fn();
  } catch (e) {
    if (!(e instanceof ProblemaDeLaGuarda)) throw e;
    imposibles++;
    console.error(e.message);
  }
};

/**
 * Corre una expresión contra un módulo TypeScript del repositorio y devuelve
 * lo que imprime.
 *
 * **Existe porque contar texto no es contar.** La primera versión de la guarda
 * de rutas medidas contaba líneas `  medido(` con una expresión regular, y una
 * auditoría mostró lo que eso deja pasar: `raw-map.ts` ya promueve entradas a
 * `PROBADO` por otro camino --`{ ...deLaConsola(...), estado: 'PROBADO' }`-- y
 * una entrada así no la veía; al revés, colapsar una llamada a una sola línea
 * disparaba una falsa alarma sin cambiar una coma de la semántica. Una guarda
 * que compara el repositorio contra su propio estilo de escritura es más débil
 * todavía que compararlo consigo mismo, que es lo que `vse-disciplina` §6 ya
 * desaconseja.
 *
 * Así que se ejecuta la función que el propio paquete exporta para esto.
 */
const contarEjecutando = (modulo, expresion) => {
  let salida;
  try {
    salida = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
        `const m = await import(${JSON.stringify(join(RAIZ, modulo))});\n`
        + `process.stdout.write(String(${expresion}));`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (e) {
    // Ejecutar abre una superficie que leer texto no tenía: el módulo puede no
    // existir, no compilar, o dejar de exportar la función. Las tres daban el
    // stack del proceso hijo, que no dice qué cifra quedó sin comprobar.
    // **El error va, aunque no esté entre las primeras líneas.** Con `slice(0, 3)`
    // se veían la ruta, el código y el caret, y el `TypeError` --que es lo único
    // que dice qué pasó-- quedaba afuera por una línea.
    const lineas = String(e?.stderr ?? e?.message ?? e).trim().split('\n').filter((l) => l.trim() !== '');
    const iError = lineas.findIndex((l) => /^[A-Za-z]*Error\b/.test(l.trim()));
    const detalle = (iError === -1 ? lineas.slice(0, 3) : [...lineas.slice(0, 2), lineas[iError]])
      .join('\n    ');
    throw new ProblemaDeLaGuarda(
      `no se pudo contar \`${expresion}\` sobre ${modulo}.\n` +
      `    ${detalle}\n` +
      '  Esta cifra se cuenta ejecutando el módulo, no leyendo su texto. Si el\n' +
      '  módulo se movió o dejó de exportar lo que se llama acá, hay que decidir\n' +
      '  quién cuenta esa cifra ahora.',
    );
  }
  const n = Number(salida.trim());
  if (!Number.isInteger(n)) {
    throw new ProblemaDeLaGuarda(
      `contar \`${expresion}\` sobre ${modulo} devolvió «${salida.trim()}», que no es un entero.`,
    );
  }
  return n;
};

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
 * Cuántas afirmaciones conoce esta guarda en total.
 *
 * Se cuenta, no se escribe. Existe para que el resumen pueda decir **cuántas
 * quedaron sin comprobar** en vez de callarlo: hasta ahora, cuando algo fallaba
 * la línea de «Cifras validadas: N» no se imprimía, así que el que leía la salida
 * no tenía forma de saber si se había dejado de mirar una cifra o veinte.
 */
const AFIRMACIONES_ESPERADAS = DE_LA_CONSOLA.length + CONSTANTES.length
  + HECHOS.reduce((n, h) => n + h.afirmaciones.length, 0);

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
for (const hecho of HECHOS) intentar(() => {
  const real = hecho.contar();
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
});

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
