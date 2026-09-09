/** Que son los bytes +2 y +3 de los dos bloques del main (284..293). */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const ORIG: Record<string, string> = {
  'm.gate.enabled': '0', 'm.gate.bypass': '1', 'm.gate.thresh': '0',
  'm.dyn.bypass': '0', 'm.dyn.l.ratio': '0.0487804878', 'm.dyn.l.threshold': '0.7427250239',
  'm.dyn.r.ratio': '0.0487804878', 'm.dyn.r.threshold': '0.7427250239',
  'm.eq.bypass': '',
};
mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/mn.wav', { seg: 200, freq: 1000, dbfs: -6 });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();
const a = new Cliente();
let cap: number[][] = []; let on = false;
const estado = new Map<string, string>();
a.al((l) => {
  if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]);
  const p = l.split('^'); if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) estado.set(p[1], p.slice(2).join('^'));
});
const med = (i: number) => { const v = cap.map((f) => f[i]).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
let audio: any = null;
try {
  await a.conectar('A');
  await dormir(3500);
  for (const k of Object.keys(ORIG)) if (ORIG[k] === '') ORIG[k] = estado.get(k) ?? '?';
  console.log('previos: ' + JSON.stringify(ORIG));
  audio = spawn('afplay', ['/tmp/aud-wav/mn.wav'], { stdio: 'ignore' });
  await dormir(1600);
  const offs = [284, 285, 286, 287, 288, 289, 290, 291, 292, 293];
  console.log('prueba'.padEnd(26) + offs.map((o) => String(o).padStart(5)).join(''));
  for (const [n, c] of [
    ['base', {}],
    ['m.gate.enabled=1', { 'm.gate.enabled': '1', 'm.gate.bypass': '0' }],
    ['m.gate cerrado', { 'm.gate.enabled': '1', 'm.gate.bypass': '0', 'm.gate.thresh': '1' }],
    ['m.dyn.bypass=1', { 'm.dyn.bypass': '1' }],
    ['m.dyn aplastado', { 'm.dyn.l.ratio': '0', 'm.dyn.l.threshold': '0.2', 'm.dyn.r.ratio': '0', 'm.dyn.r.threshold': '0.2' }],
    ['m.dyn solo L aplastado', { 'm.dyn.l.ratio': '0', 'm.dyn.l.threshold': '0.2' }],
  ] as [string, Record<string, string>][]) {
    for (const [k, v] of Object.entries(c)) a.enviar(`SETD^${k}^${v}`);
    await dormir(1600); cap = []; on = true; await dormir(1200); on = false;
    console.log(n.padEnd(26) + offs.map((o) => String(med(o)).padStart(5)).join(''));
    for (const k of Object.keys(c)) a.enviar(`SETD^${k}^${ORIG[k]}`);
    await dormir(900);
  }
} finally {
  matar();
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(1200);
  console.log('\nrestaurado: ' + JSON.stringify(ORIG));
  a.cerrar();
}
process.exit(0);
