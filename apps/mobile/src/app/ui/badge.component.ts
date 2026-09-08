import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type TonoDeInsignia = 'neutro' | 'ok' | 'aviso' | 'peligro' | 'senal';

/**
 * Insignia de estado.
 *
 * Lleva siempre texto además de color. El color solo refuerza: una insignia
 * que solo se distingue por el tono es invisible para quien no distingue ese
 * tono, y esta aplicación muestra estados de los que depende que algo suene o
 * no suene en una sala llena.
 */
@Component({
  selector: 'ui-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="tono()"><ng-content /></span>`,
  styles: [`
    :host { display: inline-flex; }
    span {
      display: inline-flex; align-items: center;
      padding: 2px var(--sp-2);
      border: 1px solid;
      border-radius: var(--radio-sm);
      font-size: var(--txt-xs);
      font-weight: var(--peso-medio);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .neutro  { color: var(--muted);  border-color: var(--line-fuerte); }
    .ok      { color: var(--ok);     border-color: var(--ok);     background: var(--ok-tenue); }
    .aviso   { color: var(--warn);   border-color: var(--warn);   background: var(--warn-tenue); }
    .peligro { color: var(--danger); border-color: var(--danger); background: var(--danger-tenue); }
    .senal   { color: var(--signal); border-color: var(--signal); background: var(--signal-tenue); }
  `],
})
export class BadgeComponent {
  readonly tono = input<TonoDeInsignia>('neutro');
}
