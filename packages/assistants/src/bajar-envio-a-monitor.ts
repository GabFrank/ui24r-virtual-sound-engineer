import type { SessionState } from '@vse/domain';
import { LIMITES } from '@vse/domain';
import { aRaw, entrada, esNivelDeEnvioAMonitor } from '@vse/mixer-adapter';

/**
 * Si el envío de un canal a un monitor se puede bajar ahora, y hasta dónde.
 *
 * **Es el paso que faltaba para que ADR-028 haga algo.** Ese ADR abrió las 240
 * rutas `i.N.aux.M.value` y su propia sección de huecos dice, primero de todo:
 *
 * > *«Ningún camino de la aplicación propone un cambio de envío a monitor. El
 * > único `CambioPropuesto` que se construye en producción en todo el
 * > repositorio es `aplicar-ganancia.service.ts`. ADR-028 no cambia nada
 * > observable hoy: abre una puerta que nadie usa todavía.»*
 *
 * **Vive acá y no en el servicio de Angular para poder probarse**, igual que
 * `puedeAplicarGanancia`: es la decisión que abre la puerta a escribir en la
 * consola de alguien, y dejarla enredada con la inyección de dependencias la
 * volvería comprobable sólo a mano.
 *
 * ## De dónde salen las reglas
 *
 * Del usuario, textual, el 2026-09-12: *«Si el acople es muy fuerte entonces
 * bajo el nivel del auxiliar o pa, dependiendo de donde se escucha, luego vuelvo
 * a subir de a poco buscando el acople nuevamente»*. O sea: **esta función sólo
 * baja**. Volver a subir es del usuario, y el techo —«hasta donde estaba»— lo
 * hace cumplir el motor.
 *
 * Y de ADR-028, que razonó por qué `SHOW` es el único estado cerrado: lo que
 * separa `FULL_BAND` y `RINGOUT` de `SHOW` no es «en vivo» sino **quién está
 * mirando**. Ajustar un monitor con la banda tocando es exactamente el caso que
 * el usuario pidió; con público, un cambio sorpresa en la cuña de un músico no
 * tiene quien lo atrape.
 *
 * ## Lo que esta función agrega y el motor no hacía
 *
 * **Se niega a proponer un nivel cuya ley no se midió.** La conversión de dB a
 * crudo sale de `aRaw`, que desde el ítem 104 tiene la ley del envío medida
 * contra un convertidor externo — y **sólo en el tramo que se midió**, crudo
 * 0,25 a 1,0. Pedir −40 dB de envío devuelve `FUERA_DE_RANGO` y se dice, en vez
 * de escribir un número que sale de extrapolar.
 *
 * Es la primera vez en este proyecto que una medición cambia lo que la
 * aplicación puede hacer.
 */

/** Lo que hace falta saber para decidir. */
export interface EstadoParaBajarMonitor {
  /** La ruta canónica del nivel: `i.N.aux.M.value`. */
  readonly ruta: string;
  /** Dónde está el envío ahora, en dB. Lo lee el adaptador, no se supone. */
  readonly nivelActualDb: number;
  /** Cuánto se quiere bajar, en dB y positivo. */
  readonly bajarDb: number;
  readonly sessionState: SessionState | null;
  readonly paroDeEmergencia: boolean;
  readonly conexionPermiteEscribir: boolean;
}

export type VeredictoDeBajada =
  | {
      readonly puede: true;
      /** El nivel al que quedaría, en dB. */
      readonly destinoDb: number;
      /** El crudo que va al cable, atado a `destinoDb` por la ley medida. */
      readonly crudo: number;
    }
  | { readonly puede: false; readonly motivo: string };

/**
 * El motivo se devuelve siempre, y es deliberado.
 *
 * Una pantalla que apaga un botón sin decir por qué obliga a adivinar. Acá el
 * motivo casi siempre es accionable —conectá la consola, salí del show, pedí
 * menos decibeles—, así que decirlo convierte una traba en el siguiente paso.
 */
export function puedeBajarEnvioAMonitor(e: EstadoParaBajarMonitor): VeredictoDeBajada {
  if (e.paroDeEmergencia) {
    return { puede: false, motivo: 'el paro de emergencia está activo' };
  }

  if (!e.conexionPermiteEscribir) {
    return { puede: false, motivo: 'la consola no está conectada con el estado confirmado' };
  }

  // **La forma canónica y el rango real, y no una expresión regular.** Una
  // auditoría midió lo que dejaba pasar la lista blanca vieja: `i.24.aux.0.value`
  // —un canal que esta consola no tiene— y `i.03.aux.1.value`, que es la misma
  // ruta que suena en la sala alcanzada por una clave que el techo por ruta no
  // cuenta.
  if (!esNivelDeEnvioAMonitor(e.ruta)) {
    return {
      puede: false,
      motivo: `${e.ruta} no es un nivel de envío a monitor de esta consola`,
    };
  }

  if (e.sessionState === 'SHOW') {
    return {
      puede: false,
      motivo: 'con público en la sala el envío a monitor no se toca: un cambio en la '
        + 'cuña de un músico no tiene quien lo atrape',
    };
  }

  // **Sólo baja.** Subir es del usuario —«vuelvo a subir de a poco»— y el techo
  // de «hasta donde estaba» lo hace cumplir el motor, que es quien tiene el
  // estado por ruta.
  if (!(e.bajarDb > 0)) {
    return {
      puede: false,
      motivo: 'esta función sólo baja: volver a subir lo hace el usuario, de a poco',
    };
  }

  const tope = LIMITES.MONITOR_AUX_SEND?.porTransaccion;
  if (tope !== undefined && e.bajarDb > tope) {
    return {
      puede: false,
      motivo: `el envío a monitor se mueve hasta ${tope} dB por vez y se pidieron `
        + `${e.bajarDb}: bajá de a poco y volvé a escuchar`,
    };
  }

  if (!Number.isFinite(e.nivelActualDb)) {
    return {
      puede: false,
      motivo: 'no se sabe dónde está el envío ahora, así que no hay desde dónde bajar',
    };
  }

  const destinoDb = e.nivelActualDb - e.bajarDb;
  const r = aRaw(e.ruta, destinoDb);
  if (!r.ok) {
    // **El caso que importa y que antes no existía.** `FUERA_DE_RANGO` significa
    // que el destino cae afuera del tramo que la medición cubrió, y proponerlo
    // sería extrapolar una ley. El ítem 104 midió de −32,14 a +10 dB.
    const e2 = entrada(e.ruta);
    const tramo = e2 === undefined ? '' : ` La ley está medida de ${e2.fisicoMin.toFixed(1)} `
      + `a ${e2.fisicoMax.toFixed(1)} dB (${e2.spike}).`;
    return { puede: false, motivo: `${r.mensaje}.${tramo}` };
  }

  return { puede: true, destinoDb, crudo: r.raw };
}
