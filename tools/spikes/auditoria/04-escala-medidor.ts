/**
 * Escala del medidor por escalones digitales conocidos.
 *
 * Metodo: 1 kHz a niveles exactos en dBFS (la cadena analogica es lineal, asi
 * que los ESCALONES se conservan aunque el offset absoluto no se conozca).
 * Se mide el byte del canal 10 (bloque i.9, offsets 62..67) y el del bus
 * principal (284..292).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const DIR = '/tmp/aud-wav';
mkdirSync(DIR, { recursive: true });

const niveles = (process.argv[2] ?? '0,-2,-4,-6,-8,-10,-12,-15,-18,-21,-24,-27,-30,-35,-40,-45,-50,-55,-60,-65,-70,-75,-80')
  .split(',').map(Number);
const OFFS = [62, 63, 64, 65, 66, 67, 284, 285, 286, 287, 288];

for (const db of niveles) generarWav(`${DIR}/t${db}.wav`, { seg: 2.6, freq: 1000, dbfs: db });

const c = new Cliente();
let cap: number[][] = [];
let on = false;
c.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
await c.conectar();
await dormir(600);

const med = (a: number[][], i: number) => {
  const v = a.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

console.log('dBFS\t' + OFFS.map((o) => 'b' + o).join('\t') + '\tn');
const filas: string[] = [];
for (const db of niveles) {
  const p = spawn('afplay', [`${DIR}/t${db}.wav`], { stdio: 'ignore' });
  await dormir(1100);
  cap = []; on = true;
  await dormir(1100);
  on = false;
  try { p.kill('SIGKILL'); } catch { /* noop */ }
  await dormir(250);
  const fila = `${db}\t` + OFFS.map((o) => med(cap, o)).join('\t') + `\t${cap.length}`;
  console.log(fila);
  filas.push(fila);
}
c.cerrar();
process.exit(0);
