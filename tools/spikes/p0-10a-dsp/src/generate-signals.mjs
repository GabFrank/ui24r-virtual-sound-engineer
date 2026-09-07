// Genera los once archivos de referencia de docs/dsp-spec.md.
// Determinista: mismo generador pseudoaleatorio con semilla fija, para que
// dos ejecuciones den archivos idénticos byte a byte.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWav24, clamp } from './wav.mjs';

const SR = 48000;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

// Generador congruencial: reproducible entre ejecuciones y entre máquinas.
function makeRandom(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const dbToLin = (db) => Math.pow(10, db / 20);

function silence(seconds) {
  return new Float64Array(Math.round(seconds * SR));
}

function sine(seconds, freq, levelDb) {
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  const a = dbToLin(levelDb);
  for (let i = 0; i < n; i++) out[i] = a * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

// Ruido rosa por el método de Voss-McCartney: caída de 3 dB por octava.
function pinkNoise(seconds, levelDb, seed = 7) {
  const rnd = makeRandom(seed);
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  const ROWS = 16;
  const rows = new Float64Array(ROWS);
  let running = 0;
  let counter = 0;
  for (let i = 0; i < n; i++) {
    counter++;
    // El índice de la fila a actualizar es la posición del bit menos significativo.
    let k = 0;
    let c = counter;
    while ((c & 1) === 0 && k < ROWS - 1) { c >>= 1; k++; }
    running -= rows[k];
    rows[k] = rnd() * 2 - 1;
    running += rows[k];
    out[i] = running / ROWS;
  }
  // Normaliza a RMS y luego aplica el nivel pedido.
  return applyRms(out, levelDb);
}

function logSweep(seconds, f1, f2, levelDb) {
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  const a = dbToLin(levelDb);
  const T = seconds;
  const K = (T * 2 * Math.PI * f1) / Math.log(f2 / f1);
  const L = Math.log(f2 / f1) / T;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = a * Math.sin(K * (Math.exp(L * t) - 1));
  }
  return out;
}

// Fuente armónica con envolvente por notas: la usan las señales instrumentales.
function harmonicSource(seconds, { f0, harmonics, decay, noteHz, noise = 0, seed = 3, levelDb }) {
  const rnd = makeRandom(seed);
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  const notePeriod = Math.round(SR / noteHz);
  for (let i = 0; i < n; i++) {
    const inNote = i % notePeriod;
    const env = Math.exp(-decay * (inNote / SR));
    let v = 0;
    for (let h = 1; h <= harmonics; h++) {
      v += (1 / Math.pow(h, 1.4)) * Math.sin((2 * Math.PI * f0 * h * i) / SR);
    }
    v = v * env + (rnd() * 2 - 1) * noise * env;
    out[i] = v;
  }
  return applyRms(out, levelDb);
}

function percussion(seconds, levelDb, seed = 11) {
  const rnd = makeRandom(seed);
  const n = Math.round(seconds * SR);
  const out = new Float64Array(n);
  const hitPeriod = Math.round(SR / 2.5); // 2,5 golpes por segundo
  for (let i = 0; i < n; i++) {
    const inHit = i % hitPeriod;
    const t = inHit / SR;
    const env = Math.exp(-28 * t);
    const body = Math.sin(2 * Math.PI * 72 * t) * Math.exp(-15 * t);
    const snap = (rnd() * 2 - 1) * Math.exp(-90 * t);
    out[i] = body * 0.7 + snap * 0.6;
    out[i] *= env > 0 ? 1 : 0;
  }
  return applyRms(out, levelDb);
}

function mixSignals(parts) {
  const n = Math.max(...parts.map((p) => p.length));
  const out = new Float64Array(n);
  for (const p of parts) for (let i = 0; i < p.length; i++) out[i] += p[i];
  return out;
}

function applyRms(x, targetDb) {
  let acc = 0;
  for (let i = 0; i < x.length; i++) acc += x[i] * x[i];
  const rms = Math.sqrt(acc / x.length);
  if (rms === 0) return x;
  const g = dbToLin(targetDb) / rms;
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

function hardClip(x, ceilingDb = -0.05) {
  const c = dbToLin(ceilingDb);
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = clamp(x[i], -c, c);
  return out;
}

const SIGNALS = {
  // nombre: [generador, descripción]
  silence:      () => silence(5),
  sine_1k:      () => sine(5, 1000, -20),
  pink:         () => pinkNoise(20, -20),
  sweep:        () => logSweep(10, 20, 20000, -20),
  voice:        () => harmonicSource(8, { f0: 196, harmonics: 24, decay: 1.2, noteHz: 2.2, noise: 0.05, levelDb: -22 }),
  guitar:       () => harmonicSource(8, { f0: 147, harmonics: 30, decay: 2.5, noteHz: 3.0, noise: 0.02, seed: 21, levelDb: -22 }),
  bass:         () => harmonicSource(8, { f0: 55, harmonics: 12, decay: 1.8, noteHz: 2.0, noise: 0.01, seed: 31, levelDb: -20 }),
  percussion:   () => percussion(8, -20),
  full_band:    () => applyRms(mixSignals([
                    harmonicSource(8, { f0: 196, harmonics: 24, decay: 1.2, noteHz: 2.2, noise: 0.05, levelDb: -26 }),
                    harmonicSource(8, { f0: 147, harmonics: 30, decay: 2.5, noteHz: 3.0, noise: 0.02, seed: 21, levelDb: -28 }),
                    harmonicSource(8, { f0: 55, harmonics: 12, decay: 1.8, noteHz: 2.0, noise: 0.01, seed: 31, levelDb: -26 }),
                    percussion(8, -28),
                  ]), -18),
  clipped:      () => hardClip(applyRms(pinkNoise(5, -6, 99), -4)),
  very_low:     () => pinkNoise(5, -60, 5),
};

mkdirSync(OUT, { recursive: true });
for (const [name, gen] of Object.entries(SIGNALS)) {
  const samples = gen();
  writeFileSync(join(OUT, `${name}.wav`), writeWav24(samples, SR));
  process.stdout.write(`${name}.wav  ${(samples.length / SR).toFixed(1)} s\n`);
}
process.stdout.write(`\n${Object.keys(SIGNALS).length} archivos en ${OUT}\n`);
