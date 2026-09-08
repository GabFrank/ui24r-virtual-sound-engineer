import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ParoService } from './paro.service';

/**
 * El botón del paro de emergencia.
 *
 * Se usa en dos sitios: flotando en la esquina del contenedor, y **dentro de
 * cada diálogo modal**. Lo segundo no es redundancia: un `dialog` abierto con
 * `showModal()` se pinta en la capa superior del navegador, por encima de
 * cualquier `z-index`, y su velo intercepta los eventos de puntero. Con un
 * diálogo abierto, el botón flotante deja de existir para el usuario — se
 * comprobó midiendo: `elementFromPoint` sobre su centro devuelve el diálogo, y
 * un clic no llega nunca.
 *
 * INV-019 exige que el paro esté disponible en el cien por cien de las
 * pantallas **y diálogos**. Con la capa superior de por medio, la única forma
 * de cumplirlo es que el botón esté dentro del diálogo.
 */
@Component({
  selector: 'app-paro-boton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" [class.activo]="armado()"
            [attr.aria-label]="rotulo()"
            [attr.aria-disabled]="armado() ? 'true' : null"
            (click)="pulsar()">
      {{ texto() }}
    </button>
  `,
  styles: [`
    @use 'tokens' as *;

    :host { display: inline-flex; }

    button {
      width: var(--alto-paro); height: var(--alto-paro);
      border-radius: 50%;
      background: var(--danger); color: var(--sobre-danger);
      border: 3px solid var(--danger-borde);
      font-family: var(--mono); font-size: var(--txt-sm); font-weight: var(--peso-fuerte);
      letter-spacing: 0.08em; cursor: pointer;
      touch-action: manipulation;
    }
    button:active { transform: scale(0.96); }

    /* Armado. Antes era texto claro sobre gris —2,42:1, ilegible justo cuando
       importa— y encima seguía anunciándose como un botón que alterna, cuando
       rearmar es otra acción y está en otro sitio. */
    button.activo {
      background: var(--surface-3); color: var(--ink);
      border-color: var(--line-fuerte);
      cursor: default;
      font-size: var(--txt-xs);
    }

    /* --- Flotante: en la esquina del contenedor --- */
    :host(.flotante) {
      position: fixed; z-index: 1000;
      right: var(--sp-4); bottom: calc(var(--sp-4) + var(--seguro-abajo));
    }
    :host(.flotante) button { box-shadow: var(--sombra-flotante); }

    /* En teléfono la barra de navegación vive abajo: sin esto el paro queda
       encima de ella y tapa dos destinos. */
    @include hasta($bp-telefono) {
      :host(.flotante) {
        bottom: calc(var(--tap-comodo) + var(--sp-3) + var(--seguro-abajo));
      }
      :host(.flotante) button {
        width: var(--alto-paro-telefono); height: var(--alto-paro-telefono);
      }
    }

    /* --- En diálogo: más chico, en la cabecera, sin sombra --- */
    :host(.en-dialogo) button {
      width: var(--tap-min); height: var(--tap-min);
      font-size: var(--txt-xxs);
    }
  `],
})
export class ParoBotonComponent {
  private readonly paro = inject(ParoService);

  readonly armado = this.paro.armado;

  readonly texto = computed(() => (this.armado() ? 'ACTIVO' : 'PARO'));

  readonly rotulo = computed(() =>
    this.armado()
      ? 'Paro de emergencia activo. Las escrituras están bloqueadas.'
      : 'Paro de emergencia',
  );

  pulsar(): void { this.paro.activar(); }
}
