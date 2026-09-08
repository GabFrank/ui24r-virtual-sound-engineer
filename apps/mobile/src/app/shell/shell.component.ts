import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { ConnectionStateService } from '../core/connection.state';
import { EmergencyStopComponent } from './emergency-stop.component';
import { TelemetryComponent } from '../telemetry/telemetry.component';

/**
 * Contenedor de la aplicación.
 *
 * El paro de emergencia se monta acá y no dentro de cada pantalla, porque
 * INV-019 exige que esté visible en el cien por ciento de las pantallas y
 * diálogos. Montarlo en el contenedor es la forma de que no se pueda olvidar
 * en una pantalla nueva.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [EmergencyStopComponent, TelemetryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="barra">
      <span class="marca">Virtual Sound Engineer</span>
      <span class="estado" [class]="claseEstado()">{{ textoEstado() }}</span>
    </header>

    <main class="contenido">
      <app-telemetry />
    </main>

    <app-emergency-stop />
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }

    .barra {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px; border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .marca { font-weight: 500; letter-spacing: -0.01em; }

    .estado {
      font-family: var(--mono); font-size: 13px; letter-spacing: 0.06em;
      text-transform: uppercase; padding: 4px 10px; border-radius: 3px;
      border: 1px solid var(--line);
    }
    .estado.conectado { color: var(--ok); }
    .estado.inestable { color: var(--warn); }
    .estado.desconectado { color: var(--muted); }

    .contenido { flex: 1; padding: 24px 16px; overflow-y: auto; }

  `],
})
export class ShellComponent {
  private readonly conexion = inject(ConnectionStateService);

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

  readonly claseEstado = computed(() => {
    switch (this.conexion.estado()) {
      case 'CONNECTED': return 'conectado';
      case 'UNSTABLE':
      case 'RECONNECTING': return 'inestable';
      case 'DISCONNECTED': return 'desconectado';
    }
  });
}
