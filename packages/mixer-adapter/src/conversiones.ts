/**
 * Conversiones entre el valor crudo del protocolo y unidades físicas.
 *
 * **Tomadas de la consola el 2026-09-08.** Hasta esa fecha este archivo tenía
 * estimaciones declaradas como tales: una curva de fader con una pendiente
 * inventada de 2,2 y una ganancia de entrada supuesta lineal. Las dos eran
 * razonables y las dos estaban equivocadas.
 *
 * De dónde salen ahora. La Ui24R sirve su propia interfaz en
 * `http://<consola>/mixer.html`, y ahí están las funciones que esa interfaz usa
 * para mostrar decibeles. Son las de la consola, no una aproximación nuestra.
 * Es el camino que el paso 2 de SPK-P0.2b preveía: «extraer las tablas de
 * conversión del código que la propia consola sirve por HTTP».
 *
 * Qué NO significa eso, porque la diferencia importa. Es la conversión que la
 * consola usa para *dibujar* su interfaz. Que muestre «0 dB» en la posición
 * 0,764706 no demuestra que el nivel físico sea 0 dB: eso lo mide SPK-P0.10b
 * con tonos y bucle físico, y no está medido. Lo que estas funciones garantizan
 * es que **nuestra lectura coincide con la que ve el operador en la consola**,
 * que es lo que hacía falta para que los dos números se puedan comparar.
 */

/**
 * Si las curvas salen de la consola real en vez de una estimación.
 *
 * Sigue habiendo una distinción que la interfaz tiene que respetar: es cierto
 * para el fader y la ganancia de entrada. No lo es para el ecualizador, el
 * compresor ni la puerta, que no viven en este archivo justamente por eso.
 */
export const VERIFICADO_CONTRA_CONSOLA = true;

/** Consola y firmware de los que se tomaron estas curvas. */
export const ORIGEN_DE_LAS_CURVAS = {
  modelo: 'ui24',
  firmware: '3.4.8318-ui24',
  fecha: '2026-09-08',
  fuente: 'mixer.html servido por la consola',
} as const;

/** Extremos de la conversión del fader, en dB. */
export const FADER_DB_MAXIMO = 10;
export const FADER_DB_MINIMO = -90;

/**
 * Posición del fader que la consola muestra como 0 dB.
 *
 * Literal de `mixer.html` (`zeroDbPos`). Es 13/17: la ley está ajustada sobre
 * diecisieteavos, y −10 dB cae en 9/17 y −60 dB en 1/17.
 */
export const FADER_POSICION_0_DB = 0.7647058823529421;

/**
 * Ganancia lineal para una posición de fader, como la calcula la consola.
 *
 * Copia literal de `VtoLIN`. El factor con seno por debajo de 0,055 es de la
 * consola: es el tramo donde el recorrido se cierra hacia el silencio. No es un
 * artificio nuestro y no se toca.
 */
function faderALineal(valor: number): number {
  const v = valor;
  const exponente = v * (23.90844819639692
    + v * (-26.23877598214595 + (12.195249692570245 - 0.4878099877028098 * v) * v));
  const base = 2.676529517952372e-4 * Math.exp(exponente);
  return v < 0.055 ? base * Math.sin(28.559933214452666 * v) : base;
}

/**
 * Valor del fader (0 a 1) a dB.
 *
 * El recorrido llega a **+10 dB**, no a 0: este fader tiene ganancia por encima
 * de la unidad. Un asistente que dé por sentado que 1,0 es 0 dB se equivoca en
 * diez decibeles justo en el extremo peligroso.
 *
 * Sobre el silencio se mantiene la decisión anterior: solo el cero es silencio.
 * La consola escribe «-inf» por debajo de 0,001, pero eso es cómo pone el
 * número en pantalla, no un escalón de la curva. Recortar donde recorta la
 * pantalla reintroduciría el salto que las pruebas de este archivo existen para
 * impedir.
 */
export function faderADb(valor: number): number {
  if (valor <= 0) return -Infinity;
  if (valor >= 1) return FADER_DB_MAXIMO;
  const lineal = faderALineal(valor);
  if (lineal <= 0) return FADER_DB_MINIMO;
  const db = 20 * Math.log10(lineal);
  return Math.max(FADER_DB_MINIMO, Math.min(FADER_DB_MAXIMO, db));
}

/**
 * dB a valor del fader.
 *
 * `VtoLIN` no tiene inversa cerrada —una exponencial de un polinomio de cuarto
 * grado, por un seno en el tramo bajo— así que se invierte por bisección. La
 * curva es monótona, que es la única condición que la bisección necesita, y
 * setenta iteraciones agotan la precisión del flotante.
 *
 * Fuera del tramo no puede ser inversa, y no es un defecto: por debajo de
 * `FADER_DB_MINIMO` la curva está recortada y muchos dB dan el mismo valor.
 */
