#!/usr/bin/env node
/**
 * Que toda evidencia posterior a `medir.mjs` haya pasado por `medir.mjs`.
 *
 * **Por qué existe.** `medir.mjs` tee la salida de una medición a la pantalla y
 * al archivo a la vez, con un encabezado que dice la fecha y el comando. Sin
 * ella, la rutina era correr el guion, leer la terminal, y volver a correrlo
 * redirigiendo a un archivo: dos corridas, y sobre hardware nunca dan igual.
 *
 * **Y la primera versión de esta guarda acusaba en falso, que es peor que no
 * acusar.** Decía que nueve evidencias «se archivaron a mano el mismo día en
 * que entró la herramienta que existe para impedirlo». Contado:
 * `git log --diff-filter=A -- tools/spikes/medir.mjs` da **c37c644, 2026-09-10
 * a las 12:55:27**, y las nueve entraron entre las **00:56 y las 12:30 de ese
 * mismo día**. Ninguna pudo usarla. La frase era cierta en cuanto al día y
 * falsa en cuanto a lo único que importaba. Lo marcó una auditoría, y el
 * reproche se retira.
 *
 * Lo que queda en pie, y no es poco: cinco de esas nueve **siguen siendo
 * transcripciones que sostienen criterios en verde**. Que nadie tuviera con qué
 * medirlas entonces explica cómo pasó; no las convierte en mediciones.
 *
 * **El límite es el instante del commit que creó la herramienta**, no una fecha
 * a ojo. De ahí en adelante, no usarla es una decisión.
 *
 * Las listas de abajo son distintas a propósito:
 *
 * - `SIN_HERRAMIENTA_DISPONIBLE` está **cerrada**, y su tamaño se comprueba:
 *   sumarle algo es un acto deliberado y visible.
 * - `PENDIENTES_DE_REMEDIR` no exime de nada. Exige que el documento que cita
 *   cada una lo diga **en el mismo párrafo que la cita**, no en cualquier parte
 *   del archivo. Una deuda que no se ve donde se lee es una deuda que no se
 *   paga.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');

/**
 * El encabezado **entero** que `medir.mjs` escribe.
 *
 * **Antes esto era `/medir\.mjs/` sobre los primeros 400 bytes**, o sea una
 * subcadena. Una auditoría lo midió: alcanzaba con prependerle
 * `# lo corri con medir.mjs, palabra` a una transcripción para que la guarda
 * diera por buena la medición. Una regla que se pasa escribiendo su propio
 * nombre no es una regla.
 *
 * Ahora se exigen las tres líneas con forma: el rótulo, una fecha en formato
 * ISO y el comando con el guion. Falsificar eso ya no es un descuido — es
 * escribir a mano una fecha y un comando que nunca corrieron, y para eso no hay
 * guarda que alcance.
 */
const ENCABEZADO = [
  /^# Medición archivada por tools\/spikes\/medir\.mjs$/,
  /^# fecha: \d{4}-\d{2}-\d{2}T[\d:.]+Z$/,
  /^# comando: node .*\.(ts|mjs)\b/,
];

function tieneEncabezado(texto) {
  const lineas = texto.split('\n');
  return ENCABEZADO.every((re, i) => re.test(lineas[i] ?? ''));
}

/**
 * Evidencias anteriores al 2026-09-10, cuando `medir.mjs` no existía.
 *
 * **Lista cerrada.** No se le agrega nada: cualquier archivo nuevo tiene la
 * herramienta disponible.
 */
