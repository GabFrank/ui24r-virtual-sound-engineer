import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ButtonComponent } from './button.component';
import { IconComponent, type NombreDeIcono } from './icon.component';
import { ToastService } from './toast.service';

@Component({
  selector: 'ui-toasts',
  standalone: true,
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  /* `role="status"` y no `alert`: los avisos informativos no deben interrumpir
     lo que el lector de pantalla esté diciendo. Los errores, que sí importan,
     no se muestran acá sino en la propia pantalla. */
  template: `
    <div class="zona" role="status" aria-live="polite">
      @for (a of avisos(); track a.id) {
        <div class="mensaje" [class]="a.tono">
          <!-- Un icono por tono. Antes el tono se distinguía únicamente por
               tres píxeles de borde de color: para quien no distingue ese
               tono, un error y una confirmación eran el mismo mensaje. -->
          <ui-icon [nombre]="a.icono" [tamanio]="18" />
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
      /* Se reserva el ancho del paro en todos los tamaños, no solo en
         teléfono: entre 600 y 696 px el aviso se centraba y su botón de
         descartar quedaba literalmente debajo del círculo del paro. El
         objetivo que el usuario quiere tocar y el que jamás debe tocarse por
         error compartían píxeles. */
      width: min(520px, calc(100% - var(--sp-6) - var(--alto-paro)));
      pointer-events: none;
    }
    /* La clase base se llama «mensaje» y no «aviso» a propósito: uno de los
       tonos se llama «aviso», y con ambos nombres iguales el selector
       .aviso.aviso coincidía con cualquier mensaje. El resultado era que todos
       salían en ámbar, incluidos los de éxito. Lo mostró una captura del
       recorrido del camino de usuario. */
    .mensaje {
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
    @media (prefers-reduced-motion: reduce) { .mensaje { animation: none; } }

    .mensaje ui-icon { flex: none; }
    .mensaje.ok    { border-left-color: var(--ok); color: var(--ok); }
    .mensaje.aviso { border-left-color: var(--warn); color: var(--warn); }
    .mensaje.error { border-left-color: var(--danger); color: var(--danger); }
    .mensaje.info  { border-left-color: var(--signal); color: var(--signal); }
    /* El texto vuelve al color normal: el tono lo llevan el icono y el borde. */
    .mensaje span { color: var(--ink); }

    /* En teléfono los avisos suben por encima de todo lo que ya flota abajo:
       la barra de navegación y el paro de emergencia. Sin esto se montaban
       sobre el paro, que es el control que nunca puede quedar tapado. */
    @include hasta($bp-telefono) {
      .zona {
        bottom: var(--zona-inferior-telefono);
        width: calc(100% - var(--sp-4));
      }
    }
  `],
})
export class ToastsComponent {
  private readonly servicio = inject(ToastService);
  private static readonly ICONOS: Readonly<Record<string, NombreDeIcono>> = {
    ok: 'chequeo', aviso: 'aviso', error: 'error', info: 'info',
  };

  readonly avisos = computed(() => this.servicio.avisos().map((a) => ({
    ...a,
    icono: ToastsComponent.ICONOS[a.tono] ?? 'info',
  })));

  descartar(id: number): void { this.servicio.descartar(id); }
}
