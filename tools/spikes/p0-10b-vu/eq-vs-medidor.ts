/**
 * ¿El medidor previo (byte +0) es anterior tambien al ecualizador?
 *
 * Del compresor ya se sabe que si. Si el ecualizador estuviera ANTES de ese
 * punto, un realce de banda moveria el nivel que el asistente usa para
 * aconsejar ganancia, y el consejo saldria coloreado por una decision de
 * timbre que no tiene nada que ver con el margen del previo.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
let pre: number[] = []; let ent: number[] = []; let sal: number[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const m = decodificarVuCanales(l.slice(4))[9];
  if (m) { pre.push(dbDeMedidor(m.pre)); ent.push(dbDeMedidor(m.entrada)); sal.push(dbDeMedidor(m.salida)); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 2500));
const p = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2000));
const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const medir = async (etiqueta: string) => {
  pre = []; ent = []; sal = [];
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`${etiqueta.padEnd(34)} pre ${media(pre).toFixed(2)} · entrada ${media(ent).toFixed(2)} · salida ${media(sal).toFixed(2)}`);
};
// La banda 3 esta cerca de 1 kHz segun su frecuencia normalizada (0,756).
await medir('ecualizador plano');
t.enviar(codificarSetd('i.9.eq.b3.gain', 1));   // realce al maximo
await new Promise((r) => setTimeout(r, 1200));
await medir('banda 3 realzada al maximo');
t.enviar(codificarSetd('i.9.eq.b3.gain', 0));   // corte al maximo
await new Promise((r) => setTimeout(r, 1200));
await medir('banda 3 cortada al maximo');
t.enviar(codificarSetd('i.9.eq.b3.gain', 0.5)); // plano de nuevo
await new Promise((r) => setTimeout(r, 1200));
await medir('devuelta a plano');
p.kill();
await t.desconectar();
