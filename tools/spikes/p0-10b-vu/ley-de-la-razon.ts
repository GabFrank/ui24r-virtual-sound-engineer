/**
 * La ley de la razón del compresor, medida contra el aparato.
 *
 * Segunda mitad del ítem 97. La primera midió la pendiente del umbral:
 * 95,6 ± 6,3 dB por unidad, compatible con el 96 del `mixer.html` y no
 * confirmado.
 *
 * **Qué se mide.** `VtoRATIO(a) = 1/a`, leída del `mixer.html` y nunca
 * contrastada. Si es cierta, para un exceso `E` sobre el umbral la reducción
 * es `E·(1 − 1/R) = E·(1 − a)`: **lineal en el crudo y con cero en a = 1**.
 *
 * **Dos excesos, y por eso.** Un auditor señaló que con un solo exceso «la
 * reducción es proporcional a (1−a)» y «la relación es 1/a» son
 * indistinguibles: para afirmar que es una *relación* hay que ver la reducción
 * **escalar con el exceso**. Van 6 y 18 dB.
 *
 * **El exceso se cuenta contra la rodilla MEDIDA, no contra `VtoTHRESH`.** El
 * diseño original calculaba el exceso con la fórmula que esta misma corrida
 * pone en duda: un error del 20 % en la pendiente daba una recta igual de recta
 * con el cero en el mismo lugar. Circular. La rodilla de la corrida anterior, a
 * −1 dBFS, cayó en el crudo 0,530.
 *
 * **El supresor se apaga**, como en la primera mitad.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-de-la-razon.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, dbDeReduccion,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const HZ = 1000;
const FM = 48000;

const ESCALON_REDUCCION_DB = (dbDeReduccion(240) - dbDeReduccion(246)) / 6;
const PREVIO = { threshold: 0.875, ratio: 1 };

/** La rodilla medida en la primera mitad, con el tono a −1 dBFS. */
const RODILLA = 0.530;

/**
 * Cuánto crudo es un decibel de umbral.
 *
 * **Sale de la pendiente MEDIDA, no de la del `mixer.html`.** 95,6 dB por unidad
 * de crudo. Usar el 96 sería volver a la circularidad que el auditor señaló.
 */
const CRUDO_POR_DB = 1 / 95.6;

/** Los dos excesos sobre el umbral, en dB. Separados para ver si escala. */
const EXCESOS_DB = [6, 18];

/** Crudos de razón a recorrer. El 1 es «sin comprimir» y tiene que dar cero. */
const RAZONES = [1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, -1 / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), 'vse-razon.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let pre: number[] = [];
let red: number[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  pre.push(c.pre); red.push(c.reduccionDb);
});
const media = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);

async function leer(ms = 1800) {
  pre = []; red = [];
  await new Promise((r) => setTimeout(r, ms));
  return { pre: media(pre), red: media(red), n: red.length };
}

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
// **Se EXIGE la clave, no se supone.** Antes esto era `?? '1'`, y una lectura
// HTTP fallida --que `estadoPorHttp` devuelve como mapa vacio-- hacia imprimir
// «estaba en 1» sin haberlo medido y ENCENDER al restaurar un supresor que el
// usuario podia tener apagado. Lo encontro una auditoria de instrumentos el
// 2026-09-12: era el hallazgo mas peligroso de los seis, porque toca el unico
// de 45 campos que una instantanea no devuelve.
const AFS_PREVIO = exigirClave(e0, 'm.afs.enabled');
t.enviar(codificarSetd('m.afs.enabled', 0));
await new Promise((r) => setTimeout(r, 1200));

const sonando = spawn('afplay', [tono(600)]);
await new Promise((r) => setTimeout(r, 3000));

