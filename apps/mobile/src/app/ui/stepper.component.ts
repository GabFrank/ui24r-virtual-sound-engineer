import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from './icon.component';

export interface PasoDeAsistente {
  readonly id: string;
  readonly titulo: string;
}

/**
 * Indicador de pasos de un asistente.
 *
 * Los asistentes de configuración son obligatorios (ADR-017): hay pasos que no
 * se pueden saltar porque de ellos depende que la aplicación no proponga
 * disparates. Si el usuario no ve cuántos faltan, los abandona a la mitad y
 * queda con una configuración incompleta que parece completa.
 *
 * En teléfono se reduce a «paso 2 de 5» más el título: cinco círculos con
 * texto no entran en 360 píxeles sin quedar ilegibles.
 */
@Component({
  selector: 'ui-stepper',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="ancho">
      @for (p of pasos(); track p.id; let i = $index) {
        <li [class.hecho]="i < indice()" [class.actual]="i === indice()"
            [attr.aria-current]="i === indice() ? 'step' : null">
          <span class="marca">
            @if (i < indice()) { <ui-icon nombre="chequeo" [tamanio]="14" /> }
            @else { {{ i + 1 }} }
          </span>
          <span class="titulo">{{ p.titulo }}</span>
        </li>
      }
    </ol>

    <p class="angosto">
      <span class="cuenta num">{{ indice() + 1 }}/{{ pasos().length }}</span>
      <span class="titulo">{{ tituloActual() }}</span>
    </p>
  `,
  styles: [`
    @use 'tokens' as *;

    :host { display: block; margin-bottom: var(--sp-5); }

    ol {
      display: flex; align-items: center; gap: var(--sp-2);
      list-style: none; margin: 0; padding: 0;
      overflow-x: auto;
    }
    li {
      display: flex; align-items: center; gap: var(--sp-2);
      padding: var(--sp-2) var(--sp-3);
      border: 1px solid var(--line);
      border-radius: var(--radio-full);
      color: var(--muted);
      font-size: var(--txt-sm);
      white-space: nowrap;
    }
    li.actual { border-color: var(--signal); color: var(--ink); }
    li.hecho { color: var(--ok); border-color: var(--ok-tenue); }

    .marca {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; flex: none;
      border-radius: var(--radio-full);
      background: var(--surface-2);
      font-family: var(--mono); font-size: var(--txt-xs);
    }
    li.actual .marca { background: var(--signal); color: #06282b; }
    li.hecho .marca { background: var(--ok-tenue); color: var(--ok); }

    p.angosto {
      display: none;
      align-items: baseline; gap: var(--sp-3);
    }
    .cuenta { color: var(--signal); font-size: var(--txt-sm); }
    p.angosto .titulo { font-size: var(--txt-lg); font-weight: var(--peso-medio); }

    @include hasta($bp-telefono) {
      ol.ancho { display: none; }
      p.angosto { display: flex; }
    }
  `],
})
export class StepperComponent {
  readonly pasos = input.required<readonly PasoDeAsistente[]>();
  readonly indice = input.required<number>();

  protected readonly tituloActual = computed(
    () => this.pasos()[this.indice()]?.titulo ?? '',
  );
}
