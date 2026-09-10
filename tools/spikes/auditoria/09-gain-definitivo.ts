/**
 * Curva de hw.9.gain, version buena.
 * Leccion de las corridas previas: el piso de ruido esta referido a la ENTRADA,
 * asi que a ganancia alta un tono bajo queda enterrado y la lectura miente por
 * un offset CONSTANTE (por eso engana: parece una curva valida).
 * Aca se usa siempre el tono mas fuerte que no sature: 0 dBFS hasta crudo 0.80
 * y -12 dBFS de 0.70 a 1.00, con solape para empalmar.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const G = 'hw.9.gain', G0 = '0.2508445026';
mkdirSync('/tmp/aud-wav', { recursive: true });
for (const d of [0, -12]) generarWav(`/tmp/aud-wav/d${d}.wav`, { seg: 100, freq: 1000, dbfs: d });
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
  console.log('nivel\tcrudo\tb62');
  const tramos: [number, number, number][] = [[0, 0, 0.80], [-12, 0.70, 1.0]];
  for (const [d, ini, fin] of tramos) {
    matar(); await dormir(250);
    audio = spawn('afplay', [`/tmp/aud-wav/d${d}.wav`], { stdio: 'ignore' });
    await dormir(1300);
    for (let g = ini; g <= fin + 1e-9; g += 0.01) {
      const v = Number(g.toFixed(3));
      a.enviar(`SETD^${G}^${v}`);
      await dormir(480);
      cap = []; on = true; await dormir(650); on = false;
      console.log(`${d}\t${v}\t${est(62)}`);
    }
  }
} finally {
  matar();
  try { a.enviar(`SETD^${G}^${G0}`); } catch { /* noop */ }
  await dormir(600);
  console.log(`\nrestaurado ${G}=${G0}`);
  a.cerrar();
}
process.exit(0);