console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a -1 dBFS`);
console.log(`rodilla medida en la primera mitad: crudo ${RODILLA}`);
console.log(`pendiente medida: 95,6 dB por unidad -> ${(CRUDO_POR_DB * 1000).toFixed(2)} milesimas de crudo por dB`);
console.log(`escalon del medidor de reduccion: ${ESCALON_REDUCCION_DB.toFixed(4)} dB`);
console.log(`supresor del general: estaba en ${AFS_PREVIO}, se apaga`);
console.log('');

const series: { exceso: number; puntos: { a: number; red: number; pre: number; n: number }[] }[] = [];

for (const exceso of EXCESOS_DB) {
  // Bajar el umbral `exceso` dB por debajo de la rodilla pone la senal ese
  // tanto por encima del umbral.
  const umbral = Number((RODILLA - exceso * CRUDO_POR_DB).toFixed(4));
  t.enviar(codificarSetd(`i.${n}.dyn.threshold`, umbral));
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`--- exceso ${exceso} dB (umbral en crudo ${umbral}) ---`);
  console.log('razon crudo |  R = 1/a | reduccion | predicha E(1-a) | desvio | n');
  const puntos: { a: number; red: number; pre: number; n: number }[] = [];
  for (const a of RAZONES) {
    t.enviar(codificarSetd(`i.${n}.dyn.ratio`, a));
    await new Promise((r) => setTimeout(r, 1200));
    const l = await leer();
    puntos.push({ a, red: l.red, pre: l.pre, n: l.n });
    const predicha = exceso * (1 - a);
    console.log(`${a.toFixed(2).padStart(11)} | ${(1 / a).toFixed(1).padStart(8)} | `
      + `${l.red.toFixed(2).padStart(9)} | ${predicha.toFixed(2).padStart(15)} | `
      + `${(l.red - predicha).toFixed(2).padStart(6)} | ${String(l.n).padStart(3)}`);
  }
  series.push({ exceso, puntos });
  console.log('');
}

sonando.kill();
t.enviar(codificarSetd(`i.${n}.dyn.threshold`, PREVIO.threshold));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, PREVIO.ratio));
t.enviar(codificarSetd('m.afs.enabled', Number(AFS_PREVIO)));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

console.log('=== C2: cero en a = 1, y lineal ===');
for (const s of series) {
  const enUno = s.puntos.find((p) => p.a === 1)!;
  console.log(`  exceso ${s.exceso} dB: en a=1 la reduccion es ${enUno.red.toFixed(2)} dB `
    + `(${enUno.red === 0 ? 'CERO, como predice 1/a' : 'NO es cero'})`);
  const desvios = s.puntos.map((p) => Math.abs(p.red - s.exceso * (1 - p.a)));
  const peor = Math.max(...desvios);
  console.log(`     desvio maximo contra E(1-a): ${peor.toFixed(2)} dB `
    + `= ${(peor / ESCALON_REDUCCION_DB).toFixed(2)} escalones`);
}

console.log('');
console.log('=== C3: la reduccion tiene que ESCALAR con el exceso ===');
console.log('Sin esto, «proporcional a (1-a)» y «la relacion es 1/a» son lo mismo.');
const [bajo, alto] = series;
if (bajo !== undefined && alto !== undefined) {
  const factorEsperado = alto.exceso / bajo.exceso;
  console.log(`razon de excesos: ${alto.exceso}/${bajo.exceso} = ${factorEsperado.toFixed(2)}`);
  console.log('razon crudo | reduccion baja | reduccion alta | cociente | esperado');
  for (const p of bajo.puntos) {
    if (p.a === 1) continue;
    const q = alto.puntos.find((x) => x.a === p.a)!;
    const cociente = p.red === 0 ? NaN : q.red / p.red;
    console.log(`${p.a.toFixed(2).padStart(11)} | ${p.red.toFixed(2).padStart(14)} | `
      + `${q.red.toFixed(2).padStart(14)} | ${Number.isNaN(cociente) ? '   —' : cociente.toFixed(2).padStart(8)} | `
      + `${factorEsperado.toFixed(2).padStart(8)}`);
  }
}
console.log('');
console.log('restaurado, supresor incluido. La comprobacion por HTTP va aparte.');
