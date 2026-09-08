import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ALMACEN } from '../core/almacen/almacen';
import { validarUrlDeConsola } from '@vse/domain';
import { ConnectionStateService } from '../core/connection.state';
import { MixerService } from '../core/mixer.service';
import { Preferencias } from '../core/preferencias.service';
import { Repositorios } from '../core/repos/repositorios';
import {
  BadgeComponent, ButtonComponent, CardComponent, FieldComponent,
  PageHeaderComponent, ToastService,
} from '../ui';

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
    FormsModule, RouterLink, BadgeComponent, ButtonComponent, CardComponent,
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

            @if (error(); as e) { <p class="error">{{ e }}</p> }
          </div>
        </ui-card>

        <ui-card titulo="Actualización de la aplicación"
                 subtitulo="No se publica en ninguna tienda">
          <p class="nota">
            Las versiones nuevas llegan desde las publicaciones del repositorio.
            No se actualiza durante una sesión ni con la consola conectada.
          </p>
          <a routerLink="/ajustes/actualizacion" class="enlace">Buscar actualizaciones</a>
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
    .enlace { display: inline-block; margin-top: var(--sp-3); color: var(--signal); }
    .conteos { list-style: none; margin: 0 0 var(--sp-3); padding: 0; }
    .conteos li {
      display: flex; justify-content: space-between;
      padding: var(--sp-2) 0; border-bottom: 1px solid var(--line);
      color: var(--ink-2);
    }
    .conteos li:last-child { border-bottom: 0; }
  `],
})
export class AjustesComponent {
  private readonly mixer = inject(MixerService);
  private readonly conexion = inject(ConnectionStateService);
  private readonly repos = inject(Repositorios);
  private readonly avisos = inject(ToastService);

  readonly prefs = inject(Preferencias);
  readonly almacen = inject(ALMACEN);

  readonly host = this.prefs.host;
  readonly conectando = this.mixer.conectando;
  readonly error = this.mixer.ultimoError;
  readonly exportando = signal(false);

  readonly conteos = signal({ bandas: 0, locales: 0, pas: 0, sesiones: 0 });

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
