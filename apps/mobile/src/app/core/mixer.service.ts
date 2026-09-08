import { Injectable, inject, signal } from '@angular/core';
import {
  Ui24rMixerAdapter, WebSocketTransport, type EstadoCanal,
  type ConnectionState, type BulkExternalChange,
} from '@vse/mixer-adapter';
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

  async conectar(url: string): Promise<void> {
    this.conectando.set(true);
    this.ultimoError.set(null);
    try {
      const adapter = new Ui24rMixerAdapter(new WebSocketTransport());
      this.adapter = adapter;

      adapter.alCambiarConexion((e: ConnectionState) => {
        this.sincronizarConexion(e);
        this.log.info('mixer', 'conexion_cambio', { estado: e });
      });

      adapter.alVolcadoCompleto(() => {
        this.conexion.volcadoCompletoRecibido();
        this.log.info('mixer', 'volcado_completo', {});
      });

      adapter.alActualizarTelemetria(() => {
        this.canales.set(adapter.canales());
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
      this.canales.set(adapter.canales());
    } catch (e) {
      this.ultimoError.set(String(e));
      this.log.error('mixer', 'conexion_fallida', { url, error: String(e) });
      throw e;
    } finally {
      this.conectando.set(false);
    }
  }

  async desconectar(): Promise<void> {
    await this.adapter?.desconectar();
    this.adapter = null;
    this.canales.set([]);
  }

  reiniciarPicos(): void {
    this.adapter?.reiniciarPicos();
  }

  descartarCambioMasivo(): void {
    this.cambioMasivo.set(null);
  }

  readonly releyendo = signal(false);

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
