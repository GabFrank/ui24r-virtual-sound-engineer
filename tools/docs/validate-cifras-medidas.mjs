#!/usr/bin/env node
/**
 * Que un número presentado como medido esté en la evidencia que se cita.
 *
 * **El error que lo trajo, tres veces en un día.** Se corre una medición, se
 * mira la salida en la terminal, y después se corre otra vez para archivarla.
 * Son DOS corridas: la que se leyó y la que quedó. Cuando dan distinto —y en
 * una medición sobre hardware siempre dan un poco distinto— el documento cita
 * un número que no está en ningún archivo.
 *
 * Pasó con la latencia del testigo («mediana 17, extremos 12 a 26» contra un
 * archivo que decía 18 y 14), y con la de `SNAPSHOTLIST` («máximo 277» contra un
 * archivo cuyo máximo era 7). El segundo era peor: ese 277 era **el argumento
 * entero** para cambiar un plazo. Al medirlo de nuevo, sesenta veces, no volvió
 * a aparecer.
 *
 * **Por qué importa a la hora del show.** Un número inventado no se nota
 * mientras nadie dependa de él. Se nota el día que alguien ajusta un plazo, un
 * umbral o una espera confiando en él, y el aparato hace otra cosa.
 *
 * **Cómo funciona.** Busca líneas de documentación que citen un archivo de
 * evidencia, saca los números de esa misma línea, y comprueba que estén en el
 * archivo citado. No entiende de qué habla cada número: solo exige que quien
 * dice «medido, ver este archivo» tenga el número en ese archivo.
 *
 * **Lo que NO hace, y conviene saberlo.** No revisa números que no estén en la
 * misma línea que su cita, ni afirmaciones sin cita. Para eso está la regla de
 * huérfanos, que exige que toda evidencia se cite desde algún lado.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Los documentos donde se afirman mediciones. */
function markdowns(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === 'evidence') continue;   // la evidencia no se audita a sí misma
      salida.push(...markdowns(ruta));
    } else if (nombre.endsWith('.md')) salida.push(ruta);
  }
  return salida;
}

/**
 * Las cifras de un bloque que **se presentan como medición**.
 *
 * **Solo los números con unidad**, y el recorte es deliberado. Un bloque de
 * documentación mezcla resultados con umbrales —«100 % de las filas»—,
 * ordinales —«la 21»—, totales calculados a mano —«84 pedidos»— e
 * identificadores —`S-02.13`—, y ninguno de esos tiene por qué estar en un
 * archivo de evidencia. La primera versión los comprobaba todos y reportó once
 * cosas, de las cuales **una sola era real**. Una guarda con esa proporción de
 * ruido se desactiva en una semana.
 *
 * Las unidades son las que este proyecto usa para decir qué midió: milisegundos,
 * segundos, decibeles y hercios. Los tres errores que motivaron todo esto
 * —«mediana 17 ms», «máximo 277 ms», «recorrido de 84,5 dB»— caen los tres
 * adentro.
 *
 * **Queda fuera el porcentaje a propósito**: en los charters casi siempre es el
 * umbral de un criterio y no un resultado.
 */
const UNIDADES = String.raw`(?:ms|s|dB|dBFS|Hz|kHz)`;

/**
 * Los valores numéricos de un texto, ya normalizados.
 *
 * **Se compara por valor y no por cadena**, y hace falta: la evidencia imprime
 * `0.5000` donde el documento escribe «0,5», y el firmware aparece como
 * `3.4.8318` donde el documento dice «8318». Las dos son la misma cifra y una
 * comparación de texto las daba por distintas. Una guarda que grita por cosas
 * ciertas se desactiva sola.
 */
function valoresDe(texto) {
  const valores = new Set();
  for (const linea of texto.split('\n')) {
    // **Las líneas de encabezado no cuentan.** `medir.mjs` escribe la fecha
    // ISO, el comando y el código de salida en líneas que empiezan con `#`, y
    // ahí hay números —la hora, un PID, una marca de tiempo— que no son la
    // medición. Sin este filtro, un «17 ms» validaba contra el 17 de un
    // `T17:36:59`: un falso negativo esperando, o sea una cifra falsa que pasa.
    if (linea.trimStart().startsWith('#')) continue;
    for (const bruto of linea.match(/\d+(?:[.,]\d+)?/g) ?? []) {
      valores.add(Number(bruto.replace(',', '.')));
    }
  }
  return valores;
}

