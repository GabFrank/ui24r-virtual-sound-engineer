/**
 * Que hay despues de las entradas en la trama VU2.
 *
 * `protocol-spec` la deja sin afirmar: dice que los bytes restantes no cierran
 * en multiplo de seis con la lectura de las entradas y que el patron parece
 * desalineado. Ahi viven los medidores del general, los auxiliares, los
 * subgrupos y los efectos: todo lo que hace falta para saber que esta pasando
 * en las SALIDAS y no solo en las entradas.
 *
 * Metodo: senal por un canal conocido, y comparar la trama con y sin senal
 * byte a byte. Lo que se mueva fuera de la zona de entradas es salida.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport } from '@vse/mixer-adapter';

const CABECERA = 8, POR_CANAL = 6, ENTRADAS = 24;
const FIN_ENTRADAS = CABECERA + POR_CANAL * ENTRADAS;

const t = new Ui24rTransport();
let tramas: number[][] = [];
t.alRecibir((l) => { if (l.startsWith('VU2^')) tramas.push([...Buffer.from(l.slice(4), 'base64')]); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 2500));

const medir = async (sonar: boolean): Promise<number[]> => {
  let p: ReturnType<typeof spawn> | null = null;
  if (sonar) p = spawn('afplay', ['/tmp/vse-comp.wav']);
  await new Promise((r) => setTimeout(r, 2000));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  p?.kill();
  const n = tramas[0]?.length ?? 0;
  const m = new Array(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) m[i] += (tr[i] ?? 0) / tramas.length;
  return m;
};

const silencio = await medir(false);
const conSenal = await medir(true);
await t.desconectar();

console.log(`trama de ${silencio.length} bytes · entradas hasta el ${FIN_ENTRADAS - 1} · cola de ${silencio.length - FIN_ENTRADAS} bytes`);
console.log(`la cola cierra en multiplo de 6? ${(silencio.length - FIN_ENTRADAS) % 6 === 0 ? 'si' : 'NO'}`);
console.log('');
console.log('bytes de la COLA que se mueven con la senal:');
const movidos: number[] = [];
for (let i = FIN_ENTRADAS; i < silencio.length; i++) {
  const d = conSenal[i]! - silencio[i]!;
  if (Math.abs(d) > 3) { movidos.push(i); console.log(`  [${i}] rel ${i - FIN_ENTRADAS}: ${silencio[i]!.toFixed(0)} -> ${conSenal[i]!.toFixed(0)}  (${d > 0 ? '+' : ''}${d.toFixed(0)})`); }
}
if (movidos.length === 0) console.log('  ninguno');
console.log('');
console.log('separacion entre los que se movieron:');
for (let k = 1; k < movidos.length; k++) console.log(`  ${movidos[k]! - movidos[k - 1]!}`);
