#!/usr/bin/env node
/**
 * Un multitono, y la respuesta en frecuencia que se saca de él.
 *
 * **Por qué no un barrido.** Medir la curva de un filtro con un tono por vez son
 * cien capturas por cada ajuste que se quiera probar. Un multitono —la suma de
 * cien senoides— mide **toda la respuesta en una sola captura**, porque cada tono
 * se lee en su propio bin y los demás no entran en esa cuenta.
 *
 * **Y no hace falta que el estímulo sea plano.** Con el bucle de la interfaz, los
 * canales 3 y 4 devuelven exactamente lo que la computadora transmitió, así que
 * la respuesta se calcula como `capturado ÷ transmitido` tono por tono. Lo que no
 * sea plano en el estímulo se cancela solo.
 *
 * **Las frecuencias caen en bins enteros.** Si un tono cae entre dos bins, la
 * ventana de Hann se come hasta 1,4 dB, y el error no es igual para todos los
 * tonos: sería una curva falsa con forma de curva. Redondeando cada frecuencia al
 * bin más cercano el error desaparece.
 *
 * **Y las fases son pseudoaleatorias.** Con todas en cero las cien senoides se
 * suman en el instante cero y el pico es cien veces el de una: el archivo
 * recortaría con un nivel eficaz ridículamente bajo. Con fases repartidas el
 * factor de cresta baja a unos 3,5 y el estímulo entrega mucho más nivel por el
 * mismo pico.
 */
import { writeFileSync } from 'node:fs';
import { amplitudDelTono, pisoDelBin, dB, leerWav } from './analizar.mjs';

/**
 * Frecuencias repartidas por octava, cada una caída en un bin entero.
 *
 * Se quitan los duplicados que aparecen abajo de todo: a 20 Hz, un doceavo de
 * octava son 1,2 Hz, y si el bin mide 0,25 Hz dos tonos vecinos pueden redondear
 * al mismo. Y se exige **separación mínima en bins** para que no se derramen
 * entre sí, que es lo que arruinaría la medición justo en los graves.
 */
export function frecuenciasPorOctava({
  desde = 40, hasta = 16000, porOctava = 12, anchoDelBinHz, separacionMinimaEnBins = 8,
}) {
  const crudas = [];
  const paso = Math.pow(2, 1 / porOctava);
  for (let f = desde; f <= hasta * 1.0000001; f *= paso) crudas.push(f);
  const enBins = [];
  for (const f of crudas) {
    const k = Math.round(f / anchoDelBinHz);
    const ultimo = enBins[enBins.length - 1];
    if (ultimo !== undefined && k - ultimo < separacionMinimaEnBins) continue;
    enBins.push(k);
  }
  return enBins.map((k) => k * anchoDelBinHz);
}

/**
 * El WAV del multitono, con el pico puesto donde se pide.
 *
 * El nivel se ajusta **después** de sumar, midiendo el pico real en vez de
 * estimarlo: el factor de cresta de una suma de senoides con fases aleatorias
 * depende del sorteo, y estimarlo sería arriesgar un recorte o desperdiciar
 * nivel.
 */
export function escribirMultitono(
  ruta, { frecuencias, fm, segundos, picoObjetivoDbFS, repeticiones = 1 },
) {
  const n = Math.round(fm * segundos);
  const x = new Float64Array(n);
  // Fases deterministas: la misma corrida repetida da el mismo archivo, que es
  // lo que permite comparar dos capturas sin preguntarse si cambió el estímulo.
  let semilla = 12345;
  const siguiente = () => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return semilla / 0x7fffffff;
  };
  for (const f of frecuencias) {
    const fase = 2 * Math.PI * siguiente();
    const w = (2 * Math.PI * f) / fm;
    for (let i = 0; i < n; i++) x[i] += Math.sin(w * i + fase);
  }
  let pico = 0;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]);
    if (a > pico) pico = a;
    suma += x[i] * x[i];
  }
  const eficaz = Math.sqrt(suma / n);
  const escala = (Math.pow(10, picoObjetivoDbFS / 20) / pico) * 32767;

  const bloque = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(x[i] * escala)));
    bloque.writeInt16LE(v, i * 4); bloque.writeInt16LE(v, i * 4 + 2);
  }
  // **El bloque se repite sin costura, y por eso se puede.** Cada frecuencia cae
  // en un bin entero de esta ventana, o sea que completa un número entero de
  // ciclos en el bloque: pegar una copia detrás de otra continúa la fase exacta,
  // sin salto ni chasquido. Calcular cinco minutos de cien senoides serían mil
  // millones de operaciones; copiar un búfer no cuesta nada.
  const datos = repeticiones <= 1 ? bloque
    : Buffer.concat(Array.from({ length: repeticiones }, () => bloque));

  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(fm, 24); c.writeUInt32LE(fm * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return {
    /** Pico sobre eficaz. Con fases repartidas ronda 4; con todas en cero sería 100. */
    factorDeCresta: pico / eficaz,
    nivelPorTonoDbFS: dB(escala / 32767),
    segundosTotales: (n * repeticiones) / fm,
  };
}

