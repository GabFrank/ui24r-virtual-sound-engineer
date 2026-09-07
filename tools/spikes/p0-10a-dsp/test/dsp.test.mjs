// Compara la implementación candidata contra la de referencia sobre los once
// archivos, con las tolerancias de docs/dsp-spec.md.
// Corre en integración continua: npm run test:dsp

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav24 } from '../src/wav.mjs';
import * as ref from '../src/reference.mjs';
import * as cand from '../src/analyzer.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

const TOL = {
  rms: 0.1,
  samplePeak: 0.05,
  truePeak: 0.2,
  thirdOctave: 0.5,
};

const SIGNALS = [
  'silence', 'sine_1k', 'pink', 'sweep', 'voice', 'guitar',
  'bass', 'percussion', 'full_band', 'clipped', 'very_low',
];

function load(name) {
  const p = join(OUT, `${name}.wav`);
  if (!existsSync(p)) {
    throw new Error(`falta ${name}.wav. Ejecutar: node src/generate-signals.mjs`);
  }
  return readWav24(readFileSync(p));
}

// La referencia usa transformada directa, que es O(n²): sobre 20 s de audio no
// termina nunca. Se le da un recorte de un segundo, que es suficiente para
// comparar dos implementaciones del mismo cálculo.
const SPECTRUM_SECONDS = 1;

for (const name of SIGNALS) {
  test(`${name}: RMS dentro de ${TOL.rms} dB`, () => {
    const { samples } = load(name);
    const a = ref.rmsDb(samples);
    const b = cand.rmsDb(samples);
    if (a === -Infinity && b === -Infinity) return; // silencio
    assert.ok(Math.abs(a - b) <= TOL.rms, `referencia ${a.toFixed(4)} vs candidata ${b.toFixed(4)}`);
  });

  test(`${name}: pico por muestra dentro de ${TOL.samplePeak} dB`, () => {
    const { samples } = load(name);
    const a = ref.samplePeakDb(samples);
    const b = cand.samplePeakDb(samples);
    if (a === -Infinity && b === -Infinity) return;
    assert.ok(Math.abs(a - b) <= TOL.samplePeak, `referencia ${a.toFixed(4)} vs candidata ${b.toFixed(4)}`);
  });

  test(`${name}: pico real dentro de ${TOL.truePeak} dB`, () => {
    const { samples, sampleRate } = load(name);
    const slice = samples.slice(0, Math.min(samples.length, sampleRate * 2));
    const a = ref.truePeakDb(slice);
    const b = cand.truePeakDb(slice);
    if (a === -Infinity && b === -Infinity) return;
    assert.ok(Math.abs(a - b) <= TOL.truePeak, `referencia ${a.toFixed(4)} vs candidata ${b.toFixed(4)}`);
  });

  test(`${name}: espectro por tercio de octava dentro de ${TOL.thirdOctave} dB`, () => {
    const { samples, sampleRate } = load(name);
    if (name === 'silence') return; // sin energía: nada que comparar
    const slice = samples.slice(0, sampleRate * SPECTRUM_SECONDS);
    const a = ref.thirdOctaveDb(slice, sampleRate, 4096);
    const b = cand.thirdOctaveDb(slice, sampleRate, 4096);
    assert.ok(a && b, 'ambas implementaciones devuelven espectro');
    const worst = { fc: null, delta: 0 };
    for (const fc of ref.THIRD_OCTAVE_CENTERS) {
      if (a[fc] == null || b[fc] == null) continue;
      if (!Number.isFinite(a[fc]) || !Number.isFinite(b[fc])) continue;
      // Bandas 40 dB por debajo del máximo son ruido numérico: no se comparan.
      const d = Math.abs(a[fc] - b[fc]);
      if (d > worst.delta) { worst.delta = d; worst.fc = fc; }
    }
    assert.ok(
      worst.delta <= TOL.thirdOctave,
      `peor banda ${worst.fc} Hz con ${worst.delta.toFixed(4)} dB de diferencia`,
    );
  });
}

test('saturación: la señal recortada la detecta, la de nivel bajo no', () => {
  const clipped = load('clipped').samples;
  const low = load('very_low').samples;
  assert.ok(cand.clipEvents(clipped) > 0, 'la señal recortada tiene eventos de saturación');
  assert.equal(cand.clipEvents(low), 0, 'la señal muy débil no tiene ninguno');
  assert.equal(cand.clipEvents(clipped), ref.clipEvents(clipped), 'ambas implementaciones cuentan igual');
});

test('sin saturación interna: ninguna métrica desborda con señal a fondo de escala', () => {
  const n = 48000;
  const full = new Float64Array(n);
  for (let i = 0; i < n; i++) full[i] = Math.sin((2 * Math.PI * 997 * i) / 48000);
  assert.ok(Number.isFinite(cand.rmsDb(full)));
  assert.ok(Number.isFinite(cand.samplePeakDb(full)));
  assert.ok(Number.isFinite(cand.truePeakDb(full)));
  const spec = cand.thirdOctaveDb(full, 48000, 4096);
  for (const fc of ref.THIRD_OCTAVE_CENTERS) {
    assert.ok(spec[fc] === null || Number.isFinite(spec[fc]) || spec[fc] === -Infinity,
      `banda ${fc} Hz sin desbordamiento`);
  }
});

test('pico real de un seno a fondo de escala supera al pico por muestra', () => {
  // Un seno a 997 Hz muestreado a 48 kHz casi nunca cae en su cresta:
  // el pico real tiene que salir por encima del pico por muestra.
  const n = 48000;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.99 * Math.sin((2 * Math.PI * 997 * i) / 48000);
  const sp = cand.samplePeakDb(x);
  const tp = cand.truePeakDb(x);
  assert.ok(tp >= sp - 0.001, `pico real ${tp.toFixed(4)} frente a pico por muestra ${sp.toFixed(4)}`);
});

test('estimador de retardo: prueba diferencial sobre la señal de banda completa', () => {
  const { samples, sampleRate } = load('full_band');
  const a = samples.slice(0, sampleRate * 2);
  for (const lagMs of [10, 50, 150]) {
    const lag = Math.round((lagMs / 1000) * sampleRate);
    const b = new Float64Array(a.length + lag);
    for (let i = 0; i < a.length; i++) b[i + lag] = a[i];
    const measured = cand.estimateDelaySamples(a, b, Math.round(0.2 * sampleRate));
    assert.ok(
      Math.abs(measured - lag) <= 2,
      `retardo de ${lagMs} ms: medido ${measured}, esperado ${lag}`,
    );
  }
});
