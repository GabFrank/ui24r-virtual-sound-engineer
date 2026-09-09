/**
 * v2 con higiene de procesos (pkill afplay) tras el incidente del tono huerfano.
 * (b) barrido fino hw.9.gain paso 0.01 por tramos.
 * (c) techo del medidor usando el fader como amplificador digital: si el byte
 *     pre-fader NO esta saturado y el post-fader se planta, el tope es del
 *     medidor y no del conversor.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const G = 'hw.9.gain', G0 = '0.2508445026';
const F = 'i.9.mix', F0 = '0.7647058824';
mkdirSync('/tmp/aud-wav', { recursive: true });
for (const d of [0, -24, -42, -60]) generarWav(`/tmp/aud-wav/v${d}.wav`, { seg: 90, freq: 1000, dbfs: d });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const a = new Cliente();
let cap: number[][] = [];
let on = false;
a.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
const est = (i: number) => {
  const v = cap.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
let audio: any = null;
const poner = async (d: number) => {
  matar(); audio = null;
  await dormir(200);
  audio = spawn('afplay', [`/tmp/aud-wav/v${d}.wav`], { stdio: 'ignore' });
  await dormir(1200);
};
const leer = async () => { cap = []; on = true; await dormir(700); on = false; };

try {
  await a.conectar('A');
  await dormir(700);

  console.log('### (b) barrido fino hw.9.gain');
  console.log('nivel\tcrudo\tb62\tb64');
  const tramos: [number, number, number][] = [[-24, 0, 0.30], [-42, 0.28, 0.66], [-60, 0.64, 1.0]];
  for (const [d, ini, fin] of tramos) {
    await poner(d);
    for (let g = ini; g <= fin + 1e-9; g += 0.01) {
      const v = Number(g.toFixed(3));
      a.enviar(`SETD^${G}^${v}`);
      await dormir(500);
      await leer();
      console.log(`${d}\t${v}\t${est(62)}\t${est(64)}`);
    }
  }

  console.log('\n### (c) techo con fader (tono 0 dBFS)');
  await poner(0);
  console.log('gain\tfader\tb62\tb64\tb66');
  for (const g of [0.6, 0.7, 0.8]) {
    a.enviar(`SETD^${G}^${g}`);
    await dormir(500);
    for (const f of [0.7647058824, 0.85, 0.9, 0.95, 1]) {
      a.enviar(`SETD^${F}^${f}`);
      await dormir(500);
      await leer();
      console.log(`${g}\t${f}\t${est(62)}\t${est(64)}\t${est(66)}`);
    }
  }
} finally {
  matar();
  try { a.enviar(`SETD^${G}^${G0}`); a.enviar(`SETD^${F}^${F0}`); } catch { /* noop */ }
  await dormir(600);
  console.log(`\nrestaurado ${G}=${G0}  ${F}=${F0}`);
  a.cerrar();
}
process.exit(0);
