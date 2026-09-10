/**
 * (a) Los dos bloques de 5 de la cola: main L/R o dos buses distintos (paneo).
 * (b) Ley del byte de reduccion, metodo independiente del medidor: con ratio
 *     infinito y umbral fijo, subir la entrada 1 dB sube la reduccion 1 dB.
 * (c) i.N.src y i.N.stereoIndex: que valores acepta la consola (con testigo,
 *     porque a quien escribe no le devuelve eco).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const ORIG: Record<string, string> = {
  'i.9.pan': '0.5', 'i.9.dyn.threshold': '0.875', 'i.9.dyn.ratio': '1',
  'i.9.dyn.attack': '0.34375',
  'i.4.src': 'hw.4', 'i.4.stereoIndex': '-1', 'i.5.src': 'hw.5', 'i.5.stereoIndex': '-1',
};
mkdirSync('/tmp/aud-wav', { recursive: true });
const NIV = [0, -3, -6, -9, -12, -15, -18];
for (const d of NIV) generarWav(`/tmp/aud-wav/gr${d}.wav`, { seg: 14, freq: 1000, dbfs: d });
generarWav('/tmp/aud-wav/pan.wav', { seg: 90, freq: 1000, dbfs: -12 });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const a = new Cliente();
const b = new Cliente();
let cap: number[][] = [];
let on = false;
let ecos: string[] = [];
a.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
b.al((l) => { if (/\^i\.[45]\.(src|stereoIndex)\^/.test(l)) ecos.push(l); });
const med = (i: number) => {
  const v = cap.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const tomar = async (ms = 1100) => { cap = []; on = true; await dormir(ms); on = false; };
let audio: any = null;
try {
  await a.conectar('A'); await b.conectar('B');
  await dormir(900);

  console.log('### (a) paneo de i.9 -> bytes 284..293');
  matar(); await dormir(150);
  audio = spawn('afplay', ['/tmp/aud-wav/pan.wav'], { stdio: 'ignore' });
  await dormir(1500);
  const offs = [284, 285, 286, 287, 288, 289, 290, 291, 292, 293];
  console.log('pan'.padEnd(10) + offs.map((o) => String(o).padStart(5)).join(''));
  for (const p of ['0.5', '0', '1', '0.5']) {
    a.enviar(`SETD^i.9.pan^${p}`);
    await dormir(1300); await tomar();
    console.log(p.padEnd(10) + offs.map((o) => String(med(o)).padStart(5)).join(''));
  }
  a.enviar('SETD^i.9.pan^0.5'); await dormir(600);

  console.log('\n### (b) reduccion vs nivel (ratio=0, umbral=0.3, ataque=0)');
  a.enviar('SETD^i.9.dyn.ratio^0');
  a.enviar('SETD^i.9.dyn.attack^0');
  a.enviar('SETD^i.9.dyn.threshold^0.3');
  await dormir(1500);
  console.log('dBFS\tb62\tb63\tb67\t247-b67');
  const filas: [number, number][] = [];
  for (const d of NIV) {
    matar(); await dormir(150);
    audio = spawn('afplay', [`/tmp/aud-wav/gr${d}.wav`], { stdio: 'ignore' });
    await dormir(1600);
    await tomar(1200);
    const b67 = med(67);
    console.log(`${d}\t${med(62)}\t${med(63)}\t${b67}\t${247 - b67}`);
    filas.push([d, 247 - b67]);
  }
  const n = filas.length;
  const sx = filas.reduce((s, f) => s + f[0], 0), sy = filas.reduce((s, f) => s + f[1], 0);
  const sxy = filas.reduce((s, f) => s + f[0] * f[1], 0), sxx = filas.reduce((s, f) => s + f[0] * f[0], 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  console.log(`pendiente = ${m.toFixed(4)} bytes de (247-b67) por dB de entrada`);
  matar();

  console.log('\n### (c) i.N.src / i.N.stereoIndex (canal 5, i.4/i.5, mudos y sin uso)');
  for (const [ruta, val] of [
    ['i.4.src', 'none'], ['i.4.src', 'hw.0'], ['i.4.src', 'usb.4'], ['i.4.src', 'p.0'],
    ['i.4.src', 'ua.4'], ['i.4.src', 'l.0'], ['i.4.src', 'hw.4'],
    ['i.4.stereoIndex', '5'], ['i.4.stereoIndex', '1'], ['i.4.stereoIndex', '0'],
    ['i.4.stereoIndex', '-1'],
  ] as [string, string][]) {
    ecos = [];
    a.enviar(`SETD^${ruta}^${val}`);
    await dormir(900);
    console.log(`  ${ruta} <- ${JSON.stringify(val)}   testigo vio: ${JSON.stringify(ecos)}`);
  }
} finally {
  matar();
  for (const [k, v] of Object.entries(ORIG)) { try { a.enviar(`SETD^${k}^${v}`); } catch { /* noop */ } }
  await dormir(1200);
  console.log('\nrestaurado: ' + JSON.stringify(ORIG));
  a.cerrar(); b.cerrar();
}
process.exit(0);
