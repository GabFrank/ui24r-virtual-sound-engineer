// Implementación CANDIDATA. Es la que se porta a Kotlin para el motor nativo.
// Usa FFT radix-2 iterativa y acumuladores incrementales. Tiene que coincidir
// con reference.mjs dentro de las tolerancias de docs/dsp-spec.md.

import { THIRD_OCTAVE_CENTERS, groupThirdOctave } from './reference.mjs';

const dbFromLin = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export function rmsDb(x, from = 0, to = x.length) {
  let acc = 0;
  for (let i = from; i < to; i++) acc += x[i] * x[i];
  return dbFromLin(Math.sqrt(acc / (to - from)));
}

export function samplePeakDb(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > m) m = a;
  }
  return dbFromLin(m);
}

export function crestFactorDb(x) {
  return samplePeakDb(x) - rmsDb(x);
}

// Pico real por interpolación polifásica: cuatro filtros FIR precalculados,
// uno por fase. Equivale a sobremuestrear por cuatro, pero sin materializar
// la señal sobremuestreada, que es lo que hace falta en tiempo real.
const TP_TAPS = 48;
const TP_PHASES = 4;
const tpFilters = buildPolyphase(TP_PHASES, TP_TAPS);

function buildPolyphase(phases, taps) {
  const half = taps / 2;
  const out = [];
  for (let p = 0; p < phases; p++) {
    const frac = p / phases;
    const h = new Float64Array(taps);
    for (let k = -half; k < half; k++) {
      const t = k - frac;
      const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * (k + half)) / taps)
                     + 0.08 * Math.cos((4 * Math.PI * (k + half)) / taps);
      h[k + half] = s * w;
    }
    out.push(h);
  }
  return out;
}

export function truePeakDb(x) {
  const half = TP_TAPS / 2;
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a > m) m = a;
  }
  for (let p = 1; p < TP_PHASES; p++) {
    const h = tpFilters[p];
    for (let i = half; i < x.length - half; i++) {
      let acc = 0;
      for (let k = 0; k < TP_TAPS; k++) acc += x[i + k - half] * h[k];
      const a = acc < 0 ? -acc : acc;
      if (a > m) m = a;
    }
  }
  return dbFromLin(m);
}

// FFT radix-2 iterativa, en el sitio. n tiene que ser potencia de dos.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm;
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const hannCache = new Map();
function hann(n) {
  if (!hannCache.has(n)) {
    const w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    hannCache.set(n, w);
  }
  return hannCache.get(n);
}

export function powerSpectrum(x, fftSize, hop = fftSize / 2) {
  const w = hann(fftSize);
  let wPower = 0;
  for (let i = 0; i < fftSize; i++) wPower += w[i] * w[i];
  wPower /= fftSize;

  const bins = new Float64Array(fftSize / 2);
  let frames = 0;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  for (let start = 0; start + fftSize <= x.length; start += hop) {
    for (let i = 0; i < fftSize; i++) { re[i] = x[start + i] * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < fftSize / 2; k++) bins[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  if (frames === 0) return null;
  for (let k = 0; k < bins.length; k++) {
    bins[k] = bins[k] / frames / (fftSize * fftSize * wPower);
    if (k > 0) bins[k] *= 2;
  }
  return { bins, frames };
}

export function thirdOctaveDb(x, sampleRate, fftSize = 4096, hop = fftSize / 2) {
  const spec = powerSpectrum(x, fftSize, hop);
  if (!spec) return null;
  return groupThirdOctave(spec.bins, sampleRate, fftSize);
}

// Multirresolución: ventana larga bajo 100 Hz, corta por encima.
// Es lo que fija docs/dsp-spec.md.
export function thirdOctaveMultiRes(x, sampleRate) {
  const long = thirdOctaveDb(x, sampleRate, 32768);
  const short = thirdOctaveDb(x, sampleRate, 8192);
  const out = {};
  for (const fc of THIRD_OCTAVE_CENTERS) {
    const src = fc < 100 ? long : short;
    out[fc] = src ? src[fc] : null;
  }
  return out;
}

export function clipEvents(x, thresholdDb = -0.1, runLength = 3) {
  const t = Math.pow(10, thresholdDb / 20);
  let events = 0, run = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] < 0 ? -x[i] : x[i];
    if (a >= t) {
      if (++run === runLength) events++;
    } else run = 0;
  }
  return events;
}

export function noiseFloorDb(x, sampleRate, windowMs = 100) {
  const win = Math.round((windowMs / 1000) * sampleRate);
  const values = [];
  for (let s = 0; s + win <= x.length; s += win) values.push(rmsDb(x, s, s + win));
  if (values.length === 0) return rmsDb(x);
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.1)];
}

// Estimador de retardo por correlación cruzada. La precisión se verifica de
// forma diferencial: ver docs/dsp-spec.md.
export function estimateDelaySamples(a, b, maxLag) {
  let bestLag = 0;
  let bestVal = -Infinity;
  const n = Math.min(a.length, b.length);
  for (let lag = 0; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i < n - lag; i++) acc += a[i] * b[i + lag];
    if (acc > bestVal) { bestVal = acc; bestLag = lag; }
  }
  return bestLag;
}
