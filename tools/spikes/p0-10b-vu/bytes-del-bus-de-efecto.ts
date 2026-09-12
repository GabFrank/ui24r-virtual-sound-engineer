/**
 * Qué mide cada byte del bloque de un bus de EFECTO.
 *
 * **Por qué hace falta, y por qué no alcanza con lo que ya hay.** `busEstereo()`
 * nombra `preIzq/preDer/postIzq/postDer`, y su docblock dice que eso se midió
 * «con el canal 10 asignado al **subgrupo 1**». Un subgrupo no tiene procesador
 * y un bus de efectos sí: «previo» y «posterior» pueden no significar lo mismo.
 * `protocol-spec.md` §4.4 lo lista como pendiente en dos lugares; la matriz de
 * capacidades decía que estaba identificado. El spec tenía razón.
 *
 * **Cuatro preguntas, en orden, y cada una es condición de la siguiente:**
 *
 * 1. **¿El bus está aislado?** Control negativo: con el envío en 0, los siete
 *    bytes tienen que caer al piso. Si no caen, otra cosa lo alimenta y todo lo
 *    demás mide esa otra cosa.
 * 2. **¿Qué bytes siguen al fader del bus?** Se mueve `f.1.mix` y se mira cuáles
 *    se mueven. Eso separa «previo al fader» de «posterior al fader», que es lo
 *    único que la medición del subgrupo estableció.
 * 3. **¿El medidor toma antes o después del procesador?** Se corta el envío de
 *    golpe y se muestrea trama por trama. Una suma no tiene memoria: la caída
 *    medida del medidor directo es de 20 dB en 37 ms de mediana. Un reverb sí
 *    la tiene y deja cola.
 * 4. **¿Y si el procesador no hace nada?** **Un procesador transparente es
 *    indistinguible de no estar**, así que la 3 sola no decide. Se mira además
 *    la dispersión entre frecuencias: un reverb tiene damping de agudos y corte
 *    de graves; una suma es plana. El medidor de entrada dio 0,23 dB de
 *    dispersión entre 100 Hz, 1 kHz y 10 kHz.
 *
 * **Se informan los siete bytes crudos siempre**, sin promediar izquierda con
 * derecha: un reverb descorrelaciona los canales y promediarlos en silencio
 * mete un error que depende del nivel.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/bytes-del-bus-de-efecto.ts 10 1 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, decodificarVuBuses,
  dbDeMedidor, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const fx = Number(process.argv[3] ?? '1');
const maquina = process.argv[4] ?? '192.168.0.78';
const FM = 48000;
const SEGUNDOS = 240;
const RESOLUCION_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

/** Estado previo, leído del aparato. */
const PREVIO = { envio: 0, faderBus: 0.7647058824 };
const ENVIO = 0.8;


