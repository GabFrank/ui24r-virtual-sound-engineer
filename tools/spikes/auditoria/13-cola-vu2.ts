/**
 * Cola de VU2: subgrupo, efecto y auxiliar. Se manda senal a cada bus y se
 * varian sus controles de a uno para ver que byte se mueve.
 * Buses elegidos: s.1, f.0, a.0 (los tres desmuteados en el volcado inicial;
 * s.0 y f.3 estan muteados y darian ceros enganosos).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const ORIG: Record<string, string> = {
  'i.9.aux.0.value': '0', 'i.9.aux.0.post': '0', 'i.9.aux.0.mute': '0',
  'i.9.fx.0.value': '0', 'i.9.fx.0.post': '1', 'i.9.fx.0.mute': '0',
  'i.9.subgroup': '-1',
  'a.0.mix': '', 'a.0.mute': '0', 'a.0.gate.enabled': '', 'a.0.dyn.bypass': '0',
  'a.0.dyn.threshold': '', 'a.0.dyn.ratio': '', 'a.0.eq.bypass': '0',
  's.1.mix': '', 's.1.mute': '0', 's.1.gate.enabled': '', 's.1.dyn.bypass': '0',
  's.1.dyn.threshold': '', 's.1.dyn.ratio': '', 's.1.eq.bypass': '0',
  'f.0.mix': '', 'f.0.mute': '0', 'f.0.dyn.bypass': '0', 'f.0.eq.bypass': '0',
};

mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/cola.wav', { seg: 900, freq: 1000, dbfs: -12 });
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
let audio: any = null;

const rango = (ini: number, fin: number) => {
  const r: number[] = []; for (let i = ini; i <= fin; i++) r.push(i); return r;
};

try {
  await a.conectar('A');
  await dormir(3500);
  for (const k of Object.keys(ORIG)) if (ORIG[k] === '') ORIG[k] = estado.get(k) ?? '?';
  console.log('valores previos: ' + JSON.stringify(ORIG));

  audio = spawn('afplay', ['/tmp/aud-wav/cola.wav'], { stdio: 'ignore' });
  await dormir(1500);

  // --- localizar el bloque de subgrupo: probar codificacion de i.9.subgroup ---
  console.log('\n### codificacion de i.9.subgroup (bytes 164..205, 6 bloques de 7)');
  for (const v of ['-1', '0', '1', '2', '4']) {
    a.enviar(`SETD^i.9.subgroup^${v}`);
    await dormir(1200);
    await tomar();
    console.log(`  subgroup=${v} -> ` + rango(164, 205).map((o) => med(o)).join(','));
  }
  a.enviar('SETD^i.9.subgroup^-1');
  await dormir(800);

  const bateria = async (
    titulo: string, ini: number, fin: number,
    encender: Record<string, string>, pruebas: [string, Record<string, string>][],
  ) => {
    console.log(`\n### ${titulo}  (bytes ${ini}..${fin})`);
    for (const [k, v] of Object.entries(encender)) a.enviar(`SETD^${k}^${v}`);
    await dormir(1500);
    const offs = rango(ini, fin);
    console.log('prueba'.padEnd(26) + offs.map((o) => String(o).padStart(5)).join(''));
    for (const [nombre, cambios] of pruebas) {
      for (const [k, v] of Object.entries(cambios)) a.enviar(`SETD^${k}^${v}`);
      await dormir(1400);
      await tomar();
      console.log(nombre.padEnd(26) + offs.map((o) => String(med(o)).padStart(5)).join(''));
      for (const k of Object.keys(cambios)) a.enviar(`SETD^${k}^${ORIG[k]}`);
      await dormir(700);
    }
    for (const k of Object.keys(encender)) a.enviar(`SETD^${k}^${ORIG[k]}`);
    await dormir(900);
  };

  await bateria('AUX a.0', 234, 238, { 'i.9.aux.0.value': '1' }, [
    ['con senal', {}],
    ['a.0.mix=0.3', { 'a.0.mix': '0.3' }],
    ['a.0.mute=1', { 'a.0.mute': '1' }],
    ['a.0.gate.enabled=0', { 'a.0.gate.enabled': '0' }],
    ['a.0.dyn.bypass=1', { 'a.0.dyn.bypass': '1' }],
    ['a.0 comp thr0 r0', { 'a.0.dyn.threshold': '0', 'a.0.dyn.ratio': '0' }],
    ['a.0.eq.bypass=1', { 'a.0.eq.bypass': '1' }],
    ['send=0 (sin senal)', { 'i.9.aux.0.value': '0' }],
  ]);

  await bateria('FX f.0', 206, 212, { 'i.9.fx.0.value': '1' }, [
    ['con senal', {}],
    ['f.0.mix=0.3', { 'f.0.mix': '0.3' }],
    ['f.0.mute=1', { 'f.0.mute': '1' }],
    ['f.0.dyn.bypass=1', { 'f.0.dyn.bypass': '1' }],
    ['f.0.eq.bypass=1', { 'f.0.eq.bypass': '1' }],
    ['send=0 (sin senal)', { 'i.9.fx.0.value': '0' }],
  ]);

  await bateria('SUB s.1', 171, 177, { 'i.9.subgroup': '1' }, [
    ['con senal', {}],
    ['s.1.mix=0.3', { 's.1.mix': '0.3' }],
    ['s.1.mute=1', { 's.1.mute': '1' }],
    ['s.1.gate.enabled=0', { 's.1.gate.enabled': '0' }],
    ['s.1.dyn.bypass=1', { 's.1.dyn.bypass': '1' }],
    ['s.1 comp thr0 r0', { 's.1.dyn.threshold': '0', 's.1.dyn.ratio': '0' }],
    ['s.1.eq.bypass=1', { 's.1.eq.bypass': '1' }],
    ['sin subgrupo', { 'i.9.subgroup': '-1' }],
  ]);
} finally {
  matar();
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(1200);
  console.log('\nrestaurado: ' + JSON.stringify(ORIG));
  a.cerrar();
}
process.exit(0);
