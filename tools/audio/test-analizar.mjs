/**
 * El instrumento del que salen TODAS las cifras, contra señales que se conocen.
 *
 * **Por qué existe.** Una auditoría de controles encontró el 2026-09-13 que
 * `analizar.mjs` —Goertzel, piso del bin, pico, RMS, lectura de WAV— **no tenía
 * ni un test**, y lo demostró con dos mutaciones que no rompen nada:
 *
 * - Hacer que `pisoDelBin` devuelva **siempre 0** deja los nueve tests del
 *   multitono en verde. Con piso cero, el margen de cada punto sale infinito y la
 *   guarda de 45 dB de las mediciones **no dispara nunca**: la corrida publica
 *   como medidos puntos hundidos en el ruido.
 * - Quitar la compensación de ganancia coherente de Hann —el `/ 0.5`— también
 *   deja los nueve en verde, porque el único test que la toca la usa dentro de un
 *   **cociente**, donde se cancela. Es un error de escala de **6 dB** en todo dBFS
 *   absoluto que este proyecto publique.
 *
 * Las señales de acá tienen amplitud conocida por construcción, así que el
 * instrumento se mide contra algo y no contra sí mismo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amplitudDelTono, pisoDelBin, pico, rms, dB } from './analizar.mjs';

const FM = 48000;
const N = 192000;

/** Un seno de amplitud exacta, en una frecuencia que cae en un bin entero. */
function seno(amplitud, hz, n = N) {
  const x = new Float32Array(n);
  const w = (2 * Math.PI * hz) / FM;
  for (let i = 0; i < n; i++) x[i] = amplitud * Math.sin(w * i);
  return x;
}

/**
 * Ruido con varianza conocida, determinista para que el test no parpadee.
 *
 * **El generador tiene que quedarse en 32 bits, y el primero que puse no lo
 * hacía.** Un congruencial clásico —`s * 1103515245 + 12345`— con `s` del orden
 * de 2³⁰ da un producto de 2⁶⁰, que en coma flotante de doble precisión **pierde
 * los bits bajos**: los valores salían todos múltiplos de potencias grandes de
 * dos. El nivel eficaz daba bien (1,017e-2 contra 1,000e-2) y el **espectro no
 * era plano**, así que los bins salían 88 veces por debajo de lo teórico y este
 * test culpaba al instrumento por un defecto de su propio banco de pruebas.
 *
 * `Math.imul` hace la multiplicación de 32 bits exacta, que es lo que hacía falta.
 */
function ruido(sigma, n = N) {
  let s = 987654321 >>> 0;
  const siguiente = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Box-Muller: dos uniformes dan una normal.
    const u = Math.max(1e-12, siguiente());
    const v = siguiente();
    x[i] = sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  return x;
}

test('la amplitud de un tono es la que se puso, no la mitad', () => {
  // **Ésta es la que atrapa la compensación de Hann.** Sin el `/ 0.5`, la ventana
  // se come exactamente la mitad de la amplitud y todo sale 6,02 dB abajo. Como
  // aquí no hay ningún cociente donde cancelarse, el error queda a la vista.
  for (const a of [1.0, 0.5, 0.1, 0.001]) {
    const medido = amplitudDelTono(seno(a, 1000), 1000, FM);
    assert.ok(Math.abs(medido - a) / a < 0.001,
      `un seno de amplitud ${a} se mide como ${medido}`);
  }
  // Y en decibeles: media amplitud son −6,02 dBFS, no −12,04.
  assert.ok(Math.abs(dB(amplitudDelTono(seno(0.5, 1000), 1000, FM)) + 6.0206) < 0.01);
});

test('el tono se mide igual en cualquier parte del espectro', () => {
  for (const hz of [50, 200, 1000, 5000, 15000]) {
    const medido = amplitudDelTono(seno(0.25, hz), hz, FM);
    assert.ok(Math.abs(medido - 0.25) / 0.25 < 0.002,
      `en ${hz} Hz un seno de 0,25 se mide como ${medido}`);
  }
});

test('el piso del bin da el valor teorico del ruido, no cero', () => {
  // **Ésta es la que atrapa el `return 0`.** El nivel esperado de un bin con
  // ventana de Hann sobre ruido blanco de desviación sigma es
  // `sigma * sqrt(6 / N)`: la ventana aporta un factor de potencia de 3/8 y la
  // normalización de `amplitudDelTono` otro de 4/N.
  for (const sigma of [0.01, 0.001]) {
    const esperado = sigma * Math.sqrt(6 / N);
    const medido = pisoDelBin(ruido(sigma), 1000, FM);
    const factor = Math.max(medido / esperado, esperado / medido);
    assert.ok(factor < 1.35,
      `con sigma ${sigma} el piso teorico es ${esperado.toExponential(3)} y se midio `
      + `${medido.toExponential(3)} (factor ${factor.toFixed(2)})`);
  }
});

test('el piso del bin NO recoge el tono que tiene al lado', () => {
  // Si los bins de guarda estuvieran mal puestos, un tono fuerte inflaría su
  // propio piso y el margen saldría chico: la guarda anularía puntos buenos. Y si
  // se corrieran al revés, el piso saldría enorme y la guarda no anularía nada.
  const conTono = pisoDelBin(seno(1.0, 1000), 1000, FM);
  // Un seno puro no tiene ruido: lo que el piso recoja es derrame de la ventana.
  assert.ok(dB(conTono) < -100,
    `un tono de amplitud 1 derrama ${dB(conTono).toFixed(1)} dB en su propio piso`);
});

