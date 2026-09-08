import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { BandProfile, SessionId, SoundSession, VenueProfile } from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  BadgeComponent, ButtonComponent, CardComponent, DialogComponent,
  EmptyStateComponent, PageHeaderComponent, StatComponent, ToastService,
} from '../ui';
import { ESTADOS } from '../sesion/estados';

/**
 * Detalle de una sesión del historial.
 *
 * Solo lectura. Una sesión cerrada no se edita: si se pudiera, el historial
 * dejaría de ser un registro de lo que pasó y pasaría a ser una opinión sobre
 * lo que pasó.
 */
@Component({
  selector: 'app-sesion-detalle',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, CardComponent, DialogComponent,
    EmptyStateComponent, PageHeaderComponent, StatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header [titulo]="titulo()" [descripcion]="subtitulo()">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (sesion() === null) {
        <ui-empty icono="error" titulo="Esa sesión ya no está" />
      } @else {
        <div class="pila-lg">
          <ui-card>
            <div class="resumen">
              <ui-stat rotulo="Estado" [valor]="estado()" />
              <ui-stat rotulo="Banda" [valor]="nombreBanda()" />
              <ui-stat rotulo="Duración" [valor]="duracion()" />
              <ui-stat rotulo="Puntaje de sala" [valor]="sesion()!.roomScore ?? '—'"
                       [tono]="sesion()!.roomScore === null ? 'neutro' : 'senal'" />
              <ui-stat rotulo="Puntaje de mezcla" [valor]="sesion()!.mixScore ?? '—'"
                       [tono]="sesion()!.mixScore === null ? 'neutro' : 'senal'" />
            </div>
          </ui-card>

          <ui-card titulo="Qué quedó registrado">
            <ul class="conteos">
              <li><span>Mediciones</span> <b class="num">{{ sesion()!.measurementIds.length }}</b></li>
              <li><span>Recomendaciones</span> <b class="num">{{ sesion()!.recommendationIds.length }}</b></li>
              <li><span>Transacciones aplicadas</span> <b class="num">{{ sesion()!.transactionIds.length }}</b></li>
              <li><span>Tomas de prueba</span> <b class="num">{{ sesion()!.takeIds.length }}</b></li>
            </ul>
            @if (vacia()) {
              <p class="nota">
                Esta sesión no registró mediciones. Es lo esperable mientras el
                equipo de medición no esté disponible: hasta entonces la
                aplicación observa y propone, pero no mide.
              </p>
            }
          </ui-card>

          <div class="racimo racimo-entre">
            <ui-button variante="peligro" icono="borrar"
                       (pulsado)="confirmarBorrado.set(true)">Borrar del historial</ui-button>
            <ui-button variante="secundario" icono="descargar"
                       (pulsado)="exportar()">Exportar</ui-button>
          </div>
        </div>
      }
    </div>

    <ui-dialog titulo="Borrar la sesión" [abierto]="confirmarBorrado()"
               [cerrableAlTocarFuera]="false" (cerrado)="confirmarBorrado.set(false)">
      <p class="lectura">
        Se borra el registro de lo que pasó esa noche, incluidas sus mediciones.
        Si el local usaba su puntaje para comparar con noches anteriores, esa
        comparación pierde un punto de referencia.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="confirmarBorrado.set(false)">Cancelar</ui-button>
        <ui-button variante="peligro" icono="borrar" (pulsado)="borrar()">Borrar</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    .resumen { display: grid; gap: var(--sp-4); grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
    .conteos { list-style: none; margin: 0; padding: 0; }
    .conteos li {
      display: flex; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-2) 0; border-bottom: 1px solid var(--line);
      color: var(--ink-2);
    }
    .conteos li:last-child { border-bottom: 0; }
    .nota { margin-top: var(--sp-3); color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
  `],
})
export class SesionDetalleComponent {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly id = input.required<string>();

  readonly sesion = signal<SoundSession | null>(null);
  readonly banda = signal<BandProfile | null>(null);
  readonly local = signal<VenueProfile | null>(null);
  readonly confirmarBorrado = signal(false);

  readonly titulo = computed(() => this.local()?.nombre ?? 'Sesión');
  readonly nombreBanda = computed(() => this.banda()?.nombre ?? 'Banda borrada');
  readonly estado = computed(() => {
    const s = this.sesion();
    return s === null ? '—' : ESTADOS[s.state].etiqueta;
  });

  readonly subtitulo = computed(() => {
    const s = this.sesion();
    if (s === null) return null;
    return new Date(s.iniciadaEl).toLocaleString('es', {
      dateStyle: 'full', timeStyle: 'short',
    });
  });

  readonly duracion = computed(() => {
    const s = this.sesion();
    if (s === null) return '—';
    const fin = s.cerradaEl === null ? Date.now() : new Date(s.cerradaEl).getTime();
    const minutos = Math.max(0, Math.round((fin - new Date(s.iniciadaEl).getTime()) / 60_000));
    if (minutos < 60) return `${minutos} min`;
    return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')}`;
  });

  readonly vacia = computed(() => (this.sesion()?.measurementIds.length ?? 0) === 0);

  constructor() {
    effect(() => {
      const id = this.id();
      void this.cargar(id as SessionId);
    });
  }

  private async cargar(id: SessionId): Promise<void> {
    const s = await this.repos.sesion(id);
    this.sesion.set(s);
    if (s === null) return;
    const [banda, local] = await Promise.all([
      this.repos.banda(s.bandProfileId), this.repos.local(s.venueProfileId),
    ]);
    this.banda.set(banda);
    this.local.set(local);
  }

  async exportar(): Promise<void> {
    const s = this.sesion();
    if (s === null) return;
    // Se copia al portapapeles en vez de descargar un fichero: dentro de la
    // aplicación empaquetada no hay carpeta de descargas a la que el usuario
    // pueda llegar sin salir a un explorador de ficheros.
    const texto = JSON.stringify({ sesion: s, banda: this.banda(), local: this.local() }, null, 2);
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.ok('Sesión copiada al portapapeles.');
    } catch {
      this.avisos.error('No se pudo copiar. El sistema no dio permiso al portapapeles.');
    }
  }

  async borrar(): Promise<void> {
    const s = this.sesion();
    if (s === null) return;
    await this.repos.borrarSesion(s.id);
    this.confirmarBorrado.set(false);
    this.avisos.ok('Sesión borrada.');
    await this.volver();
  }

  volver(): Promise<boolean> { return this.router.navigate(['/historial']); }
}
