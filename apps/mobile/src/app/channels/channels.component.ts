import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { ChannelProfileType } from '@vse/domain';
import { BandService } from '../core/band.service';
import { MixerService } from '../core/mixer.service';
import { SesionService } from '../core/sesion.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, PageHeaderComponent,
} from '../ui';

/** Una fila ya resuelta: la plantilla no calcula nada. */
interface FilaDeCanal {
  readonly indice: number;
  readonly nombre: string;
  readonly tipo: ChannelProfileType | '';
  readonly tipoNombre: string;
  readonly margen: string;
  readonly enVivo: boolean;
  readonly asignado: boolean;
}

/**
 * Asignación de canales: qué entrada de la consola es qué instrumento.
 *
 * Propone el tipo a partir del nombre que el canal ya tiene en la consola,
 * porque el usuario normalmente ya los nombró y volver a escribirlos en una
 * tablet, de pie, antes de un show, sería tiempo perdido.
 *
 * Todo lo que la plantilla muestra sale de una sola señal calculada. Antes
 * había tres métodos llamados desde el enlace —`tipoDe`, `margenDe`,
 * `enVivoDe`— más una señal `version` que se incrementaba a mano para
 * forzar el refresco. Eso reevaluaba las tres funciones por cada canal en
 * cada ciclo de detección de cambios, con los medidores actualizándose varias
 * veces por segundo.
 */
