import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { BandService } from '../core/band.service';
import { GainAssistantService, DURACION_CAPTURA_S } from './gain-assistant.service';
import type { ChannelAssignment } from '@vse/domain';

/**
 * Asistente de ganancia.
 *
 * Muestra la recomendación con su porqué y su evidencia, nunca solo un número.
 * Y no aplica nada: en esta versión la aplicación no escribe en la consola.
 */
@Component({
  selector: 'app-gain',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (asignaciones().length === 0) {
      <p class="vacio">
        Todavía no hay canales asignados. Asigná al menos uno en la pestaña de
        canales: sin saber qué instrumento es, no hay margen objetivo con el que
        comparar.
      </p>
    } @else {
      @if (capturando()) {
        <section class="captura">
          <p class="etiqueta">{{ tituloCaptura() }}</p>
          <p class="cuenta">{{ segundos() }}</p>
          <p class="instruccion">{{ instruccion() }}</p>
          <button type="button" (click)="cancelar()">Cancelar</button>
        </section>
      }

      <table>
        <thead>
          <tr>
            <th class="izq">Canal</th>
            <th class="num">Pico</th>
            <th class="num">Margen</th>
            <th class="num">Objetivo</th>
            <th class="num">Ganancia</th>
            <th class="num">Propuesta</th>
            <th>Confianza</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (a of asignaciones(); track a.id) {
            <tr>
              <td class="izq">
                <span class="idx">{{ a.ui24rInputIndex }}</span> {{ a.nombreEnConsola }}
              </td>
              @if (resultado(a.ui24rInputIndex); as r) {
                <td class="num">{{ r.analisis.picoDb.toFixed(1) }}</td>
                <td class="num">{{ r.analisis.margenDb.toFixed(1) }}</td>
                <td class="num">{{ margenObjetivo(a) }}</td>
                <td class="num">{{ r.propuesta.gainActualDb.toFixed(0) }}</td>
                <td class="num propuesta" [class.sube]="r.propuesta.deltaDb > 0.05"
                    [class.baja]="r.propuesta.deltaDb < -0.05">
                  {{ delta(r.propuesta.deltaDb) }}
                </td>
                <td><span class="conf" [class]="r.propuesta.confianza">{{ confianza(r.propuesta.confianza) }}</span></td>
              } @else {
                <td class="num" colspan="6">sin medir</td>
              }
              <td>
                <button type="button" class="medir" [disabled]="capturando()"
                        (click)="medir(a)">
                  {{ resultado(a.ui24rInputIndex) ? 'Repetir' : 'Medir' }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>

      @for (r of resultados(); track r.indice) {
        <article class="recomendacion">
          <h3>{{ r.nombre }}</h3>
          <p class="razon">{{ r.propuesta.razon }}</p>
          @if (r.propuesta.avisos.length > 0) {
            <ul class="avisos">
              @for (av of r.propuesta.avisos; track av) { <li>{{ av }}</li> }
            </ul>
          }
          <p class="evidencia">
            Ventana de {{ r.analisis.duracionS.toFixed(0) }} s ·
            {{ r.analisis.muestras }} muestras con señal ·
            variación de {{ r.analisis.rangoDinamicoDb.toFixed(0) }} dB ·
            estabilidad {{ r.analisis.estabilidadDb.toFixed(1) }} dB
          </p>
          <p class="nota">
            Sin corrección de sala todavía: esta recomendación mira la señal del
            canal, no lo que se oye en el recinto. Aplicá el cambio a mano en la
            consola.
          </p>
        </article>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .vacio { color: var(--muted); max-width: 60ch; }

    .captura {
      background: var(--surface); border: 1px solid var(--signal);
      border-radius: 3px; padding: 20px; margin-bottom: 20px; text-align: center;
    }
    .etiqueta { color: var(--muted); margin: 0 0 4px; font-size: 14px; }
    .cuenta {
      font-family: var(--mono); font-size: 56px; line-height: 1;
      color: var(--signal); margin: 0 0 8px; font-variant-numeric: tabular-nums;
    }
    .instruccion { margin: 0 0 16px; font-size: 17px; }
    .captura button {
      background: transparent; color: var(--ink-2); border: 1px solid var(--line);
      border-radius: 3px; padding: 10px 20px; cursor: pointer;
    }

    table { font-size: 14px; margin-bottom: 24px; }
    th.izq, td.izq { text-align: left; }
    .idx { color: var(--muted); font-family: var(--mono); font-size: 12px; }
    td.propuesta.sube { color: var(--ok); }
    td.propuesta.baja { color: var(--warn); }
    .conf {
      font-family: var(--mono); font-size: 11px; letter-spacing: .06em;
      padding: 2px 8px; border-radius: 2px; border: 1px solid var(--line);
      color: var(--muted);
    }
    .conf.HIGH { color: var(--ok); border-color: var(--ok); }
    .conf.MEDIUM { color: var(--warn); border-color: var(--warn); }
    /* Hay un botón por canal: doce rellenos compiten con los números, que son
       lo que hay que leer. Se dejan como acción secundaria. */
    .medir {
      background: transparent; color: var(--signal);
      border: 1px solid var(--signal); border-radius: 3px;
      padding: 8px 16px; cursor: pointer; font-size: 13px;
    }
    .medir:hover { background: color-mix(in srgb, var(--signal) 12%, transparent); }
    .medir:disabled { opacity: .35; border-color: var(--line); color: var(--muted); }

    .recomendacion {
      border-left: 2px solid var(--signal); padding: 0 0 0 16px; margin-bottom: 20px;
      max-width: 78ch;
    }
    h3 { font-size: 15px; margin: 0 0 6px; font-weight: 500; }
    .razon { margin: 0 0 8px; color: var(--ink-2); }
    .avisos { margin: 0 0 8px; padding-left: 18px; color: var(--warn); font-size: 13.5px; }
    .evidencia, .nota {
      margin: 0 0 4px; color: var(--muted); font-size: 12.5px;
    }
  `],
})
export class GainComponent {
  private readonly banda = inject(BandService);
  private readonly asistente = inject(GainAssistantService);

  readonly asignaciones = this.banda.asignaciones;
  readonly resultados = this.asistente.resultados;
  readonly capturando = this.asistente.capturando;
  readonly segundos = this.asistente.segundosRestantes;

  readonly tituloCaptura = computed(() => {
    const i = this.asistente.canalEnCurso();
    const a = i === null ? undefined : this.banda.asignacionDe(i);
    return a ? a.nombreEnConsola : 'Capturando';
  });

  readonly instruccion = computed(() =>
    this.asistente.estado() === 'CUENTA_REGRESIVA'
      ? 'Preparate'
      : `Tocá o cantá la parte más fuerte que vayas a hacer en el show, durante ${DURACION_CAPTURA_S} segundos`,
  );

  resultado(indice: number) {
    return this.asistente.resultadoDe(indice);
  }

  margenObjetivo(a: ChannelAssignment): string {
    return `${this.banda.perfilDe(a).margenObjetivoDb}`;
  }

  delta(db: number): string {
    if (Math.abs(db) < 0.05) return '—';
    return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
  }

  confianza(c: string): string {
    switch (c) {
      case 'HIGH': return 'ALTA';
      case 'MEDIUM': return 'MEDIA';
      case 'LOW': return 'BAJA';
      default: return 'SIN DATOS';
    }
  }

  medir(a: ChannelAssignment): void {
    void this.asistente.capturar(a);
  }

  cancelar(): void {
    this.asistente.cancelar();
  }
}
