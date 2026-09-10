/**
 * ¿Qué trae el flujo `RTA`?
 *
 * La consola lo manda treinta veces por segundo y la aplicación lo usa **sólo
 * como señal de vida**: cuenta que llegó y tira el contenido. Si adentro viene
 * el espectro por bandas, se abre el dominio de la frecuencia sin motor de
 * audio, sin micrófono de medición y sin esperar al control de paso G-B.
 *
 * Método: tonos de frecuencia conocida por una entrada, y mirar qué posiciones
 * de la trama se mueven. La trampa a evitar: `RTA` llega igual en silencio, así
 * que hay que comparar contra el fondo antes de afirmar nada.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport } from '@vse/mixer-adapter';

const FM = 48000; const SEG = 12; const DB = -12;
function tono(hz: number, ruta: string): void {
  const n = FM * SEG; const amp = Math.pow(10, DB / 20) * 32767;
  const datos = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  writeFileSync(ruta, Buffer.concat([c, datos]));
}

function aBytes(b64: string): number[] {
  return [...Buffer.from(b64, 'base64')];
}

const t = new Ui24rTransport();
let tramas: number[][] = [];
t.alRecibir((l) => { if (l.startsWith('RTA^')) tramas.push(aBytes(l.slice(4))); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));

const medir = async (etiqueta: string, hz: number | null): Promise<number[]> => {
  let p: ReturnType<typeof spawn> | null = null;
  if (hz !== null) { tono(hz, '/tmp/vse-rta.wav'); p = spawn('afplay', ['/tmp/vse-rta.wav']); }
  await new Promise((r) => setTimeout(r, 2500));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2500));
  p?.kill();
  const n = tramas[0]?.length ?? 0;
  const media = new Array(n).fill(0);
  for (const tr of tramas) for (let i = 0; i < n; i++) media[i] += tr[i]! / tramas.length;
  console.log(`${etiqueta}: ${tramas.length} tramas de ${n} bytes`);
  return media;
};

const fondo = await medir('silencio', null);
const resultados: { hz: number; media: number[] }[] = [];
for (const hz of [100, 1000, 10000]) {
  resultados.push({ hz, media: await medir(`${hz} Hz`, hz) });
}
await t.desconectar();

console.log('');
console.log('posiciones que mas suben respecto del silencio:');
for (const { hz, media } of resultados) {
  const subidas = media
    .map((v, i) => ({ i, d: v - (fondo[i] ?? 0) }))
    .filter((x) => x.d > 3)
    .sort((a, b) => b.d - a.d)
    .slice(0, 6);
  console.log(`  ${String(hz).padStart(5)} Hz -> ${subidas.map((s) => `[${s.i}] +${s.d.toFixed(0)}`).join('  ') || 'ninguna'}`);
}
