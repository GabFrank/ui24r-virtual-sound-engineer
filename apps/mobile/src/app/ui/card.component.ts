import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Tarjeta.
 *
 * Es el contenedor por defecto de cualquier bloque con identidad propia. En
 * teléfono, además, es lo que reemplaza a las filas de una tabla: una tabla de
 * ocho columnas en 360 píxeles no se lee, y una lista de tarjetas sí.
 */
@Component({
  selector: 'ui-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (titulo(); as t) {
      <header>
        <h3>{{ t }}</h3>
        @if (subtitulo(); as s) { <p class="sub">{{ s }}</p> }
        <div class="acciones"><ng-content select="[acciones]" /></div>
      </header>
    }
    <div class="cuerpo"><ng-content /></div>
  `,
  styles: [`
    :host {
      display: block;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radio-lg);
      overflow: hidden;
    }
    :host(.plana) { background: transparent; border-color: transparent; }
    :host(.acento) { border-color: var(--signal-tenue); }

    header {
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas: 'titulo acciones' 'sub acciones';
      gap: 0 var(--sp-3);
      align-items: center;
      padding: var(--sp-4);
      border-bottom: 1px solid var(--line);
    }
    h3 {
      grid-area: titulo;
      font-size: var(--txt-md); font-weight: var(--peso-medio);
      line-height: var(--alto-linea-apretado);
    }
    .sub { grid-area: sub; font-size: var(--txt-sm); color: var(--muted); }
    .acciones { grid-area: acciones; display: flex; gap: var(--sp-2); }

    .cuerpo { padding: var(--sp-4); }
    :host(.sin-relleno) .cuerpo { padding: 0; }
  `],
})
export class CardComponent {
  readonly titulo = input<string | null>(null);
  readonly subtitulo = input<string | null>(null);
}
