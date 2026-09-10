/**
 * (a) Latencia del testigo: escribo en A, cronometro hasta verlo en B.
 * (b) Barrido de fader i.9.mix con tono estable -> que bytes se mueven.
 * Restaura i.9.mix pase lo que pase.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const RUTA = 'i.9.mix';
const ORIGINAL = '0.7647058824';
mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/tono12.wav', { seg: 200, freq: 1000, dbfs: -12 });

const a = new Cliente();
const b = new Cliente();
let audio: any = null;

const eventos: { t: number; linea: string }[] = [];
b.al((l) => { if (l.startsWith('SETD^' + RUTA + '^')) eventos.push({ t: Date.now(), linea: l }); });

let cap: number[][] = [];
let on = false;
a.al((l) => { if (on && l.startsWith('VU2^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });

const med = (arr: number[][], i: number) => {
  const v = arr.map((f) => f[i]).sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

try {
  await a.conectar('A');
  await b.conectar('B');
  await dormir(800);

  // --- (a) latencia del testigo, 8 medidas ---
  console.log('### latencia testigo (ms)');
  const lat: number[] = [];
  for (let k = 0; k < 8; k++) {
    const valor = (0.30 + k * 0.01).toFixed(6);
    eventos.length = 0;
    const t0 = Date.now();
    a.enviar(`SETD^${RUTA}^${valor}`);
    for (let w = 0; w < 200 && eventos.length === 0; w++) await dormir(5);
    if (eventos.length) { lat.push(eventos[0].t - t0); }
    else console.log(`  k=${k} SIN ECO`);
    await dormir(120);
  }
  console.log('  medidas: ' + lat.join(', '));
  console.log(`  n=${lat.length} min=${Math.min(...lat)} max=${Math.max(...lat)} media=${(lat.reduce((x, y) => x + y, 0) / lat.length).toFixed(1)}`);
  console.log('  ejemplo de eco: ' + (eventos[0]?.linea ?? '(ninguno)'));

  // --- (b) barrido de fader ---
  audio = spawn('afplay', ['/tmp/aud-wav/tono12.wav'], { stdio: 'ignore' });
  await dormir(1500);
  console.log('\n### barrido fader i.9.mix  (tono 1 kHz -12 dBFS)');
  const OFFS = [62, 63, 64, 65, 66, 67, 284, 285, 286, 287];
  console.log('crudo\t' + OFFS.map((o) => 'b' + o).join('\t'));
  const crudos = [1, 0.95, 0.9, 0.85, 0.8, 0.7647058824, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05, 0];
  for (const v of crudos) {
    a.enviar(`SETD^${RUTA}^${v}`);
    await dormir(700);
    cap = []; on = true;
    await dormir(900);
    on = false;
    console.log(`${v}\t` + OFFS.map((o) => med(cap, o)).join('\t'));
  }
} finally {
  try { if (audio) audio.kill('SIGKILL'); } catch { /* noop */ }
  try { a.enviar(`SETD^${RUTA}^${ORIGINAL}`); } catch { /* noop */ }
  await dormir(500);
  console.log(`\nrestaurado ${RUTA} = ${ORIGINAL}`);
  a.cerrar(); b.cerrar();
}
process.exit(0);
