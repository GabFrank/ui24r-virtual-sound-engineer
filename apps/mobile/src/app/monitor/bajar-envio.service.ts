import { Injectable, inject, signal } from '@angular/core';
import { puedeBajarEnvioAMonitor } from '@vse/assistants';
import type { ContextoSeguridad } from '@vse/safety';
import { registrarTecho, olvidarTecho } from '@vse/safety';
import { SafetyService } from '../core/safety.service';
import { DiarioService } from '../core/diario.service';
import { SessionStateService } from '../core/session.state';
import { MixerService } from '../core/mixer.service';
import { Logger } from '../core/logger';

/**
 * Bajar el envío de un canal a un monitor, con toda la cadena de seguridad
 * detrás.
 *
 * **Es el hueco 1 de ADR-028, que ese ADR declara primero de todo:**
 *
 * > *«Ningún camino de la aplicación propone un cambio de envío a monitor. El
 * > único `CambioPropuesto` que se construye en producción en todo el
 * > repositorio es `aplicar-ganancia.service.ts`. ADR-028 no cambia nada
 * > observable hoy: abre una puerta que nadie usa todavía.»*
 *
 * Faltaban dos cosas y las dos aparecieron el 2026-09-13: la **ley** del envío,
 * que el ítem 104 midió contra un convertidor externo, y que `entrada()`
 * resolviera una ruta concreta — no lo hacía, así que la guarda que ata la
 * magnitud al crudo devolvía `SIN_LEY_VERIFICADA` en los veinticuatro canales.
 *
 * ## El techo, que este servicio SÍ puede llenar
 *
 * ADR-028 también declara vacío `techoPorRuta` «porque hace falta el historial
 * de la sesión». **Para este techo, no hace falta.** `registrarTecho` lo
 * construye de los cambios mismos: guarda dónde estaba la ruta **la primera vez
 * que la aplicación la bajó**, y el primer descenso gana. Quien baja es el dueño
 * natural de esa memoria, y quien baja es este servicio.
 *
 * Así que el mapa vive acá y se pasa al motor en cada transacción. Es la regla
 * del usuario, textual: *«Hasta donde estaba antes de que yo lo bajara, y ni un
 * paso más»*.
 *
 * ## Lo que este servicio NO hace, y hay que decirlo
 *
 * **Ninguna pantalla lo llama todavía.** Existe el camino y está probado; falta
 * quién lo dispare. Decirlo es la diferencia entre una función y la promesa de
 * una función, y este proyecto ya tiene documentado un commit que dijo que la
 * aplicación «lee» algo que no leía.
 *
 * **Y no sube.** Volver a subir es del usuario —*«luego vuelvo a subir de a poco
 * buscando el acople nuevamente»*— y el techo lo hace cumplir el motor. Este
 * servicio sólo aporta el techo; no hay acá un camino que escriba hacia arriba.
 */

export interface EnvioABajar {
  readonly canal: number;
  readonly auxiliar: number;
  /** `i.N.aux.M.value`, en forma canónica. */
  readonly ruta: string;
  /** Dónde está ahora, en dB. Lo lee el adaptador; no se supone. */
  readonly nivelActualDb: number;
  /** El crudo que la consola tiene ahora, para la comprobación previa. */
  readonly crudoActual: number;
  /** Cuánto bajar, en dB y positivo. */
  readonly bajarDb: number;
}

export type ResultadoBajada =
  | { readonly estado: 'APLICADA'; readonly id: string; readonly quedoEnDb: number }
  | { readonly estado: 'NO_SE_PUEDE'; readonly motivo: string }
  | { readonly estado: 'FALLO'; readonly motivo: string };

@Injectable({ providedIn: 'root' })
export class BajarEnvioService {
  private readonly seguridad = inject(SafetyService);
  private readonly diario = inject(DiarioService);
  private readonly sesion = inject(SessionStateService);
  private readonly mixer = inject(MixerService);
  private readonly log = inject(Logger);

  /**
   * Dónde estaba cada envío antes de que la aplicación lo bajara.
   *
   * **Es un `signal` para que una pantalla pueda mostrarlo.** Un techo que el
   * usuario no ve es un techo que lo va a sorprender: si pide subir y el motor
   * rechaza, la pantalla tiene que poder decir hasta dónde puede.
   */
  private readonly techos = signal<ReadonlyMap<string, number>>(new Map());

  /** Hasta dónde puede volver a subir esta ruta, o `null` si nunca se bajó. */
  techoDe(ruta: string): number | null {
    return this.techos().get(ruta) ?? null;
  }

  /**
   * Olvida el techo de una ruta.
   *
   * **Hace falta porque el techo es de la aplicación, no de la consola.** Si el
   * usuario mueve ese envío a mano, el «donde estaba» que recuerda este servicio
   * dejó de ser cierto, y seguir sosteniéndolo le impediría subir a donde él ya
   * lo puso. Quien detecte el cambio ajeno llama acá.
   */
  olvidar(ruta: string): void {
    this.techos.update((t) => olvidarTecho(t, ruta));
  }