const SIN_HERRAMIENTA_DISPONIBLE = new Set([
  // Las nueve del 2026-09-10, todas anteriores a las 12:55:27 de ese día.
  'SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt',
  'SPK-ACK-POLICY/evidence/respaldo-medidor-2026-09-10.txt',
  'SPK-P0.8/evidence/borrado-instantanea-2026-09-10.txt',
  'SPK-P0.8/evidence/retencion-y-lista-2026-09-10.txt',
  'SPK-P0.9/evidence/agrupacion-arrastre-2026-09-10.txt',
  'SPK-P0.9/evidence/cadencia-difusion-2026-09-10.txt',
  'SPK-P0.9/evidence/concurrencia-2026-09-10.txt',
  'SPK-P0.9/evidence/escrituras-propias-2026-09-10.txt',
  'SPK-P0.9/evidence/testigo-en-el-tic-2026-09-10.txt',
  'SPK-P0.1/evidence/ciclos-wifi-cortada.txt',
  'SPK-P0.1/evidence/handshake.txt',
  'SPK-P0.1/evidence/prueba-A-pasivo.txt',
  'SPK-P0.1/evidence/prueba-B-alive.txt',
  'SPK-P0.1/evidence/tres-clientes-diff.txt',
  'SPK-P0.1/evidence/volcado-inicial.txt',
  'SPK-P0.1/evidence/vu-con-senal.txt',
  'SPK-P0.1/evidence/lazo-cerrado-2026-09-09.txt',
  'SPK-P0.1/evidence/lazo-contra-consola-2026-09-09.txt',
  'SPK-P0.1/evidence/recorrido-tablet-2026-09-09.txt',
  'SPK-P0.10b/evidence/barridos-2026-09-08.txt',
  'SPK-P0.10b/evidence/constantes-mixer-html-2026-09-09.txt',
  'SPK-P0.10b/evidence/techo-medidor-2026-09-09.txt',
  'SPK-P0.2a/evidence/trabajo3-cambios.txt',
  'SPK-P0.2a/evidence/curva-ganancia-completa-2026-09-09.txt',
  'SPK-P0.2a/evidence/enlace-estereo-2026-09-09.txt',
  'SPK-P0.2a/evidence/fuentes-de-canal-2026-09-09.txt',
  'SPK-P0.2a/evidence/http-servido-2026-09-09.txt',
  'SPK-P0.2a/evidence/ley-ganancia-2026-09-09.txt',
  'SPK-P0.2a/evidence/manual-fw-3.5-que-aporta-2026-09-09.txt',
  'SPK-P0.2a/evidence/manual-tecnico-fw-3.5.8328.txt',
  'SPK-P0.2a/evidence/trabajo-previo-2026-09-09.txt',
  'SPK-P0.2c/evidence/buses-vu2-2026-09-09.txt',
  'SPK-P0.2c/evidence/cola-vu2-2026-09-09.txt',
  'SPK-P0.5/evidence/espectro-en-la-tablet-2026-09-09.txt',
  'SPK-P0.5/evidence/realimentacion-2026-09-09.txt',
  'SPK-P0.5/evidence/rta-es-espectro-2026-09-09.txt',
  'SPK-P0.5/evidence/rta-general-2026-09-09.txt',
  'SPK-P0.5/evidence/rta-no-es-espectro-2026-09-09.txt',
  'SPK-P0.5/evidence/var-rta-2026-09-09.txt',
]);

/** El tamaño de la lista cerrada. Si cambia, se cambia acá a propósito. */
const CUANTAS_SIN_HERRAMIENTA = 39;

/**
 * Transcripciones posteriores a la herramienta que **todavía no se remidieron**.
 *
 * Cada una tiene que estar declarada como tal en el documento que la cita, con
 * la frase de abajo. No se exime: se obliga a decirlo.
 */
const PENDIENTES_DE_REMEDIR = new Set([
  'SPK-P0.8/evidence/borrado-instantanea-2026-09-10.txt',
  'SPK-P0.8/evidence/retencion-y-lista-2026-09-10.txt',
  'SPK-P0.9/evidence/agrupacion-arrastre-2026-09-10.txt',
  'SPK-P0.9/evidence/testigo-en-el-tic-2026-09-10.txt',
  'SPK-ACK-POLICY/evidence/respaldo-medidor-2026-09-10.txt',
]);

/**
 * Transcripciones que ya tienen su remedición al lado.
 *
 * Se conservan porque los documentos cuentan qué se vio aquella noche y borrar
 * el archivo dejaría la prosa sin respaldo. Lo que se exige es que el documento
 * cite **también** la remedición.
 */
const REMEDIDAS = new Map([
  ['SPK-P0.9/evidence/escrituras-propias-2026-09-10.txt',
    'SPK-P0.9/evidence/escrituras-propias-2026-09-11.txt'],
  ['SPK-P0.9/evidence/cadencia-difusion-2026-09-10.txt',
    'SPK-P0.9/evidence/cadencia-difusion-2026-09-11.txt'],
  ['SPK-P0.9/evidence/concurrencia-2026-09-10.txt',
    'SPK-P0.9/evidence/concurrencia-2026-09-11.txt'],
  ['SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt',
    'SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-11.txt'],
]);

/** La frase que tiene que aparecer en el documento que cita una pendiente. */
const AVISO = 'transcripción sin archivar';

function archivos(dir, salida = []) {
  for (const n of readdirSync(dir)) {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) archivos(r, salida);
    else salida.push(r);
  }
  return salida;
}

const RAIZ_SPIKES = join(RAIZ, 'docs', 'spikes');
const evidencias = archivos(RAIZ_SPIKES)
  .filter((f) => f.includes(`${'evidence'}/`) && f.endsWith('.txt'))
  .map((f) => f.slice(RAIZ_SPIKES.length + 1));

const docs = archivos(join(RAIZ, 'docs')).filter((f) => f.endsWith('.md'));
const prosa = docs.map((f) => ({ f, texto: readFileSync(f, 'utf8') }));

/**
 * El texto partido en párrafos, y cada fila de tabla como su propio párrafo.
 *
 * Los criterios viven en tablas de una línea: si la fila entera contara como
 * «el documento», el aviso de una fila taparía el de otra.
 */
function parrafos(texto) {
  const salida = [];
  for (const bloque of texto.split(/\n\s*\n/)) {
    if (bloque.trimStart().startsWith('|')) salida.push(...bloque.split('\n'));
    else salida.push(bloque);
  }
  return salida;
}

