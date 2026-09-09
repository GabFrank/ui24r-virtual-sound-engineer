/** Confirmar que los 12 bytes finales (294..305) son las entradas de linea. */
import { Cliente, dormir } from './cliente.ts';

const ORIG: Record<string, string> = { 'l.0.mute': '0', 'l.1.mute': '0', 'l.0.mix': '', 'l.1.mix': '' };
const a = new Cliente();
let cap: number[][] = []; let on = false;
const estado = new Map<string, string>();
a.al((l) => {
  if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]);
  const p = l.split('^'); if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) estado.set(p[1], p.slice(2).join('^'));
});
const med = (i: number) => { const v = cap.map((f) => f[i]).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
try {
  await a.conectar('A');
  await dormir(3500);
  for (const k of Object.keys(ORIG)) if (ORIG[k] === '') ORIG[k] = estado.get(k) ?? '?';
  console.log('previos: ' + JSON.stringify(ORIG));
  const offs = [];
  for (let i = 284; i <= 305; i++) offs.push(i);
  console.log('prueba'.padEnd(18) + offs.map((o) => String(o).padStart(4)).join(''));
  for (const [n, c] of [
    ['base', {}],
    ['l.0.mute=1', { 'l.0.mute': '1' }],
    ['l.1.mute=1', { 'l.1.mute': '1' }],
    ['l.0.mix=0.2', { 'l.0.mix': '0.2' }],
    ['l.1.mix=0.2', { 'l.1.mix': '0.2' }],
  ] as [string, Record<string, string>][]) {
    for (const [k, v] of Object.entries(c)) a.enviar(`SETD^${k}^${v}`);
    await dormir(1500); cap = []; on = true; await dormir(1300); on = false;
    console.log(n.padEnd(18) + offs.map((o) => String(med(o)).padStart(4)).join(''));
    for (const k of Object.keys(c)) a.enviar(`SETD^${k}^${ORIG[k]}`);
    await dormir(900);
  }
} finally {
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(1200);
  console.log('\nrestaurado: ' + JSON.stringify(ORIG));
  a.cerrar();
}
process.exit(0);
