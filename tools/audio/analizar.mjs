#!/usr/bin/env node
/**
 * Qué hay en un WAV capturado: el nivel del tono, el piso, y cuánto separa uno
 * del otro.
 *
 * **Por qué el pico no alcanza, y es la diferencia entre poder medir y no.**
 * El pico de una señal con ruido es el pico de la suma: cuando el tono baja
 * hasta el orden del ruido, el pico deja de bajar y el barrido se aplana. Con
 * el piso medido acá —unos −55 dBFS en el general— un barrido por pico tendría
 * unos 33 dB de recorrido útil desde el nivel de trabajo, y eso es justo lo que
 * le faltó a la primera corrida de la medición 94 para decidir nada.
 *
 * **Medir el tono en su frecuencia cambia eso.** Correlacionando con el seno y
 * el coseno de 1 kHz —que es el algoritmo de Goertzel, una DFT de un solo bin—
 * el ruido que no está en esa frecuencia no entra en la cuenta. Con cuatro
 * segundos a 48 kHz el bin es de 0,25 Hz de ancho, así que rechaza casi todo el
 * ruido de banda ancha y el recorrido útil pasa de treinta y pico de decibeles
 * a bastante más.
 *
 * **Y es el mismo dato, medido mejor**: no es un truco para ver lo que no está.
 * Si el tono se fue, el bin da cero igual.
 *
 * **Lo que este analizador NO hace**: no dice nada sobre dBFS absolutos de la
 * consola. Mide lo que llegó a la interfaz, y entre la salida de la consola y
 * esto hay una ganancia de entrada que nadie midió. Sirve para **diferencias**
 * por un camino que no se toca, que es lo que las leyes necesitan.
 *
 * Uso:
 *   node tools/audio/analizar.mjs <archivo.wav> [frecuencia] [--json]
 */
import { readFileSync } from 'node:fs';

/**
 * Lee un WAV PCM float32 entrelazado, recorriendo los trozos de verdad.
 *
 * **No busca la cadena `data` con `indexOf`.** Eso encuentra la primera
 * aparición, que puede caer dentro de un trozo `JUNK` o hasta dentro del audio,
 * y devuelve basura con forma de señal. Los archivos que escribe `AVAudioFile`
 * traen un `JUNK` de relleno antes del `fmt `, así que el caso no es teórico.
 */
