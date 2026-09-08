import { Component, inject, signal, computed, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { ConnectionStateService } from '../core/connection.state';
import { EmergencyStopComponent } from './emergency-stop.component';
import { TelemetryComponent } from '../telemetry/telemetry.component';
import { ChannelsComponent } from '../channels/channels.component';
import { GainComponent } from '../gain/gain.component';
import { UpdatesComponent } from '../updates/updates.component';
import { GaleriaComponent } from '../galeria/galeria.component';
import { ToastsComponent } from '../ui';

type Pestania = 'telemetria' | 'canales' | 'ganancia' | 'actualizacion' | 'galeria';

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
  imports: [
    EmergencyStopComponent, TelemetryComponent, ChannelsComponent, GainComponent,
    UpdatesComponent, GaleriaComponent, ToastsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="barra">
      <span class="marca">Virtual Sound Engineer</span>
      <span class="estado" [class]="claseEstado()">{{ textoEstado() }}</span>
    </header>

    <nav class="pestanias">
      @for (p of pestaniasVisibles(); track p.id) {
        <button type="button" [class.activa]="pestania() === p.id"
                [attr.data-pestania]="p.id"
                (click)="ir(p.id)">{{ p.etiqueta }}</button>
      }
    </nav>

    <main class="contenido">
      @switch (pestania()) {
        @case ('canales') { <app-channels /> }
        @case ('ganancia') { <app-gain /> }
        @case ('actualizacion') { <app-updates /> }
        @case ('galeria') { <app-galeria /> }
        @default { <app-telemetry /> }
      }
    </main>

    <app-emergency-stop />
    <ui-toasts />
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

  /**
   * La pestaña de actualización está siempre, incluso sin conexión con la
   * consola: el momento natural para actualizar es justamente antes de
   * conectarse, cuando todavía no hay nada en marcha.
   */
  private readonly pestanias: readonly {
    id: Pestania; etiqueta: string; exigeConexion: boolean; soloDesarrollo?: boolean;
  }[] = [
    { id: 'telemetria', etiqueta: 'Telemetría', exigeConexion: true },
    { id: 'canales', etiqueta: 'Canales', exigeConexion: true },
    { id: 'ganancia', etiqueta: 'Ganancia', exigeConexion: true },
    { id: 'actualizacion', etiqueta: 'Actualización', exigeConexion: false },
    { id: 'galeria', etiqueta: 'Diseño', exigeConexion: false, soloDesarrollo: true },
  ];

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  readonly pestaniasVisibles = computed(() =>
    this.pestanias.filter(
      (p) => (!p.exigeConexion || this.conectado()) && (!p.soloDesarrollo || this.desarrollo),
    ),
  );

  /**
   * La galería del sistema de diseño no viaja en la compilación de
   * publicación: es documentación para quien construye, no una pantalla del
   * producto.
   */
  private readonly desarrollo = isDevMode();

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
