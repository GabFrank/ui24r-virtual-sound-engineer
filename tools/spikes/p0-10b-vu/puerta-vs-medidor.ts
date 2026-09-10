/**
 * ¿El medidor previo (byte +0) es anterior tambien a la puerta de ruido?
 *
 * Del compresor y del ecualizador ya se sabe que si, medido. De la puerta era
 * una INFERENCIA --esta en el mismo bloque que el compresor-- y por esa
 * inferencia el asistente baja la confianza en todos los canales con puerta
 * activa, que en una consola de show son casi todos. Confirmarla devuelve esa
 * confianza; desmentirla obliga a otra cosa.
 *
 * Metodo: tono fijo y subir el umbral de la puerta por encima de la senal,
 * para que cierre. Si `pre` no se mueve y `entrada` cae, queda medido.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor } from '@vse/mixer-adapter';

const umbralDb = (crudo: number): number => -90 + 96 * crudo;
const t = new Ui24rTransport();
let pre: number[] = []; let ent: number[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const m = decodificarVuCanales(l.slice(4))[9];
  if (m) { pre.push(dbDeMedidor(m.pre)); ent.push(dbDeMedidor(m.entrada)); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 2500));

// Estado original, para devolverlo despues.
const original = { depth: 0, threshold: 0 };
const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const p = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2000));

const medir = async (etiqueta: string) => {
  pre = []; ent = [];
  await new Promise((r) => setTimeout(r, 2500));
  console.log(`${etiqueta.padEnd(38)} pre ${media(pre).toFixed(2)} · entrada ${media(ent).toFixed(2)}`);
};

await medir('puerta abierta (umbral bajo)');
// La ruta es `gate.thresh`, no `gate.threshold`. Y la profundidad esta
// INVERTIDA: `VtoGATE_DEPTH(a) = 60a - 60`, asi que 0 es atenuacion maxima y 1
// es ninguna. Ya viene en 0, o sea al maximo, y no hace falta tocarla: alcanza
// con subir el umbral por encima de la senal, que esta en -48,7 dB.
t.enviar(codificarSetd('i.9.gate.thresh', 0.55));
await new Promise((r) => setTimeout(r, 1500));
await medir(`umbral ${umbralDb(0.55).toFixed(0)} dB: la puerta cierra`);
t.enviar(codificarSetd('i.9.gate.thresh', 0.3));
await new Promise((r) => setTimeout(r, 1500));
await medir(`umbral ${umbralDb(0.3).toFixed(0)} dB: vuelve a abrir`);

p.kill();
t.enviar(codificarSetd('i.9.gate.thresh', original.threshold));
await new Promise((r) => setTimeout(r, 1000));
await t.desconectar();
console.log('umbral de la puerta devuelto a 0, que es como estaba');
