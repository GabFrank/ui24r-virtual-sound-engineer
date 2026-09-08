import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ALMACEN } from '../core/almacen/almacen';
import { validarUrlDeConsola } from '@vse/domain';
import { ConnectionStateService } from '../core/connection.state';
import { MixerService } from '../core/mixer.service';
import { Preferencias } from '../core/preferencias.service';
import { RegistroService } from '../core/registro.service';
import { Repositorios } from '../core/repos/repositorios';
import type { LogEvent } from '@vse/logging';
import {
  BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, FieldComponent,
  PageHeaderComponent, ToastService,
} from '../ui';

/**
 * Una línea del registro, ya formateada.
 *
 * El formato se hace acá y no en la plantilla porque una llamada desde la
 * plantilla se reevalúa en cada ciclo de detección de cambios, y esta lista
 * tiene cien líneas.
 */
interface LineaDeRegistro {
  readonly clave: string;
  readonly clase: string;
  readonly hora: string;
  readonly que: string;
  readonly donde: string;
}

function aLinea(e: LogEvent, i: number): LineaDeRegistro {
  return {
    clave: `${e.ts}-${i}`,
    clase: `nivel-${e.level}`,
    hora: e.ts.slice(11, 19),
    que: e.event,
    donde: e.category,
  };
}

/**
 * Ajustes.
 *
 * Reúne lo que se toca una vez y después casi nunca: la dirección de la
 * consola, dónde se guardan los datos y cómo se actualiza la aplicación.
 *
 * La dirección de la consola está acá y no en la pantalla de la consola
 * porque conectarse es una acción y configurar dónde conectarse es un ajuste.
 * Mezclarlas llevaba a que el campo de la dirección apareciera en pantalla
 * cada vez que se abría la telemetría.
 */
