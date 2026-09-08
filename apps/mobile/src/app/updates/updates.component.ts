import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { formatearVersion } from '@vse/updater';
import { UpdateService } from './update.service';

/**
 * Pantalla de actualización.
 *
 * La aplicación no se publica en ninguna tienda (ADR-020), así que esta
 * pantalla es el único camino por el que llega una versión nueva a la tablet.
 * Por eso muestra el porqué de cada bloqueo en vez de un botón apagado: si en
 * medio de un ensayo el botón no responde, el usuario necesita leer que es
 * porque hay una sesión abierta, no quedarse tocando la pantalla.
 */
@Component({
  selector: 'app-updates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cabecera">
      <div>
        <p class="etiqueta">Versión instalada</p>
        <p class="version">{{ instalada() }}</p>
      </div>
      <button type="button" [disabled]="ocupado()" (click)="buscar()">
        {{ textoBuscar() }}
      </button>
    </section>

    @if (error(); as e) {
      <p class="error">{{ e }}</p>
    }

    @switch (estado()) {
      @case ('sin-datos') {
        <p class="nota">
          Todavía no se consultó. La aplicación no se publica en ninguna tienda:
          las versiones nuevas llegan desde las publicaciones del repositorio.
        </p>
      }
      @case ('al-dia') {
        <p class="nota ok">No hay ninguna versión más nueva publicada.</p>
      }
      @case ('ilegible') {
        <p class="nota aviso">
          No se pudo interpretar la versión instalada, así que no hay con qué
          comparar. Es lo que pasa con una compilación local sin número de
          versión.
        </p>
      }
      @case ('novedad') {
        <section class="novedad">
          <p class="etiqueta">Versión disponible</p>
          <p class="version grande">{{ disponible() }}</p>
          <p class="tamanio">{{ tamanio() }}</p>

          @if (bloqueos().length > 0) {
            <ul class="bloqueos">
              @for (b of bloqueos(); track b.motivo) {
                <li>
                  @if (b.invariante) { <span class="inv">{{ b.invariante }}</span> }
                  {{ b.explicacion }}
                </li>
              }
            </ul>
          } @else if (!permiso()) {
            <p class="nota aviso">
              Android exige habilitar una vez «instalar aplicaciones
              desconocidas» para esta aplicación. Es un ajuste del sistema y no
              se puede conceder desde acá.
            </p>
            <button type="button" (click)="pedirPermiso()">Abrir el ajuste</button>
          } @else {
            @switch (fase()) {
              @case ('DESCARGANDO') {
                <p class="progreso">{{ progreso() }}</p>
              }
              @case ('VERIFICANDO') {
                <p class="progreso">{{ progreso() }}</p>
              }
              @case ('LISTA_PARA_INSTALAR') {
                <p class="nota ok">
                  Descargada y verificada. Al instalar, la aplicación se cierra y
                  vuelve a abrirse con la versión nueva.
                </p>
                <button type="button" class="primario" (click)="instalar()">
                  Instalar y reiniciar
                </button>
              }
              @case ('INSTALANDO') {
                <p class="progreso">Instalando. Confirmá en el diálogo del sistema.</p>
              }
              @default {
                <button type="button" class="primario" (click)="descargar()">
                  Descargar
                </button>
              }
            }
          }

          @if (notas()) {
            <details>
              <summary>Novedades de esta versión</summary>
              <pre>{{ notas() }}</pre>
            </details>
          }
        </section>
      }
    }
  `,
  styles: [`
    :host { display: block; max-width: 620px; }

    .cabecera {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--line);
    }
    .etiqueta {
      margin: 0; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted);
    }
    .version { margin: 4px 0 0; font-family: var(--mono); font-size: 18px; }
    .version.grande { font-size: 28px; }

    button {
      background: transparent; border: 1px solid var(--line); color: var(--ink);
      padding: 10px 18px; border-radius: 3px; cursor: pointer; font-size: 15px;
    }
    button:disabled { color: var(--muted); cursor: default; }
    button.primario { border-color: var(--signal); color: var(--signal); }

    .novedad { padding-top: 20px; }
    .tamanio { color: var(--muted); font-size: 13px; margin: 2px 0 18px; }

    .nota { color: var(--muted); line-height: 1.55; }
    .nota.ok { color: var(--ok); }
    .nota.aviso { color: var(--warn); }
    .error { color: var(--danger, #e5484d); line-height: 1.55; }

    .bloqueos { list-style: none; padding: 0; margin: 0 0 12px; }
    .bloqueos li {
      border-left: 2px solid var(--warn); padding: 8px 0 8px 12px;
      margin-bottom: 8px; color: var(--muted); line-height: 1.5;
    }
    .inv {
      font-family: var(--mono); font-size: 12px; color: var(--warn);
      margin-right: 6px;
    }

    .progreso { font-family: var(--mono); color: var(--signal); }

    details { margin-top: 24px; color: var(--muted); }
    summary { cursor: pointer; }
    pre { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
  `],
})
export class UpdatesComponent {
  private readonly servicio = inject(UpdateService);

  readonly fase = this.servicio.fase;
  readonly error = this.servicio.error;
  readonly permiso = this.servicio.permisoConcedido;
  readonly progresoNumerico = this.servicio.porcentaje;

  readonly instalada = computed(() => this.servicio.versionInstalada() ?? '—');

  readonly ocupado = computed(() => {
    const f = this.fase();
    return f !== 'INACTIVA' && f !== 'FALLIDA';
  });

  readonly textoBuscar = computed(() =>
    this.fase() === 'CONSULTANDO' ? 'Consultando…' : 'Buscar actualizaciones',
  );

  readonly estado = computed<'sin-datos' | 'al-dia' | 'ilegible' | 'novedad'>(() => {
    const d = this.servicio.decision();
    if (d === null) return 'sin-datos';
    switch (d.tipo) {
      case 'AL_DIA': return 'al-dia';
      case 'VERSION_INSTALADA_ILEGIBLE': return 'ilegible';
      default: return 'novedad';
    }
  });

  private readonly publicacion = computed(() => {
    const d = this.servicio.decision();
    if (d === null || d.tipo === 'AL_DIA' || d.tipo === 'VERSION_INSTALADA_ILEGIBLE') return null;
    return d.publicacion;
  });

  readonly disponible = computed(() => {
    const p = this.publicacion();
    return p === null ? '—' : formatearVersion(p.version);
  });

  readonly notas = computed(() => this.publicacion()?.notas ?? '');

  readonly tamanio = computed(() => {
    const p = this.publicacion();
    if (p === null || p.apk.bytes === 0) return '';
    return `${(p.apk.bytes / 1024 / 1024).toFixed(1)} MB`;
  });

  readonly bloqueos = computed(() => {
    const d = this.servicio.decision();
    return d !== null && d.tipo === 'BLOQUEADA' ? d.bloqueos : [];
  });

  readonly progreso = computed(() => {
    const pct = this.progresoNumerico();
    if (this.fase() === 'VERIFICANDO' && pct === 100) return 'Verificando la suma…';
    return pct === null ? 'Descargando…' : `Descargando ${pct} %`;
  });

  buscar(): void { void this.servicio.buscar(); }
  pedirPermiso(): void { void this.servicio.pedirPermiso(); }
  instalar(): void { void this.servicio.instalar(); }

  descargar(): void {
    const p = this.publicacion();
    if (p !== null) void this.servicio.descargar(p);
  }
}
