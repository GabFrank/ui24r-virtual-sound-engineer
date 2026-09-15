/**
 * Cerrar el lazo con la ganancia del previo, y medir dónde vive.
 *
 * **Por qué el previo y no el fader.** Se intentó dos veces con el fader y no
 * pasó nada: 24 dB de recorrido y el espectro del general quieto. El
 * condensador entrega muy poco con `hw.8.gain` en 0,25, y el fader no puede
 * crear señal que no llegó. La ganancia del previo sí.
 *
 * **Y esta es la primera corrida con el fondo limpio.** Las anteriores se
 * hicieron con un receptor Bluetooth enchufado a las entradas RCA, abiertas a
 * 0 dB, metiendo un tono en el general todo el tiempo — lo encontró el oído del
 * usuario, no las mediciones. Desconectado, el general da 0,0 dB en las 122
 * bandas, con control positivo que confirma que el analizador ve. Lo que
 * aparezca ahora viene del micrófono y de nada más.
 *
 * **Qué se busca.** No el silbido: el **arranque**. En cada paso se compara
 * cuánto creció la banda contra cuánto subió la ganancia. Si el canal solo pasa,
 * la razón es 1. Si hay lazo, crece. Con eso se puede medir, por primera vez,
 * cuánto sobresale de sus vecinas una realimentación de verdad — que es el
 * número que `MARGEN_SOBRE_VECINAS_DB` viene eligiendo a ojo.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-5/lazo-por-el-previo.ts [ip] [canal] [topeGanancia]
 */
import { execFileSync } from 'node:child_process';
import {
  Ui24rTransport, codificarSetd, codificarSets, decodificarEspectro, gananciaADb,
  faderADb, frecuenciaDeBanda, nombreDeInstantanea, comandoCrearShow, comandoGuardar,
  comandoListar, comandoBorrar, instantaneasDeLaLista,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const canal = Number(process.argv[3] ?? '9');
const TOPE = Number(process.argv[4] ?? '0.80');
const n = canal - 1;

const PASO = 0.04;
const ESPERA_MS = 2200;
/** El fader del canal, fijo, en su posición normal de 0 dB. */
const FADER = 0.7647058824;

const RAZON_PARA_CORTAR = 2.0;
const NIVEL_PARA_CORTAR_DB = 35;

function leerCrudo(): Map<string, string> {
  let t = '';
  try {
    t = execFileSync('curl', ['-s', '--max-time', '10', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { t = String((e as { stdout?: string }).stdout ?? ''); }
  const m = new Map<string, string>();
  for (const l of t.split('\n')) {
    const p = l.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined && !m.has(p[1])) {
      m.set(p[1], (p[2] ?? '').trim());
    }
  }
  return m;
}

/** Cuánto sobresale una banda de sus vecinas, saltando las inmediatas. */
function excesoSobreVecinas(b: readonly number[], i: number): number {
  const v: number[] = [];
  for (const d of [-6, -5, -4, 4, 5, 6]) { const x = b[i + d]; if (x !== undefined) v.push(x); }
  return v.length === 0 ? 0 : b[i]! - v.reduce((s, x) => s + x, 0) / v.length;
}

const base = leerCrudo();
const ORIG = {
  mute: Number(base.get(`i.${n}.mute`) ?? '1'),
  mix: Number(base.get(`i.${n}.mix`) ?? '0.5'),
  gain: Number(base.get(`hw.${n}.gain`) ?? '0.25'),
  rta: base.get('var.rta') ?? '',
};
console.log(`consola ${maquina}, canal ${canal}`);
console.log(`previo: ${ORIG.gain.toFixed(4)} = ${gananciaADb(ORIG.gain).toFixed(1)} dB`);
console.log(`fader durante la prueba: ${FADER.toFixed(4)} = ${faderADb(FADER).toFixed(1)} dB`);
console.log(`se sube el previo hasta ${TOPE} = ${gananciaADb(TOPE).toFixed(1)} dB`);
console.log('');

const t = new Ui24rTransport();
let bandas: number[] = [];
const listas: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith('RTA^')) { const d = decodificarEspectro(l.slice(4)); if (d.length >= 122) bandas = d; }
  else if (l.startsWith('SNAPSHOTLIST^')) listas.push(l);
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 3000));

t.enviar(comandoCrearShow());
await new Promise((r) => setTimeout(r, 600));
const nombre = nombreDeInstantanea(Date.now());
t.enviar(comandoGuardar(nombre));
await new Promise((r) => setTimeout(r, 1800));
listas.length = 0;
t.enviar(comandoListar());
await new Promise((r) => setTimeout(r, 1500));
if (!listas.flatMap((l) => instantaneasDeLaLista(l)).includes(nombre)) {
  console.log('Sin punto de retorno verificado NO se sigue. INV-001.');
  await t.desconectar(); process.exit(2);
}
console.log(`punto de retorno: ${nombre}`);

t.enviar(codificarSets('var.rta', 'm'));
await new Promise((r) => setTimeout(r, 2500));
const fondo = bandas.slice();
const mediaFondo = fondo.reduce((s, v) => s + v, 0) / Math.max(1, fondo.length);
console.log(`fondo del general antes de abrir nada: media ${mediaFondo.toFixed(2)} dB`);

