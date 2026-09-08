import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Que algo se está leyendo.
 *
 * Barras y no un disco que gira: ocupan el sitio que va a ocupar el contenido,
 * así que la pantalla no salta cuando llega. El texto va en «aria-live» porque
 * un lector de pantalla no ve la animación.
 *
 * Se respeta «prefers-reduced-motion»: quien pidió menos movimiento ve las
 * barras quietas, que siguen diciendo lo mismo.
 */
@Component({
  selector: 'ui-cargando',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="caja" role="status" aria-live="polite">
      <span class="sr">{{ texto() }}</span>
      @for (n of barras; track n) {
        <span class="barra" aria-hidden="true"></span>
      }
    </div>
  `,
  styles: [`
    .caja { display: grid; gap: var(--sp-3); padding: var(--sp-2) 0; }
    .barra {
      display: block; height: 56px; border-radius: var(--radio-2);
      background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
      background-size: 200% 100%;
      animation: brillo 1.4s ease-in-out infinite;
    }
    .barra:nth-child(3) { animation-delay: .15s; }
    .barra:nth-child(4) { animation-delay: .3s; }
    @keyframes brillo {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .barra { animation: none; background: var(--surface-2); }
    }
    .sr {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
    }
  `],
})
export class CargandoComponent {
  readonly texto = input('Cargando');
  readonly barras = [1, 2, 3];
}
