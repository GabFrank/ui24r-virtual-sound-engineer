/**
 * Qué devuelve una recuperación de instantánea, campo por campo.
 *
 * Cierra **dos** criterios que estaban abiertos por el mismo motivo —que nadie
 * había ejecutado un `LOADSNAPSHOT` nunca—:
 *
 * - **P0.8, «alcance de la recuperación documentado»**, que figuraba
 *   DESCONOCIDO. Es la pregunta más importante para la seguridad del producto:
 *   si el punto de retorno que la aplicación guarda antes de escribir (INV-001)
 *   no devuelve todo, entonces no es un punto de retorno.
 * - **P0.9, criterio 4**, que se llama «recuperación de instantánea detectada
 *   como avalancha». Lo medido hasta ahora era una ráfaga de escrituras, que
 *   dispara el mismo detector por otro camino y da causa `DESCONOCIDA`. Un
 *   recall de verdad cambia `var.currentSnapshot` y tiene que dar
 *   `SNAPSHOT_RECALL`.
 *
 * **Por qué es seguro, y dónde está la red.** La instantánea se guarda **desde
 * el estado de ahora**, así que recuperarla devuelve exactamente el ahora: la
 * propia recuperación es la restauración. Los campos que se mueven en el medio
 * son de los canales 21 a 24, que no tienen nada enchufado y están silenciados.
 * Y por si el recall no devolviera algo, se guardan los ~6700 valores de antes
 * y **se comparan uno a uno al final**: lo que no haya vuelto se restaura a
 * mano y se dice cuál era.
 *
 * Al terminar se borra la instantánea que creamos —solo esa, y solo porque
 * lleva nombre fechable— y ninguna del usuario.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-8/alcance-recall.ts [ip] [canales]
 */
import { execFileSync } from 'node:child_process';
import {
  Ui24rTransport, ConfirmedStateStore, codificarSetd, codificarSets, decodificar,
  nombreDeInstantanea, comandoCrearShow, comandoGuardar, comandoListar, comandoBorrar,
  instantaneasDeLaLista, SHOW_DE_LA_APLICACION,
} from '@vse/mixer-adapter';
import type { BulkExternalChange } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