test('promediar aprieta el piso mucho mas que mirar un bin suelto', () => {
  // **De esto salió el episodio de las dos tomas del mismo silencio**, que dieron
  // −106,70 y −136,12 dBFS con diez minutos de diferencia y nada tocado: el valor
  // de un bin aislado de ruido no es «el piso», es una muestra de una variable
  // con 5,6 dB de desviación y cola larga hacia abajo.
  //
  // El test no fija una constante: **compara las dos dispersiones sobre el mismo
  // ruido**, que es la propiedad que importa y no depende de cuántos bins se
  // promedien hoy.
  const x = ruido(0.01);
  const donde = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2400];
  const promediado = donde.map((hz) => dB(pisoDelBin(x, hz, FM)));
  const unSoloBin = donde.map((hz) => dB(amplitudDelTono(x, hz, FM)));
  const rango = (v) => Math.max(...v) - Math.min(...v);

  assert.ok(rango(promediado) < rango(unSoloBin) / 2,
    `promediando el piso varia ${rango(promediado).toFixed(2)} dB y con un bin suelto `
    + `${rango(unSoloBin).toFixed(2)} dB: promediar tiene que apretarlo al menos a la mitad`);
  // Y en términos absolutos sigue siendo un estimador utilizable.
  assert.ok(rango(promediado) < 4,
    `${rango(promediado).toFixed(2)} dB de dispersion es demasiado para una guarda `
    + 'que decide si un punto vale');
});

test('el pico y el eficaz son lo que dicen', () => {
  const x = seno(0.5, 1000);
  assert.ok(Math.abs(pico(x) - 0.5) < 1e-4, `pico ${pico(x)}`);
  // El eficaz de un seno es su amplitud sobre raiz de dos.
  assert.ok(Math.abs(rms(x) - 0.5 / Math.SQRT2) < 1e-4, `eficaz ${rms(x)}`);
  // Y el pico con 192 000 muestras no revienta la pila, que es por lo que existe
  // el bucle en vez de `Math.max(...x)`.
  assert.equal(pico(new Float32Array(N)), 0);
});

test('dB es la conversion de siempre, y el cero no es -0', () => {
  assert.ok(Math.abs(dB(1) - 0) < 1e-12);
  assert.ok(Math.abs(dB(0.5) + 6.0206) < 0.001);
  assert.equal(dB(0), -Infinity);
});

/**
 * **La mutación que las pruebas de tono puro no pueden ver: sacar la ventana.**
 *
 * Goertzel evalúa la correlación en la frecuencia exacta, así que con un tono
 * **solo** la ventana no cambia nada: medido, 0,000 dB con y sin. Y si además se
 * saca el `/ 0,5` que la compensa, tampoco cambia la escala. O sea que quitar la
 * ventana entera —ventana y compensación juntas— dejaba todo el archivo en verde.
 *
 * Lo que la ventana compra es rechazo de lo que NO está en la frecuencia pedida,
 * y este banco vive de eso: el ítem 105 mide una fuga 79 dB por debajo de un tono
 * que suena al mismo tiempo. Sin ventana, un interferente a nivel pleno a 50 Hz
 * de distancia mete **+23,7 dB** de error; con Hann, 0,002 dB.
 *
 * **La separación es de 200,5 bins a propósito.** Con una separación que sea un
 * múltiplo ENTERO del bin, el núcleo rectangular vale cero y la prueba pasaría
 * sin ventana: un interferente a 3,00 Hz exactos da 0,000 dB de error en los dos
 * casos. Una prueba con números redondos no ve nada.
 */
test('un interferente fuerte y cercano no se cuela en el bin', () => {
  const DEBIL = 1e-4;          // −80 dB
  const SEPARACION_EN_BINS = 200.5;
  const hzInterferente = 1000 + (SEPARACION_EN_BINS * FM) / N;
  const x = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    x[i] = DEBIL * Math.sin((2 * Math.PI * 1000 * i) / FM)
      + Math.sin((2 * Math.PI * hzInterferente * i) / FM + 0.7);
  }
  const error = dB(amplitudDelTono(x, 1000, FM)) - dB(DEBIL);
  assert.ok(Math.abs(error) < 0.1,
    `el interferente a ${(hzInterferente - 1000).toFixed(2)} Hz mete ${error.toFixed(2)} dB `
    + 'de error en un tono de -80 dB. Sin ventana de Hann esto da +23,7 dB, y es el '
    + 'regimen en el que se mide la fuga del item 105.');
});

test('con un tono solo, la ventana no se nota: por eso hace falta la prueba de arriba', () => {
  // Esto NO es un control de calidad del instrumento: es la demostracion de por
  // que el test anterior existe. Si algun dia falla, es que Goertzel dejo de
  // evaluar en la frecuencia exacta y hay que revisar la prueba de al lado.
  for (const [n, hz] of [[N, 1000], [N, 1000.37], [144000, 1000], [12000, 1013.7]]) {
    const error = dB(amplitudDelTono(seno(0.25, hz, n), hz, FM)) - dB(0.25);
    assert.ok(Math.abs(error) < 0.01,
      `${n} muestras a ${hz} Hz: ${error.toFixed(4)} dB`);
  }
});
