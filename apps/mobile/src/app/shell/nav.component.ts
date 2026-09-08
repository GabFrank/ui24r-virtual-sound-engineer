import { ChangeDetectionStrategy, Component, computed, inject, isDevMode } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ConnectionStateService } from '../core/connection.state';
import { IconComponent, type NombreDeIcono } from '../ui';

interface Destino {
  readonly ruta: string;
  readonly etiqueta: string;
  readonly icono: NombreDeIcono;
  readonly soloDesarrollo?: boolean;
}

/**
 * Navegación principal.
 *
 * Cinco destinos y no más. Es el límite práctico de una barra inferior en
 * teléfono, y es también el límite de lo que alguien recuerda mientras hace
 * otra cosa.
 *
 * Cambia de forma, no de contenido: en teléfono es una barra inferior, al
 * alcance del pulgar; en tablet es una columna lateral, donde no compite con
 * el contenido y deja el ancho para las tablas.
 *
 * Ningún destino se oculta por falta de conexión. Ocultar la consola cuando no
 * hay conexión dejaba al usuario sin sitio donde enterarse de por qué no la
 * hay; ahora el destino sigue ahí y la pantalla explica el estado.
 */
@Component({
  selector: 'app-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="'Navegación principal'">
      @for (d of destinos(); track d.ruta) {
        <a [routerLink]="d.ruta" routerLinkActive="activo"
           [routerLinkActiveOptions]="{ exact: false }"
           [attr.data-destino]="d.ruta">
          <span class="marca">
            <ui-icon [nombre]="d.icono" [tamanio]="22" />
            @if (d.ruta === 'consola' && !conectado()) { <i class="punto" aria-hidden="true"></i> }
          </span>
          <span class="etiqueta">{{ d.etiqueta }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    @use 'tokens' as *;

    nav { display: flex; }

    a {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      color: var(--muted);
      text-decoration: none;
      border-radius: var(--radio-md);
      min-height: var(--tap-min);
      transition: color var(--mov-rapido) var(--curva),
                  background var(--mov-rapido) var(--curva);
    }
    a.activo { color: var(--ink); background: var(--surface-2); }
    a:active { background: var(--surface-3); }

    .marca { position: relative; display: inline-flex; }
    /* Un punto, no un color distinto: el estado de conexión ya se dice con
       texto en la barra superior, y esto es solo un recordatorio periférico. */
    .punto {
      position: absolute; top: -2px; right: -2px;
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--warn);
      border: 2px solid var(--surface);
    }

    /* --- Tablet: columna lateral --- */
    @include desde($bp-telefono) {
      :host {
        display: block;
        border-right: 1px solid var(--line);
        background: var(--surface);
        padding: var(--sp-3);
        width: 208px; flex: none;
      }
      nav { flex-direction: column; gap: var(--sp-1); }
    }

    /* Tablet angosta y teléfono en horizontal: solo iconos, para no comerse
       el ancho que necesitan las tablas. */
    @media (min-width: 600px) and (max-width: 899px) {
      :host { width: auto; }
      a { justify-content: center; padding: var(--sp-3); }
      .etiqueta { display: none; }
    }

    /* --- Teléfono: barra inferior --- */
    @include hasta($bp-telefono) {
      :host {
        position: fixed; z-index: 40;
        left: 0; right: 0; bottom: 0;
        background: var(--surface);
        border-top: 1px solid var(--line);
        padding-bottom: var(--seguro-abajo);
      }
      nav { justify-content: space-around; }
      a {
        flex-direction: column; gap: 2px;
        padding: var(--sp-2) var(--sp-1);
        flex: 1; min-width: 0;
      }
      a.activo { background: transparent; color: var(--signal); }
      .etiqueta {
        font-size: 11px; overflow: hidden; text-overflow: ellipsis;
        white-space: nowrap; max-width: 100%;
      }
    }
  `],
})
export class NavComponent {
  private readonly conexion = inject(ConnectionStateService);

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  private readonly todos: readonly Destino[] = [
    { ruta: 'sesion', etiqueta: 'Sesión', icono: 'sesion' },
    { ruta: 'consola', etiqueta: 'Consola', icono: 'medidor' },
    { ruta: 'perfiles', etiqueta: 'Perfiles', icono: 'banda' },
    { ruta: 'historial', etiqueta: 'Historial', icono: 'historial' },
    { ruta: 'ajustes', etiqueta: 'Ajustes', icono: 'ajustes' },
    { ruta: 'diseno', etiqueta: 'Diseño', icono: 'canales', soloDesarrollo: true },
  ];

  private readonly desarrollo = isDevMode();

  readonly destinos = computed(() =>
    this.todos.filter((d) => !d.soloDesarrollo || this.desarrollo),
  );
}
