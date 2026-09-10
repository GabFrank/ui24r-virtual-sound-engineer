/**
 * RTA: (a) banda <-> frecuencia, (b) dB por byte, (c) pre o post fader.
 * var.rta es GLOBAL: valor previo "" (vacio), se restaura si o si.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const RTA0 = '';
const F = 'i.9.mix', F0 = '0.7647058824';
mkdirSync('/tmp/aud-wav', { recursive: true });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const FREQS = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 18000, 20000];
for (const f of FREQS) generarWav(`/tmp/aud-wav/r${f}.wav`, { seg: 12, freq: f, dbfs: -12 });
const NIVELES = [0, -3, -6, -9, -12, -15, -18, -24, -30, -36, -42, -48, -54, -60];
for (const d of NIVELES) generarWav(`/tmp/aud-wav/rn${d}.wav`, { seg: 10, freq: 1000, dbfs: d });

const a = new Cliente();
let cap: number[][] = [];
let on = false;
a.al((l) => { if (on && l.startsWith('RTA^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
const promedio = (): number[] => {
  const n = cap[0].length;
  return Array.from({ length: n }, (_, i) => cap.reduce((s, f) => s + f[i], 0) / cap.length);
};
let audio: any = null;
const tocar = async (ruta: string) => {
  matar(); await dormir(150);
  audio = spawn('afplay', [ruta], { stdio: 'ignore' });
  await dormir(1400);
};
const tomar = async (ms = 1500) => { cap = []; on = true; await dormir(ms); on = false; return promedio(); };

try {
  await a.conectar('A');
  await dormir(700);
  a.enviar('SETS^var.rta^i.9');
  await dormir(800);

  console.log('### (a) banda vs frecuencia');
  console.log('Hz\tpico\tvalor\tcentroide\tvecinos');
  for (const f of FREQS) {
    await tocar(`/tmp/aud-wav/r${f}.wav`);
    const p = await tomar(1400);
    let pk = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[pk]) pk = i;
    const lo = Math.max(0, pk - 6), hi = Math.min(p.length - 1, pk + 6);
    let sn = 0, sd = 0;
    for (let i = lo; i <= hi; i++) { sn += i * p[i]; sd += p[i]; }
    const vec = [];
    for (let i = Math.max(0, pk - 3); i <= Math.min(p.length - 1, pk + 3); i++) vec.push(`${i}:${p[i].toFixed(1)}`);
    console.log(`${f}\t${pk}\t${p[pk].toFixed(1)}\t${(sn / sd).toFixed(2)}\t${vec.join(' ')}`);
  }

  console.log('\n### (b) dB por byte (1 kHz, banda 67)');
  console.log('dBFS\tpico\tbanda\tsuma(60..74)');
  for (const d of NIVELES) {
    await tocar(`/tmp/aud-wav/rn${d}.wav`);
    const p = await tomar(1400);
    let pk = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[pk]) pk = i;
    let s = 0; for (let i = 60; i <= 74; i++) s += p[i];
    console.log(`${d}\t${p[pk].toFixed(1)}\t${pk}\t${s.toFixed(1)}`);
  }

  console.log('\n### (c) pre o post fader (tono -12 dBFS)');
  await tocar('/tmp/aud-wav/rn-12.wav');
  console.log('fader\tpico\tbanda');
  for (const v of [F0, '0.9', '0.6', '0.4', F0]) {
    a.enviar(`SETD^${F}^${v}`);
    await dormir(900);
    const p = await tomar(1400);
    let pk = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[pk]) pk = i;
    console.log(`${v}\t${p[pk].toFixed(1)}\t${pk}`);
  }
} finally {
  matar();
  try { a.enviar(`SETD^${F}^${F0}`); a.enviar(`SETS^var.rta^${RTA0}`); } catch { /* noop */ }
  await dormir(800);
  console.log(`\nrestaurado var.rta=${JSON.stringify(RTA0)}  ${F}=${F0}`);
  a.cerrar();
}
process.exit(0);
