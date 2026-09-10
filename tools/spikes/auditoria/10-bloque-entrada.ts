/**
 * Que es cada byte del bloque de 6 de una entrada, y donde esta tomado el
 * medidor +0. Se aplica de a un cambio por vez sobre i.9 con tono estable y se
 * mira que bytes se mueven. Cada prueba restaura lo suyo antes de la siguiente.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const BASE = 62; // bloque de i.9
const ORIG: Record<string, string> = {
  'i.9.eq.bypass': '0',
  'i.9.eq.hpf.freq': '0',
  'i.9.eq.hpf.slope': '0',
  'i.9.eq.b3.gain': '0.5',
  'i.9.gate.enabled': '1',
  'i.9.gate.threshold': '0',
  'i.9.gate.thresh': '0',
  'i.9.gate.depth': '0',
  'i.9.dyn.bypass': '0',
  'i.9.dyn.ratio': '1',
  'i.9.dyn.threshold': '0.875',
  'i.9.dyn.attack': '0.34375',
  'i.9.dyn.gain': '0.75',
  'i.9.dyn.outgain': '0.3333333333',
  'i.9.mute': '0',
  'i.9.invert': '0',
  'i.9.pan': '0.5',
  'i.9.solo': '0',
};
const PRUEBAS: [string, Record<string, string>][] = [
  ['base', {}],
  ['eq.bypass=1', { 'i.9.eq.bypass': '1' }],
  ['hpf al maximo', { 'i.9.eq.hpf.freq': '1', 'i.9.eq.hpf.slope': '1' }],
  ['b3.gain=1 (realce)', { 'i.9.eq.b3.gain': '1' }],
  ['b3.gain=0 (corte)', { 'i.9.eq.b3.gain': '0' }],
  ['gate.threshold=1', { 'i.9.gate.threshold': '1', 'i.9.gate.thresh': '1' }],
  ['gate.thr=1 + depth=1', { 'i.9.gate.threshold': '1', 'i.9.gate.thresh': '1', 'i.9.gate.depth': '1' }],
  ['gate.enabled=0', { 'i.9.gate.enabled': '0' }],
  ['comp thr=0 ratio=1', { 'i.9.dyn.threshold': '0', 'i.9.dyn.ratio': '1', 'i.9.dyn.attack': '0' }],
  ['comp thr=0 ratio=0', { 'i.9.dyn.threshold': '0', 'i.9.dyn.ratio': '0', 'i.9.dyn.attack': '0' }],
  ['comp thr=0.5 ratio=1', { 'i.9.dyn.threshold': '0.5', 'i.9.dyn.ratio': '1', 'i.9.dyn.attack': '0' }],
  ['dyn.bypass=1 (thr=0 r=1)', { 'i.9.dyn.threshold': '0', 'i.9.dyn.ratio': '1', 'i.9.dyn.bypass': '1' }],
  ['dyn.outgain=1', { 'i.9.dyn.outgain': '1' }],
  ['mute=1', { 'i.9.mute': '1' }],
  ['invert=1', { 'i.9.invert': '1' }],
  ['pan=0 (izq)', { 'i.9.pan': '0' }],
];

mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/blk.wav', { seg: 400, freq: 1000, dbfs: -12 });
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
try {
  await a.conectar('A');
  await dormir(700);
  audio = spawn('afplay', ['/tmp/aud-wav/blk.wav'], { stdio: 'ignore' });
  await dormir(1500);
  const OFFS = [62, 63, 64, 65, 66, 67, 284, 285, 286, 287];
  console.log('prueba'.padEnd(26) + OFFS.map((o) => ('b' + o).padStart(5)).join(''));
  for (const [nombre, cambios] of PRUEBAS) {
    for (const [k, v] of Object.entries(cambios)) a.enviar(`SETD^${k}^${v}`);
    await dormir(1400);
    cap = []; on = true; await dormir(1200); on = false;
    console.log(nombre.padEnd(26) + OFFS.map((o) => String(est(o)).padStart(5)).join(''));
    for (const k of Object.keys(cambios)) a.enviar(`SETD^${k}^${ORIG[k]}`);
    await dormir(700);
  }
} finally {
  matar();
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(900);
  console.log('\nrestaurado i.9.* a los valores del volcado inicial');
  a.cerrar();
}
process.exit(0);
