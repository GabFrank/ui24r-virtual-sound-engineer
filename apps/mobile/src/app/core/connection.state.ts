import { Injectable, signal, computed } from '@angular/core';

/**
 * Estado de la conexión con la consola. Implementa INV-017 e INV-018.
 *
 * El estado inestable no se detecta por pérdida de paquetes: el transporte es
 * TCP, así que desde la aplicación no se pierde nada, se retrasa. Lo que sí se
 * observa es la cadencia de las tramas de medidores, que la consola emite de
 * forma continua. Un hueco largo entre tramas es la señal.
 */

export type ConnectionState = 'CONNECTED' | 'UNSTABLE' | 'RECONNECTING' | 'DISCONNECTED';

@Injectable({ providedIn: 'root' })
export class ConnectionStateService {
  private readonly _estado = signal<ConnectionState>('DISCONNECTED');
  private readonly _storeValido = signal(false);
  private readonly _ultimaTramaVu = signal<number | null>(null);

  /**
   * Umbral de hueco entre tramas de medidores. Se fija con el valor medido en
   * el primer spike: tres veces el intervalo medio. Hasta entonces, un valor
   * conservador que se corregirá con el número real.
   */
  private umbralHuecoMs = 300;

  readonly estado = this._estado.asReadonly();
  readonly storeValido = this._storeValido.asReadonly();

  /** Solo con conexión estable y estado confirmado se puede escribir. */
  readonly permiteEscribir = computed(
    () => this._estado() === 'CONNECTED' && this._storeValido(),
  );

  fijarUmbralHueco(ms: number): void {
    this.umbralHuecoMs = ms;
  }

  conectado(): void {
    this._estado.set('CONNECTED');
  }

  /**
   * Al reconectar, el estado local deja de ser confiable hasta que llega el
   * volcado completo: la consola pudo cambiar mientras no había conexión.
   */
  reconectando(): void {
    this._estado.set('RECONNECTING');
    this._storeValido.set(false);
  }

  desconectado(): void {
    this._estado.set('DISCONNECTED');
    this._storeValido.set(false);
  }

  volcadoCompletoRecibido(): void {
    this._storeValido.set(true);
    if (this._estado() === 'RECONNECTING') this._estado.set('CONNECTED');
  }

  /** Invalida el estado ante una avalancha de cambios externos (INV-021). */
  invalidarPorCambioMasivo(): void {
    this._storeValido.set(false);
  }

  /** Se llama con cada trama de medidores recibida. */
  tramaVuRecibida(ahoraMs = Date.now()): void {
    const previa = this._ultimaTramaVu();
    this._ultimaTramaVu.set(ahoraMs);
    if (previa === null) return;
    const hueco = ahoraMs - previa;
    if (hueco > this.umbralHuecoMs && this._estado() === 'CONNECTED') {
      this._estado.set('UNSTABLE');
    } else if (hueco <= this.umbralHuecoMs && this._estado() === 'UNSTABLE') {
      this._estado.set('CONNECTED');
    }
  }
}
