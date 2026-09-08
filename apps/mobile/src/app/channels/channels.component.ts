import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { MixerService } from '../core/mixer.service';
import { BandService } from '../core/band.service';
import type { ChannelProfileType } from '@vse/domain';

/**
 * Asignación de canales: qué entrada de la consola es qué instrumento.
 *
 * Propone el tipo a partir del nombre que el canal ya tiene en la consola,
 * porque el usuario normalmente ya los nombró y volver a escribirlos en una
 * tablet, de pie, antes de un show, sería tiempo perdido.
 */
@Component({
  selector: 'app-channels',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cabecera">
      <div>
        <h2>Canales</h2>
        <p class="sub">
          {{ asignados() }} de {{ canales().length }} asignados.
          Marcá <strong>en vivo</strong> los canales que llevan una fuente real
          durante el show: sirve de protección al activar el modo de reproducción.
        </p>
      </div>
      <button type="button" (click)="autoasignar()">Proponer todos</button>
    </section>

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
        @for (c of canales(); track c.indice) {
          <tr [class.asignado]="tipoDe(c.indice) !== null">
            <td class="izq"><span class="idx">{{ c.indice }}</span></td>
            <td class="izq">{{ c.nombre }}</td>
            <td class="izq">
              <select [value]="tipoDe(c.indice) ?? ''"
                      (change)="cambiarTipo(c.indice, c.nombre, $event)">
                <option value="">Sin asignar</option>
                @for (p of perfiles; track p.id) {
                  <option [value]="p.type">{{ p.nombre }}</option>
                }
              </select>
            </td>
            <td class="num">{{ margenDe(c.indice) }}</td>
            <td>
              <input type="checkbox" [checked]="enVivoDe(c.indice)"
                     [disabled]="tipoDe(c.indice) === null"
                     (change)="cambiarEnVivo(c.indice, $event)"
                     [attr.aria-label]="'canal ' + c.indice + ' en vivo'">
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: [`
    :host { display: block; }
    .cabecera {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 16px; margin-bottom: 16px;
    }
    .cabecera button {
      background: var(--surface-2); color: var(--ink); border: 1px solid var(--line);
      border-radius: 3px; padding: 10px 16px; cursor: pointer; white-space: nowrap;
    }
    h2 { font-size: 20px; margin: 0 0 4px; font-weight: 500; }
    .sub { color: var(--muted); font-size: 13px; margin: 0; max-width: 70ch; }
    .sub strong { color: var(--ink-2); font-weight: 500; }
    table { font-size: 14px; }
    th.izq, td.izq { text-align: left; }
    .idx { color: var(--muted); font-family: var(--mono); font-size: 12px; }
    tr.asignado .idx { color: var(--signal); }
    select {
      background: var(--surface-2); color: var(--ink); border: 1px solid var(--line);
      border-radius: 3px; padding: 8px 10px; font-size: 14px; min-width: 190px;
    }
    input[type=checkbox] { width: 22px; height: 22px; accent-color: var(--signal); }
  `],
})
export class ChannelsComponent {
  private readonly mixer = inject(MixerService);
  private readonly banda = inject(BandService);

  readonly canales = this.mixer.canales;
  readonly perfiles = this.banda.perfiles;
  readonly asignados = this.banda.asignados;

  private readonly version = signal(0);

  tipoDe(indice: number): ChannelProfileType | null {
    this.version();
    const a = this.banda.asignacionDe(indice);
    if (!a) return null;
    return this.banda.perfilDe(a).type;
  }

  margenDe(indice: number): string {
    this.version();
    const a = this.banda.asignacionDe(indice);
    return a ? `${this.banda.perfilDe(a).margenObjetivoDb} dB` : '—';
  }

  enVivoDe(indice: number): boolean {
    this.version();
    return this.banda.asignacionDe(indice)?.isLive ?? false;
  }

  cambiarTipo(indice: number, nombre: string, ev: Event): void {
    const valor = (ev.target as HTMLSelectElement).value;
    if (valor === '') this.banda.quitar(indice);
    else {
      this.banda.asignar(indice, {
        instrumento: nombre,
        tipo: valor as ChannelProfileType,
        nombreEnConsola: nombre,
        isLive: this.enVivoDe(indice),
      });
    }
    this.version.update((v) => v + 1);
  }

  cambiarEnVivo(indice: number, ev: Event): void {
    const a = this.banda.asignacionDe(indice);
    if (!a) return;
    this.banda.asignar(indice, {
      instrumento: a.instrumento,
      tipo: this.banda.perfilDe(a).type,
      nombreEnConsola: a.nombreEnConsola,
      isLive: (ev.target as HTMLInputElement).checked,
    });
    this.version.update((v) => v + 1);
  }

  autoasignar(): void {
    for (const c of this.canales()) {
      const tipo = this.banda.sugerirTipo(c.nombre);
      if (tipo === 'CUSTOM') continue; // sin coincidencia clara, lo decide el usuario
      this.banda.asignar(c.indice, {
        instrumento: c.nombre,
        tipo,
        nombreEnConsola: c.nombre,
        isLive: true,
      });
    }
    this.version.update((v) => v + 1);
  }
}
