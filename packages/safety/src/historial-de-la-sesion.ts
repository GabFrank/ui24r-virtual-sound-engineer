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
 * ## La tercera, que es la que hace que una rampa sea una rampa
 *
 * `rutasConMedicionPosterior` contesta *«¿se escuchó después del último cambio
 * de esta ruta?»*, y es lo que convierte una serie de escrituras en una rampa.
 * Sale de `EntradaDiario.medicionPosteriorId`, que se agregó junto con este
 * módulo: la columna estaba en la base desde el esquema inicial y **nunca tuvo
 * quien la llenara**.
 *
 * **Mira sólo la última transacción que tocó cada ruta**, no si alguna vez hubo
 * una medición. Haber escuchado hace tres pasos no autoriza el cuarto.
 *
 * ## La cuarta, que es el ancla de ADR-034
 *
 * `rutasConNivelEstablecido` contesta *«¿alguien fijó ya el nivel de trabajo de
 * esta cuña?»*, y con eso el motor sabe si está poniendo el nivel o retocándolo.
 * Sale de `EntradaDiario.nivelEstablecidoEn`, que nace con este cambio.
 *
 * **Y es lo que además rebasa el acumulado.** Establecer el nivel no sólo cambia
 * qué reglas rigen: mueve la referencia desde la que se cuenta. Las dos cosas son
 * la misma frase de ADR-034 —*«poner el nivel fija el ancla, y retocar se mide
 * desde ahí»*— y separarlas dejaría al retoque naciendo con el presupuesto ya
 * gastado por la rampa.
 */
import type { EntradaDiario } from './journal.ts';

/** Lo que el historial puede contestar hoy. */
export interface HistorialDeLaSesion {
  /**
   * Cuánto se corrió cada ruta respecto de **la referencia vigente**, en la
   * unidad declarada de cada cambio.
   *
   * Es una suma con signo, no de magnitudes: un cambio que devuelve la ruta
   * hacia donde estaba **descuenta**, que es lo que el motor espera —*«un
   * movimiento que acerca el parámetro a su valor inicial siempre es
   * admisible»*—.
   *
   * **La referencia es dónde estaba la ruta al empezar la sesión, salvo que
   * alguien haya establecido un nivel de trabajo**; desde ese momento la
   * referencia es ese nivel y la cuenta arranca de nuevo. Decirlo así --y no
   * «respecto de donde estaba al empezar»-- es la mitad de ADR-034 que vive acá:
   * *«poner el nivel fija el ancla, y retocar se mide desde ahí»*. Sin esto, una
   * cuña levantada veinticinco decibeles desde el piso llegaría al primer retoque
   * con el presupuesto de 4 dB agotado seis veces, y el motor la dejaría clavada
   * justo cuando empieza el trabajo fino.
   */
  readonly acumuladoPorRuta: ReadonlyMap<string, number>;
  /** Las rutas que esta sesión ya movió al menos una vez. */
  readonly rutasYaTocadas: ReadonlySet<string>;
  /**
   * Las rutas cuyo **último** cambio tiene una medición anotada después.
   *
   * El motor lo usa para negarse a mover dos veces sin escuchar en el medio. Una
   * ruta que no está acá o no se tocó nunca —y entonces no hace falta— o se
   * movió y nadie anotó haber escuchado.
   */
  readonly rutasConMedicionPosterior: ReadonlySet<string>;
  /**
   * Las rutas cuyo nivel de trabajo esta sesión ya estableció.
   *
   * El motor lo usa para saber en cuál de las dos operaciones de ADR-034 está
   * cada ruta. Una que no está acá todavía se está poniendo: su presupuesto
   * acumulado queda suspendido y lo que la acota es el techo de nominal.
   */
  readonly rutasConNivelEstablecido: ReadonlySet<string>;
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
  const conNivel = new Set<string>();
  /** Por ruta, si la ÚLTIMA transacción que la movió tiene medición después. */
  const escuchadaAlFinal = new Map<string, boolean>();

  // **El orden lo pone el almacén** --`deLaSesion` ordena por fecha de
  // creación-- y acá se recorre tal cual. Reordenar de nuevo escondería el día
  // que alguien llame con una lista suelta: que el orden sea del almacén está
  // escrito en la interfaz del diario, y es ahí donde tiene que sostenerse.
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
      // Se pisa en cada vuelta a propósito: gana la última, que es la que el
      // motor tiene que mirar antes del próximo movimiento.
      escuchadaAlFinal.set(c.path, entrada.medicionPosteriorId !== null);
      if (!Number.isFinite(delta)) continue;
      acumulado.set(c.path, (acumulado.get(c.path) ?? 0) + delta);
    }

    // **Después de contar los cambios de esta transacción, no antes.** La
    // transacción que establece el nivel es la que lo alcanzó: sus decibeles son
    // el último paso de la rampa y pertenecen a la rampa. Resetear primero los
    // cobraría contra el presupuesto del retoque, que empieza recién acá.
    //
    // **`?? []` porque una entrada vieja no trae el campo.** El diario se
    // serializa entero como JSON, así que las transacciones anteriores a esta
    // pieza vuelven sin él, y `for…of undefined` estalla. La ausencia es
    // «ninguna ruta», que además es lo cierto: cuando esas entradas se
    // escribieron, establecer un nivel no existía.
    for (const ruta of entrada.nivelEstablecidoEn ?? []) {
      conNivel.add(ruta);
      acumulado.set(ruta, 0);
    }
  }

  const conMedicion = new Set<string>();
  for (const [ruta, escuchada] of escuchadaAlFinal) if (escuchada) conMedicion.add(ruta);

  return {
    acumuladoPorRuta: acumulado,
    rutasYaTocadas: tocadas,
    rutasConMedicionPosterior: conMedicion,
    rutasConNivelEstablecido: conNivel,
  };
}
