#!/usr/bin/env node
/**
 * Que toda evidencia posterior a `medir.mjs` haya pasado por `medir.mjs`.
 *
 * **La falta que esto cierra.** `medir.mjs` existe desde el 2026-09-10 para que
 * no se pueda mirar una corrida y archivar otra: tee la salida a la pantalla y
 * al archivo a la vez, con un encabezado que dice la fecha y el comando. El
 * mismo día de su llegada se archivaron nueve evidencias **a mano**, o sea
 * transcripciones: la forma exacta del error que la herramienta vino a impedir.
 * Y varias sostienen criterios en verde.
 *
 * Lo encontró una auditoría, y el remate es que una de esas nueve —el barrido
 * del testigo— cierra diciendo *«una medición que no se archiva no se midió, se
 * contó»*.
 *
 * **Dónde se pone el límite y por qué ahí.** El día que la herramienta entró al
 * repositorio. Antes de eso no había con qué; después, no usarla es una
 * decisión. No es una fecha elegida a ojo: es la fecha del commit que la creó.
 *
 * Las dos listas de abajo son distintas a propósito:
 *
 * - `ANTERIORES_A_LA_HERRAMIENTA` está **cerrada**. Su tamaño se comprueba, así
 *   que sumarle algo es un acto deliberado y visible, no un descuido.
 * - `TRANSCRIPCIONES_PENDIENTES` no exime de nada: exige que el documento que
 *   cita cada una **lo diga**. Una deuda que no se ve es una deuda que no se
 *   paga.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(import.meta.dirname, '..', '..');

/** El encabezado que `medir.mjs` escribe, y que no se puede falsificar sin querer. */
const MARCA = /medir\.mjs/;

/**
 * Evidencias anteriores al 2026-09-10, cuando `medir.mjs` no existía.
 *
 * **Lista cerrada.** No se le agrega nada: cualquier archivo nuevo tiene la
 * herramienta disponible.
 */
const ANTERIORES_A_LA_HERRAMIENTA = new Set([
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

/** El tamaño de la lista cerrada. Si baja, se baja acá a propósito. */
const CUANTAS_ANTERIORES = 30;

/**
 * Transcripciones posteriores a la herramienta que **todavía no se remidieron**.
 *
 * Cada una tiene que estar declarada como tal en el documento que la cita, con
 * la frase de abajo. No se exime: se obliga a decirlo.
 */
const TRANSCRIPCIONES_PENDIENTES = new Set([
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

const fallos = [];

if (ANTERIORES_A_LA_HERRAMIENTA.size !== CUANTAS_ANTERIORES) {
  fallos.push(
    `la lista de evidencias anteriores a medir.mjs tiene ${ANTERIORES_A_LA_HERRAMIENTA.size} `
    + `entradas y se declaran ${CUANTAS_ANTERIORES}. Es una lista CERRADA: si baja, se baja acá.`,
  );
}

let conMarca = 0;
for (const rel of evidencias) {
  const tieneMarca = MARCA.test(readFileSync(join(RAIZ_SPIKES, rel), 'utf8').slice(0, 400));
  if (tieneMarca) { conMarca++; continue; }
  if (ANTERIORES_A_LA_HERRAMIENTA.has(rel)) continue;

  if (REMEDIDAS.has(rel)) {
    const nueva = REMEDIDAS.get(rel);
    const citada = prosa.some((p) => p.texto.includes(nueva.split('/').pop()));
    if (!citada) {
      fallos.push(`${rel} se remidió en ${nueva} y ningún documento cita la remedición`);
    }
    continue;
  }

  if (TRANSCRIPCIONES_PENDIENTES.has(rel)) {
    const nombre = rel.split('/').pop();
    const citan = prosa.filter((p) => p.texto.includes(nombre));
    if (citan.length === 0) continue;   // la regla de huérfanos se ocupa de eso
    const avisan = citan.filter((p) => p.texto.includes(AVISO));
    if (avisan.length !== citan.length) {
      const mudos = citan.filter((p) => !p.texto.includes(AVISO))
        .map((p) => p.f.slice(RAIZ.length + 1));
      fallos.push(
        `${rel} es una transcripción sin archivar y los documentos que la citan no lo dicen: `
        + mudos.join(', '),
      );
    }
    continue;
  }

  fallos.push(
    `${rel} no pasó por medir.mjs, y es posterior a la herramienta. `
    + 'Remedila con medir.mjs, o declarala en TRANSCRIPCIONES_PENDIENTES y avisalo donde se cita.',
  );
}

if (fallos.length > 0) {
  console.error('Evidencias que no se archivaron con la herramienta:\n');
  for (const f of fallos) console.error(`  - ${f}`);
  console.error('\nUna medición que no se archiva no se midió, se contó.');
  process.exit(1);
}

console.log(
  `Evidencia archivada: ${evidencias.length} archivos — ${conMarca} por medir.mjs, `
  + `${ANTERIORES_A_LA_HERRAMIENTA.size} anteriores a la herramienta, `
  + `${TRANSCRIPCIONES_PENDIENTES.size} transcripciones declaradas, `
  + `${REMEDIDAS.size} remedidas.`,
);