@Component({
  selector: 'app-ajustes',
  standalone: true,
  imports: [
    FormsModule, BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent,
    FieldComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Ajustes"
        descripcion="Lo que se configura una vez: dónde está la consola, dónde se guardan los datos y cómo llegan las versiones nuevas." />

      <div class="pila-lg">
        <ui-card titulo="Consola" [subtitulo]="estadoConexion()">
          <div class="pila">
            <ui-field rotulo="Dirección" idControl="aj-host" [error]="errorHost()"
                      ayuda="La Ui24R levanta su propia red y se presenta en ws://10.10.1.1. Si está en una red fija, poné la dirección que le asignó el router. Durante el desarrollo, acá va la del simulador.">
              <input id="aj-host" type="text" inputmode="url"
                     autocapitalize="off" autocorrect="off" spellcheck="false"
                     [ngModel]="host()" (ngModelChange)="prefs.fijarHost($event)" />
            </ui-field>

            <div class="racimo">
              @if (conectado()) {
                <ui-button variante="secundario" icono="cerrar" (pulsado)="desconectar()">
                  Desconectar
                </ui-button>
              } @else {
                <ui-button variante="primario" icono="conectar" [cargando]="conectando()"
                           [deshabilitado]="errorHost() !== null"
                           (pulsado)="conectar()">Conectar</ui-button>
              }
            </div>

            @if (error(); as e) {
              <p class="error">{{ e }}</p>
              <p class="nota">
                Comprobá que la consola esté encendida y que la tablet esté en
                su red. Si la Ui24R levanta su propia red, hay que conectarse a
                ella desde los ajustes de wifi del sistema.
              </p>
            }
          </div>
        </ui-card>

        <ui-card titulo="Actualización de la aplicación"
                 subtitulo="No se publica en ninguna tienda">
          <p class="nota">
            Las versiones nuevas llegan desde las publicaciones del repositorio.
            No se actualiza durante una sesión ni con la consola conectada.
          </p>
          <ui-button variante="secundario" icono="descargar"
                     (pulsado)="irAActualizacion()">Buscar actualizaciones</ui-button>
        </ui-card>

        <ui-card titulo="Datos" [subtitulo]="almacen.descripcion">
          <ul class="conteos">
            <li><span>Bandas</span> <b class="num">{{ conteos().bandas }}</b></li>
            <li><span>Locales</span> <b class="num">{{ conteos().locales }}</b></li>
            <li><span>Sistemas</span> <b class="num">{{ conteos().pas }}</b></li>
            <li><span>Sesiones</span> <b class="num">{{ conteos().sesiones }}</b></li>
          </ul>
          <p class="nota">
            Todo vive en el dispositivo. Durante un show no hay internet y no
            hace falta que la haya.
          </p>
          <div class="racimo">
            <ui-button variante="secundario" icono="descargar" [cargando]="exportando()"
                       (pulsado)="exportar()">Copiar todo al portapapeles</ui-button>
          </div>
        </ui-card>

        <ui-card titulo="Registro" [subtitulo]="resumenRegistro()">
          <p class="nota">
            Lo que la aplicación hizo, en orden y con su hora. Es lo primero que
            hay que mirar cuando algo salió distinto de lo esperado, y lo que se
            adjunta a una consulta de soporte.
          </p>

          @if (errorRegistro(); as e) {
            <p class="error">No se pudo guardar el registro: {{ e }}</p>
          }

          <div class="racimo">
            <ui-button variante="secundario" icono="refrescar" [cargando]="cargandoRegistro()"
                       (pulsado)="verRegistro()">
              {{ soloGraves() ? 'Ver avisos y errores' : 'Ver los últimos' }}
            </ui-button>
            <ui-button variante="sutil" (pulsado)="alternarGraves()">
              {{ soloGraves() ? 'Mostrar todo' : 'Solo avisos y errores' }}
            </ui-button>
            <ui-button variante="secundario" icono="descargar" [cargando]="copiandoRegistro()"
                       (pulsado)="copiarRegistro()">Copiar como JSONL</ui-button>
          </div>

          @if (registroTruncado()) {
            <p class="nota">
              Puede haber más avisos y errores más atrás: la búsqueda mira los
              últimos mil eventos y en esos no encontró más.
            </p>
          }

          @if (eventos().length === 0) {
            @if (registroPedido()) {
              <ui-empty icono="registro" titulo="No hay eventos"
                              descripcion="Todavía no se guardó nada, o el filtro los deja a todos fuera." />
            }
          } @else {
            <ol class="eventos">
              @for (e of eventos(); track e.clave) {
                <li [class]="e.clase">
                  <span class="hora">{{ e.hora }}</span>
                  <span class="que">{{ e.que }}</span>
                  <span class="donde">{{ e.donde }}</span>
                </li>
              }
            </ol>
          }
        </ui-card>

        <ui-card titulo="Sobre esta aplicación">
          <p class="nota">
            Ingeniero de sonido virtual asistido por medición para Soundcraft
            Ui24R. Trabaja sin conexión, propone antes de escribir y explica
            cada propuesta con el número que la sostiene.
          </p>
          <div class="racimo">
            <ui-badge tono="neutro">{{ almacen.descripcion }}</ui-badge>
          </div>
        </ui-card>
      </div>
    </div>
  `,
  styles: [`
    .nota { color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
    .error { color: var(--danger); font-size: var(--txt-sm); }

    .conteos { list-style: none; margin: 0 0 var(--sp-3); padding: 0; }
    .conteos li {
      display: flex; justify-content: space-between;
      padding: var(--sp-2) 0; border-bottom: 1px solid var(--line);
      color: var(--ink-2);
    }
    .conteos li:last-child { border-bottom: 0; }

    .eventos {
      list-style: none; margin: var(--sp-3) 0 0; padding: 0;
      max-height: 40vh; overflow-y: auto;
      border: 1px solid var(--line); border-radius: var(--radio-2);
    }
    .eventos li {
      display: grid; grid-template-columns: auto 1fr auto; gap: var(--sp-3);
      align-items: baseline;
      padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line);
      font-size: var(--txt-sm);
    }
    .eventos li:last-child { border-bottom: 0; }
    .hora { color: var(--muted); font-variant-numeric: tabular-nums; }
    .que { color: var(--ink); overflow-wrap: anywhere; }
    .donde { color: var(--muted); font-size: var(--txt-xxs); text-transform: uppercase; }
    .nivel-warn .que { color: var(--warn); }
    .nivel-error .que { color: var(--danger); }
  `],
})
export class AjustesComponent {
  private readonly mixer = inject(MixerService);
  private readonly conexion = inject(ConnectionStateService);
  private readonly repos = inject(Repositorios);
  private readonly registro = inject(RegistroService);
  private readonly avisos = inject(ToastService);
  private readonly router = inject(Router);

  readonly prefs = inject(Preferencias);
  readonly almacen = inject(ALMACEN);

  readonly host = this.prefs.host;
  readonly conectando = this.mixer.conectando;
  readonly error = this.mixer.ultimoError;
  readonly exportando = signal(false);

  readonly conteos = signal({ bandas: 0, locales: 0, pas: 0, sesiones: 0 });

  readonly eventos = signal<readonly LineaDeRegistro[]>([]);
  readonly cargandoRegistro = signal(false);
  readonly copiandoRegistro = signal(false);
  /** Sin esto, «no hay eventos» aparecería antes de haber mirado. */
  readonly registroPedido = signal(false);
  readonly soloGraves = signal(false);
  readonly errorRegistro = signal<string | null>(null);
  /** La búsqueda pudo quedarse corta: hay que decirlo, no dejarlo parecer vacío. */
  readonly registroTruncado = signal(false);

  private readonly filtroRegistro = computed(() =>
    this.soloGraves() ? ({ desdeNivel: 'warn', limite: 100 } as const) : ({ limite: 100 } as const));

  readonly resumenRegistro = computed(() => {
    const n = this.eventos().length;
    if (!this.registroPedido()) return 'Guardado en el dispositivo';
    return n === 0 ? 'Sin eventos' : `${n} evento${n === 1 ? '' : 's'}`;
  });

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  readonly errorHost = computed(() => validarUrlDeConsola(this.host()));

  readonly estadoConexion = computed(() => {
    switch (this.conexion.estado()) {
      case 'CONNECTED': return 'Conectada';
      case 'UNSTABLE': return 'Conectada, pero inestable';
      case 'RECONNECTING': return 'Reconectando';
      case 'DISCONNECTED': return 'Sin conexión';
    }
  });

  constructor() {
    void this.contar();
  }

  private async contar(): Promise<void> {
    const [bandas, locales, pas, sesiones] = await Promise.all([
      this.repos.bandas(), this.repos.locales(), this.repos.pas(), this.repos.sesiones(500),
    ]);
    this.conteos.set({
      bandas: bandas.length, locales: locales.length,
      pas: pas.length, sesiones: sesiones.length,
    });
  }

  irAActualizacion(): void { void this.router.navigate(['/ajustes/actualizacion']); }

  alternarGraves(): void {
    this.soloGraves.update((v) => !v);
    if (this.registroPedido()) void this.verRegistro();
  }

  async verRegistro(): Promise<void> {
    this.cargandoRegistro.set(true);
    this.registroPedido.set(true);
    try {
      const r = await this.registro.eventos(this.filtroRegistro());
      this.eventos.set(r.eventos.map(aLinea));
      this.registroTruncado.set(r.truncado);
      this.errorRegistro.set(this.registro.ultimoError());
    } finally {
      this.cargandoRegistro.set(false);
    }
  }

  async copiarRegistro(): Promise<void> {
    this.copiandoRegistro.set(true);
    try {
      await navigator.clipboard.writeText(
        await this.registro.exportarJsonl(this.filtroRegistro()),
      );
      this.avisos.ok('Registro copiado como JSONL.');
    } catch {
      this.avisos.error('No se pudo copiar. El sistema no dio permiso al portapapeles.');
    } finally {
      this.copiandoRegistro.set(false);
    }
  }

  conectar(): void {
    void this.mixer.conectar(this.host()).catch(() => { /* el error ya está en la señal */ });
  }

  desconectar(): void {
    void this.mixer.desconectar();
  }

  async exportar(): Promise<void> {
    this.exportando.set(true);
    try {
      await navigator.clipboard.writeText(await this.repos.exportar());
      this.avisos.ok('Datos copiados al portapapeles.');
    } catch {
      this.avisos.error('No se pudo copiar. El sistema no dio permiso al portapapeles.');
    } finally {
      this.exportando.set(false);
    }
  }
}
