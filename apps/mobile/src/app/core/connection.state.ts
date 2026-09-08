import { Injectable, signal, computed } from '@angular/core';

/**
 * Estado de la conexión con la consola, para la interfaz.
 *
 * **No decide** cuándo la conexión es inestable: eso lo hace el adaptador, que
 * es quien ve las tramas de medidores. Tener la misma regla implementada en
 * dos lugares fue un error real: la interfaz seguía diciendo "conectado"
 * mientras el adaptador ya sabía que no llegaban medidores. Lo encontró la
 * prueba visual contra el simulador.
 *
 * Este servicio solo refleja y expone lo que el adaptador determina.
 */

export type ConnectionState = 'CONNECTED' | 'UNSTABLE' | 'RECONNECTING' | 'DISCONNECTED';

@Injectable({ providedIn: 'root' })
export class ConnectionStateService {
  private readonly _estado = signal<ConnectionState>('DISCONNECTED');
  private readonly _storeValido = signal(false);

  readonly estado = this._estado.asReadonly();
  readonly storeValido = this._storeValido.asReadonly();

  /**
   * Solo con conexión estable y estado confirmado se puede escribir (INV-017).
   * Con la conexión inestable no se escribe: no hay forma de verificar que el
   * cambio llegó.
   */
  readonly permiteEscribir = computed(
    () => this._estado() === 'CONNECTED' && this._storeValido(),
  );

  fijarEstado(e: ConnectionState): void {
    this._estado.set(e);
    if (e === 'RECONNECTING' || e === 'DISCONNECTED') {
      this._storeValido.set(false);
    }
  }

  volcadoCompletoRecibido(): void {
    this._storeValido.set(true);
  }

  /** Tras una avalancha, el estado local deja de ser confiable (INV-021). */
  invalidarPorCambioMasivo(): void {
    this._storeValido.set(false);
  }
}
