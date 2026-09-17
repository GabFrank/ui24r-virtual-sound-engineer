/**
 * Cuánto se corrió cada ruta en esta sesión, y cuáles ya se tocaron.
 *
 * **El agujero que esto empieza a cerrar.** `ContextoSeguridad` tiene tres
 * campos de historial y **los dos servicios que escriben en producción se los
 * pasan vacíos**, con el motivo declarado en el código: *«el historial de la
 * sesión no existe; van vacíos a propósito y no con datos inventados»*. Ser
 * honesto sobre el hueco no lo tapa, y el hueco deja **dos reglas del motor
 * existiendo en el código y no en el comportamiento**:
 *
 * - **El presupuesto por sesión** —6 dB en la ganancia, 4 en el envío a
 *   monitor— nunca se dispara, porque el acumulado siempre arranca en cero.
 * - **«Hay que comprobar el efecto antes de volver a moverlo»** nunca se
 *   dispara, porque sin rutas tocadas **cada cambio parece el primero**.
 *
 * Y la segunda falla **abierta**: la aplicación podría mover una ruta 2 dB, otra
 * vez 2 dB, y así sin fin. No pasó nunca porque ninguna pantalla repite un
 * cambio —la de ganancia aplica una vez y el servicio de monitor no tiene
 * pantalla—. La rampa de [ADR-034](../../../docs/adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md)
 * es lo primero que repite, y entraría justo por ahí.
 *
 * Es la misma forma que `techoPorRuta`, que también consultaba un mapa que nadie
 * llenaba, y la misma que INV-034: **una invariante viva pero inerte**.
 *
 * ## Por qué se reconstruye del diario y no se lleva en memoria
 *
 * Porque la sesión sobrevive a la aplicación. El diario se escribe **antes** de
 * cada escritura (INV-020) y está en la base; un contador en memoria se pierde
 * con el proceso, y lo que se perdería es justamente el freno. Una sesión que se
 * reanuda después de una caída tiene que seguir sabiendo cuánto movió.
 *
 * ## Lo que este módulo NO hace todavía, y hay que decirlo
 *
 * **No calcula `rutasConMedicionPosterior`.** Esa es la tercera, la que
 * convierte una serie de cambios en una rampa que escucha. El dato existe en la
 * base —`transaction_journal` tiene `measurement_after_id`— pero **no está
 * expuesto en `EntradaDiario`**, así que plumbearlo toca el esquema y la
 * consulta, y va aparte. Hasta entonces el motor la sigue recibiendo vacía y
 * **esa regla sigue inerte**: se dice acá para que no parezca cerrada.
 */
import type { EntradaDiario } from './journal.ts';

/** Lo que el historial puede contestar hoy. */
export interface HistorialDeLaSesion {
  /**
   * Cuánto se corrió cada ruta respecto de donde estaba al empezar, **en la
   * unidad declarada de cada cambio**.
   *
   * Es una suma con signo, no de magnitudes: un cambio que devuelve la ruta
   * hacia donde estaba **descuenta**, que es lo que el motor espera —*«un
   * movimiento que acerca el parámetro a su valor inicial siempre es
   * admisible»*—.
   */
  readonly acumuladoPorRuta: ReadonlyMap<string, number>;
  /** Las rutas que esta sesión ya movió al menos una vez. */
  readonly rutasYaTocadas: ReadonlySet<string>;
}

/**
 * **Sólo cuenta lo que de verdad llegó a la consola.**
 *
 * Un cambio que el motor rechazó, que nunca se envió, o que se envió y no se
 * confirmó, **no movió nada en la sala**: contarlo gastaría presupuesto por algo
 * que no sonó, y el músico se quedaría sin los decibeles que nadie usó. El
 * criterio es `verificado`, que el ejecutor pone en `true` sólo cuando la
 * escritura resultó `APPLIED`.
 *
 * **Las entradas revertidas se cuentan igual, y no es un olvido.** Una reversión
 * es otro par de escrituras que también sonaron: lo que las cancela es la suma
 * con signo, no ignorarlas. Si se ignoraran, aplicar y revertir doce veces
 * costaría cero presupuesto habiendo movido la cuña veinticuatro.
 */
export function historialDeLaSesion(
  entradas: readonly EntradaDiario[],
): HistorialDeLaSesion {
  const acumulado = new Map<string, number>();
  const tocadas = new Set<string>();

  for (const entrada of entradas) {
    for (const c of entrada.cambios) {
      if (!c.verificado) continue;
      // **Un salto desde el silencio no se puede acumular, y no se inventa.**
      // Salir de −∞ es lo que ADR-034 llama «el primer paso», y su delta no es
      // un número: sumarlo envenena el acumulado de esa ruta para toda la
      // sesión. La ruta queda tocada —se movió— y su desplazamiento arranca a
      // contarse desde donde el silencio quedó atrás.
      const delta = c.magnitudEnviada - c.magnitudEsperada;
      tocadas.add(c.path);
      if (!Number.isFinite(delta)) continue;
      acumulado.set(c.path, (acumulado.get(c.path) ?? 0) + delta);
    }
  }

  return { acumuladoPorRuta: acumulado, rutasYaTocadas: tocadas };
}
