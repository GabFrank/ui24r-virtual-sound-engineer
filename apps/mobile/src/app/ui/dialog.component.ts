import {
  ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild,
} from '@angular/core';

let contadorDeDialogos = 0;
import { ParoBotonComponent } from '../paro/paro-boton.component';
import { ButtonComponent } from './button.component';

/**
 * Diálogo modal.
 *
 * Usa el elemento `dialog` nativo, no un `div` con posición fija. La diferencia
 * importa: el navegador se encarga del atrapado del foco, de la capa superior y
 * de la tecla de escape. Reimplementar eso a mano es de donde salen los
 * diálogos que se pueden dejar atrás con el tabulador.
 *
 * En teléfono se ancla abajo y ocupa el ancho completo: es donde llega el
 * pulgar. En tablet queda centrado.
 */
@Component({
  selector: 'ui-dialog',
  standalone: true,
  imports: [ButtonComponent, ParoBotonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg [attr.aria-labelledby]="idTitulo"
            (close)="cerrado.emit()" (cancel)="alIntentarCancelar($event)"
            (click)="alClicEnFondo($event)">
      <div class="caja" (click)="$event.stopPropagation()">
        <header>
          <h2 [id]="idTitulo">{{ titulo() }}</h2>
          <div class="acciones">
            <!-- INV-019: el paro tiene que estar disponible también en los
                 diálogos. Un «dialog» abierto con showModal() se pinta en la
                 capa superior del navegador y su velo intercepta los eventos,
                 así que el botón flotante del contenedor no se puede tocar. La
                 única forma de cumplir la invariante es que esté acá dentro. -->
            <app-paro-boton class="en-dialogo" />
            <ui-button class="solo-icono" variante="sutil" icono="cerrar"
                       rotuloAccesible="Cerrar" (pulsado)="cerrar()">Cerrar</ui-button>
          </div>
        </header>

        <div class="cuerpo"><ng-content /></div>

        <footer><ng-content select="[pie]" /></footer>
      </div>
    </dialog>
  `,
  styles: [`
    @use 'tokens' as *;

    dialog {
      padding: 0; border: 0; background: transparent;
      max-width: none; max-height: none;
      width: 100%; height: 100%;
      color: var(--ink);
    }
    dialog::backdrop { background: var(--velo-modal); }

    /* El «dialog» a pantalla completa es solo el lienzo: la caja de verdad se
       centra dentro. Así el clic en el fondo se detecta sin un elemento extra. */
    dialog { display: none; }
    dialog[open] { display: flex; align-items: center; justify-content: center; }

    .caja {
      display: flex; flex-direction: column;
      width: min(560px, 100%);
      max-height: min(80dvh, 100%);
      background: var(--surface);
      border: 1px solid var(--line-fuerte);
      border-radius: var(--radio-lg);
      box-shadow: var(--sombra-modal);
    }

    @include hasta($bp-telefono) {
      dialog[open] { align-items: flex-end; }
      .caja {
        width: 100%;
        max-height: 88dvh;
        border-radius: var(--radio-lg) var(--radio-lg) 0 0;
        border-bottom: 0;
        padding-bottom: var(--seguro-abajo);
      }
    }

    header {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--sp-3);
      padding: var(--sp-4);
      border-bottom: 1px solid var(--line);
    }
    h2 { font-size: var(--txt-lg); font-weight: var(--peso-medio); }
    header .acciones { display: flex; align-items: center; gap: var(--sp-2); flex: none; }

    .cuerpo { padding: var(--sp-4); overflow-y: auto; }

    footer { display: flex; justify-content: flex-end; gap: var(--sp-2); padding: var(--sp-4); }
    footer:has(> :empty), footer:empty { display: none; }

    @include hasta($bp-telefono) {
      /* En teléfono los botones del pie ocupan el ancho y se apilan: apuntar a
         un botón chico en la esquina con una sola mano falla más de lo que
         parece.

         Dos detalles que estaban mal. Uno: estirar «ui-button» no estira el
         «button» de dentro, así que los botones seguían midiendo cien píxeles.
         Dos: «column-reverse» dejaba la acción destructiva abajo, que es la
         zona de mayor acierto del pulgar, y la salida segura arriba. Ahora el
         orden se mantiene: primero cancelar, después la acción. */
      footer { flex-direction: column; }
      footer ::ng-deep ui-button,
      footer ::ng-deep ui-button button { width: 100%; }
    }
  `],
})
export class DialogComponent {
  readonly titulo = input.required<string>();
  readonly abierto = input(false);
  /** Cerrar tocando fuera. Se apaga en los diálogos que exigen una decisión. */
  readonly cerrableAlTocarFuera = input(true);

  readonly cerrado = output<void>();

  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  /** Enlaza el título con el diálogo: sin esto el lector de pantalla anuncia
   *  «diálogo» a secas, y algunos de estos borran datos sin vuelta atrás. */
  protected readonly idTitulo = `dlg-${++contadorDeDialogos}`;

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.abierto() && !el.open) el.showModal();
      else if (!this.abierto() && el.open) el.close();
    });
  }

  cerrar(): void {
    this.dlg().nativeElement.close();
  }

  protected alClicEnFondo(_: MouseEvent): void {
    if (this.cerrableAlTocarFuera()) this.cerrar();
  }

  /**
   * La tecla de escape cierra un «dialog» nativo salvo que se cancele el
   * evento. Sin esto, los diálogos que exigen una decisión —borrar una banda,
   * cerrar la sesión— se descartaban con una tecla, que es justo lo que
   * `cerrableAlTocarFuera = false` quería impedir.
   */
  protected alIntentarCancelar(e: Event): void {
    if (!this.cerrableAlTocarFuera()) e.preventDefault();
  }
}
