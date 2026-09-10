/**
 * Monitor diferencial de VU2: toma una linea base en silencio, despues
 * observa una ventana y reporta que bytes se movieron y cuanto.
 * Uso: 03-diff-vu2.ts <ms-base> <ms-observacion> [comando-a-lanzar]
 */
import { spawn } from 'node:child_process';
import { Cliente, dormir } from './cliente.ts';

const msBase = Number(process.argv[2] ?? 2000);
const msObs = Number(process.argv[3] ?? 4000);
const cmd = process.argv[4];

const c = new Cliente();
let acumular: number[][] | null = null;
const capturar: number[][] = [];
let modo: 'base' | 'obs' | 'off' = 'off';
const base: number[][] = [];

c.al((l) => {
  if (!l.startsWith('VU2^')) return;
  const b = [...Buffer.from(l.slice(4), 'base64')];
  if (modo === 'base') base.push(b);
  else if (modo === 'obs') capturar.push(b);
});

await c.conectar();
await dormir(500);
modo = 'base';
await dormir(msBase);
modo = 'off';

let hijo: any = null;
if (cmd) { hijo = spawn('/bin/sh', ['-c', cmd], { stdio: 'ignore' }); await dormir(700); }

modo = 'obs';
await dormir(msObs);
modo = 'off';
if (hijo) { try { process.kill(-hijo.pid, 'SIGKILL'); } catch { try { hijo.kill('SIGKILL'); } catch {} } }
c.cerrar();

const n = base[0].length;
const maxDe = (arr: number[][], i: number) => Math.max(...arr.map((f) => f[i]));
const medDe = (arr: number[][], i: number) => {
  const v = arr.map((f) => f[i]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};
console.log(`tramas base=${base.length} obs=${capturar.length} largo=${n}`);
console.log('off  base(max/med)  obs(max/med)   delta-max');
for (let i = 0; i < n; i++) {
  const bm = maxDe(base, i), bd = medDe(base, i);
  const om = maxDe(capturar, i), od = medDe(capturar, i);
  if (om !== bm || od !== bd) {
    console.log(`${String(i).padStart(3)}  ${String(bm).padStart(3)}/${String(bd).padStart(3)}        ${String(om).padStart(3)}/${String(od).padStart(3)}       ${String(om - bm).padStart(4)}`);
  }
}
process.exit(0);
