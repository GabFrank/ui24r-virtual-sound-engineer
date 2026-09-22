/**
 * La operación «poner la banda» (ADR-039, decisión 3).
 *
 * Poner una banda encima de una resonancia es **una transacción de tres cambios
 * sobre la misma banda del mismo canal, en este orden**: la ganancia a 0 dB,
 * después la frecuencia, después el ancho. El permiso que ADR-039 le concede
 * —que el salto de frecuencia y de ancho no lleve tope por transacción— sale de
 * que la campana queda muda: una campana en ganancia unidad es transparente,
 * esté donde esté su centro.
 *
 * **El orden es parte de la decisión y no un detalle.** El ejecutor escribe los
 * cambios uno por uno, en el orden de la lista, con su espera en el medio: los
 * intermedios suenan. Con la frecuencia antes que la ganancia, el salto sale al
 * cable con la campana todavía en su ganancia vieja —hasta cuatro decibeles,
 * por el propio tope que ADR-039 conserva— y cuatro decibeles de campana
 * barriendo el espectro se oyen. Lo encontró la auditoría de la propia ADR.
 *
 * **Se comprueba sobre el contenido de la transacción, y la etiqueta es
 * necesaria y no suficiente.** Es la misma forma que `correspondeExencionDeSistema`:
 * quien propone declara `PONER_LA_BANDA`, y el motor mira si los tres cambios de
 * verdad tienen esa forma. Lo contrario sería «pedir la exención diciendo que se
 * la merece». Y es la única forma que el motor puede comprobar: condicionar el
 * permiso a la ganancia que la banda tenga en la consola —la alternativa F de la
 * ADR— depende de un dato que el motor no tiene, porque no lee el aparato.
 *
 * **Lo que esta comprobación NO garantiza, con todas las letras.** Que la
 * ganancia quede en cero es una propiedad de lo que la transacción **declara**.
 * Quien ata cada ruta al estado real es `coincideConEsperado` (INV-011), después
 * del veredicto y antes de enviar, ruta por ruta; y `verificarAtadura` ata la
 * magnitud declarada al crudo con una holgura del 1 % del recorrido, que en la
 * ganancia son 0,4 dB. La garantía que se sostiene, sobre el cable: la
 * frecuencia no sale antes que la ganancia, y si la ganancia no coincide con lo
 * declarado, la transacción aborta antes de escribirla.
 *
 * **Y la exención que esta forma habilita NO está construida todavía.** Lo que
 * sostiene que el salto es mudo es la teoría del filtro y una cota sobre una
 * configuración quieta, no una medición de este aparato con una campana
 * moviéndose. Hasta que esa medición exista, reconocer la forma sólo agrega una
 * exigencia —una transacción etiquetada así que no la tenga se rechaza— y los
 * tres cambios siguen pasando por sus topes de siempre. Cuando se mida, la
 * exención se construye donde el motor consulta esta función, con su nombre.
 */

/** La etiqueta con que quien propone declara la operación. */
export const PONER_LA_BANDA = 'PONER_LA_BANDA';

/** Lo que de un cambio hace falta para juzgar la forma. */
export interface CambioDeLaBanda {
  readonly path: string;
  readonly unidad: string;
  readonly magnitudPropuesta: number;
}

export type FormaDePonerLaBanda =
  | { readonly bienFormada: true; readonly canal: string; readonly banda: string }
  | { readonly bienFormada: false; readonly motivo: string };

const HOJA_DE_BANDA = /^i\.(\d+)\.eq\.(b[1-4])\.(gain|freq|q)$/;
const ORDEN = ['gain', 'freq', 'q'] as const;

/**
 * ¿Estos cambios tienen la forma de «poner la banda»?
 *
 * Tres cambios, las tres hojas de la misma banda del mismo canal, en el orden
 * ganancia → frecuencia → ancho, con la ganancia declarada **exactamente** en
 * 0 dB. Cada condición que falla se nombra: quien propuso necesita saber cuál.
 */
export function formaDePonerLaBanda(cambios: readonly CambioDeLaBanda[]): FormaDePonerLaBanda {
  if (cambios.length !== ORDEN.length) {
    return {
      bienFormada: false,
      motivo: `poner la banda son exactamente ${ORDEN.length} cambios —ganancia, frecuencia `
        + `y ancho de una misma banda— y la transacción trae ${cambios.length}`,
    };
  }
  const partes = cambios.map((c) => HOJA_DE_BANDA.exec(c.path));
  for (let i = 0; i < cambios.length; i++) {
    if (partes[i] === null) {
      return {
        bienFormada: false,
        motivo: `${cambios[i]!.path} no es una hoja de una banda del ecualizador de canal`,
      };
    }
  }
  const [canal, banda] = [partes[0]![1]!, partes[0]![2]!];
  for (let i = 0; i < cambios.length; i++) {
    const p = partes[i]!;
    if (p[1] !== canal || p[2] !== banda) {
      return {
        bienFormada: false,
        motivo: `los tres cambios tienen que ser de la misma banda del mismo canal: `
          + `${cambios[0]!.path} y ${cambios[i]!.path} no lo son`,
      };
    }
    if (p[3] !== ORDEN[i]) {
      return {
        bienFormada: false,
        motivo: `el orden es ganancia, frecuencia y ancho —la ganancia primero, porque el `
          + `ejecutor escribe uno por uno y una campana con ganancia barriendo el espectro `
          + `se oye— y en la posición ${i + 1} viene ${p[3]} en vez de ${ORDEN[i]}`,
      };
    }
  }
  const ganancia = cambios[0]!;
  // **`===` y no una holgura, a propósito.** La campana es muda en ganancia
  // unidad; «casi cero» ya es una campana. La holgura que exista es la de
  // `verificarAtadura` entre lo declarado y el crudo, y esa no se duplica acá.
  if (ganancia.unidad !== 'dB' || ganancia.magnitudPropuesta !== 0) {
    return {
      bienFormada: false,
      motivo: `la ganancia tiene que quedar exactamente en 0 dB —es lo que hace muda a la `
        + `campana— y el cambio declara ${String(ganancia.magnitudPropuesta)} ${ganancia.unidad}`,
    };
  }
  return { bienFormada: true, canal, banda };
}
