// Lectura y escritura de WAV PCM de 24 bits y de coma flotante de 32 bits.
// Suficiente para los archivos de referencia; no pretende cubrir el formato entero.

export function writeWav24(samples, sampleRate = 48000) {
  const n = samples.length;
  const dataBytes = n * 3;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 3, 28);
  buf.writeUInt16LE(3, 32);          // block align
  buf.writeUInt16LE(24, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  const FULL = 8388607; // 2^23 - 1
  for (let i = 0; i < n; i++) {
    let v = Math.round(clamp(samples[i], -1, 1) * FULL);
    if (v < 0) v += 0x1000000;
    const off = 44 + i * 3;
    buf[off] = v & 0xff;
    buf[off + 1] = (v >> 8) & 0xff;
    buf[off + 2] = (v >> 16) & 0xff;
  }
  return buf;
}

export function readWav24(buf) {
  const sampleRate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  if (bits !== 24) throw new Error(`se esperaban 24 bits, se leyeron ${bits}`);
  const dataSize = buf.readUInt32LE(40);
  const n = dataSize / 3;
  const out = new Float64Array(n);
  const FULL = 8388608; // 2^23
  for (let i = 0; i < n; i++) {
    const off = 44 + i * 3;
    let v = buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
    if (v & 0x800000) v -= 0x1000000;
    out[i] = v / FULL;
  }
  return { samples: out, sampleRate };
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
