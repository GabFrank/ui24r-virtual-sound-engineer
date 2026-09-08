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
    <div class="caja" role="alert">
      <ui-icon nombre="aviso" [tamanio]="28" />
      <div class="texto">
        <p class="que">{{ mensaje() }}</p>
        <p class="ayuda">{{ ayuda() }}</p>
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
      border: 1px solid var(--danger-borde); border-radius: var(--radio-3);
      background: var(--sobre-danger); color: var(--ink);
    }
    .que { margin: 0; font-weight: 600; }
    .ayuda { margin: var(--sp-1) 0 0; color: var(--muted); font-size: var(--txt-sm); }
  `],
})
export class FalloComponent {
  readonly mensaje = input.required<string>();
  readonly ayuda = input('Los datos están en el dispositivo, así que no depende de la red.');
  readonly reintentar = output<void>();
}
