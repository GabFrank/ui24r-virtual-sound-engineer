import type { ParameterKind } from './ownership.ts';

/**
 * La escala en que se cuenta **cuánto se mueve** una hoja.
 *
 * **Es una cosa distinta de la unidad de la magnitud, y ADR-039 las separa a
 * propósito.** La unidad de la magnitud —`Hz`, `Q`, `dB`— es la de la hoja
 * medida: es lo que ata el número que el motor juzga al crudo que va al cable,
 * y no se toca. La escala del movimiento es en qué moneda se acota un salto, y
 * para una frecuencia esa moneda **no** es el hercio: un tercio de octava son
 * 26 Hz sobre una campana en 100 Hz y 1300 Hz sobre una en 5 kHz, y al oído son
 * el mismo movimiento. Un tope en hercios acota en un punto del espectro y en
 * ningún otro.
 *
 * `movimiento(desde, hasta)` recibe las dos magnitudes en la unidad de la hoja y
 * devuelve el desplazamiento **con signo** en la unidad de la escala. Con signo
 * porque el acumulado por sesión es un desplazamiento neto y no una suma de
 * magnitudes: volver hacia donde estaba descuenta.
 */
export interface EscalaDelMovimiento {
  readonly unidad: string;
  movimiento(desde: number, hasta: number): number;
}

/**
 * La escala por omisión: la diferencia en la unidad de la magnitud.
 *
 * Es lo que toda familia tenía hasta ADR-039 —decibeles contra decibeles— y
 * sigue siendo correcta para todo lo que se mueve en su propia unidad.
 */
export function diferenciaEn(unidad: string): EscalaDelMovimiento {
  return { unidad, movimiento: (desde, hasta) => hasta - desde };
}

/**
 * Octavas: el movimiento de una campana de `f1` a `f2` es `log2(f2/f1)`.
 *
 * Es la razón por la que se ecualiza y se mide en fracciones de octava, y por la
 * que el analizador de esta consola reparte sus 122 bandas en doceavos de octava
 * y no en hercios (ADR-039, «Por qué un tope en hercios no es un tope»).
 */
export const OCTAVAS: EscalaDelMovimiento = {
  unidad: 'octavas',
  movimiento: (desde, hasta) => Math.log2(hasta / desde),
};

/**
 * El ancho de banda de una campana, en octavas, a partir de su Q.
 *
 * `BW = (2 / ln 2) · asinh(1 / 2Q)`. Sobre el tramo medido del Q —0,368 a
 * 2,710— da de 3,21 a 0,53 octavas.
 *
 * **Describe el ancho nominal, y hay que decirlo con todas las letras.** El Q
 * se midió sólo a 1 kHz, y la propia corrida documenta que arriba de unos 3 kHz
 * el ancho medido se despega del nominal: a 10,9 kHz un Q de 1,00 se mide como
 * 1,55. Así que esta conversión acota el ancho **declarado**; medir el ancho real
 * arriba de 3 kHz queda como tarea (ADR-039, «Lo que está medido»).
 */
export function anchoDeBandaEnOctavas(q: number): number {
  return (2 / Math.LN2) * Math.asinh(1 / (2 * q));
}

/**
 * Octavas de ancho de banda: la misma moneda que la frecuencia, que es la
 * tercera elección del usuario en ADR-039. Ensanchar o estrechar una campana se
 * cuenta como la diferencia entre sus dos anchos.
 */
export const OCTAVAS_DE_ANCHO_DE_BANDA: EscalaDelMovimiento = {
  unidad: 'octavas',
  movimiento: (desde, hasta) => anchoDeBandaEnOctavas(hasta) - anchoDeBandaEnOctavas(desde),
};

/**
 * Una hoja con tope propio: su unidad, su escala y sus dos números.
 *
 * Lo que la hoja **no** declara —el techo absoluto y la escucha mínima— lo pone
 * la familia, porque son criterios de la clase de parámetro y no de la hoja.
 */
export interface Hoja {
  /** Qué rutas son esta hoja. Sobre la ruta concreta, `i.3.eq.b2.freq`. */
  readonly ruta: RegExp;
  /** La familia a la que pertenece; tiene que coincidir con `clasificarRuta`. */
  readonly kind: ParameterKind;
  /** La unidad de la magnitud, la misma que la ley medida de la hoja. */
  readonly unidad: string;
  readonly escala: EscalaDelMovimiento;
  readonly porTransaccion: number;
  readonly acumuladoPorSesion: number;
}

