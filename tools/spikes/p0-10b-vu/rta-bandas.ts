/** Que frecuencia cae en que posicion de la trama RTA. */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport } from '@vse/mixer-adapter';
const FM = 48000, SEG = 8, DB = -12;
function tono(hz: number): string {
  const n = FM * SEG, amp = Math.pow(10, DB / 20) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / FM));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  const ruta = `/tmp/vse-rta-${hz}.wav`;
  writeFileSync(ruta, Buffer.concat([c, d]));
  return ruta;
}
const t = new Ui24rTransport();
let tramas: number[][] = [];
t.alRecibir((l) => { if (l.startsWith('RTA^')) tramas.push([...Buffer.from(l.slice(4), 'base64')]); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 2500));
t.enviar('SETS^var.rta^i.9');
await new Promise((r) => setTimeout(r, 1200));
console.log('frecuencia | posicion del pico | valor | ancho de la campana');
for (const hz of [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) {
  const p = spawn('afplay', [tono(hz)]);
  await new Promise((r) => setTimeout(r, 2000));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2000));
  p.kill();
  const n = tramas[0]?.length ?? 0;
  const media = new Array(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) media[i] += (tr[i] ?? 0) / tramas.length;
  let pico = 0;
  for (let i = 0; i < n; i++) if (media[i] > media[pico]) pico = i;
  const ancho = media.filter((v) => v > media[pico] / 2).length;
  console.log(`${String(hz).padStart(10)} | ${String(pico).padStart(17)} | ${media[pico].toFixed(0).padStart(5)} | ${ancho}`);
}
t.enviar('SETS^var.rta^');
await new Promise((r) => setTimeout(r, 800));
await t.desconectar();
