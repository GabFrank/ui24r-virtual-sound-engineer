// Calcula las métricas de los once archivos con ambas implementaciones y
// escribe out/reference-values.json, que es la evidencia del spike.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav24 } from './wav.mjs';
import * as ref from './reference.mjs';
import * as cand from './analyzer.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const SIGNALS = ['silence', 'sine_1k', 'pink', 'sweep', 'voice', 'guitar',
  'bass', 'percussion', 'full_band', 'clipped', 'very_low'];

const fmt = (x) => (Number.isFinite(x) ? Number(x.toFixed(4)) : String(x));
const result = { generadoEl: new Date().toISOString(), tolerancias: { rms: 0.1, samplePeak: 0.05, truePeak: 0.2, thirdOctave: 0.5 }, señales: {} };

for (const name of SIGNALS) {
  const p = join(OUT, `${name}.wav`);
  if (!existsSync(p)) { console.error(`falta ${name}.wav`); process.exit(1); }
  const { samples, sampleRate } = readWav24(readFileSync(p));
  const slice2s = samples.slice(0, Math.min(samples.length, sampleRate * 2));

  const row = {
    duracionS: Number((samples.length / sampleRate).toFixed(2)),
    rmsDb: { referencia: fmt(ref.rmsDb(samples)), candidata: fmt(cand.rmsDb(samples)) },
    picoMuestraDb: { referencia: fmt(ref.samplePeakDb(samples)), candidata: fmt(cand.samplePeakDb(samples)) },
    picoRealDb: { referencia: fmt(ref.truePeakDb(slice2s)), candidata: fmt(cand.truePeakDb(slice2s)) },
    factorCrestaDb: fmt(cand.crestFactorDb(samples)),
    ruidoFondoDb: fmt(cand.noiseFloorDb(samples, sampleRate)),
    eventosSaturacion: cand.clipEvents(samples),
  };
  if (name !== 'silence') {
    const spec = cand.thirdOctaveMultiRes(samples, sampleRate);
    row.tercioOctavaDb = Object.fromEntries(
      Object.entries(spec).map(([fc, v]) => [fc, v == null ? null : fmt(v)]),
    );
  }
  result.señales[name] = row;
  console.log(`${name.padEnd(12)} RMS ${String(row.rmsDb.candidata).padStart(9)} dB  pico ${String(row.picoMuestraDb.candidata).padStart(9)} dB  saturación ${row.eventosSaturacion}`);
}

writeFileSync(join(OUT, 'reference-values.json'), JSON.stringify(result, null, 2));
console.log(`\nEscrito ${join(OUT, 'reference-values.json')}`);
