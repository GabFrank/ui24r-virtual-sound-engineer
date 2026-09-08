import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectionStateService } from '../core/connection.state';
import { SessionStateService } from '../core/session.state';
import { BadgeComponent, ToastsComponent } from '../ui';
import { EmergencyStopComponent } from './emergency-stop.component';
import { NavComponent } from './nav.component';

/**
 * Contenedor de la aplicación.
 *
 * Tres cosas viven acá y en ningún otro sitio: la barra de estado, la
 * navegación y el paro de emergencia.
 *
 * El paro está acá porque INV-019 exige que esté visible en el cien por cien
 * de las pantallas y diálogos. Montarlo en el contenedor es la única forma de
 * que no se pueda olvidar en una pantalla nueva; si dependiera de que cada
 * pantalla lo incluya, tarde o temprano alguna no lo haría, y sería
 * justamente la que hiciera falta.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavComponent, EmergencyStopComponent, ToastsComponent, BadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="barra">
      <span class="marca ancho">Virtual Sound Engineer</span>
      <span class="marca angosto">VSE</span>
      <div class="estados">
        @if (sesionActiva()) {
          <ui-badge tono="senal">Sesión en curso</ui-badge>
        }
        <ui-badge [tono]="tonoConexion()">{{ textoEstado() }}</ui-badge>
      </div>
    </header>

    <div class="cuerpo">
      <app-nav />
      <main class="contenido">
        <router-outlet />
      </main>
    </div>

    <app-emergency-stop />
    <ui-toasts />
  `,
  styles: [`
    @use 'tokens' as *;

    :host { display: flex; flex-direction: column; height: 100%; }

    .barra {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      padding-top: calc(var(--sp-3) + var(--seguro-arriba));
      border-bottom: 1px solid var(--line);
      background: var(--surface);
      flex: none;
    }
    .marca {
      font-weight: var(--peso-medio); letter-spacing: -0.01em;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .estados { display: flex; gap: var(--sp-2); flex: none; }
    .angosto { display: none; }

    .cuerpo { display: flex; flex: 1; min-height: 0; }
    .contenido { flex: 1; min-width: 0; overflow-y: auto; }

    @include hasta($bp-telefono) {
      .cuerpo { flex-direction: column; }
      /* La barra de navegación es fija abajo, así que el contenido reserva su
         alto por debajo; lo hace la utilidad .pagina, no acá. */
      /* El nombre completo se recortaba a «Virtual Sou…», que no es un nombre.
         Mejor la sigla entera que un nombre a medias. */
      .ancho { display: none; }
      .angosto { display: inline; font-weight: var(--peso-fuerte); letter-spacing: 0.04em; }
    }
    /* Teléfono en horizontal: la barra superior se come un tercio de la
       pantalla útil si no se compacta. */
    @include bajo {
      .barra { padding-block: var(--sp-2); }
    }
  `],
})
export class ShellComponent {
  private readonly conexion = inject(ConnectionStateService);
  private readonly sesion = inject(SessionStateService);

  readonly sesionActiva = this.sesion.sesionActiva;

  /**
   * Se calculan con `computed` y no con métodos: una función llamada desde la
   * plantilla se reevalúa en cada ciclo de detección de cambios, y esta barra
   * está siempre en pantalla.
   */
  readonly textoEstado = computed(() => {
    switch (this.conexion.estado()) {
      case 'CONNECTED': return 'Conectado';
      case 'UNSTABLE': return 'Inestable';
      case 'RECONNECTING': return 'Reconectando';
      case 'DISCONNECTED': return 'Sin conexión';
    }
  });

  readonly tonoConexion = computed(() => {
    switch (this.conexion.estado()) {
      case 'CONNECTED': return 'ok' as const;
      case 'UNSTABLE':
      case 'RECONNECTING': return 'aviso' as const;
      case 'DISCONNECTED': return 'neutro' as const;
    }
  });
}