  /** Si el envío se puede bajar ahora, y si no, por qué. */
  puedeBajar(e: EnvioABajar): { readonly puede: boolean; readonly motivo: string | null } {
    const permiso = this.seguridad.permiteEscritura('MONITOR_AUX_SEND');
    const v = puedeBajarEnvioAMonitor({
      ruta: e.ruta,
      nivelActualDb: e.nivelActualDb,
      bajarDb: e.bajarDb,
      sessionState: this.sesion.estado(),
      paroDeEmergencia: this.seguridad.bloqueado(),
      conexionPermiteEscribir: permiso.permitido,
    });
    return v.puede ? { puede: true, motivo: null } : { puede: false, motivo: v.motivo };
  }

  private contexto(): ContextoSeguridad {
    return {
      sessionState: this.sesion.estado() ?? 'SETUP',
      nivelAutonomia: 'ASSISTED',
      // Estos tres siguen vacíos por el motivo que ADR-028 declara: hace falta el
      // historial de la sesión, que no existe. **El techo ya no**, y por eso se
      // pasa lleno: se construye de los cambios de este servicio.
      acumuladoPorRuta: new Map(),
      rutasConMedicionPosterior: new Set(),
      rutasYaTocadas: new Set(),
      techoPorRuta: this.techos(),
      hayTakeDeSoundcheckActivo: false,
      // Vacío por el mismo motivo que en el servicio de ganancia: el puente de
      // `PAProfile.outputBuses` hasta acá no existe. Este servicio no escribe
      // ecualización de sala, así que hoy no se pierde nada.
      busesDeSalidaPermitidos: new Set(),
      confianza: 'HIGH',
      // El usuario tocó el botón. Si algún día esto se dispara solo, deja de ser
      // cierto y hay que revisarlo.
      aprobacionExplicita: true,
    };
  }

  async bajar(e: EnvioABajar, sessionId: string): Promise<ResultadoBajada> {
    const control = this.puedeBajar(e);
    if (!control.puede) return { estado: 'NO_SE_PUEDE', motivo: control.motivo ?? 'no se puede bajar' };

    // Se vuelve a pedir el veredicto completo porque de él sale el crudo, atado
    // a los dB por la ley medida. Calcularlo acá por separado sería tener dos
    // conversiones que se pueden separar.
    const permiso = this.seguridad.permiteEscritura('MONITOR_AUX_SEND');
    const v = puedeBajarEnvioAMonitor({
      ruta: e.ruta,
      nivelActualDb: e.nivelActualDb,
      bajarDb: e.bajarDb,
      sessionState: this.sesion.estado(),
      paroDeEmergencia: this.seguridad.bloqueado(),
      conexionPermiteEscribir: permiso.permitido,
    });
    if (!v.puede) return { estado: 'NO_SE_PUEDE', motivo: v.motivo };

    const api = this.mixer.api();
    if (api === null) return { estado: 'NO_SE_PUEDE', motivo: 'la consola no está conectada' };

    this.log.info('transaction', 'bajar_envio_pedido', {
      canal: e.canal, auxiliar: e.auxiliar, ruta: e.ruta,
      desdeDb: e.nivelActualDb, hastaDb: v.destinoDb,
    });

    // INV-001: sin punto de retorno no se escribe.
    const instantanea = await api.guardarInstantanea();
    if (instantanea === null) {
      this.log.warn('safety', 'sin_punto_de_retorno', { ruta: e.ruta });
      return {
        estado: 'NO_SE_PUEDE',
        motivo: 'no se pudo crear el punto de retorno en la consola, así que no se escribe nada',
      };
    }

    const cambio = {
      kind: 'MONITOR_AUX_SEND' as const,
      path: e.ruta,
      unidad: 'dB',
      // Al cable va el crudo; al control de INV-004, los decibeles.
      valorPropuesto: v.crudo,
      valorEsperado: e.crudoActual,
      magnitudPropuesta: v.destinoDb,
      magnitudEsperada: e.nivelActualDb,
    };

    const ejecutor = this.seguridad.crearEjecutor(api, this.diario);
    const r = await ejecutor.ejecutar(
      `envio-${e.canal}-${e.auxiliar}-${Date.now()}`,
      sessionId,
      `bajar ${e.bajarDb} dB el envío del canal ${e.canal} al monitor ${e.auxiliar}`,
      [cambio],
      this.contexto(),
      {
        conexionPermiteEscribir: true,
        snapshotRef: instantanea,
        tipoDeOperacion: 'MONITOR_AUX_SEND',
      },
    );

    if (r.estado === 'APLICADA') {
      // **El techo se ancla DESPUÉS de que la consola lo aceptó, no antes.**
      // Anclarlo con la intención dejaría un techo por una escritura que quizá
      // se rechazó, y el usuario no podría volver a un lugar donde nunca dejó de
      // estar. `registrarTecho` guarda de dónde venía y el primer descenso gana.
      this.techos.update((t) => registrarTecho(t, cambio));
      return { estado: 'APLICADA', id: r.id, quedoEnDb: v.destinoDb };
    }

    const motivo = r.estado === 'RECHAZADA' ? r.motivos.join('; ')
      : r.estado === 'CONFLICTO' ? `otro cliente cambió ${r.path}: ${r.motivo}`
      : r.estado === 'PARCIAL' ? r.motivo
      : r.motivo;
    this.log.warn('transaction', 'bajar_envio_fallo', { ruta: e.ruta, estado: r.estado, motivo });
    return { estado: 'FALLO', motivo };
  }
}
