/**
 * Balística del medidor: cuánto tarda en subir y cuánto en caer.
 *
 * Es la otra mitad de SPK-P0.10b y decide algo concreto del producto: si un
 * pico corto se ve o se pierde. Un medidor que cae rápido pierde el pico entre
 * dos tramas; uno que cae lento lo sostiene y hace creer que el canal está más
 * caliente de lo que está.
 *
 * Método: silencio, ráfaga de tono, silencio, repetido. Se anota cada trama
 * `VU2` con su hora de llegada y se mide sobre esa serie.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/balistica.ts 10
 *
 * **El límite de resolución es la cadencia de las tramas**, medida en 44 ms con
 * señal. Nada más rápido que eso se puede afirmar desde acá: si la subida
 * ocurre dentro de una trama, lo único honesto es decir «no se resuelve», no
 * inventar un número de milisegundos.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, decodificarVuCanales, dbDeMedidor, VU_ESCALA } from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const maquina = process.argv[3] ?? '192.168.0.78';
const NIVEL_DB = Number(process.argv[4] ?? '-15');
const RAFAGAS = Number(process.argv[5] ?? '5');
const MS_TONO = 1200;
const MS_SILENCIO = 3500;
const HZ = 1000;
const FM = 48000;

function escribirTono(db: number, ms: number): string {
  const muestras = Math.round((FM * ms) / 1000);
  const amplitud = Math.pow(10, db / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), `vse-rafaga-${db}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
const serie: { enMs: number; db: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const m = decodificarVuCanales(linea.slice(4))[canal - 1];
  if (m !== undefined) serie.push({ enMs: Date.now(), db: dbDeMedidor(m.entrada) });
});

await t.conectar(maquina);
const ruta = escribirTono(NIVEL_DB, MS_TONO);
console.log(`canal ${canal}, ${RAFAGAS} rafagas de ${MS_TONO} ms a ${NIVEL_DB} dBFS`);
console.log('');
console.log('rafaga | meseta   | subida            | caida');

const subidas: number[] = [];
const caidas: number[] = [];

for (let i = 0; i < RAFAGAS; i++) {
  await new Promise((r) => setTimeout(r, MS_SILENCIO));
  serie.length = 0;
  const t0 = Date.now();
  await new Promise<void>((r) => { const p = spawn('afplay', [ruta]); p.on('exit', () => r()); });
  await new Promise((r) => setTimeout(r, 2500));

  const muestras = serie.slice();
  if (muestras.length < 5) { console.log(`${String(i + 1).padStart(6)} | sin tramas suficientes`); continue; }

  // La meseta es la mediana del tramo alto: robusta frente a una trama
  // perdida, que con una media arruinaria el numero.
  const altos = muestras.filter((m) => Number.isFinite(m.db)).map((m) => m.db).sort((a, b) => b - a);
  const meseta = altos[Math.floor(altos.length * 0.1)] ?? -Infinity;

  const umbralSubida = meseta - 3;
  const primeraAlta = muestras.find((m) => m.db >= umbralSubida);
  const primeraConSenal = muestras.find((m) => Number.isFinite(m.db) && m.db > meseta - 40);
  const subida = primeraAlta && primeraConSenal
    ? primeraAlta.enMs - primeraConSenal.enMs
    : null;

  // La caida se mide desde la ultima trama en meseta hasta que baja 20 dB.
  const ultimaAlta = [...muestras].reverse().find((m) => m.db >= umbralSubida);
  const caida = ultimaAlta
    ? muestras.find((m) => m.enMs > ultimaAlta.enMs && m.db <= meseta - 20)
    : undefined;
  const msCaida = ultimaAlta && caida ? caida.enMs - ultimaAlta.enMs : null;

  if (subida !== null) subidas.push(subida);
  if (msCaida !== null) caidas.push(msCaida);

  console.log(
    `${String(i + 1).padStart(6)} | ${meseta.toFixed(1).padStart(8)} | `
    + `${(subida === null ? 'no se resuelve' : `${subida} ms hasta -3 dB`).padEnd(17)} | `
    + `${msCaida === null ? 'no se resuelve' : `${msCaida} ms para caer 20 dB`}`
    + `  (t+${t0 - t0} ms)`,
  );
}

await t.desconectar();

const resumen = (xs: number[]): string => {
  if (xs.length === 0) return 'sin datos';
  const orden = [...xs].sort((a, b) => a - b);
  const mediana = orden[Math.floor(orden.length / 2)]!;
  return `mediana ${mediana} ms, minimo ${orden[0]}, maximo ${orden[orden.length - 1]}`;
};
console.log('');
console.log(`subida: ${resumen(subidas)}`);
console.log(`caida de 20 dB: ${resumen(caidas)}`);
console.log('La cadencia de las tramas con senal es de ~44 ms: nada por debajo de eso se resuelve.');
