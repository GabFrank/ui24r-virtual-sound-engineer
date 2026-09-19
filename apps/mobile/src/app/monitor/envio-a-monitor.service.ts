import { Injectable, inject, signal } from '@angular/core';
import { puedeBajarEnvioAMonitor, puedeSubirEnvioAMonitor } from '@vse/assistants';
import { LEY_DEL_ENVIO } from './ley-del-envio.ts';
import type { ContextoSeguridad } from '@vse/safety';
import { anclarSiSeAplico, olvidarTecho } from '@vse/safety';
import { SafetyService } from '../core/safety.service';
import { DiarioService } from '../core/diario.service';
import { MedicionesService } from '../core/mediciones.service';
import { historialDeLaSesion } from '@vse/safety';
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

/** Lo que hace falta para subir. Casi igual, con dos diferencias que importan. */
export interface EnvioASubir {
  readonly canal: number;
  readonly auxiliar: number;
  /** `i.N.aux.M.value`, en forma canónica. */
  readonly ruta: string;
  /**
   * Dónde está ahora, en dB. Lo lee el adaptador; no se supone.
   *
   * **`-Infinity` es legítimo y significa silencio**, que es el caso con el que
   * empieza un soundcheck. Para bajar no lo es --no hay desde dónde bajar-- y
   * por eso los dos tipos no son el mismo.
   */
  readonly nivelActualDb: number;
  /** El crudo que la consola tiene ahora, para la comprobación previa. */
  readonly crudoActual: number;
  /** Cuánto subir, en dB y positivo. Se ignora si la cuña está en silencio. */
  readonly subirDb: number;
}

export type ResultadoSubida =
  | {
      readonly estado: 'APLICADA';
      readonly id: string;
      readonly quedoEnDb: number;
      /** Si este paso fue el primero desde el silencio, para poder decírselo al músico. */
      readonly salioDelSilencio: boolean;
    }
  | { readonly estado: 'NO_SE_PUEDE'; readonly motivo: string }
  | { readonly estado: 'FALLO'; readonly motivo: string };

@Injectable({ providedIn: 'root' })
export class EnvioAMonitorService {
  private readonly seguridad = inject(SafetyService);
  private readonly diario = inject(DiarioService);
  private readonly mediciones = inject(MedicionesService);
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

