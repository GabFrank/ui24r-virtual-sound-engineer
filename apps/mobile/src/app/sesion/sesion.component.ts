import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { BandProfile, SessionState, VenueProfile } from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import { SesionService } from '../core/sesion.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent,
  FieldComponent, PageHeaderComponent, StatComponent, ToastService,
} from '../ui';
import { ESTADOS, ESTADOS_EN_VIVO } from './estados';

/**
 * La sesión: pantalla de inicio de la aplicación.
 *
 * Cuando no hay ninguna abierta, es el sitio donde se empieza. Cuando hay una,
 * es el tablero: en qué estado está, qué se puede hacer ahora y cómo llegar a
 * cada cosa.
 *
 * El avance de estado se ofrece como botones y no como una lista desplegable
 * porque desde cualquier estado hay dos o tres destinos posibles, no doce, y
 * porque el orden importa: el primero es el que sigue naturalmente.
 */
@Component({
  selector: 'app-sesion',
  standalone: true,
  imports: [
    FormsModule, RouterLink, BadgeComponent, ButtonComponent, CardComponent,
    DialogComponent, EmptyStateComponent, FieldComponent, PageHeaderComponent,
    StatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      @if (enCurso(); as c) {
        <ui-page-header [titulo]="c.local?.nombre ?? 'Sesión'"
                        [descripcion]="descripcionDelEstado()">
          <ui-button variante="secundario" icono="cerrar"
                     (pulsado)="confirmarCierre.set(true)">Cerrar sesión</ui-button>
        </ui-page-header>

        <div class="pila-lg">
          <ui-card>
            <div class="resumen">
              <ui-stat rotulo="Estado" [valor]="etiquetaDelEstado()"
                       [tono]="enVivo() ? 'aviso' : 'senal'" />
              <ui-stat rotulo="Banda" [valor]="c.banda?.nombre ?? '—'" />
              <ui-stat rotulo="Canales" [valor]="c.banda?.asignaciones?.length ?? 0" />
              <ui-stat rotulo="Empezó" [valor]="horaDeInicio()" />
            </div>
          </ui-card>

          <ui-card titulo="Qué sigue">
            @if (siguientes().length === 0) {
              <p class="nota">No hay adónde avanzar desde acá.</p>
            } @else {
              <div class="racimo">
                @for (s of siguientes(); track s.estado; let i = $index) {
                  <ui-button [variante]="i === 0 ? 'primario' : 'secundario'"
                             [attr.data-estado]="s.estado"
                             (pulsado)="avanzar(s.estado)">{{ s.etiqueta }}</ui-button>
                }
              </div>
            }
            @if (motivoRechazo(); as m) {
              <p class="rechazo">{{ m }}</p>
            }
          </ui-card>

          <div class="rejilla">
            <a class="atajo" routerLink="/sesion/canales">
              <ui-card titulo="Canales" subtitulo="Qué entrada es qué instrumento">
                <p class="dato">{{ c.banda?.asignaciones?.length ?? 0 }} asignados</p>
              </ui-card>
            </a>
            <a class="atajo" routerLink="/sesion/ganancia">
              <ui-card titulo="Ganancia" subtitulo="Cuánto margen tiene cada canal">
                @if (permiteGanancia()) {
                  <ui-badge tono="ok">Se puede ajustar</ui-badge>
                } @else {
                  <ui-badge tono="neutro">Congelada en este estado</ui-badge>
                }
              </ui-card>
            </a>
            <a class="atajo" routerLink="/consola">
              <ui-card titulo="Consola" subtitulo="Medidores en vivo">
                <p class="dato">Solo lectura</p>
              </ui-card>
            </a>
          </div>
        </div>

      } @else {
        <ui-page-header titulo="Sesión"
          descripcion="Una sesión agrupa todo lo que pasa en un lugar y una fecha: qué se midió, qué se propuso y qué se aplicó." />

        @if (bandas().length === 0 || locales().length === 0) {
          <ui-empty icono="banda" titulo="Falta configurar los perfiles"
            [detalle]="queFalta()">
            <ui-button variante="primario" icono="adelante" (pulsado)="irAPerfiles()">
              Ir a Perfiles
            </ui-button>
          </ui-empty>
        } @else {
          <ui-empty icono="sesion" titulo="No hay ninguna sesión abierta"
            detalle="Elegí con qué banda y en qué local para empezar.">
            <ui-button variante="primario" icono="mas" (pulsado)="abrirInicio()">
              Empezar una sesión
            </ui-button>
          </ui-empty>
        }
      }
    </div>

    <ui-dialog titulo="Empezar una sesión" [abierto]="inicioAbierto()"
               (cerrado)="inicioAbierto.set(false)">
      <div class="pila">
        <ui-field rotulo="Banda" idControl="ses-banda">
          <select id="ses-banda" [(ngModel)]="bandaId">
            @for (b of bandas(); track b.id) { <option [value]="b.id">{{ b.nombre }}</option> }
          </select>
        </ui-field>
        <ui-field rotulo="Local" idControl="ses-local">
          <select id="ses-local" [(ngModel)]="localId">
            @for (l of locales(); track l.id) { <option [value]="l.id">{{ l.nombre }}</option> }
          </select>
        </ui-field>
      </div>
      <div pie>
        <ui-button variante="sutil" (pulsado)="inicioAbierto.set(false)">Cancelar</ui-button>
        <ui-button variante="primario" (pulsado)="empezar()">Empezar</ui-button>
      </div>
    </ui-dialog>

    <ui-dialog titulo="Cerrar la sesión" [abierto]="confirmarCierre()"
               [cerrableAlTocarFuera]="false" (cerrado)="confirmarCierre.set(false)">
      <p class="lectura">
        Una sesión cerrada no se puede reabrir. Queda entera en el historial,
        con lo que se midió y lo que se aplicó.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="confirmarCierre.set(false)">Seguir trabajando</ui-button>
        <ui-button variante="peligro" (pulsado)="cerrar()">Cerrar sesión</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    @use 'tokens' as *;
    .resumen { display: grid; gap: var(--sp-4); grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    a.atajo { text-decoration: none; color: inherit; display: block; }
    .dato { color: var(--muted); font-size: var(--txt-sm); }
    .nota { color: var(--muted); }
    .rechazo { margin-top: var(--sp-3); color: var(--warn); font-size: var(--txt-sm); line-height: var(--alto-linea); }
  `],
})
export class SesionComponent {
  private readonly servicio = inject(SesionService);
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly enCurso = this.servicio.actual;

  /**
   * Los destinos ya traen su etiqueta. Traducirlos con un método llamado desde
   * la plantilla los volvería a traducir en cada ciclo de detección.
   */
  readonly siguientes = computed(() =>
    this.servicio.siguientes().map((estado) => ({ estado, etiqueta: ESTADOS[estado].etiqueta })),
  );

  readonly bandas = signal<readonly BandProfile[]>([]);
  readonly locales = signal<readonly VenueProfile[]>([]);
  readonly bandaId = signal('');
  readonly localId = signal('');
  readonly inicioAbierto = signal(false);
  readonly confirmarCierre = signal(false);
  readonly motivoRechazo = signal<string | null>(null);

  readonly etiquetaDelEstado = computed(() => {
    const s = this.enCurso()?.sesion.state;
    return s === undefined ? '—' : ESTADOS[s].etiqueta;
  });

  readonly descripcionDelEstado = computed(() => {
    const s = this.enCurso()?.sesion.state;
    return s === undefined ? null : ESTADOS[s].hace;
  });

  readonly enVivo = computed(() => {
    const s = this.enCurso()?.sesion.state;
    return s !== undefined && ESTADOS_EN_VIVO.includes(s);
  });

  /** INV-006: la ganancia solo se toca en configuración de canales. */
  readonly permiteGanancia = computed(() => this.enCurso()?.sesion.state === 'CHANNEL_SETUP');

  readonly horaDeInicio = computed(() => {
    const t = this.enCurso()?.sesion.iniciadaEl;
    if (t === undefined) return '—';
    return new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  });

  readonly queFalta = computed(() => {
    const sinBanda = this.bandas().length === 0;
    const sinLocal = this.locales().length === 0;
    if (sinBanda && sinLocal) return 'Hace falta al menos una banda y un local. Sin saber quién toca ni dónde, no hay con qué comparar lo que se mida.';
    if (sinBanda) return 'Hace falta al menos una banda.';
    return 'Hace falta al menos un local.';
  });

  constructor() {
    effect(() => {
      this.repos.revision();
      void this.recargar();
    });
    void this.servicio.recuperar();
  }

  private async recargar(): Promise<void> {
    const [bandas, locales] = await Promise.all([this.repos.bandas(), this.repos.locales()]);
    this.bandas.set(bandas);
    this.locales.set(locales);
    if (this.bandaId() === '' && bandas[0]) this.bandaId.set(bandas[0].id);
    if (this.localId() === '' && locales[0]) this.localId.set(locales[0].id);
  }

  irAPerfiles(): void { void this.router.navigate(['/perfiles']); }

  abrirInicio(): void { this.inicioAbierto.set(true); }

  async empezar(): Promise<void> {
    try {
      await this.servicio.iniciar(
        this.bandaId() as BandProfile['id'],
        this.localId() as VenueProfile['id'],
      );
      this.inicioAbierto.set(false);
      this.avisos.ok('Sesión abierta.');
    } catch (e) {
      this.avisos.error(e instanceof Error ? e.message : 'No se pudo abrir la sesión.');
    }
  }

  async avanzar(s: SessionState): Promise<void> {
    const motivo = await this.servicio.transicionar(s);
    this.motivoRechazo.set(motivo);
  }

  async cerrar(): Promise<void> {
    await this.servicio.transicionar('CLOSED');
    this.confirmarCierre.set(false);
    this.avisos.ok('Sesión cerrada. Queda en el historial.');
  }
}
