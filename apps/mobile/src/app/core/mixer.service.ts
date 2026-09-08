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
