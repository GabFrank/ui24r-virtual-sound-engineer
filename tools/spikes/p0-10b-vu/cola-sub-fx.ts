/**
 * Los 82 bytes que faltan de la cola: linea, subgrupos y efectos.
 *
 * Los auxiliares y el general ya estan fijados (cola-secciones.ts). Lo que
 * queda por delante de ellos son tres secciones seguidas y el mismo metodo las
 * separa: provocar senal SOLO en una y ver que bytes se mueven.
 *
 * - Efectos: se sube el envio `i.9.fx.N.value` del canal que tiene el tono.
 * - Subgrupos: se asigna el canal a un subgrupo con `i.9.subgroup`, cuya
 *   codificacion NO se conoce; por eso se prueban varios valores crudos y se
 *   mira cual mueve bytes distintos. Descubrir la codificacion es parte del
 *   resultado.
 *
 * Escribe en la consola. Ver "Que se puede tocar durante una sesion de
 * medicion" en docs/spikes/README.md: se anota el valor anterior de todo lo
 * que se toca y se devuelve al final, pase lo que pase.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const CABECERA = 8, FIN_ENTRADAS = CABECERA + 6 * 24;
/** Donde arrancan los auxiliares, ya medido: la cola desconocida es lo de antes. */
const INICIO_AUXILIARES = 82;
const UMBRAL = 3;

const t = new Ui24rTransport();
let tramas: number[][] = [];
const previos = new Map<string, number>();
const anotar = (r: string, v: number): void => { if (!previos.has(r)) previos.set(r, v); };

t.alRecibir((l) => {
  if (l.startsWith('VU2^')) { tramas.push([...Buffer.from(l.slice(4), 'base64')]); return; }
  if (!l.startsWith('SETD^')) return;
  const [, r, v] = l.split('^');
  if (r && (/^i\.9\.fx\.\d+\.value$/.test(r) || r === 'i.9.subgroup')) anotar(r, Number(v));
});

await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));

const p = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2000));

const foto = async (): Promise<number[]> => {
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  const n = tramas[0]?.length ?? 0;
  const m = new Array<number>(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) m[i] += (tr[i] ?? 0) / tramas.length;
  return m;
};

const movidos = (base: number[], con: number[]): number[] => {
  const xs: number[] = [];
  for (let i = FIN_ENTRADAS; i < FIN_ENTRADAS + INICIO_AUXILIARES; i++) {
    if (Math.abs((con[i] ?? 0) - (base[i] ?? 0)) > UMBRAL) xs.push(i - FIN_ENTRADAS);
  }
  return xs;
};

const base = await foto();
console.log(`largo de trama: ${base.length}; cola desconocida: relativos 0..${INICIO_AUXILIARES - 1}`);
console.log(`valores antes de tocar: subgroup=${previos.get('i.9.subgroup') ?? 'sin dato'}, `
  + `fx.0=${previos.get('i.9.fx.0.value') ?? 'sin dato'}`);
console.log('');

const restaurar = async (): Promise<void> => {
  for (const [r, v] of previos) t.enviar(codificarSetd(r, v));
  await new Promise((r) => setTimeout(r, 1500));
};

try {
  console.log('== efectos: se sube el envio del canal 10 a cada efecto ==');
  for (const fx of []) {
    const ruta = `i.9.fx.${fx}.value`;
    t.enviar(codificarSetd(ruta, 0.85));
    await new Promise((r) => setTimeout(r, 1500));
    const xs = movidos(base, await foto());
    console.log(`  efecto ${fx + 1} -> ${xs.join(', ') || 'ningun byte'}`);
    t.enviar(codificarSetd(ruta, previos.get(ruta) ?? 0));
    await new Promise((r) => setTimeout(r, 1200));
  }

  console.log('');
  console.log('== subgrupos: se prueba la codificacion de i.9.subgroup ==');
  // Sin saber si es indice, mascara de bits o fraccion, se barren candidatos y
  // se mira cual enciende bytes distintos. El patron de los que se mueven dice
  // que codificacion es.
  for (const crudo of [0]) {
    t.enviar(codificarSetd('i.9.subgroup', crudo));
    await new Promise((r) => setTimeout(r, 1500));
    const xs = movidos(base, await foto());
    console.log(`  subgroup=${String(crudo).padStart(2)} -> ${xs.join(', ') || 'ningun byte'}`);
    t.enviar(codificarSetd('i.9.subgroup', previos.get('i.9.subgroup') ?? 0));
    await new Promise((r) => setTimeout(r, 1000));
  }
} finally {
  p.kill();
  await restaurar();
  console.log('');
  console.log('restaurado:');
  for (const [r, v] of previos) console.log(`  ${r} = ${v}`);
  await t.desconectar();
}
