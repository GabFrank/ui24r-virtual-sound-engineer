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
export function leerWav(ruta) {
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

export const dB = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);

/**
 * La amplitud de un tono en una frecuencia, por correlación.
 *
 * Es Goertzel: se acumula la proyección de la señal sobre el seno y el coseno
 * de la frecuencia buscada, y el módulo de esos dos da la amplitud. El ruido que
 * no está en esa frecuencia se promedia a cero.
 *
 * **Se usa una ventana de Hann, y no por lo que este docblock decía.** Afirmaba
 * que sin ventana la desalineación del tono respecto de la rejilla de bins
 * subestima la amplitud hasta 3,9 dB, y que Hann la baja a 1,4 dB. **Eso no
 * describe este código.** Goertzel evalúa la correlación en la frecuencia
 * **exacta** que se le pide, no en un bin de una rejilla, así que no hay
 * desalineación que perder: medido con seis largos de registro y frecuencias
 * con parte fraccionaria de ciclo, un tono solo da **0,000 dB de error con
 * ventana y sin ventana**. Lo encontró una auditoría del ítem 105 el 2026-09-13.
 *
 * Lo que la ventana compra de verdad es **rechazo de lo que NO está en la
 * frecuencia pedida**, y es enorme. Con un tono débil en 1 kHz a −80 dB y otro
 * a nivel pleno cerca, en un registro de 4 s (bin de 0,25 Hz):
 *
 * | el interferente, a | sin ventana | con Hann |
 * |---|---|---|
 * | 2,9 Hz (11,5 bins) | **+48,8 dB** de error | 9,1 dB |
 * | 10,1 Hz (40,5 bins) | +37,9 dB | 0,27 dB |
 * | 50,1 Hz (200,5 bins) | +23,7 dB | 0,002 dB |
 *
 * Los lóbulos laterales del rectángulo caen tan despacio que un interferente a
 * cincuenta hercios todavía arruina la medición. **Y separaciones que son un
 * múltiplo entero del bin dan cero de error sin ventana**, que es la trampa: una
 * prueba con números redondos no ve nada.
 *
 * Este banco vive en ese régimen. La fuga que mide el ítem 105 está 79 dB por
 * debajo de un tono que suena al mismo tiempo.
 *
 * El `/0,5` del final compensa la ganancia coherente de Hann. Sacar la ventana
 * **y** ese divisor a la vez es la mutación que las pruebas de tono puro no
 * pueden ver, y por eso hay una prueba con interferente.
 */
export function amplitudDelTono(x, frecuencia, fm) {
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
export function rms(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/** El pico, con un bucle: `Math.max(...x)` revienta la pila con 192.000 muestras. */
export function pico(x) {
  let m = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > m) m = a;
  }
  return m;
}

/**
 * El piso de ruido alrededor de una frecuencia, **promediando muchos bins**.
 *
 * **Por qué no alcanza con mirar un bin.** El valor de un bin aislado de ruido de
 * banda ancha no es «el piso»: es una muestra de una variable aleatoria. Parte
 * real y parte imaginaria son gaussianas independientes, así que la potencia sale
 * exponencial y en decibeles eso tiene una desviación de **5,6 dB** y una cola
 * que baja sin fondo — cuando el número complejo cae cerca del cero, el bin
 * informa un silencio que no existe.
 *
 * **Y se vio.** Dos tomas del mismo silencio, con diez minutos de diferencia y
 * nada tocado en el medio, dieron **−106,70 y −136,12 dBFS**. Treinta decibeles.
 * De ese número cuelga la guarda que decide qué puntos de una medición valen: con
 * el piso subestimado la guarda deja pasar puntos que el ruido está moviendo, y
 * con el piso sobrestimado anula puntos buenos.
 *
 * Promediando la **potencia** de `BINS_DEL_PISO` bins a cada lado, la desviación
 * baja con la raíz del número de bins: con 40, a unos 0,7 dB.
 *
 * **Se saltea la falda del tono.** La ventana de Hann derrama a los dos bins
 * vecinos, así que el promedio arranca `BINS_DE_GUARDA` más allá; si no, lo que
 * se mediría como piso sería el propio tono.
 */
