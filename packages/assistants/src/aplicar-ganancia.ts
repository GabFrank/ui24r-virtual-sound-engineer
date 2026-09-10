import type { Confidence, SessionState } from '@vse/domain';

/**
 * Si una propuesta de ganancia se puede aplicar, y si no, por qué.
 *
 * **Vive acá y no en el servicio de Angular para poder probarse.** Es la
 * decisión que abre la puerta a escribir en la consola de alguien; dejarla
 * enredada con la inyección de dependencias la volvería comprobable solo a mano.
 * El servicio de la aplicación junta el estado y llama a esto.
 *
 * Las reglas salen de ADR-026 y de las invariantes:
 *
 * - **ALTA o MEDIA aplican; BAJA y SIN DATOS no.** Exigir ALTA dejaría el botón
 *   apagado casi siempre —basta un de-esser activo— y el operador aplicaría a
 *   mano igual: un resguardo que nunca se usa no protege, se saltea.
 * - **Solo en configuración de canales** (INV-006).
 * - **Nunca con una toma de soundcheck activa** (INV-006), porque cambiar la
 *   ganancia después de grabar haría que la toma deje de representar al show.
 * - **Ni con el paro de emergencia puesto**, ni sin conexión confirmada.
 */

/** Las confianzas con las que ADR-026 habilita aplicar. */
const CONFIANZAS_QUE_APLICAN: readonly Confidence[] = ['HIGH', 'MEDIUM'];

export interface EstadoParaAplicar {
  readonly confianza: Confidence;
  readonly sessionState: SessionState | null;
  readonly hayTakeDeSoundcheckActivo: boolean;
  readonly paroDeEmergencia: boolean;
  readonly conexionPermiteEscribir: boolean;
}

export type VeredictoDeAplicacion =
  | { readonly puede: true }
  | { readonly puede: false; readonly motivo: string };

/**
 * El motivo se devuelve siempre, y es deliberado.
 *
 * Una pantalla que apaga un botón sin decir por qué obliga a adivinar. Acá el
 * motivo casi siempre es accionable —volvé a medir con el canal sonando, pasá a
 * configuración de canales— así que decirlo convierte una traba en el siguiente
 * paso.
 */
export function puedeAplicarGanancia(e: EstadoParaAplicar): VeredictoDeAplicacion {
  if (e.paroDeEmergencia) {
    return { puede: false, motivo: 'el paro de emergencia está activo' };
  }

  if (!e.conexionPermiteEscribir) {
    return { puede: false, motivo: 'la consola no está conectada con el estado confirmado' };
  }

  if (!CONFIANZAS_QUE_APLICAN.includes(e.confianza)) {
    return {
      puede: false,
      motivo: e.confianza === 'INSUFFICIENT_DATA'
        ? 'no hubo suficiente señal para medir: volvé a medir con el canal sonando'
        : 'la confianza de la medición es baja, así que el cambio queda a criterio tuyo',
    };
  }

  // INV-006. Se comprueba después de la confianza a propósito: si las dos cosas
  // fallan, la más útil de decir es la de la medición, que el usuario puede
  // resolver ahí mismo.
  if (e.hayTakeDeSoundcheckActivo) {
    return {
      puede: false,
      motivo: 'hay una toma de soundcheck activa: cambiar la ganancia haría que deje de representar al show',
    };
  }

  if (e.sessionState !== 'CHANNEL_SETUP') {
    return {
      puede: false,
      motivo: `la ganancia solo se toca en configuración de canales, y la sesión está en ${e.sessionState ?? 'un estado desconocido'}`,
    };
  }

  return { puede: true };
}
