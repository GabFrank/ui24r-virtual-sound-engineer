import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BandProfile, SoundSession, VenueProfile } from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  BadgeComponent, Cargable, CardComponent, CargandoComponent, EmptyStateComponent,
  FalloComponent, PageHeaderComponent,
} from '../ui';
import { ESTADOS } from '../sesion/estados';

interface Fila {
  readonly sesion: SoundSession;
  readonly banda: string;
  readonly local: string;
  readonly fecha: string;
  readonly abierta: boolean;
  readonly estado: string;
}

/**
 * Historial de sesiones.
 *
 * En tablet es una tabla; en teléfono, una lista de tarjetas. No es un capricho
 * responsivo: seis columnas en 360 píxeles obligan a desplazar en horizontal
 * para leer una fila, y una tabla que se lee en dos movimientos no es una
 * tabla.
 */
@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [
    RouterLink, BadgeComponent, CardComponent, CargandoComponent, EmptyStateComponent,
    FalloComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Historial"
        descripcion="Cada sesión guarda qué se midió, qué se propuso y qué se aplicó. Es lo que permite comparar una noche con la anterior en el mismo sitio." />

      @if (problema(); as p) {
        <ui-fallo [mensaje]="p" (reintentar)="recargar()" />
      } @else if (cargando()) {
        <ui-cargando texto="Leyendo el historial" />
      } @else if (filas().length === 0) {
        <ui-empty icono="historial" titulo="Todavía no hay sesiones"
                  detalle="Cuando cierres la primera, va a aparecer acá." />
      } @else {
        <div class="desplaza-x ancho">
          <table>
            <thead>
              <tr>
                <th scope="col" class="izq">Fecha</th>
                <th scope="col" class="izq">Local</th>
                <th scope="col" class="izq">Banda</th>
                <th scope="col">Estado</th>
                <th scope="col">Sala</th>
                <th scope="col">Mezcla</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.sesion.id) {
                <!-- El enlace va dentro de la primera celda y se estira sobre
                     toda la fila. Antes el routerLink estaba en el «tr», que
                     solo escucha clics: con teclado la fila recibia el foco
                     pero Intro no hacia nada, y el lector de pantalla anunciaba
                     «fila», no «enlace». -->
                <tr>
                  <td class="izq num">
                    <a [routerLink]="['/historial', f.sesion.id]" class="fila-enlace">
                      {{ f.fecha }}
                    </a>
                  </td>
                  <td class="izq">{{ f.local }}</td>
                  <td class="izq">{{ f.banda }}</td>
                  <td>
                    @if (f.abierta) {
                      <ui-badge tono="senal">En curso</ui-badge>
                    } @else {
                      <ui-badge tono="neutro">Cerrada</ui-badge>
                    }
                  </td>
                  <td class="num">{{ f.sesion.roomScore ?? '—' }}</td>
                  <td class="num">{{ f.sesion.mixScore ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="angosto pila">
          @for (f of filas(); track f.sesion.id) {
            <a class="tarjeta" [routerLink]="['/historial', f.sesion.id]">
              <ui-card [titulo]="f.local" [subtitulo]="f.fecha + ' · ' + f.banda">
                <div class="racimo">
                  @if (f.abierta) {
                    <ui-badge tono="senal">En curso</ui-badge>
                  } @else {
                    <ui-badge tono="neutro">{{ f.estado }}</ui-badge>
                  }
                  @if (f.sesion.roomScore !== null) {
                    <span class="dato num">Sala {{ f.sesion.roomScore }}</span>
                  }
                  @if (f.sesion.mixScore !== null) {
                    <span class="dato num">Mezcla {{ f.sesion.mixScore }}</span>
                  }
                </div>
              </ui-card>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: center; padding: var(--sp-3); border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: var(--peso-medio); font-size: var(--txt-sm); }
    .izq { text-align: left; }
    tbody tr { position: relative; }
    tbody tr:active { background: var(--surface-2); }
    tbody tr:focus-within { background: var(--surface-2); }
    .fila-enlace { color: inherit; text-decoration: none; }
    .fila-enlace::after {
      content: ''; position: absolute; inset: 0;
    }

    a.tarjeta { text-decoration: none; color: inherit; display: block; }
    .dato { color: var(--muted); font-size: var(--txt-sm); }

    .angosto { display: none; }
    @include hasta($bp-telefono) {
      .ancho { display: none; }
      .angosto { display: flex; }
    }
  `],
})
export class HistorialComponent {
  private readonly repos = inject(Repositorios);

  private readonly datos = new Cargable(
    { sesiones: [] as readonly SoundSession[], bandas: [] as readonly BandProfile[],
      locales: [] as readonly VenueProfile[] },
    async () => {
      const [sesiones, bandas, locales] = await Promise.all([
        this.repos.sesiones(), this.repos.bandas(), this.repos.locales(),
      ]);
      return { sesiones, bandas, locales };
    },
  );

  readonly cargando = this.datos.cargando;
  readonly problema = this.datos.problema;
  private readonly sesiones = computed(() => this.datos.valor().sesiones);
  private readonly bandas = computed(() => this.datos.valor().bandas);
  private readonly locales = computed(() => this.datos.valor().locales);

  readonly filas = computed<readonly Fila[]>(() => {
    const bandas = new Map(this.bandas().map((b) => [b.id as string, b.nombre]));
    const locales = new Map(this.locales().map((l) => [l.id as string, l.nombre]));
    return this.sesiones().map((s) => ({
      sesion: s,
      // Un perfil borrado no deja la fila ilegible: se dice que ya no está, en
      // vez de mostrar un identificador o una celda vacía.
      banda: bandas.get(s.bandProfileId) ?? 'Banda borrada',
      local: locales.get(s.venueProfileId) ?? 'Local borrado',
      fecha: new Date(s.iniciadaEl).toLocaleDateString('es', {
        day: '2-digit', month: '2-digit', year: '2-digit',
      }),
      abierta: s.cerradaEl === null && s.state !== 'CLOSED',
      estado: ESTADOS[s.state].etiqueta,
    }));
  });

  constructor() {
    // «allowSignalWrites» porque empezar a leer marca «cargando», y eso es una
    // escritura de señal dentro del efecto. La prohibición existe para evitar
    // bucles: acá no hay ninguno, porque el efecto depende del identificador y
    // de la revisión del repositorio, y no del estado de la lectura. Antes esto
    // no saltaba solo porque la escritura ocurría dentro de un `await`, o sea
    // que el efecto ya había terminado -- estaba igual de mal y no se veía.
    effect(() => {
      this.repos.revision();
      this.recargar();
    }, { allowSignalWrites: true });
  }

  recargar(): void { void this.datos.recargar(); }
}
