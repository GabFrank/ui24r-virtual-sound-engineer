/**
 * El medidor del subgrupo, ¿es anterior al fader o la escritura no tomo efecto?
 *
 * Al mapear la cola quedo esto sin cerrar: mover `s.0.mix` no movio ninguno de
 * los siete bytes del bloque del subgrupo 1, mientras que en el auxiliar el
 * byte +1 si sigue a `a.0.mix`. Hay dos explicaciones incompatibles y desde la
 * conexion que escribe no se distinguen, porque la consola no le devuelve eco
 * a quien escribe: o el medidor es entero anterior al fader, o la escritura no
 * llego a aplicarse.
 *
 * El testigo las separa. Si el testigo VE cambiar s.0.mix y los bytes siguen
 * quietos, el medidor es pre-fader. Si el testigo no lo ve, el problema es la
 * escritura y el mapa no dice nada del medidor.
 *
 * Escribe en la consola: asignacion de subgrupo del canal 10 y fader del
 * subgrupo 1. Anota los valores anteriores y los devuelve.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const FIN_ENTRADAS = 8 + 6 * 24;
const INICIO_SUB1 = 12, ANCHO = 7;

const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();

const previos = new Map<string, number>();
const VIGILADAS = /^(i\.9\.subgroup|s\.0\.mix|s\.0\.mute)$/;
let tramas: number[][] = [];
const vistoPorTestigo: { ruta: string; valor: number; enMs: number }[] = [];

escritor.alRecibir((l) => {
  if (l.startsWith('VU2^')) { tramas.push([...Buffer.from(l.slice(4), 'base64')]); return; }
  const [c, r, v] = l.split('^');
  if (c === 'SETD' && r && VIGILADAS.test(r) && !previos.has(r)) previos.set(r, Number(v));
});
testigo.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if (c === 'SETD' && r && VIGILADAS.test(r)) vistoPorTestigo.push({ ruta: r, valor: Number(v), enMs: Date.now() });
});

await escritor.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));
await testigo.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));

const foto = async (): Promise<number[]> => {
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  const n = tramas[0]?.length ?? 0;
  const m = new Array<number>(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) m[i] += (tr[i] ?? 0) / tramas.length;
  return m.map(Math.round);
};
const bloque = (f: number[]): number[] =>
  Array.from({ length: ANCHO }, (_, k) => f[FIN_ENTRADAS + INICIO_SUB1 + k] ?? 0);

const sonando = spawn('afplay', ['/tmp/vse-comp.wav']);
await new Promise((r) => setTimeout(r, 2000));

try {
  console.log(`valores en reposo: subgroup=${previos.get('i.9.subgroup') ?? '?'}, `
    + `s.0.mix=${previos.get('s.0.mix') ?? '?'}`);

  escritor.enviar(codificarSetd('i.9.subgroup', 0));
  // **Y hay que quitarle el silencio.** La primera corrida concluyo "el medidor
  // es pre-fader" porque el fader no movia nada; lo que pasaba es que s.0.mute
  // valia 1, asi que los bytes POST estaban en cero y no habia nada que mover.
  // Se miraban los bytes equivocados.
  escritor.enviar(codificarSetd('s.0.mute', 0));
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`canal 10 asignado al subgrupo 1; bloque = ${bloque(await foto()).join(' ')}`);
  console.log('');
  console.log('El bloque, segun parseVUdata:  +0 preL  +1 preR  +2 postL  +3 postR  +4/+5 dinamico  +6 reduccion');
  console.log('fader del subgrupo | el testigo lo vio | preL preR postL postR din din red');

  for (const crudo of [0.7647058824, 0.45, 0.15]) {
    vistoPorTestigo.length = 0;
    escritor.enviar(codificarSetd('s.0.mix', crudo));
    await new Promise((r) => setTimeout(r, 2500));
    const visto = vistoPorTestigo.filter((v) => v.ruta === 's.0.mix');
    const b = bloque(await foto());
    console.log(`${crudo.toFixed(4).padStart(18)} | ${(visto.length > 0 ? `SI (${visto[visto.length - 1]!.valor})` : 'NO').padEnd(17)} | ${b.join(' ')}`);
  }
} finally {
  sonando.kill();
  for (const [r, v] of previos) escritor.enviar(codificarSetd(r, v));
  await new Promise((r) => setTimeout(r, 2000));
  console.log('');
  console.log('restaurado:');
  for (const [r, v] of previos) console.log(`  ${r} = ${v}`);
  await escritor.desconectar();
  await testigo.desconectar();
}
