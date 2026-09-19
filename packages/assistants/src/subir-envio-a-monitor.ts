import type { SessionState } from '@vse/domain';
import { LIMITES } from '@vse/domain';
import type { LeyDelEnvioAMonitor } from './bajar-envio-a-monitor.ts';

/**
 * Si el envío de un canal a un monitor se puede **subir** ahora, y hasta dónde.
 *
 * **Es la pieza que hacía falta para que ADR-034 sirva de algo.** Ese ADR separó
 * poner el nivel de una cuña de retocarlo, y el motor sabe distinguirlos desde el
 * 2026-09-17; lo que no existía era **quien lo propusiera**. El único asistente
 * de monitor sabía bajar, por la regla del usuario sobre el acople, y subir
 * quedaba enteramente en sus manos.
 *
 * ## Por qué es una función nueva y no un parámetro de la que baja
 *
 * `puedeBajarEnvioAMonitor` tiene una regla en el nombre y otra en el cuerpo:
 * *«esta función sólo baja: volver a subir lo hace el usuario»*, que es una cita
 * del usuario sobre cómo caza un acople. Meterle un signo la volvería una función
 * cuyo nombre miente y cuyo docblock cita al usuario diciendo lo contrario de lo
 * que hace.
 *
 * Y las dos direcciones **no son simétricas**, que es el argumento de fondo:
 * bajar siempre se puede —el silencio es un destino válido y no hay piso que
 * proteger—, y subir tiene tres cosas que bajar no tiene: el techo en nominal,
 * el borde del silencio, y que el paso siguiente exige haber escuchado el
 * anterior. Una sola función con tres ramas que sólo valen para un signo es dos
 * funciones mal cosidas.
 *
 * Comparten lo que de verdad es común —la ley del envío, que entra por
 * parámetro— y `LeyDelEnvioAMonitor` se importa de allá en vez de copiarse.
 *
 * ## Las reglas, y de dónde sale cada una
 *
 * - **Sólo sube.** Simétrico de la otra: pedir un número que no es positivo es
 *   pedirle a esta función algo que no hace.
 * - **2 dB por vez**, de `LIMITES.MONITOR_AUX_SEND.porTransaccion`, leído de la
 *   tabla y no escrito acá. Es lo que hace de esto una rampa y no una corrida.
 * - **Techo en nominal, 0 dB**, de `techoAbsoluto` de la misma tabla. Decisión
 *   del usuario en ADR-034, entre cuatro opciones, y rige **también al retocar**.
 * - **El primer paso desde el silencio es un caso aparte**, decisión del usuario
 *   entre tres opciones: se va al punto más bajo que la ley sabe escribir, no a
 *   «2 dB más arriba», porque desde el silencio no hay desde dónde contar 2 dB.
 *   El motor lo concede **sólo** hacia ese punto (`SALIDA_DEL_SILENCIO_NO_PERMITIDA`),
 *   así que proponerlo de otra forma es proponer algo que va a rebotar.
 * - **Nunca fuera del tramo medido**, igual que la que baja: la ley del ítem 104
 *   cubre de −32,14 a +10 dB y afuera de ahí proponer es extrapolar.
 *
 * ## Lo que esta función NO decide, y hay que decirlo
 *
 * **No sabe si se escuchó entre un paso y el siguiente.** Eso vive en el
 * historial de la sesión, que sale del diario, y lo hace cumplir el motor. Un
 * asistente que llevara su propia cuenta tendría una segunda copia de la regla
 * que envejecería sola, que es la trampa que este repositorio ya pagó. Así que
 * esta función puede decir «sí» a un paso que el motor después rechaza por falta
 * de escucha, **y está bien**: el motor es la autoridad y el asistente propone.
 *
 * Tampoco decide si la cuña ya tiene nivel establecido, por lo mismo.
 */

/** Lo que hace falta saber para decidir si se sube. */
export interface EstadoParaSubirMonitor {
  /** La ruta canónica del nivel: `i.N.aux.M.value`. */
  readonly ruta: string;
  /**
   * Dónde está el envío ahora, en dB. Lo lee el adaptador, no se supone.
   *
   * **`-Infinity` es un valor legítimo acá y significa silencio**, que es el
   * caso principal al empezar un soundcheck. La que baja lo rechaza —no hay
   * desde dónde bajar— y ésta lo trata como el borde que ADR-034 nombró.
   */
  readonly nivelActualDb: number;
  /**
   * Cuánto se quiere subir, en dB y positivo.
   *
   * **Se ignora cuando la cuña está en silencio**, y no es un descuido: desde el
   * silencio el destino no lo elige quien pide sino la ley, porque no hay punto
   * desde el cual contar. El veredicto lo dice.
   */
  readonly subirDb: number;
  readonly sessionState: SessionState | null;
  readonly paroDeEmergencia: boolean;
  readonly conexionPermiteEscribir: boolean;
}