@Component({
  selector: 'app-channels',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Canales"
        [descripcion]="resumen()">
        <ui-button variante="secundario" icono="canales"
                   [deshabilitado]="filas().length === 0"
                   (pulsado)="autoasignar()">Proponer todos</ui-button>
      </ui-page-header>

      @if (filas().length === 0) {
        <ui-empty icono="conectar" titulo="Sin canales que asignar"
          detalle="Los canales se leen de la consola. Conectate desde Ajustes y van a aparecer acá con el nombre que ya tienen." />
      } @else {
        @if (!permiteAsignar()) {
          <p class="aviso">
            La sesión está en un estado donde la asignación no debería cambiar.
            Se puede mirar, pero conviene no tocar: la asignación es lo que
            relaciona cada medición con su fuente.
          </p>
        }

        <div class="desplaza-x ancho">
          <table>
            <thead>
              <tr>
                <th class="izq">Entrada</th>
                <th class="izq">Nombre en consola</th>
                <th class="izq">Tipo de fuente</th>
                <th class="num">Margen objetivo</th>
                <th>En vivo</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.indice) {
                <tr [class.asignado]="f.asignado">
                  <td class="izq"><span class="idx num">{{ f.indice }}</span></td>
                  <td class="izq">{{ f.nombre }}</td>
                  <td class="izq">
                    <select [value]="f.tipo" [attr.aria-label]="'tipo del canal ' + f.indice"
                            (change)="cambiarTipo(f.indice, f.nombre, $event)">
                      <option value="">Sin asignar</option>
                      @for (p of perfiles; track p.id) {
                        <option [value]="p.type">{{ p.nombre }}</option>
                      }
                    </select>
                  </td>
                  <td class="num">{{ f.margen }}</td>
                  <td>
                    <input type="checkbox" [checked]="f.enVivo" [disabled]="!f.asignado"
                           (change)="cambiarEnVivo(f.indice, $event)"
                           [attr.aria-label]="'canal ' + f.indice + ' en vivo'" />
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="angosto pila">
          @for (f of filas(); track f.indice) {
            <ui-card [titulo]="f.nombre" [subtitulo]="'Entrada ' + f.indice">
              <div class="pila-sm">
                <select [value]="f.tipo" [attr.aria-label]="'tipo del canal ' + f.indice"
                        (change)="cambiarTipo(f.indice, f.nombre, $event)">
                  <option value="">Sin asignar</option>
                  @for (p of perfiles; track p.id) {
                    <option [value]="p.type">{{ p.nombre }}</option>
                  }
                </select>
                <div class="racimo racimo-entre">
                  <span class="dato">Margen objetivo <b class="num">{{ f.margen }}</b></span>
                  <label class="envivo">
                    <input type="checkbox" [checked]="f.enVivo" [disabled]="!f.asignado"
                           (change)="cambiarEnVivo(f.indice, $event)" />
                    En vivo
                  </label>
                </div>
                @if (f.enVivo) { <ui-badge tono="aviso">Fuente real en el show</ui-badge> }
              </div>
            </ui-card>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    table { border-collapse: collapse; width: 100%; font-size: var(--txt-md); }
    th, td { text-align: center; padding: var(--sp-3); border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: var(--peso-medio); font-size: var(--txt-sm); }
    .izq { text-align: left; }
    .idx { color: var(--muted); font-size: var(--txt-xs); }
    tr.asignado .idx { color: var(--signal); }

    select {
      background: var(--surface-2); color: var(--ink);
      border: 1px solid var(--line-fuerte); border-radius: var(--radio-md);
      padding: var(--sp-2) var(--sp-3); font: inherit;
      min-height: var(--tap-min); min-width: 190px; width: 100%;
    }
    input[type=checkbox] { width: 22px; height: 22px; accent-color: var(--signal); }

    .aviso {
      margin-bottom: var(--sp-4); padding: var(--sp-3);
      border-left: 2px solid var(--warn); color: var(--muted);
      font-size: var(--txt-sm); line-height: var(--alto-linea);
    }
    .dato { color: var(--muted); font-size: var(--txt-sm); }
    .envivo { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--txt-sm); }

    .angosto { display: none; }
    @include hasta($bp-telefono) {
      .ancho { display: none; }
      .angosto { display: flex; }
    }
  `],
})
export class ChannelsComponent {
  private readonly mixer = inject(MixerService);
  private readonly banda = inject(BandService);
  private readonly sesion = inject(SesionService);

  readonly perfiles = this.banda.perfiles;

  /**
   * INV-006: la ganancia solo se toca en configuración de canales. La
   * asignación no es la ganancia, pero cambiarla después de haber medido
   * rompe la relación entre cada medición y su fuente, así que se avisa.
   */
  readonly permiteAsignar = computed(() => {
    const estado = this.sesion.actual()?.sesion.state;
    return estado === undefined || estado === 'CREATED' || estado === 'SETUP'
      || estado === 'CHANNEL_SETUP';
  });

  readonly filas = computed<readonly FilaDeCanal[]>(() => {
    const asignaciones = this.banda.asignaciones();
    return this.mixer.canales().map((c) => {
      const a = asignaciones.find((x) => x.ui24rInputIndex === c.indice);
      if (a === undefined) {
        return {
          indice: c.indice, nombre: c.nombre, tipo: '' as const, tipoNombre: '',
          margen: '—', enVivo: false, asignado: false,
        };
      }
      const perfil = this.banda.perfilDe(a);
      return {
        indice: c.indice,
        nombre: c.nombre,
        tipo: perfil.type,
        tipoNombre: perfil.nombre,
        margen: `${perfil.margenObjetivoDb} dB`,
        enVivo: a.isLive,
        asignado: true,
      };
    });
  });

  readonly resumen = computed(() => {
    const total = this.filas().length;
    const puestos = this.filas().filter((f) => f.asignado).length;
    return `${puestos} de ${total} asignados. Marcá «en vivo» los canales que llevan una `
      + 'fuente real durante el show: sirve de protección al activar el modo de reproducción, '
      + 'que sustituye las entradas por pistas grabadas.';
  });

  cambiarTipo(indice: number, nombre: string, ev: Event): void {
    const valor = (ev.target as HTMLSelectElement).value;
    if (valor === '') {
      this.banda.quitar(indice);
      return;
    }
    const previa = this.filas().find((f) => f.indice === indice);
    this.banda.asignar(indice, {
      instrumento: nombre,
      tipo: valor as ChannelProfileType,
      nombreEnConsola: nombre,
      isLive: previa?.enVivo ?? false,
    });
  }

  cambiarEnVivo(indice: number, ev: Event): void {
    const a = this.banda.asignacionDe(indice);
    if (a === undefined) return;
    this.banda.asignar(indice, {
      instrumento: a.instrumento,
      tipo: this.banda.perfilDe(a).type,
      nombreEnConsola: a.nombreEnConsola,
      isLive: (ev.target as HTMLInputElement).checked,
    });
  }

  autoasignar(): void {
    for (const f of this.filas()) {
      if (f.asignado) continue;
      const tipo = this.banda.sugerirTipo(f.nombre);
      if (tipo === null) continue;
      this.banda.asignar(f.indice, {
        instrumento: f.nombre, tipo, nombreEnConsola: f.nombre, isLive: false,
      });
    }
  }
}
