import { Injectable, inject, signal } from '@angular/core';
import {
  Ui24rMixerAdapter, Ui24rTransport, WebSocketTransport, type EstadoCanal,
  type ConnectionState, type BulkExternalChange,
} from '@vse/mixer-adapter';
import { esSimulador } from '@vse/domain';
import { Logger } from './logger';
import { ConnectionStateService } from './connection.state';

export interface AvisoCambioExterno {
  readonly parametro: string;
  readonly valor: number;
  readonly cuando: string;
}

/**
 * Puente entre el adaptador y la interfaz.
 *
 * El adaptador no sabe nada de Angular y la interfaz no sabe nada del
 * protocolo. Este servicio traduce eventos a señales.
 */
/**
 * Cuánto se espera el volcado completo tras pedir una relectura.
 *
 * La consola manda su estado entero al abrir la conexión, y son cientos de
 * mensajes. Cinco segundos es holgado para eso y corto para alguien parado
 * delante de una consola que no contesta.
 */
const ESPERA_VOLCADO_MS = 5000;

/**
 * Cada cuánto se reintenta conectar mientras la consola no está.
 *
 * Un segundo: lo bastante seguido para no inflar la medición del criterio 1 de
 * SPK-P0.1 —su umbral son diez segundos— y lo bastante espaciado para no
 * castigar la batería con intentos que van a fallar igual. Es el mismo número
 * que usaba la prueba de diagnóstico, que era donde vivía este reintento.
 */
const REINTENTO_MS = 1000;

@Injectable({ providedIn: 'root' })
export class MixerService {
  private readonly log = inject(Logger);
  private readonly conexion = inject(ConnectionStateService);
  private adapter: Ui24rMixerAdapter | null = null;

  readonly canales = signal<readonly EstadoCanal[]>([]);
  readonly cambiosExternos = signal<readonly AvisoCambioExterno[]>([]);
  readonly cambioMasivo = signal<BulkExternalChange | null>(null);
  readonly conectando = signal(false);
  readonly ultimoError = signal<string | null>(null);

  /** Última dirección con la que se conectó, para el informe de diagnóstico. */
  readonly direccion = signal<string | null>(null);

  /*
   * Observadores del diagnóstico.
   *
   * Viven en el servicio y no en el adaptador porque el adaptador se crea de
   * nuevo en cada conexión: si se suscribieran a él, una reconexión --que es
   * justo lo que el diagnóstico mide-- los dejaría sin oír nada.
   */
  private readonly oyentesTelemetria: (() => void)[] = [];
  private readonly oyentesLatido: (() => void)[] = [];
  private readonly oyentesVolcado: (() => void)[] = [];
  private readonly oyentesConexion: ((estado: ConnectionState) => void)[] = [];

  observarTelemetria(cb: () => void): () => void {
    this.oyentesTelemetria.push(cb);
    return () => quitar(this.oyentesTelemetria, cb);
  }

  /**
   * Cada trama del analizador. Es la señal de vida de la conexión, y llega
   * igual en silencio; los medidores no. La distinción está en el adaptador.
   */
  observarLatido(cb: () => void): () => void {
    this.oyentesLatido.push(cb);
    return () => quitar(this.oyentesLatido, cb);
  }

  observarVolcado(cb: () => void): () => void {
    this.oyentesVolcado.push(cb);
    return () => quitar(this.oyentesVolcado, cb);
  }

  observarConexion(cb: (estado: ConnectionState) => void): () => void {
    this.oyentesConexion.push(cb);
    return () => quitar(this.oyentesConexion, cb);
  }

  /** El estado confirmado entero. Vacío si no hay conexión. */
  volcadoDelEstado(): ReadonlyMap<string, { readonly valor: number }> {
    return this.adapter?.volcadoDelEstado() ?? new Map();
  }

  async infoDispositivo(): Promise<{ modelo: string; firmware: string } | null> {
    if (this.adapter === null) return null;
    return this.adapter.infoDispositivo();
  }