function leerWav(ruta) {
  const d = readFileSync(ruta);
  if (d.length < 12 || d.toString('ascii', 0, 4) !== 'RIFF'
      || d.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${ruta} no es un WAV: no empieza con RIFF....WAVE`);
  }
  let o = 12;
  let fmt = null;
  let datos = null;
  while (o + 8 <= d.length) {
    const id = d.toString('ascii', o, o + 4);
    const largo = d.readUInt32LE(o + 4);
    const cuerpo = d.subarray(o + 8, Math.min(o + 8 + largo, d.length));
    if (id === 'fmt ') {
      fmt = {
        formato: cuerpo.readUInt16LE(0),
        canales: cuerpo.readUInt16LE(2),
        frecuencia: cuerpo.readUInt32LE(4),
        bits: cuerpo.readUInt16LE(14),
      };
    } else if (id === 'data') {
      datos = cuerpo;
    }
    // Los trozos se alinean a dos bytes.
    o += 8 + largo + (largo % 2);
  }
  if (fmt === null) throw new Error(`${ruta} no tiene trozo fmt`);
  if (datos === null) throw new Error(`${ruta} no tiene trozo data`);
  if (fmt.formato !== 3 || fmt.bits !== 32) {
    throw new Error(`${ruta} no es float32 (formato ${fmt.formato}, ${fmt.bits} bits). `
      + 'Este analizador no convierte nada a proposito: cada conversion es una '
      + 'oportunidad de meter un error de escala.');
  }
  const porCuadro = fmt.canales * 4;
  const cuadros = Math.floor(datos.length / porCuadro);
  if (cuadros === 0) {
    throw new Error(`${ruta} tiene el trozo data vacio. Si el archivo pesa pero `
      + 'dice cero, la cabecera no se cerro: el grabador tiene una guarda para eso.');
  }
  const canales = Array.from({ length: fmt.canales }, () => new Float32Array(cuadros));
  for (let k = 0; k < cuadros; k++) {
    for (let c = 0; c < fmt.canales; c++) {
      canales[c][k] = datos.readFloatLE(k * porCuadro + c * 4);
    }
  }
  return { ...fmt, cuadros, canales };
}

const dB = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

/**
 * La amplitud de un tono en una frecuencia, por correlación.
 *
 * Es Goertzel: se acumula la proyección de la señal sobre el seno y el coseno
 * de la frecuencia buscada, y el módulo de esos dos da la amplitud. El ruido que
 * no está en esa frecuencia se promedia a cero.
 *
 * **Se usa una ventana de Hann.** Sin ventana, que la frecuencia no caiga justo
 * en un bin entero derrama energía a los costados y subestima la amplitud hasta
 * 3,9 dB: el error más grande de toda la cadena, y silencioso. Con Hann la
 * pérdida por desalineación baja a 1,4 dB y se compensa por la ganancia
 * coherente de la ventana, que es 0,5.
 */
function amplitudDelTono(x, frecuencia, fm) {
  const n = x.length;
  const w = (2 * Math.PI * frecuencia) / fm;
  let re = 0;
  let im = 0;
  for (let i = 0; i < n; i++) {
    // Hann, calculada en línea para no reservar otro arreglo del largo de la señal.
    const v = x[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    re += v * Math.cos(w * i);
    im += v * Math.sin(w * i);
  }
  // 2/n por la mitad negativa del espectro, y /0,5 por la ganancia coherente
  // de Hann.
  return (2 * Math.hypot(re, im)) / n / 0.5;
}

/** El nivel eficaz de todo lo que hay. */
function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/** El pico, con un bucle: `Math.max(...x)` revienta la pila con 192.000 muestras. */
function pico(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  return m;
}

const [, , ruta, frecuenciaCruda, ...resto] = process.argv;
if (ruta === undefined) {
  console.error('uso: node tools/audio/analizar.mjs <archivo.wav> [frecuencia] [--json]');
  process.exit(2);
}
const frecuencia = frecuenciaCruda === undefined || frecuenciaCruda.startsWith('--')
  ? 1000 : Number(frecuenciaCruda);
if (!Number.isFinite(frecuencia) || frecuencia <= 0) {
  console.error(`frecuencia invalida: ${frecuenciaCruda}`);
  process.exit(2);
}
const comoJson = resto.includes('--json') || frecuenciaCruda === '--json';

const w = leerWav(ruta);
const salida = {
  archivo: ruta,
  frecuencia,
  frecuenciaDeMuestreo: w.frecuencia,
  cuadros: w.cuadros,
  segundos: w.cuadros / w.frecuencia,
  // El ancho del bin: con cuatro segundos son 0,25 Hz, y eso es lo que rechaza
  // el ruido de banda ancha.
  anchoDelBinHz: w.frecuencia / w.cuadros,
  canales: w.canales.map((x) => {
    const tono = amplitudDelTono(x, frecuencia, w.frecuencia);
    const total = rms(x);
    // Lo que queda cuando se saca el tono: potencia total menos la del tono.
    // Puede dar negativo por redondeo cuando el tono es todo lo que hay.
    const potenciaRuido = Math.max(0, total * total - (tono * tono) / 2);
    return {
      tonoDb: dB(tono),
      picoDb: dB(pico(x)),
      rmsDb: dB(total),
      ruidoDb: dB(Math.sqrt(potenciaRuido)),
      recorteExacto: pico(x) >= 1.0,
    };
  }),
};

if (comoJson) {
  console.log(JSON.stringify(salida, null, 2));
} else {
  console.log(`${ruta}`);
  console.log(`  ${w.canales.length} canales, ${w.frecuencia} Hz, `
    + `${salida.segundos.toFixed(2)} s, bin de ${salida.anchoDelBinHz.toFixed(3)} Hz`);
  console.log(`  tono buscado: ${frecuencia} Hz`);
  console.log('');
  console.log('  canal |  tono   |  pico   |   RMS   |  ruido  | tono-ruido');
  salida.canales.forEach((c, i) => {
    const f = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(7) : '   -inf');
    const margen = Number.isFinite(c.tonoDb) && Number.isFinite(c.ruidoDb)
      ? (c.tonoDb - c.ruidoDb).toFixed(1).padStart(6) : '     -';
    console.log(`   ${String(i + 1).padStart(4)} | ${f(c.tonoDb)} | ${f(c.picoDb)} | `
      + `${f(c.rmsDb)} | ${f(c.ruidoDb)} | ${margen} dB`
      + (c.recorteExacto ? '   RECORTA' : ''));
  });
  console.log('');
  console.log('  El margen tono-ruido es el recorrido que queda antes de que el');
  console.log('  ruido se coma la señal. Medido en el bin, no por pico.');
}