export type VeredictoDeSubida =
  | {
      readonly puede: true;
      /** El nivel al que quedaría, en dB. */
      readonly destinoDb: number;
      /** El crudo que va al cable, atado a `destinoDb` por la ley medida. */
      readonly crudo: number;
      /**
       * Si este paso es el primero desde el silencio.
       *
       * Sirve para dos cosas: que la pantalla pueda decírselo al músico —«te la
       * enciendo bajita»— y que quien arme el `CambioPropuesto` sepa que tiene
       * que declarar `magnitudEsperada: -Infinity`, que es lo único que el motor
       * acepta desde ahí.
       */
      readonly saleDelSilencio: boolean;
    }
  | { readonly puede: false; readonly motivo: string };

export function puedeSubirEnvioAMonitor(
  e: EstadoParaSubirMonitor,
  ley: LeyDelEnvioAMonitor,
): VeredictoDeSubida {
  if (e.paroDeEmergencia) {
    return { puede: false, motivo: 'el paro de emergencia está activo' };
  }

  if (!e.conexionPermiteEscribir) {
    return { puede: false, motivo: 'la consola no está conectada con el estado confirmado' };
  }

  if (!ley.esNivelDeEnvioAMonitor(e.ruta)) {
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

  const tramo = ley.entrada(e.ruta);
  if (tramo === undefined) {
    return {
      puede: false,
      motivo: `${e.ruta} no tiene ley medida: proponer un nivel sería inventarlo`,
    };
  }

  // **Que lo pedido sea subir se comprueba ANTES del silencio, y la primera
  // versión no lo hacía.** Una auditoría adversarial del 2026-09-19 lo midió:
  // con la cuña apagada, `subirDb` de −5, 0, `NaN` y −∞ **contestaban que sí**,
  // porque la rama del silencio se adelantaba a esta comprobación. Inocuo para
  // el producto --el destino es fijo-- pero una función llamada
  // `puedeSubirEnvioAMonitor`, cuyo docblock dice «esta función sólo sube»,
  // contestaba que sí a un pedido de bajar. El nombre mentía.
  //
  // **Cuánto se pide sigue sin importar desde el silencio; que se pida subir,
  // sí.** Son dos cosas distintas y sólo una se ignora.
  if (!(e.subirDb > 0)) {
    return {
      puede: false,
      motivo: 'esta función sólo sube: para bajar está puedeBajarEnvioAMonitor',
    };
  }

  // **El borde del silencio, antes que nada de lo que mira decibeles.** Con la
  // cuña apagada no hay nivel actual del que restar ni al que sumar, así que
  // cualquier cuenta de más abajo daría `NaN` o infinito. El destino no lo elige
  // quien pide: es el punto más bajo que la ley sabe escribir, leído de la ley.
  //
  // Es el único camino por el que el motor deja salir del silencio, y sólo hacia
  // ahí. Proponer otra cosa desde acá sería proponer un rebote.
  if (e.nivelActualDb === -Infinity) {
    const r = ley.aRaw(e.ruta, tramo.fisicoMin);
    if (!r.ok) {
      return {
        puede: false,
        motivo: `${r.mensaje}. El mínimo escribible de la ley es `
          + `${tramo.fisicoMin.toFixed(1)} dB (${tramo.spike}) y ni ése se puede convertir`,
      };
    }
    return { puede: true, destinoDb: tramo.fisicoMin, crudo: r.raw, saleDelSilencio: true };
  }

  if (!Number.isFinite(e.nivelActualDb)) {
    // `+Infinity` y `NaN` no son silencio: son no saber dónde está la cuña.
    // **Van después del silencio y no antes**, porque `Number.isFinite(-Infinity)`
    // también es falso y un solo `if` se habría comido el caso de arriba.
    return {
      puede: false,
      motivo: 'no se sabe dónde está el envío ahora, así que no hay desde dónde subir',
    };
  }

  const tope = LIMITES.MONITOR_AUX_SEND?.porTransaccion;
  if (tope !== undefined && e.subirDb > tope) {
    return {
      puede: false,
      motivo: `el envío a monitor se mueve hasta ${tope} dB por vez y se pidieron `
        + `${e.subirDb}: subí de a poco y volvé a escuchar`,
    };
  }

  // **El techo en nominal, decisión del usuario en ADR-034.** Es un tope sobre
  // dónde queda el parámetro, no sobre cuánto se movió, y rige también al
  // retocar. Se rechaza en vez de recortar en silencio: una cuña que queda más
  // abajo de lo pedido sin avisar es una sorpresa para quien la pidió, y el
  // músico pregunta por qué no subió.
  const techo = LIMITES.MONITOR_AUX_SEND?.techoAbsoluto;
  const destinoDb = e.nivelActualDb + e.subirDb;
  if (techo !== undefined && destinoDb > techo) {
    return {
      puede: false,
      motivo: `la cuña está en ${e.nivelActualDb.toFixed(1)} dB y subirla `
        + `${e.subirDb} dB la pasaría de ${techo} dB, que es el techo: desde acá `
        + 'el nivel lo sube el músico pidiéndolo, no la aplicación',
    };
  }

  const r = ley.aRaw(e.ruta, destinoDb);
  if (!r.ok) {
    return {
      puede: false,
      motivo: `${r.mensaje}. La ley está medida de ${tramo.fisicoMin.toFixed(1)} `
        + `a ${tramo.fisicoMax.toFixed(1)} dB (${tramo.spike}).`,
    };
  }

  return { puede: true, destinoDb, crudo: r.raw, saleDelSilencio: false };
}
