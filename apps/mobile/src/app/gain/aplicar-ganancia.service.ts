import { Injectable, inject } from '@angular/core';
import { rawParaGananciaMasCercana, gananciaAlcanzable } from '@vse/mixer-adapter';
import { puedeAplicarGanancia } from '@vse/assistants';
import type { Confidence } from '@vse/domain';
import type { ContextoSeguridad } from '@vse/safety';
import { SafetyService } from '../core/safety.service';
import { DiarioService } from '../core/diario.service';
import { SessionStateService } from '../core/session.state';
import { MixerService } from '../core/mixer.service';
import { Logger } from '../core/logger';

/**
 * Aplicar una propuesta de ganancia en la consola.
 *
 * **Es la pieza que faltaba para cerrar el lazo.** El ejecutor de
 * transacciones, el motor de seguridad y el diario existían desde antes; nadie
 * los instanciaba. La aplicación medía, proponía, y ahí se cortaba: el cambio
 * lo hacía el usuario a mano en la consola.
 *
 * Lo que decide ADR-026 y este servicio implementa:
 *
 * - **Se aplica con confianza ALTA o MEDIA.** Exigir ALTA dejaría el botón
 *   apagado casi siempre —basta un de-esser activo para bajar a MEDIA— y el
 *   operador terminaría aplicando a mano igual. Un resguardo que nunca se usa
 *   no protege: se saltea.
 * - **Un canal por transacción.** INV-005 permite hasta cuatro en ASSISTED,
 *   pero la ganancia se aplica de a uno porque después hay que volver a medir
 *   ese canal para verificar, y medir cuatro a la vez pide que cuatro músicos
 *   toquen a la vez lo mismo que tocaron recién.
 * - **Solo en configuración de canales** (INV-006). El motor lo comprueba
 *   igual; acá se comprueba antes para poder decirlo en la pantalla en vez de
 *   dejar que la transacción se rechace.
 */

/** Lo que hace falta saber de una propuesta para poder aplicarla. */
export interface PropuestaAplicable {
  readonly canal: number;
  /** La ruta del previo, ya resuelta desde `i.N.src`. */
  readonly rutaGanancia: string;
  /** El valor crudo que la consola tiene ahora, para la comprobación previa. */
  readonly crudoActual: number;
  readonly gainPropuestoDb: number;
  readonly confianza: Confidence;
}

export type ResultadoAplicacion =
  | { readonly estado: 'APLICADA'; readonly id: string; readonly quedoEnDb: number }
  | { readonly estado: 'NO_SE_PUEDE'; readonly motivo: string }
  | { readonly estado: 'FALLO'; readonly motivo: string };

/** Las confianzas con las que ADR-026 habilita aplicar. */
const CONFIANZAS_QUE_APLICAN: readonly Confidence[] = ['HIGH', 'MEDIUM'];

@Injectable({ providedIn: 'root' })
export class AplicarGananciaService {
  private readonly seguridad = inject(SafetyService);
  private readonly diario = inject(DiarioService);
  private readonly sesion = inject(SessionStateService);
  private readonly mixer = inject(MixerService);
  private readonly log = inject(Logger);

  /**
   * Si el botón de aplicar tiene que estar habilitado, y si no, por qué.
   *
   * Devuelve el motivo aunque no se pueda: una pantalla que apaga un botón sin
   * decir por qué obliga al usuario a adivinar, y en este producto el motivo
   * casi siempre es accionable —conectá la consola, volvé a medir, pasá a
   * configuración de canales—.
   */
  /**
   * Si el botón tiene que estar habilitado, y si no, por qué.
   *
   * Las reglas viven en `@vse/assistants`, donde se prueban; acá se junta el
   * estado disperso —sesión, seguridad, conexión— y se pregunta.
   */
  /**
   * Si el botón tiene que estar habilitado, y si no, por qué.
   *
   * Toma solo la confianza porque el resto —estado de sesión, paro, conexión—
   * lo sabe este servicio. La pantalla no tiene por qué juntar ese estado para
   * preguntar si se puede.
   */
  puedeAplicar(confianza: Confidence, canal?: number): { readonly puede: boolean; readonly motivo: string | null } {
    const permiso = this.seguridad.permiteEscritura('PREAMP_GAIN');
    const v = puedeAplicarGanancia({
      confianza,
      sessionState: this.sesion.estado(),
      // Todavía no hay tomas de soundcheck en la aplicación. Va en `false` y no
      // en un valor inventado; cuando existan, entran acá.
      hayTakeDeSoundcheckActivo: false,
      // Lo dice el adaptador, que sigue `var.mtk.soundcheck` y `i.N.scsrc`.
      tomaPistaGrabada: canal === undefined
        ? false
        : this.mixer.canales().find((c) => c.indice === canal)?.tomaPistaGrabada ?? false,
      paroDeEmergencia: this.seguridad.bloqueado(),
      conexionPermiteEscribir: permiso.permitido,
    });
    return v.puede ? { puede: true, motivo: null } : { puede: false, motivo: v.motivo };
  }