function leerCrudo(): Map<string, string> {
  let texto = '';
  try {
    texto = execFileSync('curl', ['-s', '--max-time', '10', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { texto = String((e as { stdout?: string }).stdout ?? ''); }
  const m = new Map<string, string>();
  for (const l of texto.split('\n')) {
    const p = l.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) m.set(p[1], (p[2] ?? '').trim());
  }
  return m;
}

/** Diferencias entre dos volcados, ignorando lo que se mueve solo. */
function diferencias(a: Map<string, string>, b: Map<string, string>): [string, string, string][] {
  const fuera: [string, string, string][] = [];
  for (const [k, v] of a) {
    // Estas cambian solas y no dicen nada del recall.
    if (k.startsWith('var.rta') || k === 'var.pongtime' || k === 'var.asosec') continue;
    const w = b.get(k);
    if (w !== undefined && w !== v) fuera.push([k, v, w]);
  }
  return fuera;
}

/**
 * Canales a mover. Silenciados y sin nada enchufado: nada puede sonar.
 *
 * **Se parametrizó por una corrida que no midió lo que creía.** La primera usó
 * los canales 21 a 24, que no tienen fuente — y por eso mismo **no tienen
 * previo**: la consola declara `phantom:20`, o sea veinte previos para
 * veinticuatro entradas. Los cuatro `hw.N.gain` no existían, la consola los
 * ignoró en silencio, y la familia **ganancia** —justo la única que la
 * aplicación escribe de verdad— quedó sin medir mientras la tabla mostraba
 * nueve familias en verde. Un campo que no se movió no prueba nada sobre el
 * recall, y la primera versión no lo distinguía de uno que volvió.
 */
const CANALES = (process.argv[3] ?? '20,21,22,23').split(',').map(Number);

/**
 * Campos de familias distintas a propósito.
 *
 * El criterio pide el alcance **campo por campo**, y para eso no alcanza con
 * mover quince faders: si el recall devuelve los faders no dice nada sobre los
 * nombres, el ecualizador o la puerta. Se toca una de cada familia.
 */
const NUMERICOS_CANAL = CANALES.flatMap((n) => [
  `i.${n}.pan`, `i.${n}.mix`, `i.${n}.mute`, `i.${n}.aux.0.value`,
  `i.${n}.eq.b1.gain`, `i.${n}.gate.enabled`, `i.${n}.dyn.bypass`, `i.${n}.delay`,
  `hw.${n}.gain`,
]);
const TEXTOS_CANAL = CANALES.map((n) => `i.${n}.name`);

/**
 * Las otras cuatro familias que el criterio 3 nombra por su nombre.
 *
 * El criterio pregunta literalmente «¿incluye ganancia, alimentación fantasma,
 * supresión de realimentación, patcheo, retardos, reproductor?». Con canales
 * sueltos se contestan ganancia y retardos; las otras cuatro viven en otro
 * lado y hay que tocarlas donde están o el criterio queda contestado a medias
 * mientras la tabla se ve llena.
 *
 * Todas son inofensivas con la sala en silencio: el previo elegido no tiene
 * nada enchufado, el bus auxiliar 7 no recibe envíos, y el reproductor no está
 * reproduciendo nada.
 */
const EXTRA_NUM = [
  `hw.${CANALES[0]}.phantom`,   // alimentación fantasma
  'm.afs.enabled',              // supresión de realimentación
  'p.0.mix',                    // reproductor
  'p.0.mute',
];
const EXTRA_TXT = [
  'hwoutaux.6.src',             // patcheo de salida física
];

const NUMERICOS = [...NUMERICOS_CANAL, ...EXTRA_NUM];
const TEXTOS = [...TEXTOS_CANAL, ...EXTRA_TXT];

console.log(`consola ${maquina}`);
console.log(`campos a mover: ${NUMERICOS.length} numericos y ${TEXTOS.length} de texto, sobre los canales ${CANALES.map((n) => n + 1).join(', ')}`);
console.log('');

const base = leerCrudo();
console.log(`volcado inicial: ${base.size} claves`);
const origNum = new Map(NUMERICOS.map((r) => [r, Number(base.get(r) ?? '0')]));
const origTxt = new Map(TEXTOS.map((r) => [r, base.get(r) ?? '']));

// --------------------------------------------------------- el observador
const observador = new Ui24rTransport();
const store = new ConfirmedStateStore();
let avisos: BulkExternalChange[] = [];
store.alCambioMasivo((e) => { avisos.push(e); });
let difundidas: string[] = [];
let anotando = false;
observador.alRecibir((linea) => {
  // Se le pasa la linea entera y no solo los `SETD`, que es lo que hace el
  // adaptador de verdad. La primera version llamaba a `aplicar` a mano para los
  // numericos y descartaba los textos: con eso el guion reproducia el mismo
  // defecto que estaba midiendo, y la causa salia DESCONOCIDA por culpa del
  // instrumento tanto como del programa.
  store.procesarLinea(linea);
  const m = decodificar(linea);
  if (anotando && (m.tipo === 'SETD' || m.tipo === 'SETS')) difundidas.push(m.path);
});

const actor = new Ui24rTransport();
const listas: string[] = [];
actor.alRecibir((l) => { if (l.startsWith('SNAPSHOTLIST^')) listas.push(l); });

await observador.conectar(maquina);
await actor.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));
avisos = [];

// ------------------------------------------------- 1. guardar el punto de retorno
console.log('');
console.log('== 1. Guardar la instantanea, que es el estado de AHORA ==');
actor.enviar(comandoCrearShow());
await new Promise((r) => setTimeout(r, 600));
const nombre = nombreDeInstantanea(Date.now());
actor.enviar(comandoGuardar(nombre));
await new Promise((r) => setTimeout(r, 1500));
listas.length = 0;
actor.enviar(comandoListar());
await new Promise((r) => setTimeout(r, 1500));
const enLista = listas.flatMap((l) => instantaneasDeLaLista(l));
const guardada = enLista.includes(nombre);
console.log(`  show ${SHOW_DE_LA_APLICACION}, instantanea ${nombre}`);
console.log(`  verificada releyendo la lista: ${guardada ? 'SI' : 'NO'}  (${enLista.length} automaticas nuestras en el show)`);
if (!guardada) {
  console.log('  Sin punto de retorno verificado NO se sigue. INV-001.');
  await actor.desconectar(); await observador.desconectar();
  process.exit(2);
}

