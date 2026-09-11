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
 * propia recuperación es la restauración.
 *
 * **Pero eso solo no alcanza, y el docstring decía que sí.** Acá figuraba que
 * los campos movidos «son de los canales 21 a 24, que no tienen nada enchufado
 * y están silenciados» — una frase sobre los canales por omisión, escrita como
 * si valiera para cualquier lista que le pasen. Y no vale: este guion
 * **desilencia** el canal (su regex de booleanos captura `i.N.mute`), le sube el
 * fader a 0,2 y le sube la ganancia del previo, y lo deja así entre ocho y
 * quince segundos. Sobre una entrada XLR con algo enchufado, eso suena.
 *
 * Por eso ahora exige `src = none`: **sin entrada física no hay qué mandar,
 * haga lo que haga el guion**. La enumeración se imprime siempre, pasen o no,
 * para que quede en el archivo de evidencia y no en la terminal de quien corrió.
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
import {
  estadoPorHttp, exigirCanalesMuertos, reproductorCallado, busSinEnvios,
} from '../canal-muerto.ts';

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
  // **La alimentación fantasma estaba acá y se sacó.** INV-007 la deja en solo
  // lectura, el guion hermano de P0.2a se negó a escribirla citando esa regla el
  // mismo día, y este la conmutó cuatro veces igual. El comentario de abajo
  // decía que el previo elegido «no tiene nada enchufado» y no lo comprobaba:
  // `i.13.src = hw.13`, o sea que alimenta un canal patcheado. Lo encontró una
  // auditoría.
  //
  // La consecuencia para el criterio 3 de SPK-P0.8: **si un recall devuelve la
  // alimentación fantasma vuelve a estar sin medir**, y así queda dicho ahí.
  'm.afs.enabled',              // supresión de realimentación
  'p.0.mix',                    // reproductor
  'p.0.mute',
];
const EXTRA_TXT = [
  // El patcheo de una salida física manda una señal a un jack que uno no ve. Se
  // comprobó después de las corridas que era inocuo --`a.6.mix = 0`, ningún
  // envío a ese bus-- pero **fue inocuo por suerte y no por método**: el guion
  // nunca lo verifica antes. Se deja, porque el criterio lo nombra, con la
  // comprobación ahora explícita.
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
// **Con marca de tiempo, y no es un adorno.** Este guion informaba «tardo 3003
// ms» y ese 3003 era su propio `setTimeout(3000)`: la espera fija, no la
// duracion del recall. Sobre ese numero inventado se construyo despues toda una
// explicacion de por que el aviso de avalancha se queda corto. Es exactamente
// «un numero que parece una medicion del aparato y es un artefacto de quien lo
// lee», que es la frase que este mismo archivo tiene escrita mas abajo.
let difundidas: { path: string; enMs: number }[] = [];
let anotando = false;
observador.alRecibir((linea) => {
  // Se le pasa la linea entera y no solo los `SETD`, que es lo que hace el
  // adaptador de verdad. La primera version llamaba a `aplicar` a mano para los
  // numericos y descartaba los textos: con eso el guion reproducia el mismo
  // defecto que estaba midiendo, y la causa salia DESCONOCIDA por culpa del
  // instrumento tanto como del programa.
  store.procesarLinea(linea);
  const m = decodificar(linea);
  if (anotando && (m.tipo === 'SETD' || m.tipo === 'SETS')) difundidas.push({ path: m.path, enMs: Date.now() });
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
// **Nada se escribe sin enumerar primero, y la enumeracion va al archivo.**
//
// Este guion aceptaba la lista de canales que le pasaran y escribia. Su propio
// comentario decia que la comprobacion era «ahora explicita» y era PROSA: el
// codigo no miraba nada. La corrida del 2026-09-10 uso los canales 14 a 17, y
// dos de ellos tienen envios abiertos a efectos y a auxiliares -- o sea que
// escribio sobre canales que podian sonar, y salio bien por suerte.
//
// Se comprueban las tres cosas que este guion toca y pueden hacer ruido: los
// canales, el reproductor y el bus al que se le cambia el patcheo de salida.
console.log('');
const estadoPrevio = await estadoPorHttp(maquina);
if (estadoPrevio.size === 0) {
  console.log('no se pudo leer /raw: sin enumerar no se escribe');
  await actor.desconectar(); await observador.desconectar();
  process.exit(2);
}
const canalesMuertos = exigirCanalesMuertos(estadoPrevio, CANALES, 'sin-fuente');
const player = reproductorCallado(estadoPrevio);
const bus = busSinEnvios(estadoPrevio, 'a.6', 24);
console.log(`  reproductor: ${player.si ? 'callado' : 'PUEDE SONAR'} -- ${player.porQue}`);
console.log(`  bus a.6, al que se le cambia el patcheo: ${bus.si ? 'sin envios' : 'RECIBE ENVIOS'} -- ${bus.porQue}`);
if (!canalesMuertos || !player.si || !bus.si) {
  console.log('');
  console.log('ALGO DE LO QUE ESTE GUION TOCA PUEDE SONAR EN LA SALA. No se escribe nada.');
  await actor.desconectar(); await observador.desconectar();
  process.exit(2);
}
console.log('');

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
// **Las que se movieron sin que las escribieramos, POR SU NOMBRE.**
//
// La corrida del 2026-09-10 informo «46 claves cambiaron» contra 45 escritas y
// dejo una sin identificar; el numero solo no alcanzaba para saber cual era, y
// la hipotesis que quedo escrita --un compañero de par estereo arrastrado por
// `stereoIndex`-- no se pudo comprobar porque nadie miro el nombre. Contar no es
// identificar.
const escritas = new Set<string>([...NUMERICOS, ...TEXTOS]);
const deMas = cambiados.filter((k) => !escritas.has(k));
console.log(`  de esas, escritas por nosotros: ${cambiados.length - deMas.length}`);
console.log(`  se movieron SOLAS: ${deMas.length === 0 ? 'ninguna' : deMas.map((k) => `${k} (${base.get(k)} -> ${movido.get(k)})`).join(', ')}`);
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

// **Una avalancha emite DOS avisos y hay que mirar el segundo.**
//
// El primero sale al cruzar el umbral y trae lo que se sabe en ese instante;
// para un recall eso es UNA ruta, porque el cambio de puntero abre la alerta el
// solo. El total llega cuando la ventana cierra, con `definitivo` puesto.
//
// Este guion leia `avisos[0]` y desde que el aviso de tamaño se partio en dos
// venia informando «1» donde antes informaba el total: la medicion no cambio,
// cambio el contrato, y el guion se quedo leyendo el viejo. Es el mismo error
// que este proyecto persigue en la otra direccion -- un numero que parece una
// medicion del aparato y es un artefacto de quien lo lee.
const apertura = avisos.find((e) => !e.definitivo);
const cierre = avisos.find((e) => e.definitivo);
const rutasDifundidas = new Set(difundidas.map((d) => d.path));
const primera = difundidas.length > 0 ? difundidas[0]!.enMs - t0 : null;
const ultima = difundidas.length > 0 ? difundidas[difundidas.length - 1]!.enMs - t0 : null;
console.log(`  rutas difundidas por el recall: ${rutasDifundidas.size} distintas, ${difundidas.length} mensajes`);
console.log(`  primera linea a los ${primera} ms, ultima a los ${ultima} ms  <- ESTO es lo que tarda`);
console.log(`  aviso de avalancha: ${apertura === undefined ? 'NO HUBO' : 'si'}`);
if (apertura !== undefined) {
  console.log(`  rutas al abrir la alerta: ${apertura.rutasAfectadas}  (lo que se sabe al cruzar el umbral)`);
  console.log(`  causa: ${apertura.probableCausa}   <- se espera SNAPSHOT_RECALL`);
}
console.log(`  rutas al cerrar la ventana: ${cierre === undefined ? 'NO LLEGO EL CIERRE' : cierre.rutasAfectadas}`);
// Todos los avisos, porque un recall dura mas que la ventana de la alerta y por
// lo tanto puede producir varias.
console.log(`  avisos emitidos: ${avisos.length} -> ${avisos.map((e) => `${e.rutasAfectadas}${e.definitivo ? ' (cierre)' : ' (apertura)'}`).join(', ')}`);
console.log(`  ¿difundio var.currentSnapshot? ${rutasDifundidas.has('var.currentSnapshot') ? 'si' : 'no'}`);
console.log(`  (la espera del guion fue de 3000 ms fijos: no es una medicion de nada)`);

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
