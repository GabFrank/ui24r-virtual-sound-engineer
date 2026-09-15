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
 * factor de cresta baja a **5,03, o sea 14,03 dB** — medido sobre los 104 tonos
 * que esto genera de verdad, no estimado. El número importa porque es lo que hay
 * que descontar para saber cuánto recorrido queda antes del recorte.
 */
import { writeFileSync } from 'node:fs';
import { amplitudDelTono, pisoDelBin, pico, dB, leerWav } from './analizar.mjs';

/**
 * Frecuencias repartidas por octava, cada una caída en un bin entero.
 *
 * Se exige **separación mínima en bins** para que los tonos no se derramen entre
 * sí, que es lo que arruinaría la medición justo en los graves: a 20 Hz un
 * doceavo de octava son 1,2 Hz, y con bins de 0,25 Hz dos tonos vecinos quedarían
 * a cinco bins.
 *
 * **Con `desde = 40`, que es lo que la medición 101 usa, este filtro no descarta
 * nada**: 104 crudas dan 104 tonos y la separación mínima real es de 10 bins.
 * Recién empieza a actuar en `desde = 30` (descarta 1) y en `desde = 20`
 * (descarta 4). Queda porque el día que alguien baje el arranque lo va a
 * necesitar, y queda dicho para que nadie crea que está haciendo algo hoy.
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
    /** Pico sobre eficaz. Con los 104 tonos de esta medición da 5,03 (14,03 dB). */
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
export async function respuesta(
  wav, frecuencias, { canalCapturado = 0, canalReferencia = 2 } = {},
) {
  const w = leerWav(wav);
  const cap = w.canales[canalCapturado];
  const ref = w.canales[canalReferencia];
  if (cap === undefined || ref === undefined) {
    throw new Error(`el WAV tiene ${w.canales.length} canales y hacen falta al menos `
      + `${Math.max(canalCapturado, canalReferencia) + 1}`);
  }
  // **El pico y el recorte de la captura, que quien mida tiene que poder mirar.**
  // Una curva medida sobre una captura recortada es la curva del limitador de la
  // interfaz, y se parece bastante a la de un filtro: sube, se aplana arriba, y
  // baja. El dato tiene que salir de acá porque acá es donde están las muestras.
  const picoCap = pico(cap);
  const puntos = [];
  for (const f of frecuencias) {
    // **Y acá se le devuelve el turno al bucle de eventos, que no es un detalle.**
    //
    // Este análisis son ~104 tonos por 22 correlaciones sobre 192 000 muestras:
    // entre seis y diez segundos de cálculo **sincrónico**. El transporte de la
    // consola manda un `ALIVE` cada 1000 ms con un `setInterval`, y su propio
    // docblock dice que sin eso «la consola deja de emitir a los pocos segundos».
    // Un cálculo que bloquea el bucle diez segundos es **exactamente lo mismo que
    // no mandar el latido**: se pierden diez, y la consola corta.
    //
    // Pasó el 2026-09-13: la medición 101 perdió el transporte a mitad de corrida
    // y la restauración no pudo correr, así que la consola quedó con cinco claves
    // cambiadas. Cediendo una vez por tono el bloqueo baja a unos 70 ms.
    await new Promise((r) => { setTimeout(r, 0); });
    const a = amplitudDelTono(cap, f, w.frecuencia);
    const b = amplitudDelTono(ref, f, w.frecuencia);
    // **El piso se mide en la frecuencia de CADA tono.** Medirlo una vez en el
    // medio del espectro y aplicarlo a los 104 supone que el piso es plano, y no
    // lo es: el zumbido de red en 50, 100 y 150 Hz está muy por encima del piso
    // de 800 Hz.
    const piso = pisoDelBin(cap, f, w.frecuencia, { bins: 10 });
    puntos.push({
      hz: f,
      db: dB(a) - dB(b),
      capturadoDb: dB(a),
      referenciaDb: dB(b),
      margenDb: dB(a) - dB(piso),
    });
  }
  puntos.picoDbFS = dB(picoCap);
  puntos.recorteExacto = picoCap >= 1.0;
  return puntos;
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
/**
 * La frecuencia donde una curva cruza un nivel, interpolada.
 *
 * **Estaba escondida adentro del cálculo del Q**, que la necesitaba para medir el
 * ancho de una campana. La medición 103 necesita exactamente lo mismo para el
 * punto de −3 dB de un pasa-altos, así que se saca afuera: dos copias de una
 * interpolación es como se separan sin que nadie lo note.
 *
 * Busca desde `desde` en la dirección `paso` el primer punto que quede **al otro
 * lado** de `nivel`, e interpola linealmente en `log(f)` entre ése y el anterior.
 * Devuelve `null` si la curva nunca cruza: sin los dos puntos que lo rodean no hay
 * cruce que interpolar, y suponerlo sería inventarlo.
 */
export function cruceEnNivel(puntos, nivel, desde, paso) {
  // **El arranque tiene que estar del lado de arriba, o no hay cruce.**
  //
  // Si la curva ya empieza por debajo del nivel, el bucle dispara en el primer
  // paso y la interpolación **extrapola hacia afuera de la malla**. Medido: una
  // curva monótona que arranca en −10 dB, buscando el cruce en −3, devolvía
  // **49 940 812 Hz**; una plana en −10, **14 481 Hz** — un número creíble, sobre
  // un tono real, que se habría publicado como codo.
  //
  // Es el mismo defecto que `qPorAnchoMitad` documenta haber arreglado con su
  // guarda de altura positiva, y **el arreglo no viajó con la función cuando se
  // la extrajo de ahí**. Lo encontró un auditor el 2026-09-13.
  const arranque = puntos[desde];
  if (arranque === undefined || !(arranque.db > nivel)) return null;
  for (let k = desde + paso; k >= 0 && k < puntos.length; k += paso) {
    const aca = puntos[k];
    const antes = puntos[k - paso];
    if (antes === undefined) return null;
    // **Un cruce no tiene dirección: es que los dos puntos queden a lados
    // distintos del nivel.** Escribirlo como `aca.db <= nivel` funciona sólo
    // mientras el arranque esté arriba, y el docblock prometía más que eso:
    // buscando hacia arriba desde el grave, una curva escalón devolvía 42,5 Hz
    // en vez de 1000.
    const cruzo = (antes.db - nivel) * (aca.db - nivel) <= 0;
    if (!cruzo) continue;
    if (antes.db === aca.db) return aca.hz;
    const t = (antes.db - nivel) / (antes.db - aca.db);
    return Math.exp(Math.log(antes.hz) + t * (Math.log(aca.hz) - Math.log(antes.hz)));
  }
  return null;
}

/**
 * El nivel de la banda de paso, medido en el extremo que el filtro no toca.
 *
 * **No se supone que sea 0 dB.** La curva se mide contra una línea base, así que
 * un filtro sin ganancia de paso daría cero — pero eso hay que verlo, no
 * asumirlo, y de todas formas el ruido mueve cada punto. Se toma la **mediana** de
 * los `cuantos` tonos del extremo, que es robusta a que uno se vaya.
 *
 * `extremo` es `'agudo'` para un pasa-altos —cuya banda de paso está arriba— y
 * `'grave'` para un pasa-bajos.
 */
export function bandaDePaso(puntos, extremo, { cuantos = 20, desdeHz, hastaHz } = {}) {
  // **Una ventana de frecuencias, cuando el extremo no sirve.**
  //
  // El extremo grave de este banco --40 a 120 Hz-- tiene sólo unos 8 dB de margen
  // sobre el ruido: ahí vive el zumbido de red. Medido el 2026-09-13: los cinco
  // puntos del pasa-bajos se anularon porque su banda de paso colgaba de esa
  // mediana. Para un filtro cuyo codo está arriba, la banda de paso se puede tomar
  // de un tramo intermedio que esté por debajo del codo y por encima del zumbido.
  const tramo = desdeHz !== undefined && hastaHz !== undefined
    ? puntos.filter((p) => p.hz >= desdeHz && p.hz <= hastaHz)
    : extremo === 'agudo'
      ? puntos.slice(Math.max(0, puntos.length - cuantos))
      : puntos.slice(0, cuantos);
  if (tramo.length === 0) return { db: NaN, dispersionDb: NaN, margenPeorDb: NaN };
  const v = tramo.map((p) => p.db).sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  const db = v.length % 2 === 1 ? v[m] : (v[m - 1] + v[m]) / 2;
  // **Y cuánto se dispersa, y con cuánto margen.** De esta mediana cuelga el
  // nivel del cruce de cada punto: es un punto de referencia como cualquier otro
  // y puede estar hundido en el ruido sin que nadie mire. En el extremo grave son
  // los tonos de 40 a 120 Hz, que es donde vive el zumbido de red.
  const media = tramo.reduce((s, p) => s + p.db, 0) / tramo.length;
  return {
    db,
    dispersionDb: Math.sqrt(tramo.reduce((s, p) => s + (p.db - media) ** 2, 0) / tramo.length),
    margenPeorDb: Math.min(...tramo.map((p) => p.margenDb ?? Infinity)),
  };
}

export function qPorAnchoMitad(puntos, pico) {
  // **La altura tiene que ser positiva, y el bucle arranca en el vecino.**
  //
  // Con una curva que no sube --toda negativa, con un máximo interior en −3 dB--
  // la mitad queda ARRIBA de todos los puntos, el bucle dispara en el propio pico
  // y la interpolación extrapola decenas de pasos de malla hacia afuera. Medido:
  // devolvía `{q: 0,0131, de 10,5 Hz a 61 355 Hz}` con la ventana medida yendo de
  // 40 a 15 343 Hz. Un número con cara de medido sacado de una curva que no es
  // una campana.
  if (!(pico.alturaDb > 0)) return null;
  const mitad = pico.alturaDb / 2;
  // Usa el buscador comun: tener dos copias de la misma interpolacion es como se
  // separan sin que nadie lo note.
  const cruce = (desde, paso) => cruceEnNivel(puntos, mitad, desde, paso);
  const abajo = cruce(pico.indice, -1);
  const arriba = cruce(pico.indice, +1);
  if (abajo === null || arriba === null) return null;
  return { q: pico.hz / (arriba - abajo), fAbajo: abajo, fArriba: arriba };
}
