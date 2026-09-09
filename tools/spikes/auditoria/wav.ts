/** Generador de WAV PCM 16 bits propio. */
import { writeFileSync } from 'node:fs';

export function generarWav(
  ruta: string,
  opciones: { sr?: number; seg: number; freq: number; dbfs: number; canales?: number },
): void {
  const sr = opciones.sr ?? 48000;
  const canales = opciones.canales ?? 2;
  const n = Math.round(sr * opciones.seg);
  const amp = Math.pow(10, opciones.dbfs / 20) * 32767;
  const datos = Buffer.alloc(n * canales * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * opciones.freq * i) / sr));
    for (let c = 0; c < canales; c++) datos.writeInt16LE(v, (i * canales + c) * 2);
  }
  writeFileSync(ruta, cabecera(datos, sr, canales));
}

/** WAV con varios tramos concatenados (para barridos sin re-lanzar afplay). */
export function generarWavTramos(
  ruta: string,
  tramos: { seg: number; freq: number; dbfs: number }[],
  sr = 48000,
  canales = 2,
): void {
  const total = tramos.reduce((a, t) => a + Math.round(sr * t.seg), 0);
  const datos = Buffer.alloc(total * canales * 2);
  let off = 0;
  let fase = 0;
  for (const t of tramos) {
    const n = Math.round(sr * t.seg);
    const amp = t.dbfs <= -200 ? 0 : Math.pow(10, t.dbfs / 20) * 32767;
    for (let i = 0; i < n; i++) {
      fase += (2 * Math.PI * t.freq) / sr;
      const v = Math.round(amp * Math.sin(fase));
      for (let c = 0; c < canales; c++) datos.writeInt16LE(v, ((off + i) * canales + c) * 2);
    }
    off += n;
  }
  writeFileSync(ruta, cabecera(datos, sr, canales));
}

function cabecera(datos: Buffer, sr: number, canales: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + datos.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(canales, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * canales * 2, 28);
  h.writeUInt16LE(canales * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(datos.length, 40);
  return Buffer.concat([h, datos]);
}