/**
 * La respuesta: capturado menos transmitido, tono por tono, en decibeles.
 *
 * Devuelve también el margen sobre el ruido del bin de **cada** tono, porque en
 * una curva con un pico los extremos se hunden y hay que poder anular un tono sin
 * anular la captura.
 */
export function respuesta(wav, frecuencias, { canalCapturado = 0, canalReferencia = 2 } = {}) {
  const w = leerWav(wav);
  const cap = w.canales[canalCapturado];
  const ref = w.canales[canalReferencia];
  if (cap === undefined || ref === undefined) {
    throw new Error(`el WAV tiene ${w.canales.length} canales y hacen falta al menos `
      + `${Math.max(canalCapturado, canalReferencia) + 1}`);
  }
  const pisoCap = pisoDelBin(cap, frecuencias[Math.floor(frecuencias.length / 2)], w.frecuencia);
  return frecuencias.map((f) => {
    const a = amplitudDelTono(cap, f, w.frecuencia);
    const b = amplitudDelTono(ref, f, w.frecuencia);
    return {
      hz: f,
      db: dB(a) - dB(b),
      capturadoDb: dB(a),
      referenciaDb: dB(b),
      margenDb: dB(a) - dB(pisoCap),
    };
  });
}

/**
 * El máximo de una curva, interpolado con una parábola en `(log f, dB)`.
 *
 * **Sin interpolar, el pico sólo puede caer en uno de los tonos**, así que la
 * resolución sería la separación entre tonos —un doceavo de octava, casi 6 %— y
 * eso no alcanza para contrastar una ley contra otra con holgura. La parábola por
 * el máximo y sus dos vecinos lo mejora a algo del orden del 1 %.
 *
 * Devuelve `null` cuando el máximo cae en un extremo: ahí no hay dos vecinos y,
 * peor, un máximo en el borde suele querer decir que el pico está afuera de la
 * ventana medida y lo que se vería sería el borde, no el filtro.
 */
export function picoInterpolado(puntos) {
  let i = 0;
  for (let k = 1; k < puntos.length; k++) if (puntos[k].db > puntos[i].db) i = k;
  if (i === 0 || i === puntos.length - 1) return null;
  const x = [Math.log(puntos[i - 1].hz), Math.log(puntos[i].hz), Math.log(puntos[i + 1].hz)];
  const y = [puntos[i - 1].db, puntos[i].db, puntos[i + 1].db];
  // Vértice de la parábola por tres puntos, en el eje logarítmico.
  const d1 = (y[1] - y[0]) / (x[1] - x[0]);
  const d2 = (y[2] - y[1]) / (x[2] - x[1]);
  const a = (d2 - d1) / (x[2] - x[0]);
  if (!(a < 0)) return null;
  const vertice = (x[0] + x[1]) / 2 - d1 / (2 * a);
  const alturaDb = y[1] + a * Math.pow(vertice - x[1], 2)
    + (d1 + a * (x[1] - x[0])) * (vertice - x[1]);
  return { hz: Math.exp(vertice), alturaDb, indice: i };
}

/**
 * El Q de una campana, por el ancho a **mitad de la ganancia en dB**.
 *
 * Se declara la definición porque hay varias y dan números distintos: acá el
 * ancho se mide entre los dos puntos donde la curva vale la mitad de su pico **en
 * decibeles**, y `Q = f0 / Δf`. Sirve para separar un Q de 1 de uno de 5, que es
 * lo que esta medición necesita; no para publicar una cifra fina.
 *
 * Devuelve `null` si la curva no vuelve a bajar hasta la mitad de los dos lados:
 * sin los dos cruces no hay ancho, y suponer uno sería inventarlo.
 */
export function qPorAnchoMitad(puntos, pico) {
  const mitad = pico.alturaDb / 2;
  const cruce = (desde, paso) => {
    for (let k = desde; k >= 0 && k < puntos.length; k += paso) {
      if (puntos[k].db <= mitad) {
        const anterior = puntos[k - paso];
        if (anterior === undefined) return null;
        // Interpolación lineal en log(f) entre el punto que cruzó y el anterior.
        const t = (anterior.db - mitad) / (anterior.db - puntos[k].db);
        return Math.exp(Math.log(anterior.hz)
          + t * (Math.log(puntos[k].hz) - Math.log(anterior.hz)));
      }
    }
    return null;
  };
  const abajo = cruce(pico.indice, -1);
  const arriba = cruce(pico.indice, +1);
  if (abajo === null || arriba === null) return null;
  return { q: pico.hz / (arriba - abajo), fAbajo: abajo, fArriba: arriba };
}
