/**
 * Tres preguntas que dejo abiertas el hallazgo del espectro:
 *  1. Que unidad tiene el byte de cada banda.
 *  2. Si `var.rta` es global --le cambia la pantalla al operador-- o por cliente.
 *  3. Si el analizador acepta salidas ademas de entradas.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport } from '@vse/mixer-adapter';

const FM = 48000, SEG = 8, HZ = 1000, BANDA = 67;
function tono(db: number): string {
  const n = FM * SEG, amp = Math.pow(10, db / 20) * 32767;
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
  const ruta = `/tmp/vse-rta-db${db}.wav`;
  writeFileSync(ruta, Buffer.concat([c, d]));
  return ruta;
}

const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();
let tramas: number[][] = [];
let rtaDelTestigo: string | null = null;
escritor.alRecibir((l) => { if (l.startsWith('RTA^')) tramas.push([...Buffer.from(l.slice(4), 'base64')]); });
testigo.alRecibir((l) => { if (l.startsWith('SETS^var.rta^')) rtaDelTestigo = l.split('^')[2] ?? ''; });
await escritor.conectar('192.168.0.78');
await testigo.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));

escritor.enviar('SETS^var.rta^i.9');
await new Promise((r) => setTimeout(r, 1500));
console.log(`2. el testigo vio var.rta = ${JSON.stringify(rtaDelTestigo)} -> ${rtaDelTestigo === 'i.9' ? 'ES GLOBAL: le cambia la pantalla a los demas' : 'no lo vio: seria por cliente'}`);

console.log('');
console.log('1. unidad del byte, con la banda de 1 kHz');
console.log('   fuente | byte de la banda 67 | paso');
let anterior: number | null = null;
for (const db of [-36, -30, -24, -18, -12, -6]) {
  const p = spawn('afplay', [tono(db)]);
  await new Promise((r) => setTimeout(r, 2000));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2000));
  p.kill();
  const v = tramas.reduce((s, t) => s + (t[BANDA] ?? 0), 0) / (tramas.length || 1);
  console.log(`   ${String(db).padStart(6)} | ${v.toFixed(1).padStart(19)} | ${anterior === null ? '—' : (v - anterior).toFixed(1)}`);
  anterior = v;
}

console.log('');
for (const fuente of ['m', 'a.0']) {
  escritor.enviar(`SETS^var.rta^${fuente}`);
  await new Promise((r) => setTimeout(r, 1500));
  const p = spawn('afplay', [tono(-12)]);
  await new Promise((r) => setTimeout(r, 2000));
  tramas = [];
  await new Promise((r) => setTimeout(r, 2000));
  p.kill();
  const activas = tramas[0]?.filter((v) => v > 0).length ?? 0;
  console.log(`3. var.rta = ${JSON.stringify(fuente)} -> ${activas} bandas con valor`);
}

escritor.enviar('SETS^var.rta^');
await new Promise((r) => setTimeout(r, 800));
await escritor.desconectar(); await testigo.desconectar();
