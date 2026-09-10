/** Sonda de var.rta: que formato acepta y que aparece en la trama RTA. */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';
import { generarWav } from './wav.ts';

const ORIGINAL = '';
mkdirSync('/tmp/aud-wav', { recursive: true });
generarWav('/tmp/aud-wav/rta1k.wav', { seg: 300, freq: 1000, dbfs: -12 });
const matar = () => { try { execSync('pkill -9 afplay 2>/dev/null'); } catch { /* noop */ } };
matar();

const a = new Cliente();
const b = new Cliente();
let cap: number[][] = [];
let on = false;
let ecos: string[] = [];
a.al((l) => { if (on && l.startsWith('RTA^')) cap.push([...Buffer.from(l.slice(4), 'base64')]); });
b.al((l) => { if (l.includes('var.rta')) ecos.push(l); });
let audio: any = null;
try {
  await a.conectar('A');
  await b.conectar('B');
  await dormir(700);
  audio = spawn('afplay', ['/tmp/aud-wav/rta1k.wav'], { stdio: 'ignore' });
  await dormir(1500);
  for (const [tipo, valor] of [
    ['SETD', ''], ['SETS', 'i.9'], ['SETD', 'i.9'], ['SETS', '9'], ['SETD', '9'],
    ['SETS', 'input.9'], ['SETS', 'm'], ['SETS', 'l'], ['SETS', 'master'],
  ] as [string, string][]) {
    ecos = [];
    a.enviar(`${tipo}^var.rta^${valor}`);
    await dormir(900);
    cap = []; on = true; await dormir(1200); on = false;
    const largos = [...new Set(cap.map((f) => f.length))];
    const noCero = cap.length ? cap[cap.length - 1].filter((x) => x !== 0).length : 0;
    const maxv = cap.length ? Math.max(...cap.flat()) : 0;
    console.log(`${tipo}^var.rta^${JSON.stringify(valor)} -> tramas=${cap.length} largos=${largos} bytesNoCero=${noCero} max=${maxv} eco=${JSON.stringify(ecos.slice(0, 2))}`);
    if (noCero > 0) {
      const f = cap[cap.length - 1];
      console.log('   ' + f.map((x, i) => (x ? `${i}:${x}` : '')).filter(Boolean).join(' '));
    }
  }
} finally {
  matar();
  try { a.enviar(`SETS^var.rta^${ORIGINAL}`); } catch { /* noop */ }
  await dormir(600);
  a.cerrar(); b.cerrar();
  console.log(`\nrestaurado var.rta = ${JSON.stringify(ORIGINAL)}`);
}
process.exit(0);
