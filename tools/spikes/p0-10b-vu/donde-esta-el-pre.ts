/**
 * ¿Dónde está tomado el primer medidor de cada canal?
 *
 * Ya se sabe que es anterior al procesamiento dinámico: con el compresor
 * apretando 5 dB, `entrada` bajó y `pre` no se movió. Falta lo otro: si está
 * antes o después de la ganancia del previo. La diferencia decide qué debe
 * mirar el asistente de ganancia — un medidor anterior al previo no sirve para
 * ajustar el previo.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, gananciaADb, rawParaGananciaMasCercana } from '@vse/mixer-adapter';

const canal = 10; const n = canal - 1;

// El tono se genera aca y no se reusa un archivo de otra corrida: una corrida
// muda es indistinguible de una medicion valida con la senal en el piso.
const FM = 48000; const HZ = 1000; const SEG = 45; const DB = -12;
{
  const muestras = FM * SEG;
  const amp = Math.pow(10, DB / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  writeFileSync('/tmp/vse-pre.wav', Buffer.concat([c, datos]));
}
const t = new Ui24rTransport();
let pres: number[] = []; let ents: number[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const m = decodificarVuCanales(l.slice(4))[canal - 1];
  if (m) { pres.push(dbDeMedidor(m.pre)); ents.push(dbDeMedidor(m.entrada)); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));
const p = spawn('afplay', ['/tmp/vse-pre.wav']);
await new Promise((r) => setTimeout(r, 2000));
console.log('ganancia | pre    | entrada | ambos se mueven con la ganancia?');
const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
let anterior: { pre: number; ent: number; g: number } | null = null;
for (const objetivo of [10, 16, 22, 28]) {
  const crudo = rawParaGananciaMasCercana(objetivo);
  t.enviar(codificarSetd(`hw.${n}.gain`, crudo));
  await new Promise((r) => setTimeout(r, 1500));
  pres = []; ents = [];
  await new Promise((r) => setTimeout(r, 2500));
  const pre = media(pres); const ent = media(ents);
  const nota = anterior === null ? '' :
    `pre subio ${(pre - anterior.pre).toFixed(2)}, entrada subio ${(ent - anterior.ent).toFixed(2)}, ganancia subio ${(gananciaADb(crudo) - anterior.g).toFixed(1)}`;
  console.log(`${gananciaADb(crudo).toFixed(0).padStart(8)} | ${pre.toFixed(2).padStart(6)} | ${ent.toFixed(2).padStart(7)} | ${nota}`);
  anterior = { pre, ent, g: gananciaADb(crudo) };
}
p.kill();
t.enviar(codificarSetd(`hw.${n}.gain`, 0.2508445026));
await new Promise((r) => setTimeout(r, 1000));
await t.desconectar();
console.log('ganancia restaurada');
