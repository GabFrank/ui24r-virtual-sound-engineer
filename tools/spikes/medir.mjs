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
import { createWriteStream, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';

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
/**
 * La huella del guion que corrió, y hace falta.
 *
 * **El encabezado decía qué comando se usó y no qué guion.** Una auditoría lo
 * midió el 2026-09-11: se archivó una corrida, después se editó el guion para
 * agregarle una rama, y el commit presentó esa rama como el aporte — mientras el
 * archivo, que seguía diciendo «node … retencion-y-borrado.ts», era salida de la
 * versión anterior. La rama que se celebraba **nunca se había ejecutado**.
 *
 * Es exactamente lo que esta herramienta existe para impedir, entrando por otra
 * puerta: no «mirar una corrida y archivar otra», sino **archivar una corrida y
 * después cambiar el guion debajo**. Con la huella, cualquiera puede comprobar
 * si el archivo corresponde al guion de hoy:
 *
 *     shasum -a 256 tools/spikes/…/guion.ts
 */
/**
 * Los archivos locales que el guion arrastra, transitivamente.
 *
 * **La huella cubria solo el archivo de nivel superior, y eso deja abierta la
 * puerta que la huella existe para cerrar.** Una medicion importa su
 * instrumento --`analizar.mjs`, `multitono.mjs`, `con-restauracion.ts`,
 * `restaurar.ts`-- y cambiar el instrumento despues de archivar **no movia la
 * huella**: la evidencia seguia diciendo que correspondia a un guion que ya no
 * era el mismo. Lo marco una auditoria de controles el 2026-09-13.
 *
 * Se siguen solo los imports **relativos**: los paquetes del monorepo cambian por
 * su cuenta y seguirlos entero haria que cualquier commit invalidara todas las
 * evidencias. Lo que se cubre es el guion y sus instrumentos, que es donde vive
 * el metodo de la medicion.
 */
function cierreDeImports(entrada, vistos = new Set()) {
  const abs = resolve(entrada);
  if (vistos.has(abs) || !existsSync(abs)) return vistos;
  vistos.add(abs);
  const texto = readFileSync(abs, 'utf8');
  const base = dirname(abs);
  for (const m of texto.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const pedido = join(base, m[1]);
    // El import trae la extension escrita, pero por las dudas se prueban las dos
    // formas que este arbol usa.
    for (const cand of [pedido, `${pedido}.ts`, `${pedido}.mjs`]) {
      if (existsSync(cand)) { cierreDeImports(cand, vistos); break; }
    }
  }
  return vistos;
}

const archivos = existsSync(guion) ? [...cierreDeImports(guion)].sort() : [];
const huella = archivos.length > 0
  ? createHash('sha256')
    .update(archivos.map((f) => `${relative(process.cwd(), f)}\n${readFileSync(f)}`).join('\n'))
    .digest('hex').slice(0, 16)
  : 'no se pudo leer el guion';

const encabezado = [
  `# Medición archivada por tools/spikes/medir.mjs`,
  `# fecha: ${cuando}`,
  `# comando: ${comando}`,
  `# guion: ${guion} sha256:${huella}`,
  `# la huella cubre ${archivos.length} archivo(s): el guion y sus instrumentos locales`,
  `#`,
  `# Esta es LA MISMA corrida que se vio en pantalla. No se transcribió a mano.`,
  `# La huella es del guion Y DE SUS IMPORTS LOCALES tal como estaban al correr:`,
  `# si hoy no coincide, el`,
  `# archivo es de otra version y lo que diga de si mismo no vale.`,
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
// `MODULE_TYPELESS_PACKAGE_JSON` faltaba, y es JUSTO el que aparece: los siete
// archivos de evidencia de la primera tanda lo tienen adentro. El filtro no
// filtraba el aviso que llega, que es la forma más tonta de que un filtro no
// sirva. Lo encontró una auditoría.
const RUIDO = /Reparsing as ES module|To eliminate this warning|trace-warnings|ExperimentalWarning|MODULE_TYPELESS_PACKAGE_JSON|it doesn't parse as CommonJS/;
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
  // **Se espera a que el archivo se cierre de verdad antes de salir.** Antes
  // era `salida.end()` seguido de `process.exit()` en la misma vuelta, y eso
  // puede truncar lo que quedaba en el buffer: se perdería la última parte de
  // una medición larga sin que nadie lo note, que es exactamente el modo de
  // fallo que esta herramienta existe para impedir.
  salida.end(() => {
    console.log(`\nArchivada en ${destino}`);
    process.exit(codigo ?? 0);
  });
});
