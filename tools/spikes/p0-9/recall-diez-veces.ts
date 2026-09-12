/**
 * Diez recuperaciones de instantánea, diez detecciones. El umbral del criterio 4.
 *
 * El criterio de SPK-P0.9 pide **10 de 10**. Lo que había hasta hoy era una
 * captura contra el simulador; después, una ráfaga de escrituras 10 de 10 —que
 * dispara el mismo detector por otro camino—; y después un `LOADSNAPSHOT` real,
 * una sola vez, que destapó que la causa nunca salía. Con la causa arreglada
 * falta lo único que queda: contar hasta diez.
 *
 * Cada vuelta guarda una instantánea del estado movido para que el puntero
 * tenga a dónde volver, recupera la primera —que es el estado original— y
 * comprueba que el aviso llegó y que dice `SNAPSHOT_RECALL`.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/recall-diez-veces.ts [ip] [vueltas]
 */
import { execFileSync } from 'node:child_process';
import {
  Ui24rTransport, ConfirmedStateStore, codificarSetd, codificarSets,
  nombreDeInstantanea, comandoCrearShow, comandoGuardar, comandoListar, comandoBorrar,
  instantaneasDeLaLista, SHOW_DE_LA_APLICACION,
} from '@vse/mixer-adapter';
import type { BulkExternalChange } from '@vse/mixer-adapter';
import { exigirClave } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const VUELTAS = Number(process.argv[3] ?? '10');
const CANALES = [13, 14, 15, 16];
const RUTAS = CANALES.flatMap((n) => [`i.${n}.pan`, `i.${n}.mix`, `i.${n}.aux.0.value`]);

function leerCrudo(): Map<string, string> {
  let t = '';
  try {
    t = execFileSync('curl', ['-s', '--max-time', '10', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { t = String((e as { stdout?: string }).stdout ?? ''); }
  const m = new Map<string, string>();
  for (const l of t.split('\n')) {
    const p = l.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) m.set(p[1], (p[2] ?? '').trim());
  }
  return m;
}

const base = leerCrudo();
const orig = new Map(RUTAS.map((r) => [r, Number(base.get(r) ?? '0')]));
console.log(`consola ${maquina}, ${VUELTAS} recuperaciones, ${RUTAS.length} rutas por vuelta`);
console.log('');

const observador = new Ui24rTransport();
const store = new ConfirmedStateStore();
let avisos: BulkExternalChange[] = [];
store.alCambioMasivo((e) => { avisos.push(e); });
observador.alRecibir((l) => store.procesarLinea(l));

const actor = new Ui24rTransport();
const listas: string[] = [];
actor.alRecibir((l) => { if (l.startsWith('SNAPSHOTLIST^')) listas.push(l); });

await observador.conectar(maquina);
await actor.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));
avisos = [];

actor.enviar(comandoCrearShow());
await new Promise((r) => setTimeout(r, 600));
const puntoDeRetorno = nombreDeInstantanea(Date.now());
actor.enviar(comandoGuardar(puntoDeRetorno));
await new Promise((r) => setTimeout(r, 1800));
listas.length = 0;
actor.enviar(comandoListar());
await new Promise((r) => setTimeout(r, 1500));
if (!listas.flatMap((l) => instantaneasDeLaLista(l)).includes(puntoDeRetorno)) {
  console.log('Sin punto de retorno verificado NO se sigue. INV-001.');
  await actor.desconectar(); await observador.desconectar();
  process.exit(2);
}
console.log(`punto de retorno: ${puntoDeRetorno}, verificado releyendo la lista`);
console.log('');
console.log('vuelta | aviso | causa            | rutas que informa');

const creadas = [puntoDeRetorno];
let detectadas = 0;
let conCausa = 0;

for (let v = 1; v <= VUELTAS; v++) {
  for (const r of RUTAS) {
    const x = orig.get(r) ?? 0;
    actor.enviar(codificarSetd(r, x > 0.5 ? x - 0.2 : x + 0.2));
  }
  await new Promise((r) => setTimeout(r, 1200));
  const intermedia = nombreDeInstantanea(Date.now());
  creadas.push(intermedia);
  actor.enviar(comandoGuardar(intermedia));
  await new Promise((r) => setTimeout(r, 1800));

  avisos = [];
  actor.enviar(`LOADSNAPSHOT^${SHOW_DE_LA_APLICACION}^${puntoDeRetorno}`);
  await new Promise((r) => setTimeout(r, 2500));

  const a = avisos[0];
  if (a !== undefined) {
    detectadas++;
    if (a.probableCausa === 'SNAPSHOT_RECALL') conCausa++;
  }
  console.log(
    `${String(v).padStart(6)} | ${(a === undefined ? 'NO' : 'si').padEnd(5)} | `
    + `${(a?.probableCausa ?? '—').padEnd(16)} | ${a?.rutasAfectadas ?? '—'}`,
  );
  await new Promise((r) => setTimeout(r, 1200));
}

console.log('');
console.log('== Dejar todo como estaba ==');
for (const n of creadas) {
  const c = comandoBorrar(n);
  if (c !== null) { actor.enviar(c); await new Promise((r) => setTimeout(r, 700)); }
}
// **Se exige la clave en vez de suponerla.** Un `?? valor` antes de una
// escritura no es un valor por omision: es una suposicion disfrazada de
// lectura, y con una lectura HTTP fallida --que devuelve un mapa vacio--
// restauraba la consola a un numero inventado. Auditoria del 2026-09-12.
actor.enviar(codificarSets('var.currentSnapshot', exigirClave(base, 'var.currentSnapshot')));
await new Promise((r) => setTimeout(r, 1000));
listas.length = 0;
actor.enviar(comandoListar());
await new Promise((r) => setTimeout(r, 1500));
const quedan = listas.flatMap((l) => instantaneasDeLaLista(l));
const sobreviven = creadas.filter((n) => quedan.includes(n));
console.log(`  instantaneas creadas: ${creadas.length}, sin borrar: ${sobreviven.length}`);

await actor.desconectar();
await observador.desconectar();

await new Promise((r) => setTimeout(r, 1500));
const final = leerCrudo();
const distintas = [...base].filter(([k, v]) => {
  if (k.startsWith('var.rta') || k === 'var.pongtime' || k === 'var.asosec') return false;
  const w = final.get(k);
  return w !== undefined && w !== v;
});
console.log(`  claves distintas de como estaban: ${distintas.length}`);
for (const [k, a, ] of distintas.slice(0, 10)) console.log(`    ${k} era ${a}, quedo ${final.get(k)}`);

console.log('');
console.log(`recuperaciones detectadas: ${detectadas} de ${VUELTAS}`);
console.log(`con causa SNAPSHOT_RECALL: ${conCausa} de ${VUELTAS}`);
process.exit(detectadas === VUELTAS && conCausa === VUELTAS && distintas.length === 0 ? 0 : 1);