// ------------------------------------------------------------- 2. mover cosas
console.log('');
console.log('== 2. Mover campos de familias distintas ==');
/**
 * A un booleano se le escribe 0 o 1, no 0,8.
 *
 * **La primera versión movía todo con ±0,2**, y sobre un interruptor eso manda
 * un valor que la consola tiene que interpretar. Después no se puede distinguir
 * «el recall no lo devolvió» de «la consola nunca aceptó lo que le mandamos»:
 * las dos cosas dejan la clave distinta del valor original. Con un 0↔1 la
 * pregunta vuelve a tener una sola respuesta posible.
 */
const BOOLEANOS = /\.(mute|phantom|enabled|bypass)$/;
for (const r of NUMERICOS) {
  const v = origNum.get(r) ?? 0;
  actor.enviar(codificarSetd(r, BOOLEANOS.test(r) ? (v > 0.5 ? 0 : 1) : (v > 0.5 ? v - 0.2 : v + 0.2)));
}
for (const r of TEXTOS) {
  // El patcheo no admite cualquier texto: es el nombre de un bus.
  actor.enviar(codificarSets(r, r === 'hwoutaux.6.src' ? 'a.6' : 'VSE_PRUEBA'));
}
await new Promise((r) => setTimeout(r, 2500));
const movido = leerCrudo();
const cambiados = diferencias(base, movido).map(([k]) => k);
console.log(`  claves que de verdad cambiaron: ${cambiados.length}`);
const noSeMovieron = [...NUMERICOS, ...TEXTOS].filter((r) => !cambiados.includes(r));
if (noSeMovieron.length > 0) {
  console.log(`  NO ACEPTARON EL CAMBIO, y por eso no prueban nada del recall: ${noSeMovieron.join(' ')}`);
  const familiasMudas = [...new Set(noSeMovieron.map((r) => r.replace(/^(i|hw)\.\d+\./, '').replace(/\d+/g, 'N')))];
  console.log(`  familias que esta corrida NO puede medir: ${familiasMudas.join(' ')}`);
}

// ------------------------------------------- 2b. una segunda instantanea
// **Sin esto, la pregunta de la causa se tapa sola.** Guardar una instantanea
// deja `var.currentSnapshot` apuntando a ella; si despues se recupera ESA
// MISMA, el puntero ya esta donde tiene que estar y la consola no tiene nada
// que difundir. La primera corrida concluyo «no difunde el puntero» cuando lo
// unico que habia demostrado es que no habia nada que difundir.
//
// Con una segunda instantanea del estado ya movido, el puntero pasa de B a A
// al recuperar A, y ahi si la pregunta tiene respuesta.
console.log('');
console.log('== 2b. Segunda instantanea, para que el puntero tenga a donde volver ==');
const nombreB = nombreDeInstantanea(Date.now());
actor.enviar(comandoGuardar(nombreB));
await new Promise((r) => setTimeout(r, 1800));
const trasB = leerCrudo();
console.log(`  guardada ${nombreB}`);
console.log(`  var.currentSnapshot ahora: ${trasB.get('var.currentSnapshot')}`);
console.log(`  (era ${base.get('var.currentSnapshot')} al empezar)`);

// ---------------------------------------------------------------- 3. el recall
console.log('');
console.log('== 3. LOADSNAPSHOT de la PRIMERA: la avalancha de verdad ==');
avisos = [];
difundidas = [];
anotando = true;
const t0 = Date.now();
actor.enviar(`LOADSNAPSHOT^${SHOW_DE_LA_APLICACION}^${nombre}`);
await new Promise((r) => setTimeout(r, 3000));
anotando = false;

const aviso = avisos[0];
console.log(`  rutas difundidas por el recall: ${new Set(difundidas).size} distintas, ${difundidas.length} mensajes`);
console.log(`  aviso de avalancha: ${aviso === undefined ? 'NO HUBO' : 'si'}`);
if (aviso !== undefined) {
  console.log(`  rutas que informa el aviso: ${aviso.rutasAfectadas}`);
  console.log(`  causa: ${aviso.probableCausa}   <- se espera SNAPSHOT_RECALL`);
}
console.log(`  ¿difundio var.currentSnapshot? ${difundidas.includes('var.currentSnapshot') ? 'si' : 'no'}`);
console.log(`  tardo ${Date.now() - t0} ms en total`);

// ------------------------------------------------- 4. el alcance, campo por campo
console.log('');
console.log('== 4. Alcance de la recuperacion, campo por campo ==');
await new Promise((r) => setTimeout(r, 1500));
const tras = leerCrudo();

