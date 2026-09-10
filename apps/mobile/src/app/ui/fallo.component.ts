import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from './button.component';
import { IconComponent } from './icon.component';

/**
 * Que algo no se pudo leer, y qué se puede hacer.
 *
 * Siempre con reintentar: la mayoría de estos fallos son transitorios, y sin
 * el botón la única salida es cerrar la aplicación. El mensaje va en
 * «role=alert» para que se anuncie sin tener que ir a buscarlo.
 */
@Component({
  selector: 'ui-fallo',
  standalone: true,
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="caja" [class.compacta]="compacto()" role="alert">
      <ui-icon nombre="aviso" [tamanio]="28" />
      <div class="texto">
        <p class="que">{{ mensaje() }}</p>
        @if (!compacto()) { <p class="ayuda">{{ ayuda() }}</p> }
      </div>
      <ui-button variante="secundario" icono="refrescar" (pulsado)="reintentar.emit()">
        Reintentar
      </ui-button>
    </div>
  `,
  styles: [`
    .caja {
      display: grid; gap: var(--sp-3); justify-items: center; text-align: center;
      padding: var(--sp-6) var(--sp-4);
      border: 1px solid var(--danger-borde); border-radius: var(--radio-lg);
      background: var(--sobre-danger); color: var(--ink);
    }
    /* Compacta: para cuando ya hay algo en pantalla y el fallo es de una
       recarga. Ocupa una línea y no desplaza el contenido que sí sirve. */
    .caja.compacta {
      grid-template-columns: auto 1fr auto; justify-items: start; text-align: left;
      align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4); margin-bottom: var(--sp-4);
    }
    .que { margin: 0; font-weight: 600; }
    .ayuda { margin: var(--sp-1) 0 0; color: var(--muted); font-size: var(--txt-sm); }
  `],
})
export class FalloComponent {
  readonly mensaje = input.required<string>();
  readonly ayuda = input('Los datos están en el dispositivo, así que no depende de la red.');
  /** Una sola línea, para un fallo de recarga con contenido ya en pantalla. */
  readonly compacto = input(false);
  readonly reintentar = output<void>();
}
