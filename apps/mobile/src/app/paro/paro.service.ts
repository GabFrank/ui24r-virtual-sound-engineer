import { Injectable, inject, signal } from '@angular/core';
import { Logger } from '../core/logger';
import { SafetyService } from '../core/safety.service';

/**
 * Estado del paro de emergencia.
 *
 * Vive en un servicio y no dentro del botón porque **hay más de un botón**: el
 * que flota en la esquina y el que va dentro de cada diálogo. Los dos tienen
 * que reflejar y cambiar el mismo estado; si cada uno tuviera el suyo, pulsar
 * el del diálogo dejaría el de la esquina diciendo que no pasa nada.
 */
@Injectable({ providedIn: 'root' })
export class ParoService {
  private readonly log = inject(Logger);
  private readonly safety = inject(SafetyService);

  private readonly _armado = signal(false);
  readonly armado = this._armado.asReadonly();

  activar(): void {
    if (this._armado()) return;
    const t0 = performance.now();
    this.safety.pararTodoLocal();
    this._armado.set(true);
    const ms = performance.now() - t0;
    this.log.warn('safety', 'emergency_stop_activado', { duracionLocalMs: Math.round(ms) });
    void this.safety.pararTodoRemoto();
  }

  /**
   * El rearme es explícito y relee el estado completo: después de un paro no se
   * puede asumir que la consola está como la dejamos.
   */
  rearmar(): void {
    void this.safety.rearmar().then(() => {
      this._armado.set(false);
      this.log.info('safety', 'emergency_stop_rearmado');
    });
  }
}
