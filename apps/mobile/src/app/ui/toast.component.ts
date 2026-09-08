import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ButtonComponent } from './button.component';
import { ToastService } from './toast.service';

@Component({
  selector: 'ui-toasts',
  standalone: true,
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* `role="status"` y no `alert`: los avisos informativos no deben interrumpir
     lo que el lector de pantalla esté diciendo. Los errores, que sí importan,
     no se muestran acá sino en la propia pantalla. */
  template: `
    <div class="zona" role="status" aria-live="polite">
      @for (a of avisos(); track a.id) {
        <div class="aviso" [class]="a.tono">
          <span>{{ a.texto }}</span>
          <ui-button class="solo-icono" variante="sutil" icono="cerrar"
                     rotuloAccesible="Descartar" (pulsado)="descartar(a.id)">Descartar</ui-button>
        </div>
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    .zona {
      position: fixed; z-index: 60;
      left: 50%; transform: translateX(-50%);
      bottom: calc(var(--sp-5) + var(--seguro-abajo));
      display: flex; flex-direction: column; gap: var(--sp-2);
      width: min(520px, calc(100% - var(--sp-6)));
      pointer-events: none;
    }
    .aviso {
      pointer-events: auto;
      display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
      background: var(--surface-3);
      border: 1px solid var(--line-fuerte);
      border-left-width: 3px;
      border-radius: var(--radio-md);
      box-shadow: var(--sombra-flotante);
      font-size: var(--txt-sm);
      animation: entra var(--mov-medio) var(--curva);
    }
    @keyframes entra { from { opacity: 0; transform: translateY(8px); } }
    @media (prefers-reduced-motion: reduce) { .aviso { animation: none; } }

    .aviso.ok    { border-left-color: var(--ok); }
    .aviso.aviso { border-left-color: var(--warn); }
    .aviso.error { border-left-color: var(--danger); }
    .aviso.info  { border-left-color: var(--signal); }

    /* En teléfono los avisos suben por encima de la barra de navegación
       inferior; si no, tapan justo los botones de navegación. */
    @include hasta($bp-telefono) {
      .zona { bottom: calc(var(--tap-comodo) + var(--sp-4) + var(--seguro-abajo)); }
    }
  `],
})
export class ToastsComponent {
  private readonly servicio = inject(ToastService);
  readonly avisos = this.servicio.avisos;

  descartar(id: number): void { this.servicio.descartar(id); }
}
