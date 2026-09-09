import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import {
  PISO_DB, UMBRAL_RIESGO_DB, UMBRAL_SATURACION_DB, porcentajeDeDb,
} from './escala-medidor.ts';

/**
 * Medidor de nivel de un canal.
 *
 * La escala y los umbrales viven en `escala-medidor.ts`, que los saca de la
 * consola: de −80 dB en el fondo a 0 dB en la punta, lineal en decibeles, que
 * es como la Ui24R dibuja su propia barra. Acá solo queda el pintado.
 */
@Component({
  selector: 'app-level-meter',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pista" role="meter"
         [attr.aria-label]="etiqueta()"
         [attr.aria-valuemin]="PISO_DB" [attr.aria-valuemax]="TOPE_DB"
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
      <!-- Una sola marca, y donde la barra cambia de color. Antes había dos en
           el 66,7 % y el 83,3 %, que con esta escala caen en −26,6 y −13,3 dB:
           números que no significan nada. Copiar la escala impresa de la
           consola pediría saber qué valores rotula, y eso no está medido. -->
      <div class="marca" [style.left.%]="marcaRiesgo"></div>
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

  readonly anchoNivel = computed(() => porcentajeDeDb(this.nivelDb()));
  readonly anchoPico = computed(() => porcentajeDeDb(this.picoDb()));
  readonly enRiesgo = computed(
    () => this.nivelDb() >= UMBRAL_RIESGO_DB && this.nivelDb() < UMBRAL_SATURACION_DB,
  );
  readonly saturando = computed(() => this.nivelDb() >= UMBRAL_SATURACION_DB);
  readonly picoSaturado = computed(() => this.picoDb() >= UMBRAL_SATURACION_DB);

  protected readonly PISO_DB = PISO_DB;
  protected readonly TOPE_DB = UMBRAL_SATURACION_DB;
  protected readonly marcaRiesgo = porcentajeDeDb(UMBRAL_RIESGO_DB);

  protected readonly nivelRedondeado = computed(() => Math.round(this.nivelDb()));

  /**
   * Lo que lee un lector de pantalla. En la vista de teléfono el medidor es el
   * único portador del nivel instantáneo, así que sin esto ese dato no existe
   * para quien no ve la barra.
   */
  protected readonly textoAccesible = computed(() => {
    const db = this.nivelDb();
    if (!Number.isFinite(db) || db <= PISO_DB) return 'silencio';
    // dB de la escala de la consola, no dBFS: la correspondencia con un
    // nivel digital real la mide SPK-P0.10b y hasta entonces decir «dBFS»
    // seria afirmar una referencia de fondo de escala que nadie midio.
    return `${db.toFixed(1)} dB`;
  });
}
