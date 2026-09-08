import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ParoService } from './paro.service';

/**
 * Banda de rearme.
 *
 * Va en el flujo del contenedor, arriba del todo, y **empuja** el contenido en
 * vez de superponerse. Antes flotaba fija sobre la barra superior y la tapaba
 * entera: mientras el paro estaba activo desaparecían el nombre de la
 * aplicación y, sobre todo, el estado de la conexión — justo el dato que hace
 * falta para decidir si rearmar.
 *
 * El botón usa el tamaño táctil cómodo y no el mínimo: rearmar es la única
 * salida de un estado en el que la aplicación no escribe nada, y es el momento
 * de más prisa y peor pulso de todo el uso.
 */
@Component({
  selector: 'app-paro-banda',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (armado()) {
      <div class="banda" role="alert">
        <span>Paro activo. Las escrituras están bloqueadas.</span>
        <button type="button" (click)="rearmar()">Rearmar</button>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .banda {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-4);
      padding-top: calc(var(--sp-2) + var(--seguro-arriba));
      background: var(--danger); color: var(--sobre-danger);
      font-size: var(--txt-sm); font-weight: var(--peso-medio);
    }
    button {
      flex: none;
      min-height: var(--tap-comodo);
      padding: 0 var(--sp-4);
      background: var(--sobre-danger); color: var(--ink);
      border: 0; border-radius: var(--radio-md);
      font: inherit; font-weight: var(--peso-medio);
      cursor: pointer; touch-action: manipulation;
    }
  `],
})
export class ParoBandaComponent {
  private readonly paro = inject(ParoService);

  readonly armado = this.paro.armado;

  rearmar(): void { this.paro.rearmar(); }
}