export function dbAFader(db: number): number {
  if (db <= FADER_DB_MINIMO) return 0;
  if (db >= FADER_DB_MAXIMO) return 1;
  let bajo = 0;
  let alto = 1;
  for (let i = 0; i < 70; i++) {
    const medio = (bajo + alto) / 2;
    if (faderADb(medio) < db) bajo = medio;
    else alto = medio;
  }
  return (bajo + alto) / 2;
}

/** Extremos de la ganancia de entrada, en dB. */
export const GANANCIA_DB_MINIMA = -6;
export const GANANCIA_DB_MAXIMA = 57;

/**
 * Tabla de ganancia del previo, de `mixer.html` (`ui24pgains`), menos uno.
 *
 * La consola no aplica una fórmula: indexa esta tabla de 64 entradas. Por eso
 * **la ganancia de entrada es escalonada**, y los escalones no son parejos: de
 * 2 en 2 dB hasta +26, de 1 en 1 de +27 en adelante. Son 48 valores distintos,
 * no un recorrido continuo.
 *
 * Esto no es un detalle de nomenclatura. El asistente de ganancia propone
 * cuánto subir o bajar, y una propuesta de «subí 1,5 dB» en la mitad baja del
 * recorrido **no se puede ejecutar**: ahí no hay medio escalón. Hay que
 * redondear al escalón posible y decirlo en la pantalla, en vez de fingir una
 * precisión que el aparato no tiene.
 */
const GANANCIA_TABLA: readonly number[] = [
  -5, -5, -3, -3, -1, -1, 1, 1, 3, 3, 5, 5, 7, 7, 9, 9,
  11, 11, 13, 13, 15, 15, 17, 17, 19, 19, 21, 21, 23, 23, 25, 25,
  27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
  43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
].map((g) => g - 1);

/**
 * Lo que el previo entrega de menos a partir de cierto punto. **Medido.**
 *
 * La tabla de arriba es la de la consola y dice lo que la consola cree. Medido
 * contra el aparato el 2026-09-09, con una fuente de nivel conocido entrando
 * por el canal 10 y leyendo el medidor de entrada:
 *
 * - de −6 a +24 dB la tabla es exacta dentro de 0,33 dB, que es un escalón del
 *   medidor y por lo tanto el piso de lo que se puede distinguir;
 * - entre 24 y 26 dB —la tabla no tiene escalón de 25— promete 2 dB y el previo
 *   entrega 0,71;
 * - de 26 en adelante el déficit se mantiene en ~1,1 dB y **no crece**.
 *
 * O sea una discontinuidad única, no una deriva. Once puntos entre 24 y 54 dB
 * dieron entre −0,96 y −1,33, con media −1,02; el tramo fino entre 22 y 29 dio
 * media −1,15. Se toma 1,15 y la incertidumbre es de unas dos décimas.
 *
 * **Lo que no se sabe.** Si el salto está en la tabla de la consola o en su
 * previo. Si está en el previo, la consola también muestra 26 dB entregando 25,
 * y este número nos aleja de lo que el operador lee en su pantalla. Se corrige
 * igual, por decisión del usuario: lo que importa es que una propuesta de
 * cuatro decibeles mueva cuatro decibeles.
 *
 * **Tampoco se sabe si los demás previos se comportan igual**: todo esto es del
 * canal 10, que es donde estaba la fuente, y comprobarlo exige repatchearla.
 */
export const CORRECCION_PREVIO_DB = -1.15;

/** El escalón de la tabla a partir del cual se aplica la corrección medida. */
export const CORRECCION_DESDE_DB = 26;

/**
 * La tabla de la consola con la corrección medida encima.
 *
 * La original se conserva sin tocar: documenta lo que la consola cree, y esa
 * diferencia es justamente el hallazgo. Todo lo que informa o propone dB usa
 * esta.
 */
const GANANCIA_MEDIDA: readonly number[] = GANANCIA_TABLA.map(
  (db) => (db >= CORRECCION_DESDE_DB ? db + CORRECCION_PREVIO_DB : db),
);

/** Los 48 valores de ganancia que la consola puede tomar, en dB, ordenados. */
export const GANANCIA_ESCALONES: readonly number[] =
  [...new Set(GANANCIA_MEDIDA)].sort((a, b) => a - b);

/**
 * Valor de la ganancia (0 a 1) a dB. Copia de `VtoGAIN24`.
 *
 * Antes era `GANANCIA_DB_MINIMA + valor * 63`, una recta. La consola trunca a
 * un índice de 0 a 63 y busca en la tabla; en el medio del recorrido la recta
 * erraba por más de un decibel.
 */