const BINS_DEL_PISO = 20;
const BINS_DE_GUARDA = 4;

export function pisoDelBin(x, frecuencia, fm, { bins = BINS_DEL_PISO } = {}) {
  const anchoDelBin = fm / x.length;
  let potencia = 0;
  let n = 0;
  for (let k = BINS_DE_GUARDA; k < BINS_DE_GUARDA + bins; k++) {
    for (const signo of [1, -1]) {
      const f = frecuencia + signo * k * anchoDelBin;
      if (f <= 0 || f >= fm / 2) continue;
      const a = amplitudDelTono(x, f, fm);
      potencia += a * a;
      n += 1;
    }
  }
  return n === 0 ? 0 : Math.sqrt(potencia / n);
}

/**
 * El análisis completo de un archivo, que es lo que las mediciones importan.
 *
 * Se separó de la interfaz de línea de órdenes cuando la medición 99b necesitó
 * llamarlo cuarenta y ocho veces: pasar por un subproceso y volver a leer el
 * archivo en cada punto era lento y, peor, ponía un formateo de texto en el
 * medio de un dato numérico.
 */
export function analizar(ruta, frecuencia = 1000) {
  const w = leerWav(ruta);
  return {
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
      const p = pico(x);
      // **El ruido DENTRO del bin, medido y no deducido.**
      //
      // El ruido de banda ancha no es lo que limita esta medición: una medición
      // en un bin de 0,25 Hz sólo compite con el ruido que cae en ese bin, que
      // está unos 50 dB más abajo. Usar el de banda ancha como criterio anula
      // puntos perfectamente medibles --en el banco del 2026-09-12 daba 25 dB de
      // recorrido útil donde hay 95.
      //
      // Se mide corriendo el mismo Goertzel **al lado** del tono, lo bastante
      // lejos para no tomar su energía y lo bastante cerca para que el ruido sea
      // el mismo. No se deduce del ruido total suponiendo que el espectro es
      // plano: se mide en el mismo archivo.
      const ruidoEnBin = pisoDelBin(x, frecuencia, w.frecuencia);
      return {
        tonoDb: dB(tono),
        picoDb: dB(p),
        rmsDb: dB(total),
        ruidoDb: dB(Math.sqrt(potenciaRuido)),
        ruidoEnBinDb: dB(ruidoEnBin),
        /** Lo que de verdad limita: cuánto sobresale el tono en su propio bin. */
        margenEnBinDb: dB(tono) - dB(ruidoEnBin),
        recorteExacto: p >= 1.0,
      };
    }),
  };
}

// --- La interfaz de línea de órdenes, sólo cuando se corre directamente -----

import { pathToFileURL } from 'node:url';

if (process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
  const salida = analizar(ruta, frecuencia);

  if (comoJson) {
    console.log(JSON.stringify(salida, null, 2));
  } else {
    console.log(`${ruta}`);
    console.log(`  ${salida.canales.length} canales, ${salida.frecuenciaDeMuestreo} Hz, `
      + `${salida.segundos.toFixed(2)} s, bin de ${salida.anchoDelBinHz.toFixed(3)} Hz`);
    console.log(`  tono buscado: ${frecuencia} Hz`);
    console.log('');
    console.log('  canal |  tono   |  pico   |   RMS   | ruido ancho | ruido en bin | margen');
    salida.canales.forEach((c, i) => {
      const f = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(7) : '   -inf');
      const margen = Number.isFinite(c.margenEnBinDb)
        ? c.margenEnBinDb.toFixed(1).padStart(6) : '     -';
      console.log(`   ${String(i + 1).padStart(4)} | ${f(c.tonoDb)} | ${f(c.picoDb)} | `
        + `${f(c.rmsDb)} | ${f(c.ruidoDb)} | ${f(c.ruidoEnBinDb)} | ${margen} dB`
        + (c.recorteExacto ? '   RECORTA' : ''));
    });
    console.log('');
    console.log('  El margen tono-ruido es el recorrido que queda antes de que el');
    console.log('  ruido se coma la señal. Medido en el bin, no por pico.');
  }
}
