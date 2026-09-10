import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject } from '@angular/core';
import { frecuenciaDeBanda } from '@vse/mixer-adapter';
import { PageHeaderComponent, ButtonComponent, BadgeComponent, EmptyStateComponent } from '../ui';
import { AnalizadorService, FUENTE_GENERAL } from './analizador.service';

/**
 * El espectro del general, y el aviso de realimentación.
 *
 * **Pide permiso antes de tocar nada.** El analizador de la consola es uno
 * solo: cuando esta pantalla lo toma, el operador ve cambiar su propio RTA. Por
 * eso lo primero que se ve no es el espectro sino la pregunta (ADR-025).
 *
 * **Se mira el general, no un canal**, porque la realimentación es un lazo del
 * sistema y aparece ahí venga del canal que venga.
 */
@Component({
  selector: 'app-espectro',
  standalone: true,
  imports: [PageHeaderComponent, ButtonComponent, BadgeComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ui-page-header titulo="Espectro"
      descripcion="Qué frecuencias están sonando en el general, y aviso si alguna se queda colgada." />

    @if (analizador.permiso() === 'SIN_PEDIR') {
      <div class="permiso">
        <h2>Necesito el analizador</h2>
        <p>
          La consola tiene un solo analizador de espectro. Para medir tengo que
          apuntarlo al general, así que vas a ver cambiar el RTA en tu pantalla
          mientras esta vista esté abierta.
        </p>
        @if (analizador.fuenteDelOperador(); as f) {
          <p class="detalle">Ahora está en <strong>{{ f || 'ninguna fuente' }}</strong>, y lo dejo ahí cuando salga.</p>
        }
        <div class="botones">
          <ui-button variante="secundario" (pulsado)="analizador.rechazar()">No ahora</ui-button>
          <ui-button variante="primario" (pulsado)="empezar()">Dale</ui-button>
        </div>
      </div>
    } @else if (analizador.permiso() === 'RECHAZADO') {
      <ui-empty icono="canales" titulo="El analizador quedó como estaba"
        detalle="Sin él no puedo ver el espectro ni avisarte de una realimentación. Podés cambiar de idea cuando quieras." />
      <ui-button variante="secundario" (pulsado)="volverAPreguntar()">Prestármelo ahora</ui-button>
    } @else {
      @if (avisos().length > 0) {
        <div class="alarma">
          <h2>Algo se está quedando colgado</h2>
          @for (a of avisos(); track a.banda) {
            <p class="banda"><strong>{{ a.hz }}</strong> — sostenida {{ a.segundos }} s</p>
          }
          @if (analizador.sospechosos().length > 0) {
            <p class="detalle">
              Canales abiertos ahora mismo, del más fuerte al menos:
              @for (s of analizador.sospechosos(); track s.indice) {
                <ui-badge tono="aviso">{{ s.indice }} {{ s.nombre }}</ui-badge>
              }
            </p>
            <p class="detalle">
              Es una pista y no una certeza: que un canal suene no prueba que sea
              el que realimenta. Lo que sí es seguro es que los que están en
              silencio no pueden serlo.
            </p>
          }
        </div>
      }

      <div class="barras" role="img" aria-label="Espectro del general">
        @for (b of barras(); track b.banda) {
          <span class="barra" [style.height.%]="b.alto" [class.pico]="b.sospechosa"></span>
        }
      </div>
      <p class="pie">
        Mirando el general · {{ analizador.bandas().length }} bandas ·
        {{ avisos().length === 0 ? 'nada colgado' : avisos().length + ' banda(s) sostenida(s)' }}
      </p>
    }
  `,
  styles: [`
    @use 'tokens' as *;

    .permiso, .alarma { padding: var(--sp-4); border-radius: var(--radio-md); margin-bottom: var(--sp-4); }
    .permiso { background: var(--surface-2); }
    .alarma { background: var(--warn-tenue); }
    .permiso h2, .alarma h2 { margin: 0 0 var(--sp-2); font-size: 1.1rem; }
    .detalle { font-size: .85rem; opacity: .8; line-height: 1.4; }
    .banda { font-size: 1.05rem; margin: var(--sp-1) 0; }
    .botones { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
    .barras { display: flex; align-items: flex-end; gap: 1px; height: 220px;
              padding: var(--sp-2); background: var(--surface-2); border-radius: var(--radio-md); }
    .barra { flex: 1; background: var(--signal); min-height: 1px; border-radius: 1px 1px 0 0; }
    .barra.pico { background: var(--warn); }
    .pie { font-size: .8rem; opacity: .7; margin-top: var(--sp-2); }
  `],
})
export class EspectroComponent implements OnDestroy {
  readonly analizador = inject(AnalizadorService);

  /** Las candidatas, ya en palabras que se leen de un vistazo. */
  readonly avisos = computed(() => this.analizador.candidatas().map((c) => ({
    banda: c.banda,
    hz: c.hz >= 1000 ? `${(c.hz / 1000).toFixed(2)} kHz` : `${Math.round(c.hz)} Hz`,
    segundos: (c.sostenidaMs / 1000).toFixed(1),
  })));

  /**
   * Las barras del dibujo.
   *
   * El alto se calcula sobre el máximo de la trama y no sobre un tope fijo: el
   * byte del analizador no tiene un cero absoluto medido, así que un eje en
   * decibeles absolutos sería inventado. Lo que sí es cierto y útil es la forma.
   */
  readonly barras = computed(() => {
    const b = this.analizador.bandas();
    const max = Math.max(1, ...b);
    const sospechosas = new Set(this.analizador.candidatas().map((c) => c.banda));
    return b.map((db, i) => ({
      banda: i,
      alto: Math.max(1, Math.round((db / max) * 100)),
      sospechosa: sospechosas.has(i),
      hz: frecuenciaDeBanda(i),
    }));
  });

  empezar(): void {
    this.analizador.conceder();
    this.analizador.empezar(FUENTE_GENERAL);
  }

  volverAPreguntar(): void {
    this.analizador.conceder();
    this.analizador.empezar(FUENTE_GENERAL);
  }

  /**
   * **Devolver el analizador al salir no es opcional.**
   *
   * Si esta pantalla se cierra sin devolverlo, el operador abrió el espectro una
   * vez y su analizador queda apuntando al general el resto del día.
   */
  ngOnDestroy(): void {
    this.analizador.terminar();
  }
}
