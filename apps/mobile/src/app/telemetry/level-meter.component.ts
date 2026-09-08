import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';

/**
 * Medidor de nivel de un canal.
 *
 * Escala de -60 a 0 dBFS con resolución no lineal: la zona entre -20 y 0, que
 * es donde se decide si hay margen suficiente, ocupa más de la mitad del
 * recorrido. Un medidor lineal en decibeles deja esa zona apretada, que es
 * justo la que hay que leer de un vistazo.
 */
@Component({
  selector: 'app-level-meter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pista" [attr.aria-label]="etiqueta()">
      <div class="relleno" [class.alto]="enRiesgo()" [class.saturando]="saturando()"
           [style.width.%]="anchoNivel()"></div>
      @if (anchoPico() > 0) {
        <div class="pico" [class.saturando]="saturando()" [style.left.%]="anchoPico()"></div>
      }
      <div class="marca" style="left: 66.7%"></div>
      <div class="marca" style="left: 83.3%"></div>
    </div>
  `,
  styles: [`
    .pista {
      position: relative; height: 14px; background: #0a0e10;
      border: 1px solid var(--line); border-radius: 2px; overflow: hidden;
    }
    .relleno {
      position: absolute; left: 0; top: 0; bottom: 0;
      background: var(--ok); transition: width 60ms linear;
    }
    .relleno.alto { background: var(--warn); }
    .relleno.saturando { background: var(--danger); }
    .pico {
      position: absolute; top: 0; bottom: 0; width: 2px;
      background: var(--ink); opacity: .85;
    }
    .pico.saturando { background: var(--danger); }
    .marca {
      position: absolute; top: 0; bottom: 0; width: 1px;
      background: var(--line);
    }
  `],
})
export class LevelMeterComponent {
  readonly nivelDb = input.required<number>();
  readonly picoDb = input<number>(-Infinity);
  readonly etiqueta = input<string>('nivel');

  /** -60 dB es el piso visible; por debajo no aporta información útil. */
  private static readonly PISO_DB = -60;

  private static aPorcentaje(db: number): number {
    if (!Number.isFinite(db) || db <= LevelMeterComponent.PISO_DB) return 0;
    const acotado = Math.min(0, db);
    // Curva que expande la zona alta: raíz del recorrido normalizado.
    const norm = (acotado - LevelMeterComponent.PISO_DB) / -LevelMeterComponent.PISO_DB;
    return Math.round(Math.pow(norm, 0.65) * 100);
  }

  readonly anchoNivel = computed(() => LevelMeterComponent.aPorcentaje(this.nivelDb()));
  readonly anchoPico = computed(() => LevelMeterComponent.aPorcentaje(this.picoDb()));
  readonly enRiesgo = computed(() => this.nivelDb() >= -12 && this.nivelDb() < -1);
  readonly saturando = computed(() => this.nivelDb() >= -1);
}