function tono(hz: number, segundos: number, dbfs: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, dbfs / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * hz * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), `vse-tono-${hz}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

/**
 * Los bytes del bloque de efecto, **sacados de la biblioteca y no recalculados**.
 *
 * **La primera versión rehizo la cuenta del desplazamiento a mano y se salteó la
 * sección del reproductor**, que va entre los canales y los subgrupos. Leía otro
 * bloque: el byte `+0` daba 247 fijo, que es el centinela de «sin reducción», y
 * todo lo demás cero. La corrida quedó archivada como
 * `bytes-del-bus-de-efecto-2026-09-12.txt` porque el error vale más que el dato.
 *
 * Se devuelven crudos —dividiendo por `VU_ESCALA`— porque toda reinterpretación
 * posterior depende de tener el byte y no el decibel ya convertido.
 */
function bytesDelEfecto(carga: string): number[] | null {
  const e = decodificarVuBuses(carga).efectos[fx];
  if (e === undefined) return null;
  return [
    e.preIzq / VU_ESCALA, e.preDer / VU_ESCALA,
    e.postIzq / VU_ESCALA, e.postDer / VU_ESCALA,
    e.reduccionDb, e.indicadorDePuerta ? 1 : 0,
  ];
}

const t = new Ui24rTransport();
let muestras: { t: number; bytes: number[]; testigo: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const by = bytesDelEfecto(carga);
  const c = decodificarVuCanales(carga)[n];
  if (by !== null) muestras.push({ t: Date.now(), bytes: by, testigo: c?.pre ?? 0 });
});

const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

async function tomar(ms = 2500): Promise<{ bytes: number[]; testigo: number; n: number }> {
  muestras = [];
  await new Promise((r) => setTimeout(r, ms));
  const xs = muestras;
  if (xs.length === 0) return { bytes: [0, 0, 0, 0, 0, 0], testigo: 0, n: 0 };
  return {
    bytes: [0, 1, 2, 3, 4, 5].map((i) => media(xs.map((m) => m.bytes[i] ?? 0))),
    testigo: media(xs.map((m) => m.testigo)), n: xs.length,
  };
}

function fila(etiqueta: string, r: { bytes: number[]; testigo: number; n: number }): void {
  console.log(`${etiqueta.padEnd(26)} | `
    + r.bytes.map((v) => v.toFixed(1).padStart(6)).join(' ')
    + ` | testigo ${dbDeMedidor(r.testigo).toFixed(2).padStart(7)} | n=${r.n}`);
}

await t.conectar(maquina);
const ruta = tono(1000, SEGUNDOS, -1);
let sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2500));

console.log(`canal ${canal} (i.${n}) -> efecto ${fx + 1} (f.${fx})`);
console.log(`resolucion: ${RESOLUCION_DB.toFixed(4)} dB por escalon`);
console.log('');
console.log('estado                     | preIzq preDer postIz postDe  reduc puerta | testigo del canal');

// --- 1. Control negativo: el bus aislado ---
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, 0));
await new Promise((r) => setTimeout(r, 1500));
const aislado = await tomar();
fila('envio 0 (aislado?)', aislado);

// --- 2. Con envio, y moviendo el fader del bus ---
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, ENVIO));
await new Promise((r) => setTimeout(r, 2500));
const conEnvio = await tomar();
fila(`envio ${ENVIO}, fader bus ${PREVIO.faderBus.toFixed(2)}`, conEnvio);

for (const f of [0.5, 0.2, 0]) {
  t.enviar(codificarSetd(`f.${fx}.mix`, f));
  await new Promise((r) => setTimeout(r, 2000));
  fila(`envio ${ENVIO}, fader bus ${f.toFixed(2)}`, await tomar());
}
t.enviar(codificarSetd(`f.${fx}.mix`, PREVIO.faderBus));
await new Promise((r) => setTimeout(r, 2000));

// --- 3. La cola: se corta el envio y se muestrea trama por trama ---
console.log('');
console.log('=== CAIDA AL CORTAR EL ENVIO, trama por trama ===');
console.log('Una suma no tiene memoria: 20 dB en ~37 ms de mediana. Un reverb deja cola.');
await new Promise((r) => setTimeout(r, 2500));
muestras = [];
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, 0));
await new Promise((r) => setTimeout(r, 3000));
const corte = muestras;
const t0 = corte[0]?.t ?? 0;
console.log('ms desde el corte | preIzq preDer postIz postDe');
for (const m of corte.slice(0, 40)) {
  console.log(`${String(m.t - t0).padStart(17)} | `
    + [0, 1, 2, 3].map((i) => (m.bytes[i] ?? 0).toFixed(1).padStart(6)).join(' '));
}

// --- 4. Dispersion entre frecuencias ---
sonando.kill();
console.log('');
console.log('=== DISPERSION ENTRE FRECUENCIAS ===');
console.log('Una suma es plana (el medidor de entrada dio 0,23 dB). Un reverb no.');
console.log('frecuencia | preIzq preDer postIz postDe | testigo del canal');
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, ENVIO));
for (const hz of [100, 1000, 10000]) {
  sonando = spawn('afplay', [tono(hz, 20, -1)]);
  await new Promise((r) => setTimeout(r, 4000));
  const r = await tomar(3000);
  console.log(`${String(hz).padStart(10)} | `
    + [0, 1, 2, 3].map((i) => (r.bytes[i] ?? 0).toFixed(1).padStart(6)).join(' ')
    + ` | ${dbDeMedidor(r.testigo).toFixed(2).padStart(7)}  n=${r.n}`);
  sonando.kill();
}

// --- Restauracion ---
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, PREVIO.envio));
t.enviar(codificarSetd(`f.${fx}.mix`, PREVIO.faderBus));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();
console.log('');
console.log('restaurado por el mismo camino que escribio. La comprobacion por HTTP va aparte.');
