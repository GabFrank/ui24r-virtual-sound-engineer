/**
 * La ley de bandas del analizador cuando mira EL GENERAL.
 *
 * Medido antes: con `var.rta = i.N` son 122 bandas de un doceavo de octava,
 * con `banda = 67 + 12*log2(f/1000)`. Con `var.rta = m` la consola devuelve
 * 78 bandas, y la ley NO tiene por que ser la misma: 78 bandas para la misma
 * banda audible serian un octavo de octava, no un doceavo.
 *
 * Hace falta para la deteccion de realimentacion sobre el general: sin esto se
 * puede decir "hay una banda sostenida" pero no en que frecuencia, que es
 * justo el dato que el operador necesita para actuar.
 *
 * Toma prestado el analizador con tomarAnalizador() y lo devuelve.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport, Ui24rMixerAdapter, decodificarEspectro } from '@vse/mixer-adapter';

const FM = 48000, SEG = 12;
function tono(hz: number): string {
  const n = FM * SEG, amp = Math.pow(10, -12 / 20) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin(2 * Math.PI * hz * i / FM));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  const r = `/tmp/t-${hz}.wav`; writeFileSync(r, Buffer.concat([c, d])); return r;
}

const t = new Ui24rTransport();
const a = new Ui24rMixerAdapter(t);
let ultimo: readonly number[] = [];
await a.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
console.log(`fuente original del analizador: ${JSON.stringify(a.fuenteOriginalDelAnalizador())}`);
a.alEspectro((b) => { ultimo = b; });

try {
  a.tomarAnalizador('m');
  await new Promise((r) => setTimeout(r, 2000));
  console.log('\n  Hz  | bandas | pico en la banda');
  for (const hz of [125, 250, 500, 1000, 2000, 4000, 8000]) {
    const p = spawn('afplay', [tono(hz)]);
    await new Promise((r) => setTimeout(r, 3500));
    const pico = ultimo.reduce((mejor, v, i) => v > (ultimo[mejor] ?? -1) ? i : mejor, 0);
    console.log(`${String(hz).padStart(5)} | ${String(ultimo.length).padStart(6)} | ${pico}`);
    p.kill();
    await new Promise((r) => setTimeout(r, 800));
  }
} finally {
  a.devolverAnalizador();
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`\nanalizador devuelto a ${JSON.stringify(a.fuenteOriginalDelAnalizador())}`);
  await a.desconectar();
}