  /**
   * Anota en la transacción que después de ella hubo una escucha.
   *
   * **Es la otra mitad de guardar la medición, y sin ella guardarla no sirve de
   * nada:** el motor no busca «alguna medición posterior», resuelve exactamente
   * el identificador que la transacción declara. Una tabla llena de mediciones y
   * un `medicionPosteriorId` en nulo dan el mismo veredicto que la tabla vacía.
   *
   * **Se llama después de escuchar y no al aplicar**, porque la escucha ocurre
   * después: al cerrar la transacción todavía no hay nada que oír.
   *
   * **Sin identificador no se anota nada.** La escucha devuelve `null` cuando no
   * hubo dónde guardarla, y anotar un identificador inventado sería exactamente
   * el agujero que el motor cerró el 2026-09-18: anotar cualquier texto contaba
   * como haber escuchado, y una auditoría midió dieciséis pasos y 32 dB con
   * identificadores que no existían.
   *
   * **Que esa medición sea de verdad una escucha no lo decide esto**: el motor
   * comprueba siete cosas sobre ella. Acá sólo se dice cuál fue.
   *
   * Es gemela de la de `AplicarGananciaService` a propósito y **no se comparte**:
   * las dos son tres líneas sobre servicios distintos, y el día que el envío a
   * monitor necesite anotar algo más que el identificador, un ayudante común
   * obligaría a cambiar los dos caminos para tocar uno solo.
   */
  async anotarEscucha(idTransaccion: string, medicionId: string | null): Promise<void> {
    if (medicionId === null) {
      this.log.info('transaction', 'escucha_sin_anotar', { transaccion: idTransaccion });
      return;
    }
    try {
      await this.diario.actualizar(idTransaccion, { medicionPosteriorId: medicionId });
    } catch (e) {
      // **No propaga.** El cambio ya se aplicó y se verificó; lo que se pierde es
      // el permiso para el paso siguiente, que el motor va a negar diciendo que
      // falta la medición intermedia. Hacer fallar la pantalla acá convertiría un
      // freno correcto en un error para el usuario.
      this.log.warn('transaction', 'escucha_no_anotada', {
        transaccion: idTransaccion, medicion: medicionId,
        motivo: e instanceof Error ? e.message : String(e),
      });
    }
  }

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
    }, LEY_DEL_ENVIO);
    return v.puede ? { puede: true, motivo: null } : { puede: false, motivo: v.motivo };
  }

  private async contexto(sessionId: string): Promise<ContextoSeguridad> {
    // **Las mediciones de la sesión, que hasta el 2026-09-18 iban vacías.** El
    // historial resuelve `medicionPosteriorId` contra esta lista para decidir si
    // entre un paso y el siguiente se escuchó de verdad. Con la lista vacía
    // ninguna ruta quedaba con escucha comprobada, así que **un segundo cambio
    // sobre el mismo parámetro se rechazaba siempre**: frenaba, no aflojaba,
    // pero frenaba la rampa que la pieza de monitor necesita, porque una cuña se
    // levanta en varios pasos de 2 dB escuchando entre uno y otro.
    //
    // El compilador no lo cazaba: una lista vacía es una lista válida.
    //
    // **Y esto decía tres cosas que dejaron de ser ciertas el 2026-09-19.** Decía
    // que seguía faltando quien escribiera en `measurement`, que iba a ser la
    // pantalla de monitor, y que hasta entonces esta lista volvía vacía. Ya hay
    // quien escribe --la pantalla de **ganancia**, que captura dieciocho segundos
    // después de aplicar-- así que en una sesión donde se midió ganancia esta
    // lista **ya trae filas**.
    //
    // **Y la frase que seguía acá dejó de ser cierta el 2026-09-19, más tarde el
    // mismo día.** Decía que `EnvioAMonitorService` no mide, que por eso nadie
    // anota `medicionPosteriorId` en una transacción de monitor, y que quien iba a
    // capturar sería la pantalla por músico. Las tres se cayeron juntas: quien
    // captura es `EscuchaDeLaCunaService` —un servicio, no la pantalla, igual que
    // en el camino de la ganancia— y este archivo **sí** anota, con
    // `anotarEscucha`, unas líneas más arriba.
    //
    // Lo que sigue en pie, y es lo que hay que saber para leer esta lista: **hasta
    // que una pantalla llame a subir o bajar, nadie dispara nada**, así que en la
    // práctica esta lista trae hoy sólo las mediciones de la pantalla de ganancia.
    // No es lo mismo que «el camino no existe».
    //
    // `Date.now()` es el instante contra el que se comprueba que la ventana de
    // escucha haya terminado.
    const historial = historialDeLaSesion(
      await this.diario.deLaSesion(sessionId),
      await this.mediciones.deLaSesion(sessionId),
      Date.now(),
    );
    return {
      sessionState: this.sesion.estado() ?? 'SETUP',
      nivelAutonomia: 'ASSISTED',
      // **El historial de la sesión, que hasta el 2026-09-17 iba vacío.** Estos
      // cuatro llevan la cuenta de cuánto se movió cada ruta, cuáles se tocaron,
      // si se escuchó después del último cambio y **cuáles ya tienen un nivel de
      // trabajo establecido**, que es lo que separa poner el nivel de una cuña de
      // retocarla (ADR-034). Pasarlos vacíos dejaba dos
      // reglas del motor existiendo en el código y no en el comportamiento: el
      // presupuesto por sesión nunca se disparaba --el acumulado arrancaba
      // siempre en cero-- y «comprobá el efecto antes de volver a moverlo»
      // tampoco, porque sin rutas tocadas **cada cambio parecía el primero**.
      // Esa segunda fallaba ABIERTA.
      //
      // Se reconstruyen del diario, que está en la base y sobrevive a una caída:
      // un contador en memoria se perdería con el proceso, y lo que se perdería
      // es justamente el freno.
      ...historial,
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
    }, LEY_DEL_ENVIO);
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
      await this.contexto(sessionId),
      {
        conexionPermiteEscribir: true,
        snapshotRef: instantanea,
        tipoDeOperacion: 'MONITOR_AUX_SEND',
      },
    );

    // **El techo se ancla DESPUÉS de que la consola lo aceptó, y la condición
    // vive en `@vse/safety`, donde se prueba.** Anclarlo con la intención dejaría
    // un techo por una escritura que quizá se rechazó, y el usuario no podría
    // volver a un lugar del que nunca se movió. Acá se pasa el resultado y la
    // decisión la toma quien la tiene probada; repetir el `if` en este archivo
    // sería tener la regla en dos lados.
    this.techos.update((t) => anclarSiSeAplico(t, cambio, r.estado === 'APLICADA'));

    if (r.estado === 'APLICADA') {
      return { estado: 'APLICADA', id: r.id, quedoEnDb: v.destinoDb };
    }

    const motivo = r.estado === 'RECHAZADA' ? r.motivos.join('; ')
      : r.estado === 'CONFLICTO' ? `otro cliente cambió ${r.path}: ${r.motivo}`
      : r.estado === 'PARCIAL' ? r.motivo
      : r.motivo;
    this.log.warn('transaction', 'bajar_envio_fallo', { ruta: e.ruta, estado: r.estado, motivo });
    return { estado: 'FALLO', motivo };
  }

  /** Si el envío se puede subir ahora, y si no, por qué. */
  puedeSubir(e: EnvioASubir): { readonly puede: boolean; readonly motivo: string | null } {
    const v = this.veredictoDeSubida(e);
    return v.puede ? { puede: true, motivo: null } : { puede: false, motivo: v.motivo };
  }

  private veredictoDeSubida(e: EnvioASubir) {
    const permiso = this.seguridad.permiteEscritura('MONITOR_AUX_SEND');
    return puedeSubirEnvioAMonitor({
      ruta: e.ruta,
      nivelActualDb: e.nivelActualDb,
      subirDb: e.subirDb,
      sessionState: this.sesion.estado(),
      paroDeEmergencia: this.seguridad.bloqueado(),
      conexionPermiteEscribir: permiso.permitido,
    }, LEY_DEL_ENVIO);
  }

  /**
   * Sube el envío de un canal a una cuña, un paso.
   *
   * **Es el camino que faltaba para que ADR-034 sirva de algo.** El motor sabe
   * distinguir poner el nivel de retocarlo desde el 2026-09-17 y sabe salir del
   * silencio desde el 2026-09-19; lo que no existía era quien lo propusiera.
   */
  async subir(e: EnvioASubir, sessionId: string): Promise<ResultadoSubida> {
    const v = this.veredictoDeSubida(e);
    if (!v.puede) return { estado: 'NO_SE_PUEDE', motivo: v.motivo };

    const api = this.mixer.api();
    if (api === null) return { estado: 'NO_SE_PUEDE', motivo: 'la consola no está conectada' };

    this.log.info('transaction', 'subir_envio_pedido', {
      canal: e.canal, auxiliar: e.auxiliar, ruta: e.ruta,
      desdeDb: e.nivelActualDb, hastaDb: v.destinoDb, salidaDelSilencio: v.saleDelSilencio,
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
      // **Desde el silencio se declara −∞, y es lo único que el motor acepta.**
      // `verificarAtaduraDelOrigen` sólo abre el caso con nombre propio cuando el
      // llamador dice la verdad: declarar un número finito desde el crudo del
      // silencio es la mentira que esa guarda existe para cazar, y rebota con
      // `ORIGEN_NO_ATADO`. El asistente ya lo resolvió; acá sólo se transcribe.
      magnitudEsperada: v.saleDelSilencio ? -Infinity : e.nivelActualDb,
    };

    const ejecutor = this.seguridad.crearEjecutor(api, this.diario);
    const r = await ejecutor.ejecutar(
      `envio-${e.canal}-${e.auxiliar}-${Date.now()}`,
      sessionId,
      v.saleDelSilencio
        ? `encender el envío del canal ${e.canal} al monitor ${e.auxiliar} desde el silencio`
        : `subir ${e.subirDb} dB el envío del canal ${e.canal} al monitor ${e.auxiliar}`,
      [cambio],
      await this.contexto(sessionId),
      {
        conexionPermiteEscribir: true,
        snapshotRef: instantanea,
        tipoDeOperacion: 'MONITOR_AUX_SEND',
      },
    );

    // **Subir NO ancla techo, y es lo contrario de bajar.** El techo por ruta
    // existe para que la aplicación pueda devolver una cuña «hasta donde estaba»
    // después de haberla bajado ella. Anclarlo al subir convertiría cada subida
    // en un permiso para seguir subiendo hasta ahí, que es justo el freno que
    // ADR-028 puso. Quien acota una subida es el techo de nominal y los 2 dB por
    // paso, no este registro.

    if (r.estado === 'APLICADA') {
      return {
        estado: 'APLICADA', id: r.id, quedoEnDb: v.destinoDb,
        salioDelSilencio: v.saleDelSilencio,
      };
    }

    const motivo = r.estado === 'RECHAZADA' ? r.motivos.join('; ')
      : r.estado === 'CONFLICTO' ? `otro cliente cambió ${r.path}: ${r.motivo}`
      : r.estado === 'PARCIAL' ? r.motivo
      : r.motivo;
    this.log.warn('transaction', 'subir_envio_fallo', { ruta: e.ruta, estado: r.estado, motivo });
    return { estado: 'FALLO', motivo };
  }
}
