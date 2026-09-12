import { nombreDePareja, type ParejaEnSuPuesto, type ParejaExpuesta } from '@vse/assistants';

/**
 * El diagnóstico geométrico, puesto en castellano.
 *
 * **Está separado del componente para poder probarlo**, y sobre todo para poder
 * probar lo que NO dice. La tentación de esta pantalla es escribir «este
 * monitor está acoplando con este micrófono», y eso es más de lo que la
 * geometría sabe: sabe qué pareja está **más expuesta** según lo que el usuario
 * cargó, sin decibeles, sin frecuencia y sin afirmar que haya realimentación.
 */

/** Una línea del informe, lista para mostrar. */
export interface LineaDeExposicion {
  readonly titulo: string;
  readonly detalle: string;
  readonly reservas: readonly string[];
  /** Cuántas otras parejas no se pueden separar de ésta. Cero es separada. */
  readonly empatadaCon: number;
}

/**
 * La distancia, en metros con dos decimales —o sea con precisión de centímetro.
 *
 * **Cuando el rango colapsa se muestra el número solo.** Antes salía «unos 1,20
 * m» incluso con los extremos idénticos, defendido con que «un solo número
 * invita a leerlo como una medición». Lo vetó el usuario el 2026-09-12: «*al
 * crear el instrumento/microfono, se indica si es fijo o tiene rango de
 * movimiento, punto final*».
 *
 * Tiene razón y el argumento viejo se cae solo: si el usuario declaró que algo
 * es fijo, **es** una medición, y hedgearla es el sistema desconfiando de un
 * dato que el propio usuario cargó. El rango sigue apareciendo entero cuando
 * hay rango de verdad —un micrófono en mano, medio metro de vaivén—, que es
 * exactamente donde sirve.
 */
function metros(min: number, max: number): string {
  const uno = (v: number) => v.toFixed(2).replace('.', ',');
  return Math.abs(max - min) < 0.005 ? `${uno(min)} m` : `entre ${uno(min)} y ${uno(max)} m`;
}

function grados(min: number, max: number): string {
  const uno = (v: number) => String(Math.round(v));
  if (min <= 0.5 && max >= 179.5) return 'con el ángulo sin determinar';
  // Mismo criterio que en `metros`: sin rango, el número va solo.
  return Math.abs(max - min) < 1
    ? `a ${uno(min)}° de su eje`
    : `entre ${uno(min)}° y ${uno(max)}° de su eje`;
}

/**
 * La frase que acompaña a lo que no entró en la lista.
 *
 * No se puede decir «menos expuestas» cuando el corte parte un escalón: las que
 * faltan son tan expuestas como las que se ven.
 */
export function frasePorLoQueFalta(sinMostrar: number, parteUnEscalon: boolean): string | null {
  if (sinMostrar <= 0) return null;
  const cuantas = sinMostrar === 1 ? 'Hay una pareja más' : `Hay ${sinMostrar} parejas más`;
  return parteUnEscalon
    ? `${cuantas} en el mismo escalón, tan expuestas como las de arriba: la lista se corta acá, no la exposición.`
    : `${cuantas}, menos expuestas.`;
}

function unaLinea(x: ParejaEnSuPuesto): LineaDeExposicion {
  const p = x.pareja;
  const partes = [metros(p.distanciaM.min, p.distanciaM.max)];
  if (p.anguloEnElMicrofono !== null) {
    partes.push(grados(p.anguloEnElMicrofono.min, p.anguloEnElMicrofono.max));
  } else {
    // **No es lo mismo «no sé adónde apunta» que «capta de todos lados».** La
    // primera versión decía lo segundo, que de un cardioide es directamente
    // falso. Lo corrigió una auditoría.
    partes.push('sin orientación cargada: el ángulo no entra en la cuenta');
  }
  if (p.llegaPorElEnvio === null) partes.push('y no se sabe si le llega por el envío');
  const reservas = [...p.reservas];
  // **Por qué el piso puede ser cero**, dicho con el dato que lo explica. Sin
  // esto, el nulo del patrón era un campo que no leía nadie: escrito y nunca
  // usado, o sea el mismo defecto que el resto del modelo se cuida de evitar.
  if (p.nuloDelPatronGrados !== null && p.anguloEnElMicrofono !== null
    && p.anguloEnElMicrofono.min <= p.nuloDelPatronGrados
    && p.nuloDelPatronGrados <= p.anguloEnElMicrofono.max) {
    reservas.push(
      `el nulo de este micrófono está a ${p.nuloDelPatronGrados}° y cae dentro del rango de ángulos: `
      + 'no se puede descartar que el monitor le quede justo en el punto ciego, ni que no.');
  }
  return {
    titulo: nombreDePareja(p),
    detalle: partes.join(', '),
    reservas,
    empatadaCon: x.empatadaCon.length,
  };
}

