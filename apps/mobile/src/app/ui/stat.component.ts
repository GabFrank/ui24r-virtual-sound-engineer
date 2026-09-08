import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

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
    <p class="valor" [class]="clases()">
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
      font-size: var(--txt-2xl); line-height: 1.15;
      overflow-wrap: anywhere;
    }
    /* Solo los números llevan ancho fijo. Con texto —el estado de la sesión,
       el nombre de la banda— la tipografía monoespaciada a 28 px desbordaba la
       celda y se montaba sobre el valor de al lado: en la tarjeta de resumen a
       390 px se leía «ConfiguraciLos del / Fondo». */
    .valor.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .valor.texto { font-size: var(--txt-lg); font-weight: var(--peso-medio); }
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

  /**
   * Un valor numérico usa ancho fijo y tamaño grande; uno de texto, tipografía
   * proporcional y un cuerpo menor. Se deduce del valor en vez de pedirlo,
   * porque quien lo usa ya sabe qué está pasando y una entrada más sería una
   * más que olvidar.
   */
  protected readonly clases = computed(() => {
    const v = this.valor();
    const esNumero = typeof v === 'number' || /^[-−+]?[\d.,]+$/.test(String(v).trim());
    return `${esNumero ? 'num' : 'texto'} ${this.tono()}`;
  });
  readonly unidad = input('');
  readonly nota = input<string | null>(null);
  readonly tono = input<'neutro' | 'ok' | 'aviso' | 'peligro' | 'senal'>('neutro');
}
