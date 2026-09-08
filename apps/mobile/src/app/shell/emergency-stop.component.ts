import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Logger } from '../core/logger';
import { SafetyService } from '../core/safety.service';

/**
 * Paro de emergencia. Implementa INV-019 y ADR-012.
 *
 * Está montado en el contenedor de la aplicación, no en cada pantalla: la
 * invariante exige que esté visible siempre, y montarlo una sola vez es la
 * única forma de que no se olvide en una pantalla futura.
 *
 * Lo que hace, en este orden:
 *  1. Acciones locales garantizadas, sin red, en menos de 200 ms.
 *  2. Acciones remotas con confirmación y reintentos.
 *
 * Lo que no hace: silenciar el general ni los canales. Un paro que apaga el
 * show entero es peor que el problema que resuelve, y nadie lo usaría.
 */
@Component({
  selector: 'app-emergency-stop',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (armado()) {
      <div class="rearme">
        <span>Paro activo. Las escrituras están bloqueadas.</span>
        <button type="button" class="btn-rearme" (click)="rearmar()">Rearmar</button>
      </div>
    }
    <button
      type="button"
      class="stop"
      [class.activo]="armado()"
      [attr.aria-pressed]="armado()"
      (click)="activar()">
      PARO
    </button>
  `,
  styles: [`
    @use 'tokens' as *;

    .stop {
      position: fixed; right: var(--sp-4); bottom: calc(var(--sp-4) + var(--seguro-abajo));
      width: var(--alto-paro); height: var(--alto-paro); border-radius: 50%;
      background: var(--danger); color: #1a0a0a;
      border: 3px solid #f0a0a0;
      font-family: var(--mono); font-size: 13px; font-weight: 700;
      letter-spacing: 0.08em; cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,.6);
      z-index: 1000;
    }

    /* En teléfono la barra de navegación vive abajo: sin esto el paro queda
       encima de ella y tapa dos destinos. Se sube por encima de la barra, que
       es donde además el pulgar llega sin cambiar el agarre. */
    @include hasta($bp-telefono) {
      .stop {
        width: var(--alto-paro-telefono); height: var(--alto-paro-telefono);
        bottom: calc(var(--tap-comodo) + var(--sp-3) + var(--seguro-abajo));
      }
    }
    .stop.activo { background: var(--muted); border-color: var(--line); color: var(--ink); }
    .stop:active { transform: scale(0.96); }

    .rearme {
      position: fixed; left: 0; right: 0; top: 0;
      background: var(--danger); color: #1a0a0a;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 16px; z-index: 1001;
      font-size: 14px;
    }
    .btn-rearme {
      background: #1a0a0a; color: var(--ink); border: 0;
      padding: 8px 16px; border-radius: 3px; cursor: pointer;
    }
  `],
})
export class EmergencyStopComponent {
  private readonly log = inject(Logger);
  private readonly safety = inject(SafetyService);

  readonly armado = signal(false);

  activar(): void {
    if (this.armado()) return;
    const t0 = performance.now();
    this.safety.pararTodoLocal();
    this.armado.set(true);
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
      this.armado.set(false);
      this.log.info('safety', 'emergency_stop_rearmado');
    });
  }
}