function cortar(): void { t.enviar(codificarSetd(`i.${n}.mute`, 1)); }

t.enviar(codificarSetd(`i.${n}.mix`, FADER));
t.enviar(codificarSetd(`hw.${n}.gain`, ORIG.gain));
t.enviar(codificarSetd(`i.${n}.mute`, 0));
await new Promise((r) => setTimeout(r, 2000));

console.log('');
console.log('=== Subiendo el previo. ESCUCHA. ===');
console.log('previo |    dB | banda alta        | nivel | exceso | subio | gan subio | RAZON');

let anterior: { db: number; nivel: number; banda: number } | null = null;
let seguidas = 0;
let motivo: string | null = null;
const filas: { g: number; db: number; banda: number; nivel: number; exceso: number; razon: number }[] = [];
let alCortar: number[] = [];

for (let g = ORIG.gain; g <= TOPE + 1e-9; g += PASO) {
  t.enviar(codificarSetd(`hw.${n}.gain`, g));
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  const actual = bandas.slice();
  let mejor = 4;
  for (let b = 4; b < actual.length - 4; b++) if ((actual[b] ?? 0) > (actual[mejor] ?? 0)) mejor = b;
  const nivel = actual[mejor] ?? 0;
  const exceso = excesoSobreVecinas(actual, mejor);
  const db = gananciaADb(g);

  let razon = NaN; let subioBanda = NaN; let subioGan = NaN;
  if (anterior !== null) {
    subioGan = db - anterior.db;
    subioBanda = (actual[anterior.banda] ?? 0) - anterior.nivel;
    razon = subioGan > 0.01 ? subioBanda / subioGan : NaN;
  }
  console.log(
    `${g.toFixed(3)}  | ${db.toFixed(1).padStart(5)} | ${String(mejor).padStart(3)} (~${frecuenciaDeBanda(mejor).toFixed(0).padStart(5)} Hz) `
    + `| ${nivel.toFixed(1).padStart(5)} | ${exceso.toFixed(1).padStart(6)} | ${Number.isFinite(subioBanda) ? subioBanda.toFixed(2).padStart(5) : '    —'} `
    + `| ${Number.isFinite(subioGan) ? subioGan.toFixed(2).padStart(9) : '        —'} | ${Number.isFinite(razon) ? razon.toFixed(2) : '—'}`,
  );
  filas.push({ g, db, banda: mejor, nivel, exceso, razon });
  anterior = { db, nivel, banda: mejor };

  if (nivel >= NIVEL_PARA_CORTAR_DB) motivo = `nivel ${nivel.toFixed(1)} dB`;
  if (Number.isFinite(razon) && razon >= RAZON_PARA_CORTAR) {
    seguidas++;
    if (seguidas >= 2) motivo = `razon ${razon.toFixed(2)} dos pasos seguidos`;
  } else seguidas = 0;

  if (motivo !== null) { cortar(); alCortar = actual; console.log(''); console.log(`>>> CORTADO: ${motivo}`); break; }
}
if (motivo === null) { cortar(); console.log(''); console.log(`Se llego al tope (${gananciaADb(TOPE).toFixed(1)} dB de previo) sin que se disparara.`); }

t.enviar(codificarSetd(`hw.${n}.gain`, ORIG.gain));
t.enviar(codificarSetd(`i.${n}.mix`, ORIG.mix));
t.enviar(codificarSetd(`i.${n}.mute`, ORIG.mute));
t.enviar(codificarSets('var.rta', ORIG.rta));
await new Promise((r) => setTimeout(r, 1800));
const borrar = comandoBorrar(nombre);
if (borrar !== null) { t.enviar(borrar); await new Promise((r) => setTimeout(r, 1200)); }
await t.desconectar();

console.log('');
console.log('=== Restauracion, por HTTP ===');
await new Promise((r) => setTimeout(r, 1500));
const fin = leerCrudo();
for (const [k, v] of [[`i.${n}.mute`, String(ORIG.mute)], [`i.${n}.mix`, String(ORIG.mix)], [`hw.${n}.gain`, String(ORIG.gain)], ['var.rta', ORIG.rta]] as [string, string][]) {
  const a = fin.get(k) ?? '';
  const ok = k === 'var.rta' ? a === v : Math.abs(Number(a) - Number(v)) < 1e-6;
  console.log(`  ${k.padEnd(12)} era "${v}", quedo "${a}"  ${ok ? 'ok' : '<-- NO'}`);
}

if (alCortar.length > 0) {
  const ult = filas[filas.length - 1]!;
  console.log('');
  console.log('=== El numero que hacia falta ===');
  console.log(`la banda que arranco: ${ult.banda} (~${frecuenciaDeBanda(ult.banda).toFixed(0)} Hz)`);
  console.log(`exceso sobre sus vecinas al arrancar: ${ult.exceso.toFixed(1)} dB`);
  if (filas.length >= 2) {
    const ante = filas[filas.length - 2]!;
    console.log(`exceso un paso antes, todavia estable:  ${ante.exceso.toFixed(1)} dB`);
  }
  console.log('');
  console.log('MARGEN_SOBRE_VECINAS_DB vale 9 y esta elegido a ojo.');
  console.log('Si el exceso estable ya pasa de 9, ese umbral no separa nada.');
}
