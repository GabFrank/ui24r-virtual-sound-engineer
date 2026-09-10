/**
 * Donde empieza cada seccion de la cola de la trama VU2.
 *
 * La cola no es una tabla sino cinco secciones seguidas --linea, subgrupos,
 * efectos, auxiliares y general-- y por leerla como una sola parecia
 * desalineada. Cada limite se fija igual: provocar senal SOLO en una seccion y
 * ver que bytes se mueven.
 *
 * Escribe envios de auxiliar. Ver "Que se puede tocar durante una sesion de
 * medicion" en docs/spikes/README.md: vale para los scripts de spike, con el
 * equipo sin parlantes conectados, y siempre anotando el valor anterior.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const CABECERA = 8, FIN_ENTRADAS = CABECERA + 6 * 24;
const t = new Ui24rTransport();
let tramas: number[][] = [];
const previos = new Map<string, number>();
t.alRecibir((l) => {
  if (l.startsWith('VU2^')) tramas.push([...Buffer.from(l.slice(4), 'base64')]);
  if (l.startsWith('SETD^')) {
    const [, r, v] = l.split('^');
    if (r && /^i\.9\.aux\.\d+\.value$/.test(r) && !previos.has(r)) previos.set(r, Number(v));
  }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3500));

const p = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2000));
const foto = async (): Promise<number[]> => {
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  const n = tramas[0]?.length ?? 0;
  const m = new Array(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) m[i] += (tr[i] ?? 0) / tramas.length;
  return m;
};

const base = await foto();
console.log(`envio de auxiliar antes de tocar: ${previos.get('i.9.aux.0.value') ?? 'sin dato'}`);

for (const aux of [0, 3]) {
  t.enviar(codificarSetd(`i.9.aux.${aux}.value`, 0.8));
  await new Promise((r) => setTimeout(r, 1500));
  const con = await foto();
  const movidos: number[] = [];
  for (let i = FIN_ENTRADAS; i < base.length; i++) {
    if (Math.abs(con[i]! - base[i]!) > 3) movidos.push(i - FIN_ENTRADAS);
  }
  console.log(`auxiliar ${aux + 1} arriba -> bytes relativos que se mueven: ${movidos.join(', ') || 'ninguno'}`);
  t.enviar(codificarSetd(`i.9.aux.${aux}.value`, previos.get(`i.9.aux.${aux}.value`) ?? 0));
  await new Promise((r) => setTimeout(r, 1200));
}

p.kill();
await t.desconectar();
console.log('envios de auxiliar devueltos a su valor anterior');
