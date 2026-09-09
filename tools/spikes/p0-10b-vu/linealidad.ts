/**
 * Linealidad del medidor de la consola, con una fuente conocida.
 *
 * Reproduce tonos de nivel exacto desde esta máquina —salida analógica hacia
 * una entrada de la Ui24R— y lee la trama `VU2` cruda mientras suenan. Con eso
 * se contesta la pregunta que ninguna captura de guitarra puede contestar: si
 * la escala del medidor es lineal en decibeles, **bajar la fuente 6 dB tiene
 * que bajar la lectura 6 dB**, y eso no depende de cuánto valga la ganancia
 * analógica del camino.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/linealidad.ts 20
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/linealidad.ts 20 192.168.0.78
 *
 * **Lo que esta medición puede afirmar y lo que no.** El camino lleva una
 * ganancia analógica desconocida —la perilla de la interfaz y el previo del
 * canal— que se mantiene fija durante toda la corrida. Por eso los resultados
 * son válidos como **diferencias**: la forma de la escala, su linealidad y su
 * pendiente en dB por escalón del byte. El valor absoluto, «este tono de −20
 * dBFS llega como tal a la entrada», exige conocer esa ganancia y no sale de
 * acá. Si alguien mueve la perilla en el medio, la corrida entera se descarta:
 * no hay forma de notarlo en los números.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, decodificarVuCanales, dbDeMedidor, VU_ESCALA } from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '20');
const maquina = process.argv[3] ?? '192.168.0.78';

/**
 * Niveles de la fuente, en dB bajo fondo de escala digital.
 *
 * Se pueden pasar por linea de comandos separados por comas, para poder
 * concentrar la medicion en la zona donde la cadena analogica es indudable y
 * dejar los extremos afuera: cerca del fondo manda el ruido y cerca del tope
 * cualquier eslabon puede estar limitando.
 */
const NIVELES_DB = (process.argv[4] ?? '-40,-30,-24,-18,-12,-9,-6,-3')
  .split(',').map(Number);
const HZ = Number(process.argv[6] ?? '1000');
const SEGUNDOS_POR_NIVEL = Number(process.argv[5] ?? '5');
const FRECUENCIA_MUESTREO = 48000;

/**
 * Un WAV de 16 bits con un seno del nivel pedido.
 *
 * Se genera acá y no con una herramienta externa para que el nivel sea
 * exactamente el que dice ser: `amplitud = 10^(db/20)` sobre el fondo de
 * escala, sin ningún procesamiento en el medio.
 */
function escribirTono(db: number, segundos: number): string {
  const muestras = Math.round(FRECUENCIA_MUESTREO * segundos);
  const amplitud = Math.pow(10, db / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4); // dos canales, 16 bits
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FRECUENCIA_MUESTREO));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + datos.length, 4);
  cabecera.write('WAVEfmt ', 8);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(2, 22);
  cabecera.writeUInt32LE(FRECUENCIA_MUESTREO, 24);
  cabecera.writeUInt32LE(FRECUENCIA_MUESTREO * 4, 28);
  cabecera.writeUInt16LE(4, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), `vse-tono-${db}.wav`);
  writeFileSync(ruta, Buffer.concat([cabecera, datos]));
  return ruta;
}

function reproducir(ruta: string): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const p = spawn('afplay', [ruta]);
    p.on('exit', () => resolver());
    p.on('error', rechazar);
  });
}

const t = new Ui24rTransport();
let bytes: number[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const m = decodificarVuCanales(linea.slice(4))[canal - 1];
  if (m !== undefined) bytes.push(Math.round(m.entrada / VU_ESCALA));
});

await t.conectar(maquina);
console.log(`canal ${canal} de ${maquina}, tono de ${HZ} Hz, ${SEGUNDOS_POR_NIVEL} s por nivel`);
console.log('origen | byte medio | byte max | dB leido | paso leido | paso de la fuente');

const filas: { db: number; byte: number; leido: number }[] = [];
let anterior: { db: number; leido: number } | null = null;

for (const db of NIVELES_DB) {
  const ruta = escribirTono(db, SEGUNDOS_POR_NIVEL);
  bytes = [];
  const sonando = reproducir(ruta);
  // Se descarta el arranque: el medidor tiene su propia balistica y los
  // primeros cientos de milisegundos son la subida, no el nivel.
  await new Promise((r) => setTimeout(r, 1500));
  const desde = bytes.length;
  await sonando;
  const utiles = bytes.slice(desde);
  if (utiles.length === 0) {
    console.log(`${String(db).padStart(6)} | sin tramas: la consola no manda VU2 para ese canal`);
    continue;
  }
  const medio = utiles.reduce((s, v) => s + v, 0) / utiles.length;
  const maximo = utiles.reduce((m, v) => Math.max(m, v), 0);
  const leido = dbDeMedidor(medio * VU_ESCALA);
  const pasoLeido = anterior === null ? null : leido - anterior.leido;
  const pasoFuente = anterior === null ? null : db - anterior.db;
  console.log(
    `${String(db).padStart(6)} | ${medio.toFixed(1).padStart(10)} | ${String(maximo).padStart(8)} | `
    + `${leido.toFixed(2).padStart(8)} | ${(pasoLeido === null ? '—' : pasoLeido.toFixed(2)).padStart(10)} | `
    + `${pasoFuente === null ? '—' : pasoFuente.toFixed(2)}`,
  );
  filas.push({ db, byte: medio, leido });
  anterior = { db, leido };
}

await t.desconectar();

// Recta de mínimos cuadrados entre nivel de la fuente y nivel leído. La
// pendiente es lo que contesta la pregunta: 1,0 significa que la escala del
// medidor es lineal en decibeles como dice el código de la consola.
if (filas.length >= 2) {
  const n = filas.length;
  const sx = filas.reduce((s, f) => s + f.db, 0);
  const sy = filas.reduce((s, f) => s + f.leido, 0);
  const sxy = filas.reduce((s, f) => s + f.db * f.leido, 0);
  const sxx = filas.reduce((s, f) => s + f.db * f.db, 0);
  const pendiente = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const corte = (sy - pendiente * sx) / n;
  const residuo = Math.max(...filas.map((f) => Math.abs(f.leido - (pendiente * f.db + corte))));
  console.log('');
  console.log(`pendiente ${pendiente.toFixed(4)} dB leido por dB de la fuente (1,0 = lineal)`);
  console.log(`corte ${corte.toFixed(2)} dB — es la ganancia analogica del camino, no un dato del medidor`);
  console.log(`desvio maximo de la recta: ${residuo.toFixed(2)} dB`);
}
