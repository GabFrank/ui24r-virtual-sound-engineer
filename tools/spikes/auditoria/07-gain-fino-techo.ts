/**
 * (a) Techo del medidor: tono 0 dBFS y ganancia creciente hasta que deja de subir.
 * (b) Barrido fino de hw.9.gain (paso 0.01) por tramos, con el nivel de tono
 *     elegido para que la lectura caiga dentro de escala.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const RUTA = 'hw.9.gain';
const ORIGINAL = '0.2508445026';
mkdirSync('/tmp/aud-wav', { recursive: true });
for (const d of [0, -24, -42, -60]) generarWav(`/tmp/aud-wav/f${d}.wav`, { seg: 200, freq: 1000, dbfs: d });

const a = new Cliente();
let cap: number[][] = [];
let on = false;
a.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
const est = (i: number) => {
  const v = cap.map((f) => f[i]).sort((x, y) => x - y);
  return { med: v[Math.floor(v.length / 2)], max: v[v.length - 1] };
};
let audio: any = null;
const poner = async (d: number) => {
  if (audio) { try { audio.kill('SIGKILL'); } catch { /* noop */ } }
  audio = spawn('afplay', [`/tmp/aud-wav/f${d}.wav`], { stdio: 'ignore' });
  await dormir(1200);
};
const leer = async (g: number) => {
  a.enviar(`SETD^${RUTA}^${g}`);
  await dormir(550);
  cap = []; on = true;
  await dormir(700);
  on = false;
  return { b62: est(62), b64: est(64), b66: est(66) };
};

try {
  await a.conectar('A');
  await dormir(700);

  console.log('### (a) techo: tono 0 dBFS');
  await poner(0);
  console.log('crudo\tb62med\tb62max\tb64med\tb64max\tb66max');
  for (const g of [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1.0]) {
    const r = await leer(g);
    console.log(`${g}\t${r.b62.med}\t${r.b62.max}\t${r.b64.med}\t${r.b64.max}\t${r.b66.max}`);
  }

  console.log('\n### (b) barrido fino paso 0.01');
  console.log('nivel\tcrudo\tb62');
  const tramos: [number, number, number][] = [[-24, 0, 0.30], [-42, 0.30, 0.66], [-60, 0.66, 1.0]];
  for (const [d, ini, fin] of tramos) {
    await poner(d);
    for (let g = ini; g <= fin + 1e-9; g += 0.01) {
      const v = Number(g.toFixed(3));
      const r = await leer(v);
      console.log(`${d}\t${v}\t${r.b62.med}`);
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