/**
 * Un tercio de octava por paso y una octava acumulada por sesión.
 *
 * **Operacionalización del agente, sujeta a revisión, y no decisión del
 * usuario** (ADR-039, «Lo que es operacionalización del agente»). El tercio de
 * octava es el paso más fino con que se ecualiza y son cuatro bandas del
 * analizador de esta consola, así que un paso se puede comprobar midiendo; con
 * un doceavo el movimiento cae dentro de una sola banda y la comprobación no
 * distingue. La octava acumulada son tres pasos, y el presupuesto es chico a
 * propósito: poner la banda no lo gasta, lo que queda es afinar.
 */
const RETOQUE = { porTransaccion: 1 / 3, acumuladoPorSesion: 1 } as const;

/**
 * Las hojas que declaran tope propio. **Todo lo que no está acá se rige por su
 * familia**, que es el valor por omisión a propósito: lo contrario dejaría sin
 * tope a cualquier hoja que alguien agregue y se olvide, que es fallar abierto.
 *
 * **Sólo el ecualizador de canal**, que es lo que ADR-039 decidió. El compresor
 * tiene el mismo defecto de forma —cinco hojas en tres monedas— y la escala del
 * movimiento de su relación, que no tiene unidad, es una decisión propia que
 * sigue pendiente. No se inventa acá.
 *
 * **Las expresiones acotan el índice de banda a 1–4 y no acotan el canal.** La
 * banda 5 no está en la ley medida —se midió y no hace nada— y no tiene tope
 * porque no tiene nada que acotar. El canal se deja con `\d+` porque esta tabla
 * clasifica una hoja, no autoriza una ruta: quién puede escribir lo decide
 * `OWNERSHIP` y qué rutas existen lo decide el inventario.
 */
export const HOJAS: readonly Hoja[] = [
  {
    ruta: /^i\.\d+\.eq\.b[1-4]\.freq$/, kind: 'CHANNEL_EQ',
    unidad: 'Hz', escala: OCTAVAS, ...RETOQUE,
  },
  {
    ruta: /^i\.\d+\.eq\.b[1-4]\.q$/, kind: 'CHANNEL_EQ',
    unidad: 'Q', escala: OCTAVAS_DE_ANCHO_DE_BANDA, ...RETOQUE,
  },
  // **El pasa-altos: la hoja en hercios, con el tope de una octava del anexo B.**
  // Su familia declara `octavas` como unidad de la magnitud y por eso ese tope
  // no pudo correr nunca; acá la unidad vuelve a ser la de la ley medida y la
  // octava pasa a ser lo que de verdad se cuenta. Los dos números son los de
  // `LIMITES.HPF` --una octava por transacción, dos por sesión-- y no los del
  // retoque: son una decisión anterior, del primer commit del repositorio.
  //
  // **`eq.hpf.slope` no entra acá**, así que sigue rigiéndose por su familia y
  // su conducta no cambia: no tiene ley medida, no es una frecuencia, y qué
  // significa moverla es una pregunta que esta tarea no abre.
  {
    ruta: /^i\.\d+\.eq\.hpf\.freq$/, kind: 'HPF',
    unidad: 'Hz', escala: OCTAVAS, porTransaccion: 1, acumuladoPorSesion: 2,
  },
  // **El pasa-bajos toma los números del retoque, y es una elección del agente
  // sin decisión propia.** ADR-039 recupera `eq.lpf.freq` entre las 240 rutas y
  // no le pone número; el pasa-altos tiene el suyo desde el anexo B de la
  // auditoría del 2026-09-07 —una octava por transacción, dos por sesión— y
  // vive en su familia. Para el pasa-bajos se toma el tope más apretado de los
  // dos, el del retoque, porque correr el corte de agudos un tercio de octava
  // ya es un cambio de timbre que se oye. Si el usuario quiere que espeje al
  // pasa-altos, es cambiar dos números acá.
  {
    ruta: /^i\.\d+\.eq\.lpf\.freq$/, kind: 'CHANNEL_EQ',
    unidad: 'Hz', escala: OCTAVAS, ...RETOQUE,
  },
];

/** La hoja que declara tope propio para esta ruta, si la hay. */
export function hojaDe(path: string): Hoja | undefined {
  return HOJAS.find((h) => h.ruta.test(path));
}
