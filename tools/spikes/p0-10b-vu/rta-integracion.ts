/**
 * Cuanto promedia cada trama del espectro.
 *
 * Es el cimiento de cualquier deteccion de realimentacion: sin saber el tiempo
 * de integracion, "esta banda crecio durante dos segundos" no distingue una
 * senal que crece de un promedio que arrastra.
 *
 * Metodo: rafagas de tono, y cronometrar cuanto tarda la banda en subir a su
 * meseta y cuanto en caer. La resolucion la pone la cadencia de las tramas,
 * ~33 ms, y nada por debajo de eso se puede afirmar.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport } from '@vse/mixer-adapter';
import { tomarAnalizador } from './analizador.ts';

const FM = 48000, HZ = 1000, BANDA = 67, MS_TONO = 2000, MS_SILENCIO = 3000;
function tono(ms: number): string {
  const n = Math.round((FM * ms) / 1000), amp = Math.pow(10, -12 / 20) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * HZ * i) / FM));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  writeFileSync('/tmp/vse-rta-rafaga.wav', Buffer.concat([c, d]));
  return '/tmp/vse-rta-rafaga.wav';
}

const t = new Ui24rTransport();
let serie: { ms: number; v: number }[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('RTA^')) return;
  const b = Buffer.from(l.slice(4), 'base64');
  serie.push({ ms: Date.now(), v: b[BANDA] ?? 0 });
});
const analizador = tomarAnalizador(t);
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 2500));
analizador.apuntarA('i.9');
await new Promise((r) => setTimeout(r, 1200));
const ruta = tono(MS_TONO);

console.log('rafaga | meseta | subida al 90% | caida de 20 dB | tramas/s');
const subidas: number[] = []; const caidas: number[] = [];
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, MS_SILENCIO));
  serie = [];
  const p = spawn('afplay', [ruta]);
  await new Promise((r) => setTimeout(r, MS_TONO + 2500));
  p.kill();

  const meseta = Math.max(...serie.map((s) => s.v));
  const cadencia = serie.length / ((serie[serie.length - 1]!.ms - serie[0]!.ms) / 1000);
  const primeraConSenal = serie.find((s) => s.v > 3);
  const al90 = serie.find((s) => s.v >= meseta * 0.9);
  const subida = primeraConSenal && al90 ? al90.ms - primeraConSenal.ms : null;
  const ultimaAlta = [...serie].reverse().find((s) => s.v >= meseta * 0.9);
  // 20 dB son 53 bytes con la escala de 0,375 dB por byte.
  const caida = ultimaAlta ? serie.find((s) => s.ms > ultimaAlta.ms && s.v <= meseta - 53) : undefined;
  const msCaida = ultimaAlta && caida ? caida.ms - ultimaAlta.ms : null;
  if (subida !== null) subidas.push(subida);
  if (msCaida !== null) caidas.push(msCaida);
  console.log(
    `${String(i + 1).padStart(6)} | ${String(meseta).padStart(6)} | `
    + `${(subida === null ? 'sin dato' : `${subida} ms`).padStart(13)} | `
    + `${(msCaida === null ? 'sin dato' : `${msCaida} ms`).padStart(14)} | ${cadencia.toFixed(1)}`,
  );
}
const mediana = (xs: number[]): string => {
  if (xs.length === 0) return 'sin datos';
  const o = [...xs].sort((a, b) => a - b);
  return `${o[Math.floor(o.length / 2)]} ms (min ${o[0]}, max ${o[o.length - 1]})`;
};
console.log('');
console.log(`subida:  ${mediana(subidas)}`);
console.log(`caida:   ${mediana(caidas)}`);
analizador.devolver();
console.log(`fuente del analizador devuelta a ${JSON.stringify(analizador.anterior)}, que es lo que habia`);
await new Promise((r) => setTimeout(r, 800));
await t.desconectar();
