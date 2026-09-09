/**
 * (a) Que son los dos ultimos grupos de la cola de VU2 (2x5 en 284 y 2x6 en 294).
 * (b) Ley del byte de reduccion de ganancia: se compara la caida REAL medida en
 *     el medidor post-proceso (b63, 1/3 dB por byte) contra el byte +5 (b67).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const ORIG: Record<string, string> = {
  'm.mix': '', 'p.0.mix': '', 'p.0.mute': '0', 'l.0.mute': '0',
  'i.9.dyn.threshold': '0.875', 'i.9.dyn.ratio': '1', 'i.9.dyn.attack': '0.34375',
  'i.9.dyn.outgain': '0.3333333333', 'i.9.dyn.softknee': '0',
};
mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/gr.wav', { seg: 900, freq: 1000, dbfs: -12 });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const a = new Cliente();
let cap: number[][] = [];
let on = false;
const estado = new Map<string, string>();
a.al((l) => {
  if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]);
  const p = l.split('^');
  if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) estado.set(p[1], p.slice(2).join('^'));
});
const med = (i: number) => {
  const v = cap.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const tomar = async (ms = 1100) => { cap = []; on = true; await dormir(ms); on = false; };
const rango = (i: number, f: number) => { const r = []; for (let k = i; k <= f; k++) r.push(k); return r; };
let audio: any = null;

try {
  await a.conectar('A');
  await dormir(3500);
  for (const k of Object.keys(ORIG)) if (ORIG[k] === '') ORIG[k] = estado.get(k) ?? '?';
  console.log('previos: ' + JSON.stringify(ORIG));
  audio = spawn('afplay', ['/tmp/aud-wav/gr.wav'], { stdio: 'ignore' });
  await dormir(1500);

  console.log('\n### (a) cola final: bytes 284..305');
  const offs = rango(284, 305);
  console.log('prueba'.padEnd(22) + offs.map((o) => String(o).padStart(4)).join(''));
  const pr: [string, Record<string, string>][] = [
    ['base', {}],
    ['m.mix=0.4', { 'm.mix': '0.4' }],
    ['m.mix=0.2', { 'm.mix': '0.2' }],
    ['p.0.mix=0.2', { 'p.0.mix': '0.2' }],
    ['p.0.mute=1', { 'p.0.mute': '1' }],
    ['l.0.mute=1', { 'l.0.mute': '1' }],
  ];
  for (const [n, c] of pr) {
    for (const [k, v] of Object.entries(c)) a.enviar(`SETD^${k}^${v}`);
    await dormir(1400); await tomar();
    console.log(n.padEnd(22) + offs.map((o) => String(med(o)).padStart(4)).join(''));
    for (const k of Object.keys(c)) a.enviar(`SETD^${k}^${ORIG[k]}`);
    await dormir(700);
  }

  console.log('\n### (b) ley del byte de reduccion (i.9, ratio=0 = maxima)');
  a.enviar('SETD^i.9.dyn.attack^0');
  a.enviar('SETD^i.9.dyn.ratio^0');
  await dormir(1200);
  console.log('thr\tb62\tb63\tb67\tcaida_dB_medida\t247-b67\t(247-b67)/3');
  for (const t of ['1', '0.95', '0.9', '0.85', '0.8', '0.75', '0.7', '0.65', '0.6', '0.55', '0.5', '0.45', '0.4', '0.35', '0.3', '0.2', '0.1', '0']) {
    a.enviar(`SETD^i.9.dyn.threshold^${t}`);
    await dormir(1300); await tomar(1200);
    const b62 = med(62), b63 = med(63), b67 = med(67);
    console.log(`${t}\t${b62}\t${b63}\t${b67}\t${((94 - b63) / 3).toFixed(2)}\t\t${247 - b67}\t${((247 - b67) / 3).toFixed(2)}`);
  }
} finally {
  matar();
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(1200);
  console.log('\nrestaurado: ' + JSON.stringify(ORIG));
  a.cerrar();
}
process.exit(0);
