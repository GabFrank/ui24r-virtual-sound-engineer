/**
 * El control positivo que faltaba: ¿el analizador ve algo cuando hay algo?
 *
 * **Por qué existe.** El 2026-09-11, con el Bluetooth desconectado, el general
 * dio **0,0 dB en las 122 bandas**. Eso admite dos lecturas que no se pueden
 * separar mirando el resultado: la sala está en silencio, o el analizador no
 * enganchó — la consola manda ceros con `var.rta` vacía.
 *
 * Es la misma forma que ya arruinó tres conclusiones en dos días: **un resultado
 * nulo sin control positivo no distingue «no hay nada» de «no estoy mirando».**
 *
 * Acá se mete una señal conocida y se mira si aparece. Si aparece, los ceros de
 * antes eran silencio de verdad. Si no aparece, eran ceguera.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-5/control-positivo-del-analizador.ts [ip] [canal] [dBFS]
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSets, decodificarEspectro, bandaDeFrecuencia, frecuenciaDeBanda,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const HZ = 1000;
const NIVEL_DB = Number(process.argv[4] ?? '-30');
const FM = 48000;
const SEGUNDOS = 8;

function tono(): string {
  const muestras = FM * SEGUNDOS;
  const amplitud = Math.pow(10, NIVEL_DB / 20) * 32767;
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
  const ruta = join(tmpdir(), 'vse-control.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let b: number[] = [];
t.alRecibir((l) => { if (l.startsWith('RTA^')) { const d = decodificarEspectro(l.slice(4)); if (d.length >= 122) b = d; } });
await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 2500));
t.enviar(codificarSets('var.rta', 'm'));
await new Promise((r) => setTimeout(r, 3000));

const banda = Math.round(bandaDeFrecuencia(HZ));
const antes = b.slice();
console.log(`analizador en el general, tono de ${HZ} Hz a ${NIVEL_DB} dBFS por la Scarlett`);
console.log(`banda esperada: ${banda} (~${frecuenciaDeBanda(banda).toFixed(0)} Hz)`);
console.log('');
console.log(`SIN tono: banda ${banda} = ${(antes[banda] ?? 0).toFixed(1)} dB, media ${(antes.reduce((s, v) => s + v, 0) / Math.max(1, antes.length)).toFixed(2)} dB`);

const p = spawn('afplay', [tono()]);
await new Promise((r) => setTimeout(r, 4000));
const durante = b.slice();
console.log(`CON tono: banda ${banda} = ${(durante[banda] ?? 0).toFixed(1)} dB, media ${(durante.reduce((s, v) => s + v, 0) / Math.max(1, durante.length)).toFixed(2)} dB`);
p.kill();
await new Promise((r) => setTimeout(r, 3000));
const despues = b.slice();
console.log(`SIN tono otra vez: banda ${banda} = ${(despues[banda] ?? 0).toFixed(1)} dB`);

t.enviar(codificarSets('var.rta', ''));
await new Promise((r) => setTimeout(r, 1200));
await t.desconectar();

const subio = (durante[banda] ?? 0) - (antes[banda] ?? 0);
console.log('');
console.log(`la banda del tono subio ${subio.toFixed(1)} dB con el tono puesto`);
if (subio > 6) {
  console.log('EL ANALIZADOR VE. Los ceros de antes eran silencio de verdad.');
} else {
  console.log('EL ANALIZADOR NO VE, o el tono no llega al general.');
  console.log('En cualquier caso, TODA medicion de espectro anterior queda en duda.');
}
