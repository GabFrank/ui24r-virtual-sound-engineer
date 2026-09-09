import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { crearBanda, crearLocal, crearPa, type BandProfile, type PAProfile, type VenueProfile } from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import { cuenta } from '../ui/plural';
import {
  BadgeComponent, ButtonComponent, CardComponent, Cargable, CargandoComponent,
  EmptyStateComponent, FalloComponent, PageHeaderComponent, ToastService, intentarGuardar,
} from '../ui';

type Pestania = 'bandas' | 'locales' | 'pa';

/**
 * Perfiles: bandas, locales y sistemas de amplificación.
 *
 * Los tres están juntos porque se crean juntos, la primera vez, antes de la
 * primera sesión, y porque después casi no se tocan. Separarlos en tres
 * destinos de la navegación habría gastado tres de los cinco sitios que hay
 * en algo que se visita una vez al mes.
 */
@Component({
  selector: 'app-perfiles',
  standalone: true,
  imports: [
    RouterLink, BadgeComponent, ButtonComponent, CardComponent, CargandoComponent,
    EmptyStateComponent, FalloComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Perfiles"
        descripcion="Lo que no cambia de un show a otro: quién toca, dónde y con qué equipo. Se completa una vez y después solo se ajusta.">
        <ui-button variante="primario" icono="mas" (pulsado)="crear()">{{ textoCrear() }}</ui-button>
      </ui-page-header>

      <!-- Botones con «aria-pressed», no «role=tab». El patrón de pestañas de
           ARIA promete un panel con «role=tabpanel», identificadores enlazados,
           foco móvil y navegación con flechas; acá solo estaban los roles. Un
           ARIA a medias es peor que ninguno: el lector de pantalla anuncia
           «pestaña 1 de 3» y promete un panel que no existe. -->
      <div class="pestanias">
        @for (p of pestanias; track p.id) {
          <button type="button" [attr.data-perfil]="p.id"
                  [attr.aria-pressed]="pestania() === p.id"
                  [class.activa]="pestania() === p.id"
                  (click)="pestania.set(p.id)">{{ p.etiqueta }}</button>
        }
      </div>

      @if (avisoDeRecarga(); as a) {
        <ui-fallo [mensaje]="a" [compacto]="true" (reintentar)="recargar()" />
      }

      @if (recargando()) {
        <p class="recargando" role="status">Actualizando…</p>
      }

      @if (problema(); as p) {
        <ui-fallo [mensaje]="p" (reintentar)="recargar()" />
      } @else if (cargando()) {
        <ui-cargando texto="Leyendo los perfiles guardados" />
      } @else {
      @switch (pestania()) {
        @case ('bandas') {
          @if (bandas().length === 0) {
            <ui-empty icono="banda" titulo="Todavía no hay ninguna banda"
              detalle="Una banda agrupa a sus integrantes y la asignación de canales que usa. Sin al menos una no se puede abrir una sesión.">
              <ui-button variante="primario" icono="mas" (pulsado)="crear()">Crear banda</ui-button>
            </ui-empty>
          } @else {
            <div class="rejilla">
              @for (b of filasDeBanda(); track b.id) {
                <a class="tarjeta" [routerLink]="['/perfiles/bandas', b.id]">
                  <ui-card [titulo]="b.nombre">
                    <p class="dato">{{ b.integrantes }}</p>
                    <p class="dato">{{ b.canales }}</p>
                    @if (b.sinFirma) {
                      <ui-badge tono="neutro">Sin firma de mezcla</ui-badge>
                    }
                  </ui-card>
                </a>
              }
            </div>
          }
        }

        @case ('locales') {
          @if (locales().length === 0) {
            <ui-empty icono="local" titulo="Todavía no hay ningún local"
              detalle="Un local guarda las dimensiones, la curva objetivo y el historial de puntajes de sala, para poder comparar la de hoy con la de la última vez.">
              <ui-button variante="primario" icono="mas" (pulsado)="crear()">Crear local</ui-button>
            </ui-empty>
          } @else {
            <div class="rejilla">
              @for (l of locales(); track l.id) {
                <a class="tarjeta" [routerLink]="['/perfiles/locales', l.id]">
                  <ui-card [titulo]="l.nombre" [subtitulo]="etiquetasDeTipo[l.tipo]">
                    <p class="dato">{{ l.interior ? 'Interior' : 'Exterior' }}</p>
                    @if (l.sigmaRoomScore === null) {
                      <ui-badge tono="aviso">Sin repetibilidad medida</ui-badge>
                    } @else {
                      <!-- «σ ± 3» no le dice nada a quien no lo escribió. Es
                           cuánto varía el puntaje de la sala entre noches, y
                           así es como hay que decirlo. -->
                      <ui-badge tono="ok">Varía ±{{ l.sigmaRoomScore }} puntos</ui-badge>
                    }
                  </ui-card>
                </a>
              }
            </div>
          }
        }

        @case ('pa') {
          @if (pas().length === 0) {
            <ui-empty icono="medidor" titulo="Todavía no hay ningún sistema"
              detalle="Describe las cajas, el rango útil y por qué buses sale cada componente. El rango útil es el que impide que la aplicación proponga corregir donde el equipo no entrega nada.">
              <ui-button variante="primario" icono="mas" (pulsado)="crear()">Crear sistema</ui-button>
            </ui-empty>
          } @else {
            <div class="rejilla">
              @for (p of filasDePa(); track p.id) {
                <a class="tarjeta" [routerLink]="['/perfiles/pa', p.id]">
                  <ui-card [titulo]="p.nombre" [subtitulo]="p.cajasPrincipales">
                    <p class="dato num">{{ p.rango }}</p>
                    @if (p.unSoloComponente) {
                      <ui-badge tono="neutro">Sin medición por componente</ui-badge>
                    } @else {
                      <ui-badge tono="ok">{{ p.componentes }}</ui-badge>
                    }
                  </ui-card>
                </a>
              }
            </div>
          }
        }
      }
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    .recargando {
      color: var(--muted); font-size: var(--txt-sm); margin: 0 0 var(--sp-3);
    }

    .pestanias {
      display: flex; gap: var(--sp-1);
      margin-bottom: var(--sp-5);
      border-bottom: 1px solid var(--line);
      overflow-x: auto;
    }
    .pestanias button {
      background: transparent; border: 0; border-bottom: 2px solid transparent;
      color: var(--muted); font: inherit; cursor: pointer;
      padding: var(--sp-3) var(--sp-4); white-space: nowrap;
    }
    .pestanias button.activa { color: var(--ink); border-bottom-color: var(--signal); }

    a.tarjeta { text-decoration: none; color: inherit; display: block; }
    a.tarjeta:active ui-card { border-color: var(--line-fuerte); }
    .dato { color: var(--muted); font-size: var(--txt-sm); margin-bottom: var(--sp-1); }
  `],
})
export class PerfilesComponent {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly pestania = signal<Pestania>('bandas');

  /**
   * Los tres se leen juntos y se muestran de a uno. Un solo `Cargable` y no
   * tres porque el fallo es el mismo —el almacén no contestó— y tres mensajes
   * de error apilados no dicen nada que uno no diga.
   */
  private readonly datos = new Cargable(
    { bandas: [] as readonly BandProfile[], locales: [] as readonly VenueProfile[],
      pas: [] as readonly PAProfile[] },
    async () => {
      const [bandas, locales, pas] = await Promise.all([
        this.repos.bandas(), this.repos.locales(), this.repos.pas(),
      ]);
      return { bandas, locales, pas };
    },
  );

  readonly cargando = this.datos.cargando;
  readonly problema = this.datos.problema;
  /** Relee con algo ya en pantalla: se avisa sin tapar lo que hay. */
  readonly recargando = this.datos.recargando;
  readonly avisoDeRecarga = this.datos.avisoDeRecarga;
  readonly bandas = computed(() => this.datos.valor().bandas);

  /**
   * Las bandas con sus cuentas ya escritas.
   *
   * El texto se arma acá y no en la plantilla porque una llamada a función
   * desde la plantilla se reevalúa en cada ciclo de detección de cambios, y
   * porque «1 integrantes» era exactamente lo que pasaba cuando el número y su
   * sustantivo vivían separados.
   */
  readonly filasDeBanda = computed(() => this.bandas().map((b) => ({
    id: b.id,
    nombre: b.nombre,
    integrantes: cuenta(b.integrantes.length, 'integrante', 'integrantes'),
    canales: cuenta(b.asignaciones.length, 'canal asignado', 'canales asignados'),
    sinFirma: b.mixSignature === null,
  })));

  readonly filasDePa = computed(() => this.pas().map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cajasPrincipales: p.cajasPrincipales,
    rango: `${p.rangoUtilHz[0]} – ${p.rangoUtilHz[1]} Hz`,
    unSoloComponente: p.componentes.length === 1,
    componentes: cuenta(p.componentes.length, 'componente', 'componentes'),
  })));
  readonly locales = computed(() => this.datos.valor().locales);
  readonly pas = computed(() => this.datos.valor().pas);

  readonly pestanias: readonly { id: Pestania; etiqueta: string }[] = [
    { id: 'bandas', etiqueta: 'Bandas' },
    { id: 'locales', etiqueta: 'Locales' },
    { id: 'pa', etiqueta: 'Amplificación' },
  ];

  readonly etiquetasDeTipo: Readonly<Record<string, string>> = {
    INDOOR_SMALL: 'Interior chico',
    INDOOR_MEDIUM: 'Interior mediano',
    INDOOR_LARGE: 'Interior grande',
    WAREHOUSE: 'Galpón',
    OUTDOOR: 'Exterior',
    CUSTOM: 'Otro',
  };

  readonly textoCrear = computed(() => {
    switch (this.pestania()) {
      case 'bandas': return 'Nueva banda';
      case 'locales': return 'Nuevo local';
      case 'pa': return 'Nuevo sistema';
    }
  });

  constructor() {
    // Se recarga cuando cambia la revisión del repositorio: así volver de una
    // pantalla de edición muestra el cambio sin que la edición tenga que
    // avisar a esta pantalla.
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

  /**
   * Crear navega a la pantalla de edición, pero solo si el alta se guardó.
   *
   * Antes se navegaba pasara lo que pasara: si el almacén fallaba, la pantalla
   * de edición se abría con un identificador que no existe y decía «esa banda
   * ya no existe», que es lo más confuso que se podía contestar a alguien que
   * acaba de tocar «Nueva banda».
   */
  async crear(): Promise<void> {
    const aviso = (m: string) => this.avisos.error(m);
    switch (this.pestania()) {
      case 'bandas': {
        const b = crearBanda('Banda sin nombre');
        if (!await intentarGuardar(() => this.repos.guardarBanda(b), aviso, 'crear la banda')) return;
        await this.router.navigate(['/perfiles/bandas', b.id]);
        return;
      }
      case 'pa': {
        const p = crearPa('Sistema sin nombre', '');
        if (!await intentarGuardar(() => this.repos.guardarPa(p), aviso, 'crear el sistema')) return;
        await this.router.navigate(['/perfiles/pa', p.id]);
        return;
      }
      case 'locales': {
        // Un local necesita un sistema de amplificación: sin saber qué equipo
        // hay, no se puede decidir dónde corregir. Si no hay ninguno, se crea
        // uno y se avisa, en vez de bloquear con un mensaje de error.
        let pa = this.pas()[0];
        if (pa === undefined) {
          pa = crearPa('Sistema de la casa', '');
          if (!await intentarGuardar(() => this.repos.guardarPa(pa!), aviso, 'crear el sistema')) {
            return;
          }
          this.avisos.mostrar('Se creó también un sistema de amplificación: un local no se entiende sin saber qué equipo hay.', 'aviso');
        }
        const l = crearLocal('Local sin nombre', 'INDOOR_SMALL', pa.id);
        if (!await intentarGuardar(() => this.repos.guardarLocal(l), aviso, 'crear el local')) return;
        await this.router.navigate(['/perfiles/locales', l.id]);
      }
    }
  }
}