  /**
   * Conecta con la consola, o con el simulador.
   *
   * `direccion` es **la máquina** cuando se trata de una consola real
   * —`192.168.0.49`—, no una URL. La ruta del WebSocket lleva dentro un
   * identificador de sesión que se agota al usarlo, así que hay que resolverla
   * en cada conexión; de eso se ocupa `Ui24rTransport`.
   *
   * Una dirección `ws://` significa simulador, que sí tiene dirección estable, y
   * se abre con el transporte simple. Es lo que sostiene el desarrollo sin
   * consola a mano.
   */
  /**
   * @param automatico Si el intento lo hizo la aplicacion y no la persona.
   *
   * La distincion existe por un defecto que aparecio al capturar las pantallas:
   * el reintento automatico dejaba `conectando` en verdadero casi todo el
   * tiempo --intentos de hasta tres segundos, uno por segundo-- y el boton
   * "Conectar" de Ajustes se pasaba deshabilitado. Quien hubiera escrito mal la
   * direccion quedaba atrapado en el reintento sin poder corregirla, que es
   * exactamente cuando mas falta hace poder tocarlo.
   */
  async conectar(direccion: string, automatico = false): Promise<void> {
    this.quiereConectado = true;
    // Un intento nuevo manda sobre el reintento en curso: si la persona
    // escribio otra direccion, la vieja deja de tener sentido.
    if (!automatico) {
      this.detenerReintento();
      this.direccionDeseada = direccion;
    }
    if (!automatico) this.conectando.set(true);
    this.ultimoError.set(null);
    const url = direccion;

    // El adaptador anterior se cierra antes de crear otro. Cada uno deja un
    // temporizador vigilando la cadencia del analizador, y reconectar sin
    // cerrarlo dejaba uno vivo por intento: en un show con la red inestable,
    // decenas de temporizadores mirando un socket muerto.
    const anterior = this.adapter;
    this.adapter = null;
    if (anterior !== null) await anterior.desconectar().catch(() => { /* ya estaba caido */ });

    try {
      const transporte = esSimulador(direccion)
        ? new WebSocketTransport()
        : new Ui24rTransport();
      const adapter = new Ui24rMixerAdapter(transporte);
      this.adapter = adapter;

      adapter.alCambiarConexion((e: ConnectionState) => {
        // Un adaptador que ya fue reemplazado sigue emitiendo mientras se
        // cierra. Sin esta guarda, su `DISCONNECTED` de despedida apagaba la
        // conexión nueva que acababa de reemplazarlo.
        if (this.adapter !== adapter) return;
        this.sincronizarConexion(e);
        this.log.info('mixer', 'conexion_cambio', { estado: e });
        if (e === 'DISCONNECTED') this.reconectarSiCorresponde();
        for (const cb of this.oyentesConexion) cb(e);
      });

      adapter.alVolcadoCompleto(() => {
        this.conexion.volcadoCompletoRecibido();
        this.log.info('mixer', 'volcado_completo', {});
        for (const cb of this.oyentesVolcado) cb();
      });

      adapter.alActualizarTelemetria(() => {
        this.canales.set(adapter.canales());
        for (const cb of this.oyentesTelemetria) cb();
      });

      adapter.alLatido(() => {
        for (const cb of this.oyentesLatido) cb();
      });

      adapter.alCambiarExterno((parametro, valor) => {
        this.cambiosExternos.update((prev) => [
          { parametro, valor, cuando: new Date().toISOString() },
          ...prev,
        ].slice(0, 20));
        this.log.info('mixer', 'cambio_externo', { parametro, valor });
      });

      adapter.alCambioMasivo((e) => {
        this.cambioMasivo.set(e);
        this.conexion.invalidarPorCambioMasivo();
        this.log.warn('mixer', 'cambio_masivo', { ...e });
      });

      await adapter.conectar(url);
      this.direccion.set(url);
      this.canales.set(adapter.canales());
      this.detenerReintento();
    } catch (e) {
      this.ultimoError.set(String(e));
      this.log.error('mixer', 'conexion_fallida', { url, error: String(e) });
      // El adaptador emitio RECONNECTING al empezar y, si el intento fallo,
      // nunca llega a DISCONNECTED: se queda en un estado que promete algo que
      // no esta pasando. Medido en el telefono el 2026-09-08 -- la aplicacion
      // decia RECONECTANDO con la red ya restablecida y nadie reintentando,
      // porque el reintento solo se programaba al recibir DISCONNECTED, que en
      // este camino no llega. Hay que decir la verdad y programarlo aca.
      // Solo se reintenta si esta sigue siendo la direccion que se quiere. Un
      // intento viejo que termina tarde no debe resucitar su propio reintento
      // ni pisar la conexion que la persona establecio mientras tanto.
      if (url === this.direccionDeseada) {
        this.adapter = null;
        this.sincronizarConexion('DISCONNECTED');
        this.reconectarSiCorresponde(url);
      }
      throw e;
    } finally {
      if (!automatico) this.conectando.set(false);
    }
  }

