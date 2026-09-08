import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { ConnectionStateService } from '../core/connection.state';
import { EmergencyStopComponent } from './emergency-stop.component';
import { TelemetryComponent } from '../telemetry/telemetry.component';
import { ChannelsComponent } from '../channels/channels.component';
import { GainComponent } from '../gain/gain.component';

type Pestania = 'telemetria' | 'canales' | 'ganancia';

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
  imports: [EmergencyStopComponent, TelemetryComponent, ChannelsComponent, GainComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="barra">
      <span class="marca">Virtual Sound Engineer</span>
      <span class="estado" [class]="claseEstado()">{{ textoEstado() }}</span>
    </header>

    @if (conectado()) {
      <nav class="pestanias">
        @for (p of pestanias; track p.id) {
          <button type="button" [class.activa]="pestania() === p.id"
                  (click)="ir(p.id)">{{ p.etiqueta }}</button>
        }
      </nav>
    }

    <main class="contenido">
      @switch (pestania()) {
        @case ('canales') { <app-channels /> }
        @case ('ganancia') { <app-gain /> }
        @default { <app-telemetry /> }
      }
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

    .pestanias {
      display: flex; gap: 2px; padding: 0 16px; background: var(--surface);
      border-bottom: 1px solid var(--line);
    }
    .pestanias button {
      background: transparent; border: 0; color: var(--muted);
      padding: 12px 18px; cursor: pointer; font-size: 15px;
      border-bottom: 2px solid transparent;
    }
    .pestanias button.activa { color: var(--ink); border-bottom-color: var(--signal); }

    .contenido { flex: 1; padding: 24px 16px; overflow-y: auto; }

  `],
})
export class ShellComponent {
  private readonly conexion = inject(ConnectionStateService);

  readonly pestania = signal<Pestania>('telemetria');
  readonly pestanias: readonly { id: Pestania; etiqueta: string }[] = [
    { id: 'telemetria', etiqueta: 'Telemetría' },
    { id: 'canales', etiqueta: 'Canales' },
    { id: 'ganancia', etiqueta: 'Ganancia' },
  ];

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  ir(p: Pestania): void { this.pestania.set(p); }

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
