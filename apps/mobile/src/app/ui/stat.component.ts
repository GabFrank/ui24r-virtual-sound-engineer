import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Un número con su rótulo y su unidad.
 *
 * Existe como componente porque estos números son el producto de la
 * aplicación y aparecen por todas partes: nivel, margen, puntaje, retardo.
 * Todos tienen que alinearse y leerse igual, y la unidad nunca puede faltar —
 * un «−12» sin unidad no significa nada.
 */
@Component({
  selector: 'ui-stat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="rotulo">{{ rotulo() }}</p>
    <p class="valor num" [class]="tono()">
      {{ valor() }}<span class="unidad">{{ unidad() }}</span>
    </p>
    @if (nota(); as n) { <p class="nota">{{ n }}</p> }
  `,
  styles: [`
    :host { display: block; }
    .rotulo {
      font-size: var(--txt-xs); letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted);
    }
    .valor {
      margin-top: var(--sp-1);
      font-size: var(--txt-2xl); line-height: 1.1;
    }
    :host(.grande) .valor { font-size: var(--txt-3xl); }
    .unidad { font-size: var(--txt-md); color: var(--muted); margin-left: 2px; }
    .nota { margin-top: var(--sp-1); font-size: var(--txt-xs); color: var(--muted); }

    .ok { color: var(--ok); }
    .aviso { color: var(--warn); }
    .peligro { color: var(--danger); }
    .senal { color: var(--signal); }
  `],
})
export class StatComponent {
  readonly rotulo = input.required<string>();
  readonly valor = input.required<string | number>();
  readonly unidad = input('');
  readonly nota = input<string | null>(null);
  readonly tono = input<'neutro' | 'ok' | 'aviso' | 'peligro' | 'senal'>('neutro');
}