  async desconectar(): Promise<void> {
    // Primero se apaga la intención y el reintento. Al revés, el
    // `DISCONNECTED` que produce el cierre dispararía una reconexión contra la
    // voluntad de quien acaba de tocar Desconectar.
    this.quiereConectado = false;
    this.detenerReintento();
    await this.adapter?.desconectar();
    this.adapter = null;
    this.canales.set([]);
  }

  /**
   * Vuelve a intentar mientras el usuario quiera estar conectado.
   *
   * **Por qué existe.** El adaptador no reconecta: al cerrarse el socket queda
   * en DISCONNECTED y ahí se queda. Hasta hoy el único reintento del sistema
   * vivía dentro de la prueba de diagnóstico, así que la aplicación de un show
   * se quedaba mirando una consola que había vuelto. Un músico que está
   * tocando no va a ir a Ajustes a tocar «Conectar».
   *
   * **Lo que este reintento no decide.** Cada cuánto reintentar y cuándo
   * rendirse son números que fija el criterio 1 de SPK-P0.1, que todavía no se
   * midió: pide veinte ciclos por cada forma de corte. Mientras tanto se
   * reintenta cada segundo y no se rinde nunca, que es lo que hacía la prueba
   * de diagnóstico y lo único que se puede sostener sin medición: rendirse a
   * los N intentos sería elegir un N inventado, y en un show el costo de
   * rendirse es quedarse ciego.
   */
  private reconectarSiCorresponde(direccion?: string): void {
    if (!this.quiereConectado || this.reintento !== null) return;
    // La direccion del argumento es la del intento que acaba de fallar: si es
    // el primero, `direccion()` todavia es null porque solo se fija al
    // conectar bien, y sin esto la primera caida no reintentaba nunca.
    const url = direccion ?? this.direccion();
    if (url === null) return;

    this.reconectando.set(true);
    this.log.warn('mixer', 'reconexion_iniciada', { url, intervaloMs: REINTENTO_MS });
    this.reintento = setInterval(() => {
      // Un intento por vez: el apretón de manos puede tardar más que el
      // intervalo, y dos en paralelo se pisan el adaptador.
      if (this.reintentoEnCurso) return;
      this.reintentoEnCurso = true;
      void this.conectar(url, true)
        .catch(() => { /* sigue sin haber consola */ })
        .finally(() => { this.reintentoEnCurso = false; });
    }, REINTENTO_MS);
  }

  private detenerReintento(): void {
    if (this.reintento !== null) {
      clearInterval(this.reintento);
      this.reintento = null;
      this.log.info('mixer', 'reconexion_lograda', {});
    }
    this.reconectando.set(false);
  }

  reiniciarPicos(): void {
    this.adapter?.reiniciarPicos();
  }

  descartarCambioMasivo(): void {
    this.cambioMasivo.set(null);
  }

  readonly releyendo = signal(false);