/**
 * **Un borde sin resolver, en los múltiplos exactos de 1/64.**
 *
 * Una auditoría midió el 2026-09-09 que en crudo `0,25` el aparato entrega
 * **8 dB** y no los 10 que predice esta función, y en `0,50` entrega 24 en vez
 * de 24,85 — o sea que se comporta como `ceil(64·v) − 1` y no como
 * `trunc(64·v)`. Son 2 dB, y solo en valores que caigan exactamente en un
 * múltiplo de 1/64.
 *
 * **No se cambió la fórmula**, y a propósito: la medición es de un tercero y
 * repetirla necesita tonos sostenidos, que le enseñan filtros al supresor de
 * realimentación del general. Cambiar una conversión sobre una medición que no
 * se reprodujo es justamente el error que esta sesión estuvo corrigiendo.
 * Queda anotado acá para que el próximo lo mida antes de confiar en el borde.
 */
export function gananciaADb(valor: number): number {
  const acotado = Math.max(0, Math.min(1, valor));
  const indice = Math.min(63, Math.max(0, Math.trunc(64 * acotado)));
  // La medida y no la de la consola: ver `CORRECCION_PREVIO_DB`.
  return GANANCIA_MEDIDA[indice]!;
}

/**
 * dB a valor de la ganancia. Copia de `GAIN24toV`.
 *
 * No es la inversa exacta para un decibel cualquiera, y no puede serlo: el
 * destino es escalonado. Lo que sí cumple, y está probado, es que **para cada
 * uno de los 48 escalones la ida y vuelta cierra exacta**. Para un valor
 * intermedio devuelve la posición del escalón que la consola elegiría.
 */
export function dbAGanancia(db: number): number {
  // Hay dos escalas y conviene no mezclarlas: la aplicacion habla en la
  // **medida** --lo que el previo entrega de verdad-- y la formula de la
  // consola espera la **suya**, que por encima de 26 dB dice 1,15 dB de mas.
  // Se traduce aca, en el borde, para que el resto del sistema tenga una sola.
  const enEscalaDeLaConsola = db >= CORRECCION_DESDE_DB + CORRECCION_PREVIO_DB
    ? db - CORRECCION_PREVIO_DB
    : db;
  const acotado = Math.max(
    GANANCIA_DB_MINIMA, Math.min(GANANCIA_DB_MAXIMA, enEscalaDeLaConsola),
  );
  return Math.max(0, Math.min(1, (acotado + 6) / 63));
}

/**
 * Dónde aterriza un objetivo en dB si se convierte con `dbAGanancia`.
 *
 * Encadenar las dos conversiones **no da el escalón más cercano**. `dbAGanancia`
 * reparte el recorrido en 63 partes y `gananciaADb` lo trunca sobre 64 índices;
 * ese desajuste desplaza el resultado hasta **1,97 dB por debajo** del objetivo
 * y hasta **0,98 dB por encima**. Pedir +11,5 dB aterriza en +10.
 *
 * El sesgo es mayormente hacia abajo, pero **no siempre**: 9,75 dB sube a 10.
 * Conviene decirlo porque «siempre redondea para abajo» es la clase de regla que
 * uno da por buena y después falla justo en el caso que importa.
 *
 * Se expone tal cual, sin corregirlo, porque es lo que pasa de verdad si alguien
 * encadena las dos conversiones de la consola. Para elegir bien está
 * `rawParaGananciaMasCercana`.
 */
export function gananciaAlcanzable(dbObjetivo: number): number {
  return gananciaADb(dbAGanancia(dbObjetivo));
}

/**
 * Valor crudo que deja la ganancia en el escalón **más cercano** al objetivo.
 *
 * Es lo que un asistente necesita: si la recomendación es +11,5 dB, lo honesto
 * es ir a +12 y decir «+12, que es lo más cerca que llega», no caer a +10 por
 * un truncamiento y callarlo.
 *
 * Devuelve el centro del intervalo del índice elegido, que es el punto más
 * lejano de los dos bordes y por lo tanto el más robusto al redondeo.
 *
 * **No verificado en escritura.** El proyecto está en OBSERVE y esta sesión no
 * escribió ningún parámetro: lo que está comprobado es que al leerlo de vuelta
 * con `gananciaADb` da el escalón buscado. Que la consola cuantice igual al
 * recibir lo tiene que medir el spike de escritura.
 */
export function rawParaGananciaMasCercana(dbObjetivo: number): number {
  let mejorIndice = 0;
  let mejorDistancia = Infinity;
  for (let i = 0; i < GANANCIA_MEDIDA.length; i++) {
    const distancia = Math.abs(GANANCIA_MEDIDA[i]! - dbObjetivo);
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejorIndice = i;
    }
  }
  return (mejorIndice + 0.5) / 64;
}
