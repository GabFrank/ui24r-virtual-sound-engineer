// Implementación de REFERENCIA. Escrita directamente desde las definiciones de
// docs/dsp-spec.md, sin optimizar. Es lenta a propósito: su valor es ser obvia.
// No se porta a Kotlin. Sirve para comprobar que la implementación candidata
// no se equivoca de una forma que un test escrito por la misma cabeza no vería.

const dbFromLin = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

export function rmsDb(x, from = 0, to = x.length) {
  let acc = 0;
  for (let i = from; i < to; i++) acc += x[i] * x[i];
  return dbFromLin(Math.sqrt(acc / (to - from)));
}

export function samplePeakDb(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  return dbFromLin(m);
}

// Pico real por sobremuestreo por cuatro con interpolación sinc ventaneada.
// La recomendación de medición de sonoridad usa un filtro polifásico; aquí se
// usa una sinc directa con ventana de Blackman, que es más lenta y más obvia.
export function truePeakDb(x, oversample = 4, taps = 48) {
  let m = 0;
  const half = taps / 2;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  for (let phase = 1; phase < oversample; phase++) {
    const frac = phase / oversample;
    for (let i = half; i < x.length - half; i++) {
      let acc = 0;
      for (let k = -half; k < half; k++) {
        const t = k - frac;
        const s = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
        // Ventana de Blackman sobre la longitud del filtro.
        const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * (k + half)) / taps)
                       + 0.08 * Math.cos((4 * Math.PI * (k + half)) / taps);
        acc += x[i + k] * s * w;
      }
      const a = Math.abs(acc);
      if (a > m) m = a;
    }
  }
  return dbFromLin(m);
}

export function crestFactorDb(x) {
  return samplePeakDb(x) - rmsDb(x);
}

// Transformada discreta directa, O(n²). Solo se usa sobre ventanas cortas.
function dft(re, im) {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n / 2; k++) {
    let sr = 0, si = 0;
    for (let t = 0; t < n; t++) {
      const ang = (-2 * Math.PI * k * t) / n;
      const c = Math.cos(ang), s = Math.sin(ang);
      sr += re[t] * c - im[t] * s;
      si += re[t] * s + im[t] * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

// Espectro promediado por bandas de tercio de octava, sobre ventanas solapadas.
// fftSize pequeño a propósito: la referencia no busca resolución, busca ser
// verificable a mano.
export function thirdOctaveDb(x, sampleRate, fftSize = 4096, hop = fftSize / 2) {
  const w = hann(fftSize);
  let wPower = 0;
  for (let i = 0; i < fftSize; i++) wPower += w[i] * w[i];
  wPower /= fftSize;

  const bins = new Float64Array(fftSize / 2);
  let frames = 0;
  for (let start = 0; start + fftSize <= x.length; start += hop) {
    const re = new Float64Array(fftSize);
    const im = new Float64Array(fftSize);
    for (let i = 0; i < fftSize; i++) re[i] = x[start + i] * w[i];
    const spec = dft(re, im);
    for (let k = 0; k < fftSize / 2; k++) {
      bins[k] += (spec.re[k] * spec.re[k] + spec.im[k] * spec.im[k]);
    }
    frames++;
  }
  if (frames === 0) return null;
  // Normaliza: media entre tramas, potencia de la ventana, escala de la transformada.
  for (let k = 0; k < bins.length; k++) {
    bins[k] = bins[k] / frames / (fftSize * fftSize * wPower);
    if (k > 0) bins[k] *= 2; // energía del bin espejo
  }

  return groupThirdOctave(bins, sampleRate, fftSize);
}

export const THIRD_OCTAVE_CENTERS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
  12500, 16000, 20000,
];

export function groupThirdOctave(powerBins, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  const out = {};
  for (const fc of THIRD_OCTAVE_CENTERS) {
    const lo = fc / Math.pow(2, 1 / 6);
    const hi = fc * Math.pow(2, 1 / 6);
    const kLo = Math.max(1, Math.ceil(lo / binHz));
    const kHi = Math.min(powerBins.length - 1, Math.floor(hi / binHz));
    if (kHi < kLo) { out[fc] = null; continue; }
    let acc = 0;
    for (let k = kLo; k <= kHi; k++) acc += powerBins[k];
    out[fc] = acc > 0 ? 10 * Math.log10(acc) : -Infinity;
  }
  return out;
}

// Saturación por audio: tres muestras consecutivas por encima de -0,1 dBFS.
export function clipEvents(x, thresholdDb = -0.1, runLength = 3) {
  const t = Math.pow(10, thresholdDb / 20);
  let events = 0, run = 0;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= t) {
      run++;
      if (run === runLength) events++;
    } else {
      run = 0;
    }
  }
  return events;
}

// Ruido de fondo: percentil 10 de la energía por ventana, expresado en dB.
export function noiseFloorDb(x, sampleRate, windowMs = 100) {
  const win = Math.round((windowMs / 1000) * sampleRate);
  const values = [];
  for (let s = 0; s + win <= x.length; s += win) values.push(rmsDb(x, s, s + win));
  if (values.length === 0) return rmsDb(x);
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.1)];
}
