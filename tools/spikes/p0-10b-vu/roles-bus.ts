/**
 * Que es cada byte dentro del bloque de un bus.
 *
 * Ubicar la seccion no alcanza para leerla: hace falta saber cual de los bytes
 * del bloque es el nivel, y si hay uno anterior al fader y otro posterior como
 * pasa en los canales.
 *
 * El separador es el mismo que sirvio para los canales: con la fuente fija,
 * mover el fader del bus cambia lo de despues y deja quieto lo de antes. Los
 * bytes que siguen al fader son post; los que no se mueven, pre (o banderas).
 *
 * Escribe en la consola: asignacion de subgrupo, fader de subgrupo, envio y
 * fader de auxiliar. Anota el valor anterior de todo y lo devuelve al final.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const FIN_ENTRADAS = 8 + 6 * 24;
const SECCIONES = {
  subgrupo: { inicio: 12, ancho: 7 },
  auxiliar: { inicio: 82, ancho: 5 },
} as const;

const t = new Ui24rTransport();
let tramas: number[][] = [];
const previos = new Map<string, number>();
const VIGILADAS = /^(i\.9\.subgroup|i\.9\.aux\.0\.value|s\.0\.mix|a\.0\.mix)$/;
t.alRecibir((l) => {
  if (l.startsWith('VU2^')) { tramas.push([...Buffer.from(l.slice(4), 'base64')]); return; }
  if (!l.startsWith('SETD^')) return;
  const [, r, v] = l.split('^');
  if (r && VIGILADAS.test(r) && !previos.has(r)) previos.set(r, Number(v));
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

const bloque = (foto: number[], inicio: number, ancho: number): number[] =>
  Array.from({ length: ancho }, (_, k) => Math.round(foto[FIN_ENTRADAS + inicio + k] ?? 0));

const restaurar = async (): Promise<void> => {
  for (const [r, v] of previos) t.enviar(codificarSetd(r, v));
  await new Promise((r) => setTimeout(r, 1500));
};

try {
  for (const [nombre, { inicio, ancho }] of Object.entries(SECCIONES)) {
    console.log(`== ${nombre} 1 (relativos ${inicio}..${inicio + ancho - 1}) ==`);
    // Meter senal en el bus: el subgrupo por asignacion, el auxiliar por envio.
    if (nombre === 'subgrupo') t.enviar(codificarSetd('i.9.subgroup', 0));
    else t.enviar(codificarSetd('i.9.aux.0.value', 0.85));
    await new Promise((r) => setTimeout(r, 1500));

    const fader = nombre === 'subgrupo' ? 's.0.mix' : 'a.0.mix';
    const lecturas: { crudo: number; bytes: number[] }[] = [];
    for (const crudo of [0.7647058824, 0.55, 0.35]) {
      t.enviar(codificarSetd(fader, crudo));
      await new Promise((r) => setTimeout(r, 1500));
      lecturas.push({ crudo, bytes: bloque(await foto(), inicio, ancho) });
    }

    console.log(`  ${fader.padEnd(8)} | ${Array.from({ length: ancho }, (_, k) => `b${inicio + k}`.padStart(5)).join(' ')}`);
    for (const l of lecturas) {
      console.log(`  ${l.crudo.toFixed(4).padStart(8)} | ${l.bytes.map((b) => String(b).padStart(5)).join(' ')}`);
    }
    const primero = lecturas[0]!.bytes, ultimo = lecturas[lecturas.length - 1]!.bytes;
    const post = primero.map((b, k) => Math.abs(b - (ultimo[k] ?? 0)) > 3 ? inicio + k : -1).filter((k) => k >= 0);
    const vivos = primero.map((b, k) => b > 3 ? inicio + k : -1).filter((k) => k >= 0);
    console.log(`  siguen al fader (POST): ${post.join(', ') || 'ninguno'}`);
    console.log(`  con senal pero quietos (PRE o bandera): ${vivos.filter((k) => !post.includes(k)).join(', ') || 'ninguno'}`);
    console.log('');

    t.enviar(codificarSetd(fader, previos.get(fader) ?? 0.7647058824));
    if (nombre === 'subgrupo') t.enviar(codificarSetd('i.9.subgroup', previos.get('i.9.subgroup') ?? -1));
    else t.enviar(codificarSetd('i.9.aux.0.value', previos.get('i.9.aux.0.value') ?? 0));
    await new Promise((r) => setTimeout(r, 1200));
  }
} finally {
  p.kill();
  await restaurar();
  console.log('restaurado:');
  for (const [r, v] of previos) console.log(`  ${r} = ${v}`);
  await t.desconectar();
}
