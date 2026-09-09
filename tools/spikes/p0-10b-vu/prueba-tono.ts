import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport, decodificarVuCanales, dbDeMedidor, VU_ESCALA } from '@vse/mixer-adapter';
const db = Number(process.argv[2] ?? '-20');
const canal = Number(process.argv[3] ?? '10');
const fm = 48000, segundos = 4, hz = 1000;
const n = Math.round(fm * segundos), amp = Math.pow(10, db / 20) * 32767;
const datos = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  const v = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / fm));
  datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
}
const c = Buffer.alloc(44);
c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
c.writeUInt32LE(fm, 24); c.writeUInt32LE(fm * 4, 28); c.writeUInt16LE(4, 32);
c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
writeFileSync('/tmp/vse-prueba.wav', Buffer.concat([c, datos]));
const t = new Ui24rTransport();
const bytes: number[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const m = decodificarVuCanales(l.slice(4))[canal - 1];
  if (m) bytes.push(Math.round(m.entrada / VU_ESCALA));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 500));
const antes = bytes.length;
await new Promise<void>((r) => { const p = spawn('afplay', ['/tmp/vse-prueba.wav']); p.on('exit', () => r()); });
await t.desconectar();
const u = bytes.slice(antes + 20);
const max = u.reduce((m, v) => Math.max(m, v), 0);
const med = u.reduce((s, v) => s + v, 0) / (u.length || 1);
console.log(`fuente ${db} dBFS -> canal ${canal}: byte medio ${med.toFixed(1)}, max ${max}`);
console.log(`  leido: ${dbDeMedidor(med * VU_ESCALA).toFixed(1)} dB (max ${dbDeMedidor(max * VU_ESCALA).toFixed(1)})`);
