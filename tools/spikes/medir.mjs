#!/usr/bin/env node
/**
 * Corre una medición y archiva **la misma corrida** que se está mirando.
 *
 * **El error que esto elimina, y que pasó tres veces en un día.** La rutina era:
 * correr el spike, leer la salida en la terminal, y después correrlo otra vez
 * redirigiendo a un archivo de evidencia. Son DOS corridas. En una medición
 * sobre hardware nunca dan igual —el testigo dio mediana 17 en una y 18 en la
 * otra; `SNAPSHOTLIST` dio un máximo de 277 en una y de 7 en la otra— y el
 * documento terminaba citando números que no estaban en ningún archivo.
 *
 * El peor de los tres fue el 277: era **el argumento entero** para cambiar un
 * plazo. Al medirlo de nuevo, sesenta veces seguidas, no volvió a aparecer.
 *
 * **Por qué duele a la hora del show.** Un número inventado no molesta mientras
 * nadie dependa de él. Molesta el día que alguien ajusta un plazo, un umbral o
 * una espera confiando en él, y el aparato hace otra cosa con la sala llena.
 *
 * Acá hay una sola corrida: la salida va a la pantalla y al archivo a la vez, y
 * el archivo lleva su encabezado con la fecha, el comando exacto y el resultado.
 * No hay forma de mirar una cosa y archivar otra.
 *
 * Uso:
 *   node tools/spikes/medir.mjs <destino.txt> <guion.ts> [args...]
 *
 * Ejemplo:
 *   node tools/spikes/medir.mjs \
 *     docs/spikes/SPK-P0.8/evidence/latencia-lista-2026-09-10.txt \
 *     tools/spikes/p0-10b-vu/latencia-snapshotlist.ts 192.168.0.78 60
 *
 * El encabezado del archivo se puede completar a mano después --el porqué de la
 * medición, qué se concluye-- pero **la salida no se toca**: es lo que dijo el
 * aparato.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [destino, guion, ...args] = process.argv.slice(2);

if (destino === undefined || guion === undefined) {
  console.error('Uso: node tools/spikes/medir.mjs <destino.txt> <guion.ts> [args...]');
  process.exit(2);
}
if (!destino.includes('/evidence/')) {
  console.error(`El destino tiene que estar en una carpeta evidence/: ${destino}`);
  console.error('Una medición que no queda con su spike no la encuentra nadie.');
  process.exit(2);
}
if (existsSync(destino)) {
  // No se sobrescribe: un archivo de evidencia es el registro de un día, y
  // pisarlo borra el rastro de que la medición anterior existió.
  console.error(`Ya existe: ${destino}`);
  console.error('La evidencia no se pisa. Usá otro nombre, o agregá la corrida nueva al final');
  console.error('del archivo diciendo que es otra corrida.');
  process.exit(2);
}

mkdirSync(dirname(destino), { recursive: true });
const salida = createWriteStream(destino);

const cuando = new Date().toISOString();
const comando = ['node', '--experimental-strip-types', guion, ...args].join(' ');
const encabezado = [
  `# Medición archivada por tools/spikes/medir.mjs`,
  `# fecha: ${cuando}`,
  `# comando: ${comando}`,
  `#`,
  `# Esta es LA MISMA corrida que se vio en pantalla. No se transcribió a mano.`,
  ``,
  ``,
].join('\n');
salida.write(encabezado);
process.stdout.write(encabezado);

const hijo = spawn('node', ['--experimental-strip-types', guion, ...args], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

// Los avisos de Node sobre reparsear TypeScript no son parte de la medición y
// ensucian el archivo, así que se filtran de los dos lados por igual.
const RUIDO = /Reparsing as ES module|To eliminate this warning|trace-warnings|ExperimentalWarning/;
const escribir = (trozo) => {
  const util = String(trozo).split('\n').filter((l) => !RUIDO.test(l)).join('\n');
  if (util.trim() === '' && String(trozo).trim() !== '') return;
  process.stdout.write(util);
  salida.write(util);
};
hijo.stdout.on('data', escribir);
hijo.stderr.on('data', escribir);

hijo.on('exit', (codigo) => {
  const pie = `\n\n# salida del proceso: ${codigo}\n`;
  salida.write(pie);
  process.stdout.write(pie);
  salida.end();
  console.log(`\nArchivada en ${destino}`);
  process.exit(codigo ?? 0);
});