  /**
   * Si el usuario quiere estar conectado.
   *
   * No es lo mismo que estarlo. Distingue «se cayó la red» de «tocó
   * Desconectar», que es lo único que separa una reconexión necesaria de una
   * que pelea contra la voluntad de quien la apagó.
   */
  private quiereConectado = false;
  /**
   * La direccion que la persona quiere ahora.
   *
   * Sin esto, un intento automatico **en vuelo** contra la direccion vieja
   * rearmaba el reintento al fallar --su `catch` corre despues de que la
   * persona ya conecto a otra-- y los reintentos siguientes reemplazaban el
   * adaptador bueno por uno apuntando a ninguna parte. El sintoma era una
   * conexion que se caia sola unos segundos despues de establecerse.
   */
  private direccionDeseada: string | null = null;
  private reintento: ReturnType<typeof setInterval> | null = null;
  /** Un intento automatico por vez: el apreton puede tardar mas que el intervalo. */
  private reintentoEnCurso = false;

  /** Si hay una reconexión en curso, para poder decirlo en pantalla. */
  readonly reconectando = signal(false);

  /**
   * Vuelve a leer el estado entero de la consola.
   *
   * Es lo que el cartel de cambio masivo prometía y no hacía: decía «hasta
   * releerlo» y el botón decía «Entendido». Sin esto, el estado quedaba
   * inválido hasta desconectar y volver a conectar a mano, y con él la
   * posibilidad de escribir.
   */
  async releerEstado(): Promise<void> {
    const adapter = this.adapter;
    if (adapter === null) {
      // Volvía en silencio y el botón quedaba inerte, sin registro de por qué.
      this.ultimoError.set('No hay conexión con la consola: no hay estado que releer.');
      this.log.warn('mixer', 'relectura_sin_conexion', {});
      return;
    }
    this.releyendo.set(true);
    try {
      // Se espera el volcado completo, no la reconexión. `conectar()` resuelve
      // cuando abre el socket, y lo que devuelve el estado a válido es el
      // `DUMP_END` que llega después. Sin esperarlo, el cartel se despejaba
      // porque alguien lo apagó y no porque se hubiera releído nada: si el
      // volcado no llegaba, el usuario quedaba sin cartel, sin poder escribir y
      // sin nada que se lo dijera.
      const volcado = new Promise<boolean>((resolver) => {
        const quitar = adapter.alVolcadoCompleto(() => { quitar(); resolver(true); });
        setTimeout(() => { quitar(); resolver(false); }, ESPERA_VOLCADO_MS);
      });
      await adapter.releerEstado();
      if (!await volcado) {
        this.ultimoError.set(
          'La consola volvió a conectarse pero no mandó su estado. El cartel sigue ' +
          'hasta que lo haga: no se puede escribir sobre un estado que no se leyó.',
        );
        this.log.warn('mixer', 'relectura_sin_volcado', { esperaMs: ESPERA_VOLCADO_MS });
        return;
      }
      this.cambioMasivo.set(null);
      this.canales.set(adapter.canales());
      this.log.info('mixer', 'estado_releido', {});
    } catch (e) {
      this.ultimoError.set(String(e));
      this.log.error('mixer', 'relectura_fallida', { error: String(e) });
    } finally {
      this.releyendo.set(false);
    }
  }

  /**
   * Refleja en la interfaz lo que el adaptador determinó. No vuelve a decidir
   * nada: la detección de inestabilidad vive en el adaptador, que es el que ve
   * las tramas de medidores.
   */
  private sincronizarConexion(e: ConnectionState): void {
    // No se revalida el estado acá. `CONNECTED` se emite al abrir el socket,
    // antes de recibir un solo mensaje del volcado, así que marcar el estado
    // como confirmado en ese momento dejaba `permiteEscribir()` en verdadero
    // mientras el almacén seguía INVALID — justo lo contrario de lo que dice
    // INV-017. Y peor: tras una avalancha bastaba una trama de medidores para
    // volver a CONNECTED y revalidar sin haber releído nada.
    //
    // La validación llega ahora por `alVolcadoCompleto`, que es el hecho que
    // de verdad la justifica.
    this.conexion.fijarEstado(e);
  }
}

function quitar<T>(lista: T[], elemento: T): void {
  const i = lista.indexOf(elemento);
  if (i >= 0) lista.splice(i, 1);
}