/**
 * Si la evidencia contiene ese valor, **aceptando el redondeo del documento**.
 *
 * La evidencia imprime `199.9823455811` y el documento escribe «199,98», que es
 * la misma cifra dicha con la precisión que hace falta para leerla. Exigir la
 * coincidencia exacta obligaría a llenar la documentación de decimales que no le
 * sirven a nadie, y una guarda que empuja a escribir peor termina desactivada.
 *
 * Se compara a la precisión que el documento eligió: si dice «199,98», alcanza
 * con que algún valor de la evidencia redondee a 199,98.
 */
function estaEnLaEvidencia(valores, cifra) {
  const buscado = Number(cifra.replace(',', '.'));
  if (valores.has(buscado)) return true;
  const decimales = (cifra.split(/[.,]/)[1] ?? '').length;
  const factor = 10 ** decimales;
  for (const v of valores) {
    if (Math.round(v * factor) / factor === buscado) return true;
  }
  return false;
}

function cifrasComprobables(bloque) {
  const limpio = bloque
    .replace(/\b(?:INV|ADR|SPK|S|R|G|DEC|MVP)-[\w.]+/g, ' ')
    .replace(/\d{4}-\d{2}-\d{2}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[\w./-]+\.(txt|md|ts|mjs|png|tsv|js)/g, ' ')
    .replace(/\bP0\.\d+\w*/g, ' ');
  const re = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*` + UNIDADES + String.raw`\b`, 'g');
  const crudas = [...limpio.matchAll(re)].map((m) => m[1]);
  return [...new Set(crudas)];
}

/**
 * Cifras que legítimamente no están en su evidencia, con su motivo.
 *
 * Misma idea que las citas deliberadas de `validate-ids.mjs`: **no es una lista
 * para acallar al script**, cada entrada dice por qué. El caso típico es un
 * número **retirado**: un documento que explica que una cifra vieja era falsa
 * tiene que poder nombrarla, y no estar en la evidencia es precisamente lo que
 * la hace falsa.
 *
 * Si esta lista crece sin explicaciones, el problema es la lista.
 */
const CIFRAS_DELIBERADAS = new Map([
  ['docs/spikes/SPK-P0.1-conectividad.md:4,9', 'Cifra RETIRADA. La frase dice literalmente que '
    + 'esto «reemplaza a los unos pocos ciclos, 3,8 a 4,9 s» de antes. La evidencia tiene los '
    + 'veinte ciclos reales, 3,7 a 5,0. Que la cifra vieja no esté ahí es el punto de la frase.'],
  ['docs/protocol-spec.md:84,5', 'Cifra RETIRADA. El documento explica que el recorrido del '
    + 'medidor estuvo escrito como 84,5 dB y era falso: venía de barridos con una fuente '
    + 'externa, que mide la cadena entera y no el medidor. Que no esté en la evidencia es lo '
    + 'que el propio párrafo está diciendo.'],
]);

const problemas = [];
const cache = new Map();

/**
 * Índice de los archivos de evidencia, por nombre.
 *
 * Se resuelve **por nombre y no por ruta**: los documentos citan de tres formas
 * distintas —`evidence/x.txt` relativa al spike, `spikes/SPK-.../evidence/x.txt`
 * relativa a `docs/`, y la ruta completa desde la raíz— y hacer aritmética de
 * rutas para las tres era justamente lo que fallaba en silencio. Los nombres de
 * los archivos de evidencia llevan fecha, así que son únicos de hecho.
 */
function indexarEvidencia(dir, indice = new Map()) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) indexarEvidencia(ruta, indice);
    else if (dir.endsWith('/evidence')) indice.set(nombre, ruta);
  }
  return indice;
}
const EVIDENCIA = indexarEvidencia(join(RAIZ, 'docs'));

/** Los valores de la evidencia citada, o `null` si esa cita no existe. */
function evidenciaDe(cita) {
  const nombre = cita.split('/').pop();
  const ruta = EVIDENCIA.get(nombre);
  if (ruta === undefined) return null;
  if (!cache.has(ruta)) cache.set(ruta, valoresDe(readFileSync(ruta, 'utf8')));
  return cache.get(ruta);
}

/**
 * Los bloques de un documento: párrafos, filas de tabla, citas.
 *
 * **Se mira el bloque y no la línea, y hace falta.** La primera versión miraba
 * línea por línea y **no atrapó el caso que la motivó**: en el charter de
 * SPK-P0.8 la cifra estaba en una línea y la cita del archivo en la siguiente,
 * las dos dentro del mismo párrafo. Una guarda que no cubre su propio caso
 * motivador es decorado. Se comprobó reinyectando la cifra falsa a propósito.
 *
 * Una fila de tabla es un bloque de una línea, que es lo que ya se hacía; un
 * párrafo o una cita en bloque son varias.
 */
/**
 * Secciones que listan evidencia **por entregar**, no entregada.
 *
 * El charter de un spike enumera qué archivos va a producir. Ahí una cita a algo
 * que todavía no existe es correcta —es un plan— y las cifras que la acompañan
 * son las que se esperan medir, no las medidas. Comprobarlas contra un archivo
 * inexistente es exigirle a un plan que ya sea un resultado.
 */
const SECCIONES_DE_PLAN =
  /^#+\s*(Evidencia( a entregar)?|Pasos|Criterios de aceptación|Acción ante fallo)\s*$/i;

function bloques(texto) {
  const salida = [];
  let actual = [];
  let desde = 1;
  let enPlan = false;
  texto.split('\n').forEach((linea, i) => {
    if (linea.startsWith('#')) enPlan = SECCIONES_DE_PLAN.test(linea);
    if (enPlan) {
      if (actual.length > 0) { salida.push({ desde, texto: actual.join('\n') }); actual = []; }
      desde = i + 2;
      return;
    }
    if (linea.trim() === '') {
      if (actual.length > 0) salida.push({ desde, texto: actual.join('\n') });
      actual = []; desde = i + 2;
      return;
    }
    if (linea.startsWith('|')) {
      if (actual.length > 0) { salida.push({ desde, texto: actual.join('\n') }); actual = []; }
      salida.push({ desde: i + 1, texto: linea });
      desde = i + 2;
      return;
    }
    if (actual.length === 0) desde = i + 1;
    actual.push(linea);
  });
  if (actual.length > 0) salida.push({ desde, texto: actual.join('\n') });
  return salida;
}

for (const doc of markdowns(join(RAIZ, 'docs'))) {
  bloques(readFileSync(doc, 'utf8')).forEach(({ desde, texto: linea }) => {
    const citas = linea.match(/[\w./-]*evidence\/[\w.-]+\.(?:txt|tsv|js)/g) ?? [];
    if (citas.length === 0) return;
    const cifras = cifrasComprobables(linea);
    if (cifras.length === 0) return;
    const i = desde - 1;

    // Con varias citas en el mismo bloque alcanza que el número esté en alguna:
    // el bloque afirma algo que esas evidencias sostienen entre todas.
    const textos = [];
    for (const c of citas) {
      const valores = evidenciaDe(c);
      if (valores === null) {
        // **Una cita que no resuelve NO se saltea.** La primera versión hacía
        // `return` acá, y con eso una ruta mal escrita desactivaba la
        // comprobación del bloque entero sin decir nada. Se descubrió probando
        // el validador contra el caso que lo motivó: no lo atrapaba, porque la
        // cita del charter de SPK-P0.8 es `evidence/...` relativa al spike y la
        // resolución la buscaba en otro lado. Un guarda que se apaga solo ante
        // una ruta rota es peor que no tenerlo, porque figura en verde.
        problemas.push({
          doc: doc.slice(RAIZ.length + 1), linea: i + 1, cifra: '(cita rota)', citas: c,
        });
        continue;
      }
      textos.push(valores);
    }
    if (textos.length === 0) return;

    for (const cifra of cifras) {
      const clave = `${doc.slice(RAIZ.length + 1)}:${cifra}`;
      if (CIFRAS_DELIBERADAS.has(clave)) continue;
      if (!textos.some((t) => estaEnLaEvidencia(t, cifra))) {
        problemas.push({
          doc: doc.slice(RAIZ.length + 1), linea: i + 1, cifra, citas: citas.join(', '),
        });
      }
    }
  });
}

if (problemas.length > 0) {
  console.error(`\nCifras que se presentan como medidas y no están en su evidencia (${problemas.length}):\n`);
  for (const p of problemas) {
    console.error(p.cifra === '(cita rota)'
      ? `  ✘ ${p.doc}:${p.linea}  cita un archivo de evidencia que no existe: ${p.citas}`
      : `  ✘ ${p.doc}:${p.linea}  «${p.cifra}»  no está en ${p.citas}`);
  }
  console.error('\nO el número salió de una corrida que no se archivó —pasó tres veces— o la cita');
  console.error('apunta al archivo equivocado. Las mediciones se archivan con `tools/spikes/medir.mjs`,');
  console.error('que guarda LA MISMA corrida que se está mirando.\n');
  process.exit(1);
}
console.log(`Cifras medidas: todas las que citan evidencia están en su evidencia (${CIFRAS_DELIBERADAS.size} retirada${CIFRAS_DELIBERADAS.size === 1 ? '' : 's'} a propósito).`);
