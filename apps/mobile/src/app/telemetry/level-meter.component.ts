import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';

/** −60 dB es el piso visible; por debajo no aporta información útil. */
const MIN_DB = -60;

/** Por encima de −1 dBFS el canal está prácticamente en el fondo de escala. */
const UMBRAL_SATURACION_DB = -1;

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
    <div class="pista" role="meter"
         [attr.aria-label]="etiqueta()"
         [attr.aria-valuemin]="MIN_DB" aria-valuemax="0"
         [attr.aria-valuenow]="nivelRedondeado()"
         [attr.aria-valuetext]="textoAccesible()">
      <div class="relleno" [class.alto]="enRiesgo()" [class.saturando]="saturando()"
           [style.width.%]="anchoNivel()"></div>
      @if (anchoPico() > 0) {
        <!-- La marca de pico se pinta según el PICO, no según el nivel
             instantáneo: existe para recordar el máximo alcanzado. Antes usaba «saturando()», así que un canal que picó a 0 dBFS y ahora está en
             −22 mostraba la marca en blanco. -->
        <div class="pico" [class.saturando]="picoSaturado()" [style.left.%]="anchoPico()"></div>
      }
      <div class="marca" style="left: 66.7%"></div>
      <div class="marca" style="left: 83.3%"></div>
    </div>
  `,
  styles: [`
    .pista {
      position: relative; height: 14px; background: var(--pista-medidor);
      /* Borde en el tono fuerte: con «--line» la pista daba 1,47:1 contra el
         fondo, por debajo del 3:1 que hace falta para un elemento gráfico, y
         un canal en silencio era un rectángulo invisible. */
      border: 1px solid var(--line-fuerte); border-radius: 2px; overflow: hidden;
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

  private static readonly PISO_DB = MIN_DB;

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
  readonly saturando = computed(() => this.nivelDb() >= UMBRAL_SATURACION_DB);
  readonly picoSaturado = computed(() => this.picoDb() >= UMBRAL_SATURACION_DB);

  protected readonly MIN_DB = MIN_DB;

  protected readonly nivelRedondeado = computed(() => Math.round(this.nivelDb()));

  /**
   * Lo que lee un lector de pantalla. En la vista de teléfono el medidor es el
   * único portador del nivel instantáneo, así que sin esto ese dato no existe
   * para quien no ve la barra.
   */
  protected readonly textoAccesible = computed(() => {
    const db = this.nivelDb();
    if (!Number.isFinite(db) || db <= MIN_DB) return 'silencio';
    return `${db.toFixed(1)} dBFS`;
  });
}
