/**
 * ¿El `RTA^` trae espectro cuando se le elige una fuente?
 *
 * `parseRTAdata` en el mixer.html lee `dataValue["var.rta"]` --el canal que el
 * analizador esta mirando-- y si no hay ninguno, devuelve sin hacer nada. En el
 * volcado de esta consola `var.rta` no existe: nadie lo eligio nunca, y por eso
 * la trama llega en ceros.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport } from '@vse/mixer-adapter';

const t = new Ui24rTransport();
let tramas: number[][] = [];
t.alRecibir((l) => { if (l.startsWith('RTA^')) tramas.push([...Buffer.from(l.slice(4), 'base64')]); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));

const resumen = (etiqueta: string): number[] => {
  const n = tramas[0]?.length ?? 0;
  const media = new Array(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) media[i] += (tr[i] ?? 0) / tramas.length;
  const noCero = media.filter((v) => v > 0.5).length;
  console.log(`${etiqueta.padEnd(26)} ${tramas.length} tramas · ${n} bytes · ${noCero} posiciones con valor · max ${Math.max(0, ...media).toFixed(0)}`);
  return media;
};

const medir = async (etiqueta: string, sonar: boolean): Promise<number[]> => {
  let p: ReturnType<typeof spawn> | null = null;
  if (sonar) p = spawn('afplay', ['/tmp/vse-comp.wav']);
  await new Promise((r) => setTimeout(r, 2000));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  p?.kill();
  return resumen(etiqueta);
};

await medir('sin fuente elegida', true);

console.log('');
console.log('se elige el canal 10 como fuente del analizador (var.rta = i.9)');
t.enviar('SETS^var.rta^i.9');
await new Promise((r) => setTimeout(r, 1500));

const silencio = await medir('con fuente, en silencio', false);
const conTono = await medir('con fuente, con tono', true);

const subidas = conTono
  .map((v, i) => ({ i, d: v - (silencio[i] ?? 0) }))
  .filter((x) => x.d > 3)
  .sort((a, b) => b.d - a.d);
console.log('');
console.log(`posiciones que suben con el tono: ${subidas.length}`);
for (const s of subidas.slice(0, 10)) console.log(`  [${s.i}] +${s.d.toFixed(0)}`);

t.enviar('SETS^var.rta^');
await new Promise((r) => setTimeout(r, 800));
await t.desconectar();
console.log('fuente del analizador devuelta a vacio');
