/**
 * Curva del previo hw.9.gain y techo del medidor.
 * Se barre el crudo de ganancia con varios niveles de tono para empalmar
 * tramos (el medidor solo abarca ~43 dB).
 * Restaura hw.9.gain siempre.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const RUTA = 'hw.9.gain';
const ORIGINAL = '0.2508445026';
mkdirSync('/tmp/aud-wav', { recursive: true });
const NIVELES = [-6, -24, -42, -60];
for (const d of NIVELES) generarWav(`/tmp/aud-wav/g${d}.wav`, { seg: 130, freq: 1000, dbfs: d });

const a = new Cliente();
let cap: number[][] = [];
let on = false;
a.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
const med = (i: number) => {
  const v = cap.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
let audio: any = null;
const crudos: number[] = [];
for (let x = 0; x <= 1.0001; x += 0.05) crudos.push(Number(x.toFixed(3)));

try {
  await a.conectar('A');
  await dormir(700);
  console.log('nivel\tcrudo\tb62\tb63\tb64\tb65\tb66\tb67');
  for (const d of NIVELES) {
    if (audio) { try { audio.kill('SIGKILL'); } catch { /* noop */ } }
    audio = spawn('afplay', [`/tmp/aud-wav/g${d}.wav`], { stdio: 'ignore' });
    await dormir(1200);
    for (const g of crudos) {
      a.enviar(`SETD^${RUTA}^${g}`);
      await dormir(600);
      cap = []; on = true;
      await dormir(750);
      on = false;
      console.log(`${d}\t${g}\t${med(62)}\t${med(63)}\t${med(64)}\t${med(65)}\t${med(66)}\t${med(67)}`);
    }
  }
} finally {
  try { if (audio) audio.kill('SIGKILL'); } catch { /* noop */ }
  try { a.enviar(`SETD^${RUTA}^${ORIGINAL}`); } catch { /* noop */ }
  await dormir(500);
  console.log(`\nrestaurado ${RUTA} = ${ORIGINAL}`);
  a.cerrar();
}
process.exit(0);