  /**
   * El contexto que el motor de seguridad necesita para juzgar la transacción.
   *
   * **Se arma acá y no en el servicio del transporte**: casi todo depende de
   * esta operación —qué confianza tiene, si el usuario la aprobó— y no de la
   * conexión. Lo poco que es de la sesión se pide a quien la tiene.
   */
  private contexto(confianza: Confidence): ContextoSeguridad {
    return {
      sessionState: this.sesion.estado() ?? 'SETUP',
      nivelAutonomia: 'ASSISTED',
      // Estos tres llevan la cuenta de cuánto se movió cada ruta en la sesión,
      // y hoy la aplicación no la lleva: cada aplicación de ganancia es la
      // primera. Van vacíos a propósito y no con datos inventados; cuando el
      // historial de la sesión los alimente, entran acá sin tocar el motor.
      acumuladoPorRuta: new Map(),
      rutasConMedicionPosterior: new Set(),
      rutasYaTocadas: new Set(),
      hayTakeDeSoundcheckActivo: false,
      // **Vacío, y hay que decir por qué en vez de dejarlo pasar por obvio.**
      // La traducción de `PAProfile.outputBuses` a prefijos existe
      // (`prefijosPermitidos`, con sus tests) y **el puente hasta acá no**: la
      // sesión guarda su estado, no la entidad, así que este servicio no tiene
      // de dónde sacar el perfil del lugar. Un commit del 2026-09-11 dijo que
      // el perfil «ahora declara buses» como si estuviera hecho; no lo estaba.
      //
      // Mientras esté vacío, el motor rechaza toda ecualización de sala con
      // `SIN_PERFIL_DE_SALA`, que es la verdad. Hoy no se pierde nada porque
      // este servicio solo escribe la ganancia del previo. Cuando alguien
      // escriba ecualización de salida, **esto es lo primero que hay que
      // cablear**, y el rechazo lo va a decir con todas las letras.
      busesDeSalidaPermitidos: new Set(),
      confianza: confianza === 'HIGH' ? 'HIGH' : confianza === 'MEDIUM' ? 'MEDIUM'
        : confianza === 'LOW' ? 'LOW' : 'INSUFFICIENT_DATA',
      // El usuario tocó el botón: eso es la aprobación explícita que pide
      // ASSISTED. Si algún día se aplica sin que nadie toque nada, este `true`
      // deja de ser cierto y hay que revisarlo.
      aprobacionExplicita: true,
    };
  }

  /**
   * Escribe la ganancia propuesta, con toda la cadena de seguridad detrás.
   *
   * **La ganancia no es continua**, así que lo que se escribe no es el valor
   * pedido sino el escalón más cercano que el previo puede dar. Se devuelve
   * dónde quedó de verdad —`quedoEnDb`— y no lo que se pidió: la pantalla tiene
   * que mostrar lo que hay, no lo que se intentó.
   */
  async aplicar(p: PropuestaAplicable, sessionId: string): Promise<ResultadoAplicacion> {
    const control = this.puedeAplicar(p.confianza, p.canal);
    if (!control.puede) return { estado: 'NO_SE_PUEDE', motivo: control.motivo ?? 'no se puede aplicar' };

    const api = this.mixer.api();
    if (api === null) return { estado: 'NO_SE_PUEDE', motivo: 'la consola no está conectada' };

    const quedoEnDb = gananciaAlcanzable(p.gainPropuestoDb);
    const crudo = rawParaGananciaMasCercana(p.gainPropuestoDb);

    this.log.info('transaction', 'aplicar_ganancia_pedida', {
      canal: p.canal, ruta: p.rutaGanancia, pedidoDb: p.gainPropuestoDb, quedoEnDb, confianza: p.confianza,
    });

    // **El punto de retorno, antes de nada.** INV-001 no deja que ninguna
    // transacción escriba sin una instantánea verificada en la lista releída de
    // la consola. Se crea en el show de la aplicación —nunca en los del
    // usuario— y si no queda, no se escribe: sin red no se camina por la
    // cornisa.
    const instantanea = await api.guardarInstantanea();
    if (instantanea === null) {
      this.log.warn('safety', 'sin_punto_de_retorno', { canal: p.canal });
      return {
        estado: 'NO_SE_PUEDE',
        motivo: 'no se pudo crear el punto de retorno en la consola, así que no se escribe nada',
      };
    }

    const ejecutor = this.seguridad.crearEjecutor(api, this.diario);
    const r = await ejecutor.ejecutar(
      `ganancia-${p.canal}-${Date.now()}`,
      sessionId,
      `ajuste de ganancia del canal ${p.canal} propuesto por la medición`,
      [{
        kind: 'PREAMP_GAIN',
        path: p.rutaGanancia,
        unidad: 'dB',
        valorPropuesto: crudo,
        valorEsperado: p.crudoActual,
      }],
      this.contexto(p.confianza),
      {
        conexionPermiteEscribir: true,
        snapshotRef: instantanea,
        tipoDeOperacion: 'PREAMP_GAIN',
      },
    );

    if (r.estado === 'APLICADA') return { estado: 'APLICADA', id: r.id, quedoEnDb };

    // Todo lo demás es un fallo con nombre propio, y el nombre importa: un
    // CONFLICTO quiere decir que alguien más movió esa perilla, y eso el
    // usuario tiene que saberlo tal cual.
    const motivo = r.estado === 'RECHAZADA' ? r.motivos.join('; ')
      : r.estado === 'CONFLICTO' ? `otro cliente cambió ${r.path}: ${r.motivo}`
      : r.estado === 'PARCIAL' ? r.motivo
      : r.motivo;
    this.log.warn('transaction', 'aplicar_ganancia_fallo', { canal: p.canal, estado: r.estado, motivo });
    return { estado: 'FALLO', motivo };
  }
}
