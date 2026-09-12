/**
 * Arrastrar para reordenar una lista, con el dedo.
 *
 * **Por qué a mano y no con una biblioteca.** El repositorio no depende de
 * `@angular/cdk`, así que no hay `cdkDropList`; el único precedente de arrastre
 * táctil es el plano del escenario, hecho con eventos de puntero. Lo comprobó un
 * auditor antes de que esto existiera.
 *
 * **Y por qué eventos de puntero y no la interfaz de arrastre del navegador.**
 * `draggable` con `dragstart` funciona con ratón —y en una captura automática—
 * y **no dispara con el dedo** en el navegador incrustado de Android. Un test
 * que use el ratón no distingue una implementación de la otra: por eso la
 * aritmética vive acá, separada del componente, y se prueba sin navegador.
 *
 * Lo que este archivo NO hace: no toca el DOM, no guarda nada y no sabe qué es
 * un instrumento. Convierte un gesto en un índice de destino.
 */

/** Un arrastre de reordenamiento en curso. */
export interface ArrastreDeLista {
  /** Qué fila se levantó. */
  readonly desde: number;
  /**
   * El puntero que lo empezó.
   *
   * Un segundo dedo sobre otra fila no puede secuestrar el arrastre. El plano
   * del escenario ya tuvo ese defecto y la lección viaja acá.
   */
  readonly pointerId: number;
  /** Dónde cayó el dedo al apoyarse, en píxeles de la página. */
  readonly agarreY: number;
  /** El alto de una fila, en píxeles. Lo mide quien llama. */
  readonly altoDeFila: number;
  /** Cuántas filas hay. */
  readonly cuantas: number;
}

/**
 * Cuántos píxeles tiene que moverse el dedo para que cuente como arrastre.
 *
 * Separa tocar de arrastrar: sin él, apoyar el dedo en el asidero y levantarlo
 * cuenta como gesto y ensucia el dato.
 *
 * **Es el mismo número que usa el plano del escenario, y hay un test que los
 * compara.** Un docblock anterior lo afirmaba sin nada que lo atara, y una
 * auditoría comprobó que era cierto **hoy** y que podía dejar de serlo en
 * silencio. No se importa de allá porque acoplaría dos pantallas que no tienen
 * relación; se declara acá y se comprueba que no se separen, que es el mismo
 * patrón con que este repositorio ata el blanco táctil a su ficha de diseño.
 */
export const UMBRAL_DE_ARRASTRE_PX = 8;

/**
 * En qué puesto quedaría la fila si se soltara el dedo acá.
 *
 * Devuelve `null` mientras el dedo no superó el umbral: hasta entonces el gesto
 * todavía puede ser un toque.
 *
 * **Se calcula desde el desplazamiento del dedo, no desde su posición
 * absoluta.** Con la posición absoluta, agarrar la fila por abajo la movería un
 * puesto de entrada aunque el dedo no se hubiera movido — que es el defecto que
 * el plano del escenario tuvo y que una auditoría midió en 34 cm.
 */
export function destinoDelArrastre(a: ArrastreDeLista, ahoraY: number): number | null {
  const dy = ahoraY - a.agarreY;
  if (Math.abs(dy) < UMBRAL_DE_ARRASTRE_PX) return null;
  if (a.altoDeFila <= 0) return null;
  // Se redondea porque el salto de puesto ocurre cuando la fila pasa la MITAD
  // de la siguiente: con `trunc`, habría que arrastrar una fila entera para que
  // se moviera, y el gesto se sentiría trabado.
  const saltos = Math.round(dy / a.altoDeFila);
  return recortar(a.desde + saltos, 0, Math.max(0, a.cuantas - 1));
}

/**
 * Recorta, y trata lo que no es un número finito como el mínimo.
 *
 * **La guarda de `NaN` quedó pendiente en un barrido de mutaciones**: el auditor
 * rastreó los tres llamadores y no encontró camino vivo desde la pantalla
 * —`clientY` y la altura del rectángulo son finitos—, pero no declaró
 * equivalencia por no haber encontrado contraejemplo, que es lo correcto.
 *
 * Se resuelve fijándola con un caso en vez de borrarla: la firma declara
 * `number`, que incluye `NaN`, y estas funciones son de la interfaz exportada.
 * El criterio del proyecto es que una defensa **inalcanzable** se saca; ésta es
 * alcanzable desde afuera, así que se prueba.
 */
function recortar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Cuánto hay que correr la fila levantada para que siga al dedo, en píxeles.
 *
 * Es sólo dibujo: no cambia ningún dato. Se recorta a los extremos de la lista
 * para que la fila no se vaya de la pantalla cuando el dedo sí lo hace.
 */
export function desplazamientoVisual(a: ArrastreDeLista, ahoraY: number): number {
  const dy = ahoraY - a.agarreY;
  const arriba = -a.desde * a.altoDeFila;
  const abajo = (a.cuantas - 1 - a.desde) * a.altoDeFila;
  return recortar(dy, arriba, abajo);
}

/**
 * Cómo queda la lista **mientras** se arrastra, sin tocar el dato.
 *
 * La fila levantada se saca de su puesto y se mete en el de destino, para que
 * las demás se corran bajo el dedo y el usuario vea dónde va a caer. Devuelve
 * índices dentro del arreglo original.
 */
export function ordenEnVuelo(cuantas: number, desde: number, hasta: number): readonly number[] {
  const indices = Array.from({ length: cuantas }, (_, i) => i);
  if (desde < 0 || desde >= cuantas) return indices;
  const destino = recortar(hasta, 0, cuantas - 1);
  const [movido] = indices.splice(desde, 1);
  indices.splice(destino, 0, movido!);
  return indices;
}