/**
 * Si un trozo de prosa cita ese archivo de evidencia.
 *
 * **No es `includes` del nombre a secas.** Una auditoría se lo saltó de dos
 * formas legítimas: escribiendo la extensión en mayúsculas, y dejando que
 * Markdown envolviera el nombre en dos líneas. Las dos son cosas que alguien
 * escribe sin mala intención, y con cualquiera de ellas la obligación
 * desaparecía en silencio. Se normalizan los espacios y se ignoran mayúsculas.
 */
function cita(texto, rel) {
  const nombre = rel.split('/').pop().toLowerCase();
  return texto.replace(/\s+/g, '').toLowerCase().includes(nombre.replace(/\s+/g, ''));
}

const fallos = [];

if (SIN_HERRAMIENTA_DISPONIBLE.size !== CUANTAS_SIN_HERRAMIENTA) {
  fallos.push(
    `la lista de evidencias anteriores a medir.mjs tiene ${SIN_HERRAMIENTA_DISPONIBLE.size} `
    + `entradas y se declaran ${CUANTAS_SIN_HERRAMIENTA}. Es una lista CERRADA: si baja, se baja acá.`,
  );
}

let conMarca = 0;
for (const rel of evidencias) {
  const tieneMarca = tieneEncabezado(readFileSync(join(RAIZ_SPIKES, rel), 'utf8'));
  if (tieneMarca) { conMarca++; continue; }
  // **Las exigencias van ANTES del atajo de la lista cerrada.** Al meter las
  // nueve del 2026-09-10 en esa lista, las dos ramas de abajo quedaron
  // inalcanzables y la guarda se volvió muda sin que nada lo dijera: el resumen
  // seguía informando «5 pendientes» y ninguna estaba siendo exigida. Lo
  // encontraron los propios controles positivos de esta guarda, que es para lo
  // que están.

  if (REMEDIDAS.has(rel)) {
    const nueva = REMEDIDAS.get(rel);
    const citada = prosa.some((p) => cita(p.texto, nueva));
    if (!citada) {
      fallos.push(`${rel} se remidió en ${nueva} y ningún documento cita la remedición`);
    }
    continue;
  }

  if (PENDIENTES_DE_REMEDIR.has(rel)) {
    const mudos = [];
    for (const p of prosa) {
      // **El aviso tiene que estar donde se lee la cita, no en cualquier parte
      // del archivo.** Antes bastaba con que la frase apareciera en el
      // documento: una auditoría lo midió poniéndola en un comentario HTML de
      // la primera línea, y un documento que cita dos pendientes y avisa de una
      // las cubría a las dos. Ahora se mira el párrafo -- o la fila de tabla --
      // donde aparece la cita.
      for (const trozo of parrafos(p.texto)) {
        if (!cita(trozo, rel)) continue;
        if (!trozo.includes(AVISO)) mudos.push(p.f.slice(RAIZ.length + 1));
      }
    }
    if (mudos.length > 0) {
      fallos.push(
        `${rel} es una transcripción sin archivar y no lo dice donde se la cita: `
        + [...new Set(mudos)].join(', '),
      );
    }
    continue;
  }

  if (SIN_HERRAMIENTA_DISPONIBLE.has(rel)) continue;

  fallos.push(
    `${rel} no pasó por medir.mjs, y es posterior a la herramienta. `
    + 'Remedila con medir.mjs, o declarala en PENDIENTES_DE_REMEDIR y avisalo donde se cita.',
  );
}

if (fallos.length > 0) {
  console.error('Evidencias que no se archivaron con la herramienta:\n');
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('\nUna medición que no se archiva no se midió, se contó.');
  process.exit(1);
}

// **La suma tiene que cerrar.** Antes el resumen imprimía cuatro números que
// nadie comparaba con el total, y una auditoría lo notó al falsificar un
// encabezado: decía «84 archivos» y los sumandos daban 85.
// Las pendientes y las remedidas son SUBCONJUNTOS de las que no tuvieron
// herramienta: no se suman aparte. Que lo sean se comprueba abajo, porque si
// alguna se saliera el resumen contaría dos veces sin que se note.
for (const rel of [...PENDIENTES_DE_REMEDIR, ...REMEDIDAS.keys()]) {
  if (!SIN_HERRAMIENTA_DISPONIBLE.has(rel)) {
    console.error(`${rel} está declarada aparte y no figura entre las que no tuvieron herramienta`);
    process.exit(1);
  }
}
const suma = conMarca + SIN_HERRAMIENTA_DISPONIBLE.size;
if (suma !== evidencias.length) {
  console.error(
    `las cuentas no cierran: ${evidencias.length} archivos y los grupos suman ${suma}. `
    + 'Alguno está en dos listas, o una lista nombra algo que ya no existe.',
  );
  process.exit(1);
}

console.log(
  `Evidencia archivada: ${evidencias.length} archivos — ${conMarca} por medir.mjs, `
  + `${SIN_HERRAMIENTA_DISPONIBLE.size} de cuando la herramienta no existía, `
  + `${PENDIENTES_DE_REMEDIR.size} de ésas pendientes de remedir `
  + `(${REMEDIDAS.size} ya remedidas).`,
);
