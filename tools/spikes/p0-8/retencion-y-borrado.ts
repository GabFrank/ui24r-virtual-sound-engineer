/**
 * La retención de INV-003 y el borrado, contra la consola y desde el adaptador.
 *
 * **Dos preguntas que se contestan juntas porque una es la otra bajo presión.**
 *
 * 1. **¿El borrado funciona desde el adaptador?** `comandoBorrar` existía con
 *    sus tests contra un doble desde el 2026-09-09 y **nunca se había ejecutado
 *    contra el aparato**. Un comando de borrado que no funciona falla hacia el
 *    lado silencioso: la retención no retiene, el show crece igual, y nada
 *    avisa.
 * 2. **¿La retención borra de verdad al llegar al máximo?** Todas las corridas
 *    anteriores tenían menos de veinte automáticas, o sea **por debajo del
 *    tope**, así que la retención nunca había tenido que borrar nada. Un límite
 *    que nunca se alcanzó no está probado: está supuesto.
 *
 * **Esta corrida reemplaza a dos transcripciones.** Las del 2026-09-10 se
 * archivaron a mano porque `medir.mjs` todavía no existía, y sus guiones no
 * quedaron en el árbol.
 *
 * **Lo que esta medición CUESTA, y es inevitable.** Para comprobar que la
 * retención borra hay que llegar al tope, y llegar al tope es exactamente que
 * la retención borre: cada automática que se guarda de más **se lleva puesta la
 * más vieja**. O sea que la corrida termina con cuatro automáticas menos de las
 * que había, y no es un fallo de limpieza: es el fenómeno que se vino a medir,
 * ocurriendo. No se puede medir un tope sin gastarlo.
 *
 * Se distingue de un fallo de verdad: faltar automáticas que la retención se
 * comió es lo esperado; faltar cualquier otra cosa, no.
 *
 * **Qué toca y qué no.** Sólo instantáneas **del show de la aplicación**, que
 * son las que ésta creó y sabe fechar. Ningún show del usuario, ningún
 * parámetro de audio, ningún canal. Aun así se lee el estado entero antes y
 * después: una medición que sólo revisa lo que sabe que tocó no puede ver lo
 * que tocó sin saber.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-8/retencion-y-borrado.ts [ip]
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, comandoBorrar, comandoListar,
  instantaneasDeLaLista, SHOW_DE_LA_APLICACION,
} from '@vse/mixer-adapter';
import { estadoPorHttp } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const a = new Ui24rMixerAdapter(t);

const listas: string[] = [];
const shows: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith('SNAPSHOTLIST^')) listas.push(l);
  if (l.startsWith('SHOWLIST^')) shows.push(l);
});

await a.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const antesHttp = await estadoPorHttp(maquina);
if (antesHttp.size === 0) {
  console.log('no se pudo leer /raw: sin punto de comparacion independiente, no se sigue');
  await a.desconectar();
  process.exit(1);
}

/** Pide la lista y devuelve cuánto tardó en llegar, además de la lista. */
async function lista(): Promise<{ nombres: readonly string[]; ms: number }> {
  listas.length = 0;
  const t0 = Date.now();
  t.enviar(comandoListar());
  for (let i = 0; i < 60; i++) {
    if (listas.length > 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const ms = Date.now() - t0;
  const nombres = listas.length > 0 ? instantaneasDeLaLista(listas[0]!) : [];
  return { nombres, ms };
}

console.log('');
console.log(`show de la aplicacion: ${SHOW_DE_LA_APLICACION}`);
const inicial = await lista();
console.log(`automaticas al empezar: ${inicial.nombres.length}`);
console.log(`SNAPSHOTLIST tardo: ${inicial.ms} ms`);
console.log('');

// ------------------------------------------------------- 1. el borrado, solo
console.log('== 1. Borrar una automatica nuestra, y comprobar que se fue ==');
const nueva = await a.guardarInstantanea();
console.log(`  guardada: ${nueva ?? 'NO SE PUDO'}`);
if (nueva === null) { await a.desconectar(); process.exit(1); }

const conLaNueva = await lista();
console.log(`  esta en la lista: ${conLaNueva.nombres.includes(nueva) ? 'SI' : 'NO'}`);

const orden = comandoBorrar(nueva);
if (orden === null) {
  console.log('  `comandoBorrar` se nego a construir la orden. Eso es correcto para');
  console.log('  un nombre que no sea una automatica nuestra, y aca no lo es: se aborta.');
  await a.desconectar();
  process.exit(1);
}
t.enviar(orden);
await new Promise((r) => setTimeout(r, 1500));
const sinLaNueva = await lista();
const seFue = !sinLaNueva.nombres.includes(nueva);
console.log(`  despues de DELETESNAPSHOT: ${seFue ? 'SE FUE' : 'SIGUE AHI'}`);
console.log(`  la lista quedo en ${sinLaNueva.nombres.length}`);
console.log('');

// -------------------------------------------- 2. la retencion, en el tope
console.log('== 2. La retencion al llegar al maximo ==');
console.log('  Se guarda una detras de otra hasta pasar el tope, y se mira si la');
console.log('  lista deja de crecer. Lo que se prueba es que la retencion BORRA,');
console.log('  no que el comando exista.');
console.log('');
console.log('  guardada                          | cuantas quedan | la mas vieja se fue');
console.log('  ----------------------------------+----------------+--------------------');

let previa = sinLaNueva.nombres;
let tope: number | null = null;
const creadas: string[] = [];
for (let i = 0; i < 4; i++) {
  const masVieja = [...previa].sort()[0];
  const n = await a.guardarInstantanea();
  if (n === null) { console.log('  no se pudo guardar: se corta'); break; }
  creadas.push(n);
  const ahora = await lista();
  const viejaSeFue = masVieja !== undefined && !ahora.nombres.includes(masVieja);
  console.log(
    `  ${n.padEnd(33)} | ${String(ahora.nombres.length).padStart(14)} | ${viejaSeFue ? 'SI' : 'no'}`,
  );
  if (ahora.nombres.length === previa.length && viejaSeFue) tope = ahora.nombres.length;
  previa = ahora.nombres;
}

console.log('');
if (tope !== null) {
  console.log(`RETENCION CONFIRMADA: la lista se clava en ${tope} y borra la mas vieja.`);
} else {
  console.log('LA LISTA SIGUIO CRECIENDO: la retencion no llego al tope en esta corrida,');
  console.log('o no borro. Mirar las cuentas de arriba antes de sacar conclusiones.');
}

// ------------------------------------------------ 3. dejar el show como estaba
console.log('');
console.log('== 3. Dejar el show como estaba ==');
const finalLista = await lista();
const sobran = finalLista.nombres.filter((n) => !inicial.nombres.includes(n));
for (const n of sobran) {
  const o = comandoBorrar(n);
  if (o !== null) { t.enviar(o); await new Promise((r) => setTimeout(r, 400)); }
}
const cierre = await lista();
console.log(`  automaticas creadas por esta corrida y borradas: ${sobran.length}`);
console.log(`  automaticas al terminar: ${cierre.nombres.length} (al empezar habia ${inicial.nombres.length})`);
const faltan = inicial.nombres.filter((n) => !cierre.nombres.includes(n));
// **Las que la retencion se comio son las MAS VIEJAS, y en orden.** Si lo que
// falta es exactamente el principio de la lista, fue la retencion haciendo lo
// suyo. Si falta otra cosa, es otra cosa.
const masViejas = [...inicial.nombres].sort().slice(0, faltan.length);
const laRetencion = faltan.length > 0
  && faltan.every((n) => masViejas.includes(n));
console.log(`  de las que habia al empezar, faltan: ${faltan.length === 0 ? 'ninguna' : faltan.join(', ')}`);
if (faltan.length > 0) {
  console.log(`  ¿son las mas viejas, o sea la retencion haciendo lo suyo? ${laRetencion ? 'SI' : 'NO — MIRAR ESTO'}`);
}

// **Los shows del usuario, listados y archivados.**
//
// Se afirmo en un commit que «Alma caninde y Prueba asistente quedaron
// intactas» y esa comprobacion vivia en la terminal de quien la corrio: `/raw`
// NO LISTA INSTANTANEAS, asi que la comparacion de las 6732 claves no puede
// verlas. Hay que pedir SHOWLIST y SNAPSHOTLIST, y dejarlo en el archivo.
console.log('');
console.log('== 4. Los shows de la consola, incluidos los del usuario ==');
shows.length = 0;
t.enviar('SHOWLIST');
await new Promise((r) => setTimeout(r, 1500));
const nombresDeShows = (shows[0] ?? '').split('^').slice(1).filter(Boolean);
for (const s of nombresDeShows) {
  listas.length = 0;
  t.enviar(`SNAPSHOTLIST^${s}`);
  await new Promise((r) => setTimeout(r, 1200));
  const dentro = (listas[0] ?? '').split('^').slice(2).filter(Boolean);
  const mio = s === SHOW_DE_LA_APLICACION;
  console.log(`  ${s}${mio ? ' (el de la aplicacion)' : ''}: ${dentro.length} -> ${dentro.join(', ') || '(vacio)'}`);
}

console.log('');
const despuesHttp = await estadoPorHttp(maquina);
if (despuesHttp.size === 0) {
  console.log('COMPROBACION POR HTTP: no se pudo releer.');
} else {
  const distintas: string[] = [];
  for (const k of new Set([...antesHttp.keys(), ...despuesHttp.keys()])) {
    if (antesHttp.get(k) !== despuesHttp.get(k)) distintas.push(k);
  }
  console.log(`comprobacion por HTTP, contra el estado previo (${antesHttp.size} claves leidas):`);
  console.log(`  claves que cambiaron: ${distintas.length === 0 ? 'ninguna' : distintas.join(', ')}`);
  console.log('  (var.currentSnapshot puede figurar: guardar lo mueve, y es lo esperado)');
}

await a.desconectar();
process.exit(faltan.length === 0 || laRetencion ? 0 : 1);
