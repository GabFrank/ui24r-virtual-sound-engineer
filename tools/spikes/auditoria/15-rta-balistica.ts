/**
 * Balistica del RTA: rafagas de tono 1 kHz con silencio, muestreando cada trama
 * RTA con marca de tiempo. Se mide subida (10->90 %) y caida (90->10 %) en dB.
 * Tambien: cadencia de tramas RTA y VU2, y techo del RTA.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWavTramos, generarWav } from './wav.ts';

const RTA0 = '';
mkdirSync('/tmp/aud-wav', { recursive: true });
const tramos: { seg: number; freq: number; dbfs: number }[] = [];
tramos.push({ seg: 2, freq: 1000, dbfs: -200 });
for (let k = 0; k < 6; k++) {
  tramos.push({ seg: 2.5, freq: 1000, dbfs: -6 });
  tramos.push({ seg: 2.5, freq: 1000, dbfs: -200 });
}
generarWavTramos('/tmp/aud-wav/rafaga.wav', tramos);
generarWav('/tmp/aud-wav/techo.wav', { seg: 40, freq: 1000, dbfs: 0 });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const a = new Cliente();
const serie: { t: number; v: number; vu: number }[] = [];
let ultimoVu = 0;
let on = false;
const tRta: number[] = []; const tVu: number[] = [];
a.al((l) => {
  const ahora = Date.now();
  if (l.startsWith('VU2^')) {
    tVu.push(ahora);
    ultimoVu = Buffer.from(l.slice(4), 'base64')[62];
  }
  if (l.startsWith('RTA^')) {
    tRta.push(ahora);
    if (on) serie.push({ t: ahora, v: Buffer.from(l.slice(4), 'base64')[67], vu: ultimoVu });
  }
});
let audio: any = null;
try {
  await a.conectar('A');
  await dormir(800);
  a.enviar('SETS^var.rta^i.9');
  await dormir(800);

  audio = spawn('afplay', ['/tmp/aud-wav/rafaga.wav'], { stdio: 'ignore' });
  on = true;
  await dormir(31000);
  on = false;
  matar();

  const t0 = serie[0].t;
  console.log('### serie (ms desde el inicio, banda 67 del RTA, byte 62 del VU2)');
  for (const p of serie) console.log(`${p.t - t0}\t${p.v}\t${p.vu}`);

  const d = (arr: number[]) => {
    const g: number[] = [];
    for (let i = 1; i < arr.length; i++) g.push(arr[i] - arr[i - 1]);
    g.sort((x, y) => x - y);
    return `n=${g.length} mediana=${g[Math.floor(g.length / 2)]} min=${g[0]} max=${g[g.length - 1]}`;
  };
  console.log('\n### cadencia');
  console.log('RTA: ' + d(tRta));
  console.log('VU2: ' + d(tVu));

  console.log('\n### techo del RTA (0 dBFS, ganancia normal)');
  audio = spawn('afplay', ['/tmp/aud-wav/techo.wav'], { stdio: 'ignore' });
  await dormir(2500);
  const m: number[] = [];
  const q = a.al((l) => { if (l.startsWith('RTA^')) m.push(Buffer.from(l.slice(4), 'base64')[67]); });
  await dormir(2000); q();
  console.log('pico banda 67: ' + Math.max(...m) + ' (n=' + m.length + ')');
} finally {
  matar();
  try { a.enviar(`SETS^var.rta^${RTA0}`); } catch { /* noop */ }
  await dormir(700);
  console.log(`\nrestaurado var.rta=${JSON.stringify(RTA0)}`);
  a.cerrar();
}
process.exit(0);
