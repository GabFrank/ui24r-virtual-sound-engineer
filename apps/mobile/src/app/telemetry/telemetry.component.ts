import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { MixerService } from '../core/mixer.service';
import { ConnectionStateService } from '../core/connection.state';
import { LevelMeterComponent } from './level-meter.component';

/**
 * Vista de telemetría por canal. Es la primera pantalla del primer entregable.
 *
 * Solo lectura: en esta versión la aplicación no escribe absolutamente nada en
 * la consola, y hay un test que lo verifica.
 */
@Component({
  selector: 'app-telemetry',
  standalone: true,
  imports: [LevelMeterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (masivo(); as ev) {
      <div class="alerta">
        <div>
          <strong>Cambio masivo detectado en la consola.</strong>
          {{ ev.rutasAfectadas }} parámetros cambiaron en menos de un segundo.
          Probablemente alguien recuperó una instantánea. El estado local ya no
          es confiable hasta releerlo.
        </div>
        <button type="button" (click)="descartarMasivo()">Entendido</button>
      </div>
    }

    @if (!conectado()) {
      <!-- Conectarse es una acción y configurar dónde conectarse es un ajuste.
           Tener el campo de la dirección también acá significaba dos sitios
           donde cambiarlo y ninguna garantía de que dijeran lo mismo. -->
      <section class="conectar">
        <h2>Sin conexión con la consola</h2>
        <p class="ayuda">
          La dirección de la consola y el botón de conectar están en Ajustes.
          Durante un show, la consola y la tablet van en un router dedicado: la
          red del lugar no se usa.
        </p>
        <a class="primario" href="#/ajustes">Ir a Ajustes</a>
        @if (error(); as e) { <p class="error">{{ e }}</p> }
      </section>
    } @else {
      <section class="cabecera">
        <div>
          <h2>Telemetría</h2>
          <p class="sub">
            {{ canales().length }} canales · solo lectura · esta versión no escribe
            nada en la consola
          </p>
        </div>
        <button type="button" (click)="reiniciarPicos()">Reiniciar picos</button>
      </section>

      <table>
        <thead>
          <tr>
            <th class="izq">Canal</th>
            <th class="ancho">Nivel</th>
            <th class="num">Actual</th>
            <th class="num">Pico</th>
            <th class="num">Margen</th>
            <th class="num">Ganancia</th>
            <th class="num">Fader</th>
            <th class="num">Clips</th>
          </tr>
        </thead>
        <tbody>
          @for (c of canales(); track c.indice) {
            <tr [class.silenciado]="c.silenciado">
              <td class="izq">
                <span class="idx">{{ c.indice }}</span>
                {{ c.nombre }}
                @if (c.silenciado) { <span class="mute">MUTE</span> }
              </td>
              <td>
                <app-level-meter [nivelDb]="c.nivelDb" [picoDb]="c.picoDb"
                                 [etiqueta]="'nivel de ' + c.nombre" />
              </td>
              <td class="num">{{ formatearDb(c.nivelDb) }}</td>
              <td class="num">{{ formatearDb(c.picoDb) }}</td>
              <td class="num" [class.escaso]="margenEscaso(c.picoDb)">
                {{ formatearMargen(c.picoDb) }}
              </td>
              <td class="num">{{ c.gainDb.toFixed(0) }}</td>
              <td class="num">{{ formatearDb(c.faderDb) }}</td>
              <td class="num" [class.hay]="c.eventosSaturacion > 0">
                {{ c.eventosSaturacion }}
              </td>
            </tr>
          }
        </tbody>
      </table>

      @if (externos().length > 0) {
        <section class="externos">
          <h3>Cambios hechos desde otro dispositivo</h3>
          <p class="sub">
            El protocolo no dice qué cliente los hizo: solo se puede distinguir
            un cambio propio de uno ajeno.
          </p>
          <ul>
            @for (e of externos(); track e.cuando) {
              <li><code>{{ e.parametro }}</code> pasó a {{ e.valor.toFixed(3) }}</li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: [`
    :host { display: block; }

    .alerta {
      display: flex; gap: 16px; align-items: flex-start; justify-content: space-between;
      background: #3a2a12; border: 1px solid var(--warn); border-radius: 3px;
      padding: 14px 16px; margin-bottom: 20px; color: #f0dcc0;
    }
    .alerta button {
      background: var(--warn); color: #241708; border: 0; border-radius: 3px;
      padding: 8px 16px; cursor: pointer; white-space: nowrap;
    }

    .conectar { max-width: 420px; display: flex; flex-direction: column; gap: 10px; }
    .conectar label { color: var(--muted); font-size: 13px; }
    .conectar input {
      background: var(--surface-2); border: 1px solid var(--line); color: var(--ink);
      border-radius: 3px; padding: 12px 14px; font-family: var(--mono); font-size: 15px;
    }
    .primario {
      background: var(--signal); color: #06181a; border: 0; border-radius: 3px;
      padding: 12px 20px; font-size: 15px; font-weight: 500; cursor: pointer;
    }
    .primario:disabled { opacity: .5; }
    .error { color: var(--danger); font-size: 14px; }
    .ayuda { color: var(--muted); font-size: 13px; }

    .cabecera {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; margin-bottom: 16px;
    }
    .cabecera button {
      background: var(--surface-2); color: var(--ink); border: 1px solid var(--line);
      border-radius: 3px; padding: 10px 16px; cursor: pointer; white-space: nowrap;
    }
    h2 { font-size: 20px; margin: 0 0 4px; font-weight: 500; }
    h3 { font-size: 15px; margin: 0 0 4px; font-weight: 500; }
    .sub { color: var(--muted); font-size: 13px; margin: 0; }

    table { font-size: 14px; }
    th.izq, td.izq { text-align: left; }
    th.ancho { width: 34%; }
    tr.silenciado { opacity: .45; }
    .idx {
      display: inline-block; min-width: 22px; color: var(--muted);
      font-family: var(--mono); font-size: 12px;
    }
    .mute {
      margin-left: 8px; font-size: 10px; letter-spacing: .1em;
      color: var(--danger); border: 1px solid var(--danger);
      padding: 1px 5px; border-radius: 2px;
    }
    td.num.escaso { color: var(--warn); }
    td.num.hay { color: var(--danger); font-weight: 600; }

    .externos { margin-top: 24px; }
    .externos ul { margin: 8px 0 0; padding-left: 18px; color: var(--ink-2); font-size: 14px; }
    .externos code { font-family: var(--mono); color: var(--signal); }
  `],
})
export class TelemetryComponent {
  private readonly mixer = inject(MixerService);
  private readonly conexion = inject(ConnectionStateService);

  readonly canales = this.mixer.canales;
  readonly externos = this.mixer.cambiosExternos;
  readonly masivo = this.mixer.cambioMasivo;
  readonly conectando = this.mixer.conectando;
  readonly error = this.mixer.ultimoError;

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  reiniciarPicos(): void {
    this.mixer.reiniciarPicos();
  }

  descartarMasivo(): void {
    this.mixer.descartarCambioMasivo();
  }

  /**
   * Se llaman desde la plantilla, pero son funciones puras sobre un argumento
   * y no leen señales: no arrastran estado ni disparan trabajo extra en cada
   * ciclo de detección de cambios.
   */
  formatearDb(db: number): string {
    if (!Number.isFinite(db) || db <= -80) return '−∞';
    return db.toFixed(1);
  }

  formatearMargen(picoDb: number): string {
    if (!Number.isFinite(picoDb) || picoDb <= -80) return '—';
    return (-picoDb).toFixed(1);
  }

  margenEscaso(picoDb: number): boolean {
    return Number.isFinite(picoDb) && picoDb > -6;
  }
}