const familias = new Map<string, { vuelve: number; no: number; ejemplos: string[] }>();
const sinVolver: string[] = [];
for (const r of [...NUMERICOS, ...TEXTOS]) {
  if (!cambiados.includes(r)) continue;   // no se movio: no dice nada
  const era = base.get(r);
  const ahora = tras.get(r);
  const volvio = era !== undefined && ahora !== undefined
    && (Number.isFinite(Number(era)) ? Math.abs(Number(ahora) - Number(era)) < 1e-6 : ahora === era);
  const fam = r.replace(/^(i|hw)\.\d+\./, '').replace(/\d+/g, 'N');
  const f = familias.get(fam) ?? { vuelve: 0, no: 0, ejemplos: [] };
  if (volvio) f.vuelve++; else { f.no++; f.ejemplos.push(r); sinVolver.push(r); }
  familias.set(fam, f);
}
console.log('  campo                | volvieron | NO volvieron');
for (const [fam, f] of [...familias].sort()) {
  console.log(`  ${fam.padEnd(20)} | ${String(f.vuelve).padStart(9)} | ${String(f.no).padStart(12)}${f.no > 0 ? `  (${f.ejemplos.slice(0, 2).join(' ')})` : ''}`);
}

// ------------------------------ 5. lo que cambio sin que nosotros lo tocaramos
console.log('');
console.log('== 5. ¿El recall movio algo que nosotros no tocamos? ==');
const tocadas = new Set([...NUMERICOS, ...TEXTOS, 'var.currentSnapshot']);
const colaterales = diferencias(base, tras).filter(([k]) => !tocadas.has(k));
if (colaterales.length === 0) console.log('  nada');
else {
  console.log(`  ${colaterales.length} claves:`);
  for (const [k, a, b] of colaterales.slice(0, 30)) console.log(`    ${k.padEnd(28)} ${a} -> ${b}`);
  if (colaterales.length > 30) console.log(`    ... y ${colaterales.length - 30} mas`);
}

// ---------------------------------------------------------- 6. dejar todo igual
console.log('');
console.log('== 6. Dejar todo como estaba ==');
for (const r of sinVolver) {
  if (TEXTOS.includes(r)) actor.enviar(codificarSets(r, origTxt.get(r) ?? ''));
  else actor.enviar(codificarSetd(r, origNum.get(r) ?? 0));
}
if (sinVolver.length > 0) {
  console.log(`  restaurados a mano los ${sinVolver.length} que el recall no devolvio`);
  await new Promise((r) => setTimeout(r, 1500));
}
// La etiqueta de instantanea activa se devuelve escribiendo solo la etiqueta,
// nunca con otro LOADSNAPSHOT: eso aplicaria la instantanea entera otra vez.
const etiquetaOriginal = base.get('var.currentSnapshot') ?? '';
actor.enviar(codificarSets('var.currentSnapshot', etiquetaOriginal));
await new Promise((r) => setTimeout(r, 800));

for (const n of [nombre, nombreB]) {
  const c = comandoBorrar(n);
  if (c === null) console.log(`  NO se pudo construir el borrado de ${n}: se deja`);
  else { actor.enviar(c); await new Promise((r) => setTimeout(r, 1000)); }
}
{
  await new Promise((r) => setTimeout(r, 1200));
  listas.length = 0;
  actor.enviar(comandoListar());
  await new Promise((r) => setTimeout(r, 1500));
  const quedan = listas.flatMap((l) => instantaneasDeLaLista(l));
  const sobrevive = [nombre, nombreB].filter((n) => quedan.includes(n));
  console.log(`  instantaneas borradas: ${sobrevive.length === 0 ? 'las dos' : `NO, siguen ${sobrevive.join(' ')}`}  (quedan ${quedan.length} automaticas)`);
}

await actor.desconectar();
await observador.desconectar();

console.log('');
console.log('== Comprobacion final, por HTTP ==');
await new Promise((r) => setTimeout(r, 1500));
const final = leerCrudo();
const resto = diferencias(base, final);
if (resto.length === 0) console.log('  la consola quedo EXACTAMENTE como estaba');
else {
  console.log(`  ${resto.length} claves distintas de como estaban:`);
  for (const [k, a, b] of resto.slice(0, 40)) console.log(`    ${k.padEnd(28)} era ${a}, quedo ${b}`);
}
process.exit(resto.length === 0 ? 0 : 1);
