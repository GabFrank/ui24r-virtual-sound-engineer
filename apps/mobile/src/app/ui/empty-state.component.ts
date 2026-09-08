import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type NombreDeIcono } from './icon.component';

/**
 * Estado vacío.
 *
 * Un estado vacío que solo dice "no hay nada" desperdicia la única pantalla
 * donde el usuario está seguro de que le falta algo. Este exige un título que
 * explique por qué está vacío y admite la acción que lo resuelve.
 */
@Component({
  selector: 'ui-empty',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-icon [nombre]="icono()" [tamanio]="32" />
    <h3>{{ titulo() }}</h3>
    @if (detalle(); as d) { <p>{{ d }}</p> }
    <div class="accion"><ng-content /></div>
  `,
  styles: [`
    :host {
      display: flex; flex-direction: column; align-items: center;
      text-align: center; gap: var(--sp-3);
      padding: var(--sp-7) var(--sp-4);
      color: var(--muted);
    }
    h3 { color: var(--ink-2); font-size: var(--txt-lg); font-weight: var(--peso-medio); }
    p { max-width: 46ch; line-height: var(--alto-linea); font-size: var(--txt-sm); }
    .accion:empty { display: none; }
    .accion { margin-top: var(--sp-2); }
  `],
})
export class EmptyStateComponent {
  readonly icono = input<NombreDeIcono>('info');
  readonly titulo = input.required<string>();
  readonly detalle = input<string | null>(null);
}
