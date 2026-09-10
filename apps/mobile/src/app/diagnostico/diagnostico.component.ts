import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { resumenDeCadencia } from '@vse/diagnostico';
import { ButtonComponent, CardComponent, PageHeaderComponent, StatComponent, ToastService } from '../ui';
import { ConnectionStateService } from '../core/connection.state';
import { DiagnosticoService } from './diagnostico.service';

/**
 * Prueba de conexión.
 *
 * Contesta dos preguntas de SPK-P0.1 con números medidos desde la tablet: con
 * qué cadencia llegan los medidores, y cuánto tarda en volver el estado tras un
 * corte de red. Las dos son propiedades del aparato en esa red -- medirlas
 * desde una laptop daría los números de la laptop.
 *
 * La pantalla guía el procedimiento en vez de esconderlo detrás de un botón:
 * cortar la red es una maniobra manual, y quien la hace tiene que saber qué se
 * espera de él en cada momento.
 */
@Component({
  selector: 'app-diagnostico',
  standalone: true,
  imports: [ButtonComponent, CardComponent, PageHeaderComponent, StatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Prueba de conexión"
        descripcion="Mide la cadencia de los dos flujos que manda la consola y el tiempo de reconexión desde esta tablet. No escribe nada: sólo escucha y cronometra.">
      </ui-page-header>

      @if (!conectado()) {
        <p class="nota aviso">
          No hay conexión con la consola. La prueba mide lo que llega, así que
          sin conexión no hay nada que medir: conectá desde Ajustes y volvé.
        </p>
      }

      <ui-card>
        <div class="fila">
          <ui-stat rotulo="Analizador (RTA)" [valor]="latidos().toString()" />
          <ui-stat rotulo="Cadencia del analizador" [valor]="cadenciaDelAnalizador()" />
          <ui-stat rotulo="Medidores (VU2)" [valor]="tramas().toString()" />
          <ui-stat rotulo="Cadencia de medidores" [valor]="cadencia()" />
        </div>
        <p class="nota">
          La conexión se juzga por el analizador, que llega igual en silencio.
          Los medidores se apagan cuando no hay señal: su cadencia dice cuánto
          audio hubo, no cómo está la conexión.
        </p>
        <div class="acciones">
          @if (midiendo()) {
            <ui-button variante="secundario" (pulsado)="detener()">Detener</ui-button>
          } @else {
            <ui-button [deshabilitado]="!conectado()" (pulsado)="iniciar()">Iniciar prueba</ui-button>
          }
        </div>
        @if (midiendo()) {
          <p class="nota">
            Midiendo. Dejá la aplicación abierta y en primer plano: si Android la
            suspende deja de recibir tramas, y ese hueco entraría en la
            estadística como si fuera cadencia de la consola.
          </p>
        }
      </ui-card>

      <ui-card>
        <h2>Ciclos de reconexión</h2>
        <p class="nota">
          Con la prueba en marcha, cortá la red —apagá el router, o desconectá
          la wifi de la tablet— y volvé a conectarla. Mientras esté caída, la
          prueba reintenta conectar una vez por segundo y cronometra la vuelta
          sola. El spike pide veinte ciclos por cada forma de cortar.
        </p>

        @if (esperando()) {
          <p class="nota aviso">
            Conexión caída, esperando el volcado completo. <strong>Cuando
            vuelvas a tener red, tocá el botón</strong> si el sistema no lo
            detecta solo: es lo que separa el tiempo de reconexión del tiempo
            que estuvo cortada.
          </p>
          <div class="acciones">
            <ui-button variante="secundario" (pulsado)="marcarRed()">La red volvió</ui-button>
          </div>
        }

        @if (ciclos().length === 0) {
          <p class="nota">Ninguno todavía.</p>
        } @else {
          <div class="desplaza-x">
            <table>
              <thead>
                <tr><th>#</th><th>Desde la caída</th><th>Desde que volvió la red</th></tr>
              </thead>
              <tbody>
                @for (c of ciclos(); track $index) {
                  <tr>
                    <td>{{ $index + 1 }}</td>
                    <td>{{ c.msDesdeLaCaida }} ms</td>
                    <td>{{ c.msDesdeQueVolvioLaRed === null ? 'no avisó' : c.msDesdeQueVolvioLaRed + ' ms' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </ui-card>

      <ui-card>
        <h2>Exportar</h2>
        <p class="nota">
          Copia el informe al portapapeles para pegarlo donde haga falta. El
          informe dice también lo que esta prueba no midió.
        </p>
        <div class="acciones">
          <ui-button variante="secundario" icono="descargar" (pulsado)="copiarMarkdown()">Copiar informe</ui-button>
          <ui-button variante="secundario" icono="descargar" (pulsado)="copiarJson()">Copiar JSON</ui-button>
        </div>
      </ui-card>
    </div>
  `,
  styles: [`
    @use 'tokens';

    /* Rejilla y no fila: en 360 px dos cifras una al lado de la otra dejaban
     * los rótulos pegados --«TRAMAS RECIBIDASCADENCIA»--, que es de esas cosas
     * que solo se ven en el ancho de un teléfono. Con auto-fit se parten en dos
     * líneas cuando no entran. */
    .fila {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: var(--sp-3);
    }

    .acciones { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
    .acciones ui-button { flex: 1 1 auto; }

    /* El paro flota fijo en la esquina inferior derecha y se pinta por encima
     * de todo. Una fila de botones que llegue hasta el borde derecho pasa por
     * debajo de él al desplazarse, y quien apunte a la esquina toca el paro en
     * vez del botón. Acá se apilan y se deja libre su columna. */
    @media (max-width: 599px) {
      .acciones {
        flex-direction: column;
        padding-inline-end: calc(var(--alto-paro-telefono) + var(--sp-3));
      }
    }
    h2 { font-size: var(--txt-lg); margin: 0 0 var(--sp-2); }
    .nota { color: var(--muted); font-size: var(--txt-sm); margin: var(--sp-2) 0 0; }
    .nota.aviso { color: var(--warn); }
    table { width: 100%; border-collapse: collapse; text-align: center; }
    th, td { padding: var(--sp-2); border-bottom: 1px solid var(--line); }
    .desplaza-x { overflow-x: auto; }
  `],
})
export class DiagnosticoComponent {
  private readonly diag = inject(DiagnosticoService);
  private readonly conexion = inject(ConnectionStateService);
  private readonly avisos = inject(ToastService);

  readonly midiendo = this.diag.midiendo;
  readonly tramas = this.diag.tramas;
  readonly latidos = this.diag.latidos;
  readonly ciclos = this.diag.ciclos;
  readonly esperando = this.diag.esperandoReconexion;
  readonly conectado = computed(() => this.conexion.estado() === 'CONNECTED');
  readonly cadencia = computed(() => resumenDeCadencia(this.diag.cadencia()));
  readonly cadenciaDelAnalizador = computed(
    () => resumenDeCadencia(this.diag.cadenciaDelAnalizador()),
  );

  iniciar(): void { this.diag.iniciar(); }
  detener(): void { this.diag.detener(); }
  marcarRed(): void { this.diag.marcarRedRestablecida(); }

  async copiarMarkdown(): Promise<void> {
    const { markdown } = await this.diag.informeEnTexto();
    await this.copiar(markdown);
  }

  async copiarJson(): Promise<void> {
    const { json } = await this.diag.informeEnTexto();
    await this.copiar(json);
  }

  private async copiar(texto: string): Promise<void> {
    // Al portapapeles y no a un fichero: dentro de la aplicación empaquetada no
    // hay carpeta de descargas a la que se pueda llegar sin salir a un
    // explorador de ficheros.
    try {
      await navigator.clipboard.writeText(texto);
      this.avisos.ok('Informe copiado al portapapeles.');
    } catch {
      this.avisos.error('No se pudo copiar. El sistema no dio permiso al portapapeles.');
    }
  }
}