/**
 * Las líneas del informe, de más expuesta a menos.
 *
 * `tope` corta la lista: en un escenario de veinte elementos las parejas son
 * cientos, y una lista que no entra en la pantalla no es un diagnóstico. **Lo
 * que se corta se informa**, porque una lista truncada en silencio se lee como
 * si fuera completa.
 */
export function lineasDeExposicion(
  orden: readonly ParejaEnSuPuesto[],
  tope = 8,
): {
  readonly lineas: readonly LineaDeExposicion[];
  readonly sinMostrar: number;
  /**
   * Si el corte cayó **dentro** de un escalón, o sea entre parejas que no se
   * pueden separar entre sí.
   *
   * **Cambia lo que la pantalla puede decir.** Si el corte cae entre escalones,
   * las que faltan están genuinamente más abajo. Si cae adentro, las que faltan
   * son tan expuestas como las que se ven, y llamarlas «menos expuestas» sería
   * mentir — y contradecir al encabezado, que en ese mismo caso está diciendo
   * que la geometría no las separa. Lo encontró una auditoría corriendo el caso
   * real: cuatro emisores por tres micrófonos dan un escalón único de doce
   * parejas y un tope de ocho, así que la tarjeta mostraba las dos frases
   * juntas.
   */
  readonly elCorteParteUnEscalon: boolean;
} {
  const lineas = orden.slice(0, tope).map(unaLinea);
  const sinMostrar = orden.length - lineas.length;
  // ¿El corte dejó afuera a alguna que no se puede separar de las que se ven?
  const mostradas = new Set(orden.slice(0, tope).map((x) => nombreDePareja(x.pareja)));
  const parte = orden.slice(tope).some(
    (x) => x.empatadaCon.some((n) => mostradas.has(n)));
  return { lineas, sinMostrar, elCorteParteUnEscalon: parte };
}

/**
 * La frase que encabeza el informe.
 *
 * Dice lo que el informe es y lo que no es, en la pantalla y no sólo en un
 * comentario: quien lo lea tiene que poder saber que está mirando un orden y no
 * una medición.
 */
export function encabezadoDelInforme(orden: readonly ParejaEnSuPuesto[]): string {
  const primero = orden[0];
  if (primero === undefined) {
    return 'Todavía no hay ninguna pareja de monitor y micrófono que analizar.';
  }
  const base = 'Orden de exposición según dónde está cada cosa. No es una medición de acople '
    + 'ni predice a qué frecuencia va a sonar: para eso está el analizador.';
  if (primero.empatadaCon.length === 0) return base;

  // **La frase de qué hacer depende de POR QUÉ están empatadas.** La primera
  // versión decía siempre «medir mejor las posiciones las separa», y una
  // auditoría mostró que eso es falso en los dos casos que más aparecen:
  // cuando el nulo del patrón cae dentro del rango de ángulos el piso es cero
  // por física y no baja por más que se mida, y cuando la duda viene de que
  // alguien se mueve con el micrófono en la mano, medir no reduce nada porque
  // no es imprecisión sino movimiento.
  const porElNulo = primero.pareja.nuloDelPatronGrados !== null
    && primero.pareja.anguloEnElMicrofono !== null
    && primero.pareja.anguloEnElMicrofono.min <= primero.pareja.nuloDelPatronGrados
    && primero.pareja.nuloDelPatronGrados <= primero.pareja.anguloEnElMicrofono.max;
  const cola = porElNulo
    ? 'No es falta de medición: el monitor puede estar justo en el punto ciego del micrófono, '
      + 'y eso no se resuelve midiendo mejor. Moverlo un poco sí lo resuelve.'
    : 'Si esas posiciones están cargadas a ojo, medirlas las separa; si la duda viene de que '
      + 'alguien se mueve, no.';
  return `${base} La más expuesta no se puede separar de otras `
    + `${primero.empatadaCon.length}: cualquiera de ellas podría ser la peor. ${cola}`;
}
