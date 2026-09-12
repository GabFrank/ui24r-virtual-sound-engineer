/**
 * La ley del umbral, medida sin rodilla y sin creerle a `VtoTHRESH`.
 *
 * **Existe porque las dos mitades del ítem 97 se contradicen.** El método de la
 * rodilla dio una pendiente de 95,6 ± 6,3 dB por unidad de crudo; despejar el
 * exceso a partir de la reducción, con razón 2:1, dio **31,9** entre dos
 * umbrales. Un factor de tres. No pueden ser las dos ciertas, y ninguna se
 * puede publicar hasta saber cuál falla.
 *
 * **El método, que no depende de ninguna de las dos.** Con la relación en 2:1 la
 * reducción es exactamente la mitad del exceso, así que **`exceso = 2 ×
 * reducción`**: se lee el exceso en vez de calcularlo. Barriendo el umbral y
 * leyendo la reducción sale el exceso en cada crudo, y la pendiente es la
 * derivada de eso.
 *
 * Ventajas sobre la rodilla:
 *
 * - **No hay zona muerta que sesgue.** La rodilla se localiza donde el
 *   instrumento sale de cero, con ~1 dB de sesgo; acá se trabaja con reducciones
 *   de varios decibeles, bien lejos del piso.
 * - **Da la curva entera, no dos puntos.** Si la ley no es lineal en crudo, se
 *   ve; la rodilla con dos puntos no puede distinguir una recta de una curva.
 * - **No usa `VtoTHRESH` para nada**, así que no puede ser circular.
 *
 * **Lo que sí asume, y hay que decirlo: que `VtoRATIO(a) = 1/a` sea cierta en
 * a = 0,5.** Si la relación real no es 2:1 ahí, el factor 2 está mal y toda la
 * curva sale escalada — la **forma** sobreviviría, la escala no. Por eso se
 * corre también en a = 0,25 (4:1, factor 4/3) y a = 0,1 (10:1, factor 10/9): si
 * las tres curvas coinciden, la relación es la que dice el código; si no
 * coinciden, el que está mal es `VtoRATIO` y no el umbral.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/umbral-por-sustitucion.ts 10 192.168.0.78
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
const ESCALON = (dbDeReduccion(240) - dbDeReduccion(246)) / 6;
const PREVIO = { threshold: 0.875, ratio: 1 };

/** Las tres relaciones, con su factor de despeje `1/(1 − a)`. */
const RELACIONES = [
  { a: 0.5, nombre: '2:1', factor: 1 / (1 - 0.5) },
  { a: 0.25, nombre: '4:1', factor: 1 / (1 - 0.25) },
  { a: 0.1, nombre: '10:1', factor: 1 / (1 - 0.1) },
];

/** Umbrales a recorrer. Cubren un tramo ancho por debajo de la rodilla. */
const UMBRALES = [0.50, 0.46, 0.42, 0.38, 0.34, 0.30, 0.26, 0.22, 0.18, 0.14];

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
  const ruta = join(tmpdir(), 'vse-sustitucion.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let pre: number[] = []; let red: number[] = [];
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
const AFS = exigirClave(e0, 'm.afs.enabled');
t.enviar(codificarSetd('m.afs.enabled', 0));
await new Promise((r) => setTimeout(r, 1200));
const sonando = spawn('afplay', [tono(900)]);
await new Promise((r) => setTimeout(r, 3000));

console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a -1 dBFS`);
console.log(`escalon del medidor de reduccion: ${ESCALON.toFixed(4)} dB`);
console.log(`supresor: estaba en ${AFS}, se apaga`);
console.log('');

const curvas: { nombre: string; puntos: { u: number; exceso: number; red: number; pre: number }[] }[] = [];

for (const r of RELACIONES) {
  t.enviar(codificarSetd(`i.${n}.dyn.ratio`, r.a));
  await new Promise((r2) => setTimeout(r2, 1200));
  console.log(`--- relacion ${r.nombre} (crudo ${r.a}), exceso = reduccion x ${r.factor.toFixed(3)} ---`);
  console.log('umbral crudo | reduccion | exceso despejado | pre (testigo) | n');
  const puntos: { u: number; exceso: number; red: number; pre: number }[] = [];
  for (const u of UMBRALES) {
    t.enviar(codificarSetd(`i.${n}.dyn.threshold`, u));
    await new Promise((r2) => setTimeout(r2, 1000));
    const l = await leer();
    const exceso = l.red * r.factor;
    puntos.push({ u, exceso, red: l.red, pre: l.pre });
    console.log(`${u.toFixed(3).padStart(12)} | ${l.red.toFixed(2).padStart(9)} | `
      + `${exceso.toFixed(2).padStart(16)} | ${dbDeMedidor(l.pre).toFixed(2).padStart(13)} | ${String(l.n).padStart(3)}`);
  }
  curvas.push({ nombre: r.nombre, puntos });
  console.log('');
}

sonando.kill();
t.enviar(codificarSetd(`i.${n}.dyn.threshold`, PREVIO.threshold));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, PREVIO.ratio));
t.enviar(codificarSetd('m.afs.enabled', Number(AFS)));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

console.log('=== LA PENDIENTE, de cada curva por separado ===');
for (const c of curvas) {
  const utiles = c.puntos.filter((p) => p.red > 0);
  if (utiles.length < 3) { console.log(`  ${c.nombre}: ${utiles.length} puntos utiles, no alcanza`); continue; }
  const a = utiles[0]!; const b = utiles[utiles.length - 1]!;
  const pend = (b.exceso - a.exceso) / (a.u - b.u);
  console.log(`  ${c.nombre}: ${utiles.length} puntos, pendiente ${pend.toFixed(1)} dB por unidad`);
}
console.log('');
console.log('=== LAS TRES CURVAS TIENEN QUE COINCIDIR ===');
console.log('Si coinciden, VtoRATIO = 1/a es correcta y la pendiente es la del umbral.');
console.log('Si no coinciden, el que esta mal es VtoRATIO y no el umbral.');
console.log('umbral |' + curvas.map((c) => ` ${c.nombre.padStart(8)}`).join(' |'));
for (const u of UMBRALES) {
  const fila = curvas.map((c) => {
    const p = c.puntos.find((x) => x.u === u);
    return p === undefined || p.red === 0 ? '       —' : p.exceso.toFixed(2).padStart(8);
  });
  console.log(`${u.toFixed(2).padStart(6)} |` + fila.join(' |'));
}
console.log('');
console.log('restaurado, supresor incluido. La comprobacion por HTTP va aparte.');
