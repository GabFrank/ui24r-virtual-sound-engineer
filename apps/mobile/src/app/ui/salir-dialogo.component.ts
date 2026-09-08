import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonComponent } from './button.component';
import { DialogComponent } from './dialog.component';

/**
 * El diálogo de «tenés cambios sin guardar».
 *
 * Uno solo para las tres pantallas de edición: el texto es el mismo y la
 * decisión también. No se puede cerrar tocando fuera, porque cerrarlo por
 * descuido tendría que significar una de las dos respuestas y ninguna es
 * obvia.
 */
@Component({
  selector: 'ui-salir-sin-guardar',
  standalone: true,
  imports: [ButtonComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-dialog titulo="Hay cambios sin guardar" [abierto]="abierto()"
               [cerrableAlTocarFuera]="false" (cerrado)="respuesta.emit(false)">
      <p class="lectura">
        {{ que() }} no se guarda hasta tocar «Guardar». Si salís ahora, se
        pierde lo que cambiaste.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="respuesta.emit(false)">Seguir editando</ui-button>
        <ui-button variante="peligro" (pulsado)="respuesta.emit(true)">Salir sin guardar</ui-button>
      </div>
    </ui-dialog>
  `,
})
export class SalirSinGuardarComponent {
  /** Qué se está editando, para que el aviso no sea genérico. */
  readonly que = input('Lo que escribiste');
  readonly abierto = input.required<boolean>();
  readonly respuesta = output<boolean>();
}
