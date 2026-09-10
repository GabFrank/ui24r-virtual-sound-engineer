/**
 * Si el ajuste que se aplicó sirvió de algo.
 *
 * **Es la última pata del lazo, y la que decide si el lazo existe.** Medir,
 * proponer y aplicar sin esto es una escritura con acuse de recibo: se sabe que
 * la perilla se movió, no que haya servido. ADR-026 lo decidió así por el caso
 * que interesa, que es justamente el otro — la propuesta era razonable, el
 * valor entró, y el efecto no fue el esperado: porque el previo llegó a su
 * tope, porque hay un límite antes, porque la fuente cambió entre una medición
 * y la otra. Sin volver a medir, eso queda sin detectar y la aplicación informa
 * un éxito que no hubo.
 *
 * **Lo que se compara es el margen contra su objetivo**, no el pico contra el
 * pico. Que el nivel haya subido 3 dB es interesante; que el canal haya quedado
 * donde su perfil quiere es la pregunta.
 */

/** Cuánto puede quedar el margen del objetivo y seguir contando como logrado. */
export const TOLERANCIA_OBJETIVO_DB = 2;

/**
 * Cuánto tiene que acercarse al objetivo para contar como mejora.
 *
 * Si no llegó al objetivo pero se acercó bastante, no es un fracaso: es un paso
 * del que conviene dar otro. El asistente ya acota los cambios grandes en
 * varios pasos justamente para poder verificar cada uno.
 */
export const MEJORA_MINIMA_DB = 1;

export interface EntradaVerificacion {
  /** Margen medido antes de aplicar. */
  readonly margenAntesDb: number;
  /** Margen medido después de aplicar, en una ventana nueva. */
  readonly margenDespuesDb: number;
  /** El margen que el perfil del canal busca. */
  readonly objetivoDb: number;
  /** Si la ventana posterior tuvo señal suficiente para creerle. */
  readonly ventanaPosteriorSuficiente: boolean;
}

export type VeredictoDeAjuste =
  | { readonly estado: 'EN_EL_OBJETIVO'; readonly margenDb: number }
  | { readonly estado: 'MEJORO'; readonly margenDb: number; readonly faltaDb: number }
  | { readonly estado: 'NO_MEJORO'; readonly margenDb: number; readonly ofrecerRevertir: true }
  | { readonly estado: 'EMPEORO'; readonly margenDb: number; readonly ofrecerRevertir: true }
  | { readonly estado: 'SIN_MEDICION' };

/**
 * El veredicto sobre un ajuste ya aplicado.
 *
 * **`SIN_MEDICION` no es un fallo del ajuste.** Que el músico haya dejado de
 * tocar antes de la segunda ventana no dice nada sobre si el cambio sirvió, y
 * tratarlo como fracaso llevaría a revertir cambios buenos. Se informa como lo
 * que es: quedó sin verificar.
 */
export function verificarAjuste(e: EntradaVerificacion): VeredictoDeAjuste {
  if (!e.ventanaPosteriorSuficiente || !Number.isFinite(e.margenDespuesDb)) {
    return { estado: 'SIN_MEDICION' };
  }

  const distanciaAhora = Math.abs(e.margenDespuesDb - e.objetivoDb);
  if (distanciaAhora <= TOLERANCIA_OBJETIVO_DB) {
    return { estado: 'EN_EL_OBJETIVO', margenDb: e.margenDespuesDb };
  }

  // **Se compara la DISTANCIA al objetivo, no el margen a secas.** Un canal con
  // poco margen puede necesitar más y otro menos; lo que importa es si quedó
  // más cerca de donde su perfil lo quiere.
  const distanciaAntes = Math.abs(e.margenAntesDb - e.objetivoDb);
  const acercamiento = distanciaAntes - distanciaAhora;

  if (acercamiento >= MEJORA_MINIMA_DB) {
    return { estado: 'MEJORO', margenDb: e.margenDespuesDb, faltaDb: distanciaAhora };
  }

  // Alejarse del objetivo es peor que no moverse, y se distingue: son dos cosas
  // distintas para el operador. «No pasó nada» invita a repetir; «quedó peor»
  // invita a revertir.
  if (acercamiento < 0) {
    return { estado: 'EMPEORO', margenDb: e.margenDespuesDb, ofrecerRevertir: true };
  }
  return { estado: 'NO_MEJORO', margenDb: e.margenDespuesDb, ofrecerRevertir: true };
}
