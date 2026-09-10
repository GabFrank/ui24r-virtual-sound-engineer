import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { REDUCCION_RELEVANTE_DB } from '@vse/assistants';
import { VERIFICADO_CONTRA_CONSOLA, type EstadoCanal } from '@vse/mixer-adapter';
import { ConnectionStateService } from '../core/connection.state';
import { MixerService } from '../core/mixer.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, PageHeaderComponent,
} from '../ui';
import { LevelMeterComponent } from './level-meter.component';
import { PISO_DB } from './escala-medidor';

/**
 * Por debajo de este pico el margen se marca como escaso.
 *
 * Seis decibeles es lo que hace falta para que un golpe más fuerte de lo
 * esperado no llegue al fondo de escala. Es un umbral de aviso, no de rechazo:
 * la aplicación no escribe nada acá.
 */
/**
 * Lo que precede a un número que sale de una curva sin medir.
 *
 * El nivel y el pico vienen de los medidores de la consola: son medidas. La
 * ganancia y el fader salen de convertir un valor de 0 a 1. Van en la misma
 * tabla, así que sin distinguirlos se leen como si tuvieran la misma
 * procedencia.
 *
 * **Ahora depende de si la curva se midió, y desde el 2026-09-08 se midió.** El
 * fader y la ganancia usan las conversiones que la propia consola sirve en su
 * `mixer.html`, así que el número que muestra la aplicación es el mismo que
 * muestra la consola. Seguir anteponiendo «≈» diría que es una estimación
 * cuando ya no lo es, y una marca que miente en un sentido es tan mala como la
 * que falta en el otro: enseña a ignorarla.
 *
 * Sigue siendo una constante y no se borra el mecanismo: si alguien vuelve
 * `VERIFICADO_CONTRA_CONSOLA` a falso —otra consola, otro firmware— la marca
 * reaparece sola.
 *
 * Lo que esto **no** dice es que el número corresponda a un nivel digital real.
 * Eso lo mide SPK-P0.10b y no está medido; pero eso vale igual para el nivel y
 * el pico, que nunca llevaron marca.
 */
const MARCA_ESTIMADO = VERIFICADO_CONTRA_CONSOLA ? '' : '≈';

const MARGEN_ESCASO_DB = -6;

/**
 * Traduce una ruta del protocolo a algo que se pueda leer mezclando.
 *
 * No pretende ser exhaustiva: lo que no reconoce se dice tal cual, que sigue
 * siendo mejor que nada. Lo que sí evita es la ruta cruda para los casos
 * frecuentes.
 */
function describirRuta(path: string): string {
  const canal = /^i\.(\d+)\./.exec(path);
  if (canal !== null) {
    const n = canal[1];
    if (path.endsWith('.mix')) return `el fader del canal ${n}`;
    if (path.endsWith('.mute')) return `el silencio del canal ${n}`;
    if (path.includes('.aux.')) return `un envío de monitor del canal ${n}`;
    if (path.includes('.eq.')) return `la ecualización del canal ${n}`;
    return `el canal ${n}`;
  }
  if (path === 'm.mix') return 'el fader general';
  if (path === 'm.mute') return 'el silencio general';
  if (path === 'var.currentSnapshot') return 'la instantánea activa de la consola';
  if (path.startsWith('hw.')) return `la ganancia de entrada ${path.split('.')[1] ?? ''}`.trim();
  return path;
}

/** Una fila ya formateada: la plantilla no calcula nada. */
interface FilaDeTelemetria {
  readonly indice: number;
  readonly nombre: string;
  readonly silenciado: boolean;
  readonly nivelDb: number;
  readonly picoDb: number;
  readonly nivel: string;
  readonly pico: string;
  /** El mismo número que dibuja la barra de color de la consola. */
  readonly picoSalida: string;
  readonly margen: string;
  readonly margenEscaso: boolean;
  readonly ganancia: string;
  readonly fader: string;
  readonly clips: number;
  /** Si el nivel de arriba viene condicionado por proceso dinámico. */
  readonly condicionada: boolean;
  /** Qué lo condiciona, para la insignia que va junto al nivel. */
  readonly procesos: string;
}

/**
 * Reducción a partir de la cual se marca el canal.
 *
 * El mismo número que usa el asistente, y por la misma razón: es el escalón más
 * fino de la perilla de ganancia, así que por debajo de eso no cambia nada de
 * lo que se pueda hacer.
 */
const REDUCCION_VISIBLE_DB = REDUCCION_RELEVANTE_DB;

/**
 * Qué está condicionando el nivel de un canal, en corto.
 *
 * El compresor entra con su número —«Comp −9 dB» dice mucho más que «Comp»— y
 * solo cuando de verdad está actuando: un compresor puesto que no llega a su
 * umbral no condiciona nada, y marcarlo pondría una insignia en casi todos los
 * canales de cualquier show hasta que se dejen de mirar.
 *
 * DESCONOCIDO no lleva insignia acá. En esta pantalla la insignia afirma «este
 * número pasó por algo»; «no sé si pasó por algo» es otra afirmación y, si la
 * consola dejara de publicar esas claves, marcaría los veinticuatro canales
 * para siempre. Donde sí se dice es en el asistente de ganancia, que es donde
 * cambia una respuesta.
 */
function procesosDe(c: EstadoCanal): string {
  const partes: string[] = [];
  if (c.reduccionPicoDb >= REDUCCION_VISIBLE_DB) {
    partes.push(`Comp −${c.reduccionPicoDb.toFixed(0)} dB`);
  }
  if (c.dinamica.puerta === 'ACTIVO') partes.push('Puerta');
  if (c.dinamica.deesser === 'ACTIVO') partes.push('De-esser');
  return partes.join(' · ');
}

function db(v: number): string {
  // En el piso de la escala el medidor de la consola ya no distingue señal de
  // silencio, así que se dice «−∞» en vez de un número que no significa nada.
  //
  // El piso se importa, no se copia: era el único −80 escrito a mano que
  // quedaba, y el recorrido del medidor ya se movió una vez. Si vuelve a
  // moverse, esta función lo sigue sola en lugar de quedarse atrás en silencio.
  if (!Number.isFinite(v) || v <= PISO_DB) return '−∞';
  return v.toFixed(1);
}

/**
 * Telemetría por canal.
 *
 * Solo lectura: en esta versión la aplicación no escribe absolutamente nada en
 * la consola, y hay un test que lo verifica.
 */
@Component({
  selector: 'app-telemetry',
  standalone: true,
  imports: [
    LevelMeterComponent, BadgeComponent, ButtonComponent,
    CardComponent, EmptyStateComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      @if (avisoMasivo(); as aviso) {
        <div class="alerta" role="alert">
          <div>
            <strong>{{ aviso.titulo }}</strong>
            {{ aviso.detalle }}
            El estado local ya no es confiable hasta releerlo.
          </div>
          <div class="racimo">
            <ui-button variante="primario" icono="refrescar" [cargando]="releyendo()"
                       (pulsado)="releer()">Releer el estado</ui-button>
            <ui-button variante="sutil" (pulsado)="descartarMasivo()">Ahora no</ui-button>
          </div>
        </div>
      }

      @if (!conectado()) {
        <ui-page-header titulo="Consola"
          descripcion="Los medidores en vivo de la consola. Solo lectura." />
        <ui-empty icono="conectar" titulo="Sin conexión con la consola"
          detalle="La dirección y el botón de conectar están en Ajustes. Durante un show, la consola y la tablet van en un router dedicado: la red del lugar no se usa.">
          <ui-button variante="primario" icono="ajustes"
                     (pulsado)="irAAjustes()">Ir a Ajustes</ui-button>
        </ui-empty>
        @if (error(); as e) { <p class="error">{{ e }}</p> }
      } @else {
        <ui-page-header titulo="Consola" [descripcion]="resumen()">
          <!-- Si el estado confirmado vale o no decidía si se puede escribir
               (INV-017) y no se veía en ninguna pantalla. Sin esto, tras una
               avalancha el usuario quedaba sin poder escribir y sin nada que se
               lo dijera; y la comprobación de la relectura no tenía a qué
               mirar más que a la ausencia del cartel, que se apaga solo. -->
          <ui-badge [tono]="estadoConfirmado() ? 'ok' : 'aviso'" data-estado-confirmado>
            {{ estadoConfirmado() ? 'Estado confirmado' : 'Estado sin confirmar' }}
          </ui-badge>
          <ui-button variante="secundario" icono="refrescar"
                     (pulsado)="reiniciarPicos()">Reiniciar picos</ui-button>
        </ui-page-header>

        <div class="desplaza-x ancho">
          <table>
            <thead>
              <tr>
                <th scope="col" class="izq">Canal</th>
                <th scope="col" class="medidor">Nivel</th>
                <th scope="col" class="num">Actual</th>
                <th scope="col" class="num">Pico ent.</th>
                <th scope="col" class="num">Pico sal.</th>
                <th scope="col" class="num">Margen</th>
                <th scope="col" class="num">Ganancia</th>
                <th scope="col" class="num">Fader</th>
                <th scope="col" class="num">Clips</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.indice) {
                <tr [class.silenciado]="f.silenciado">
                  <td class="izq">
                    <span class="idx num">{{ f.indice }}</span>
                    {{ f.nombre }}
                    @if (f.silenciado) { <ui-badge tono="neutro">Mute</ui-badge> }
                  </td>
                  <td>
                    <app-level-meter [nivelDb]="f.nivelDb" [picoDb]="f.picoDb"
                                     [etiqueta]="'nivel de ' + f.nombre" />
                  </td>
                  <td class="num">{{ f.nivel }}</td>
                  <!-- La insignia va pegada al pico de entrada porque es ese
                       número el que está condicionado: el medidor de entrada de
                       esta consola está DESPUÉS del proceso dinámico. -->
                  <td class="num">
                    {{ f.pico }}
                    @if (f.condicionada) { <ui-badge tono="aviso">{{ f.procesos }}</ui-badge> }
                  </td>
                  <td class="num suave">{{ f.picoSalida }}</td>
                  <td class="num" [class.escaso]="f.margenEscaso">
                    {{ f.margen }}
                    @if (f.margenEscaso) { <ui-badge tono="aviso">Escaso</ui-badge> }
                  </td>
                  <td class="num">{{ f.ganancia }}</td>
                  <td class="num">{{ f.fader }}</td>
                  <td class="num" [class.hay]="f.clips > 0">
                    {{ f.clips }}
                    @if (f.clips > 0) { <ui-badge tono="peligro">Clips</ui-badge> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="angosto pila-sm">
          @for (f of filas(); track f.indice) {
            <ui-card class="sin-relleno">
              <div class="tarjeta-canal">
                <div class="fila1">
                  <span class="nombre"><span class="idx num">{{ f.indice }}</span> {{ f.nombre }}</span>
                  @if (f.silenciado) { <ui-badge tono="neutro">Mute</ui-badge> }
                  @if (f.clips > 0) { <ui-badge tono="peligro">{{ f.clips }} clips</ui-badge> }
                </div>
                <app-level-meter [nivelDb]="f.nivelDb" [picoDb]="f.picoDb"
                                 [etiqueta]="'nivel de ' + f.nombre" />
                <div class="fila2 num">
                  <span>Pico ent. {{ f.pico }}</span>
                  <span class="suave">Sal. {{ f.picoSalida }}</span>
                  <span [class.escaso]="f.margenEscaso">Margen {{ f.margen }}</span>
                  <span>Ganancia {{ f.ganancia }}</span>
                </div>
                @if (f.condicionada) {
                  <ui-badge tono="aviso">{{ f.procesos }}</ui-badge>
                }
              </div>
            </ui-card>
          }
        </div>

        @if (hayCondicionados()) {
          <p class="nota-estimado">
            Los canales marcados junto al pico de entrada tienen proceso
            actuando: el medidor de entrada de esta consola está después del
            compresor y de la puerta, así que en esas filas el número no es el
            de la fuente. «Comp −9 dB» quiere decir que el compresor le estaba
            sacando nueve decibeles al pico. Reiniciar picos también reinicia
            esa cuenta.
          </p>
        }

        @if (hayEstimaciones) {
          <p class="nota-estimado">
            La ganancia y el fader llevan «≈»: el rango de esos parámetros está
            confirmado, pero la curva que traduce el valor de la consola a
            decibeles todavía no se midió. El nivel y el pico sí son medidas.
          </p>
        }

        @if (externos().length > 0) {
          <ui-card class="externos" titulo="Cambios hechos desde otro dispositivo"
                   subtitulo="El protocolo no dice qué cliente los hizo: solo se puede distinguir un cambio propio de uno ajeno">
            <ul>
              @for (e of externos(); track e.cuando) {
                <li>{{ e.texto }}</li>
              }
            </ul>
          </ui-card>
        }
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    /* La salida es dato de contexto: el que decide la ganancia es el de
     * entrada, y dos cifras con el mismo peso invitan a mirar la que no es. */
    .suave { color: var(--muted); }

    .nota-estimado {
      color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
      margin: var(--sp-4) 0 0;
    }

    .alerta {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--sp-4); margin-bottom: var(--sp-4);
      padding: var(--sp-3) var(--sp-4);
      background: var(--warn-tenue);
      border: 1px solid var(--warn); border-radius: var(--radio-md);
      line-height: var(--alto-linea);
    }
    @include hasta($bp-telefono) { .alerta { flex-direction: column; align-items: flex-start; } }


    .error { color: var(--danger); }

    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: center; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: var(--peso-medio); font-size: var(--txt-sm); }
    .izq { text-align: left; }
    .medidor { width: 30%; min-width: 160px; }
    .idx { color: var(--signal); font-size: var(--txt-xs); margin-right: var(--sp-2); }
    tr.silenciado { color: var(--muted); }
    .escaso { color: var(--warn); }
    .hay { color: var(--danger); }

    .tarjeta-canal { display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-3); }
    .fila1 { display: flex; align-items: center; gap: var(--sp-2); }
    .nombre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fila2 { display: flex; gap: var(--sp-4); color: var(--muted); font-size: var(--txt-sm); }

    .externos { margin-top: var(--sp-5); }
    .externos ul { margin: 0; padding-left: var(--sp-4); }
    .externos li { font-size: var(--txt-sm); color: var(--ink-2); line-height: var(--alto-linea); }
    code { font-family: var(--mono); color: var(--muted); }

    .angosto { display: none; }
    @include hasta($bp-telefono) {
      .ancho { display: none; }
      .angosto { display: flex; }
    }
  `],
})
export class TelemetryComponent {
  private readonly mixer = inject(MixerService);
  private readonly conexion = inject(ConnectionStateService);
  private readonly router = inject(Router);

  /**
   * Los cambios ajenos, en palabras.
   *
   * Antes se mostraba la ruta cruda del protocolo y el valor con tres
   * decimales: «var.currentSnapshot pasó a 1.000». Ni la ruta ni el número
   * significan nada para quien está mezclando, y el valor crudo no tiene
   * unidad porque su escalado todavía no está verificado.
   */
  readonly externos = computed(() => this.mixer.cambiosExternos().map((e) => ({
    cuando: e.cuando,
    texto: `${describirRuta(e.parametro)} cambió`,
  })));
  readonly masivo = this.mixer.cambioMasivo;

  /**
   * Qué decirle al usuario que pasó.
   *
   * El texto decía siempre «probablemente alguien recuperó una instantánea»,
   * también cuando no había ninguna instantánea de por medio. La causa la
   * deduce ahora el almacén de estado, y es lo que decide qué conviene hacer:
   * ante un recall hay que releer, ante un arrastre de faders puede que no
   * haga falta.
   */
  readonly avisoMasivo = computed(() => {
    const ev = this.masivo();
    if (ev === null) return null;
    switch (ev.probableCausa) {
      case 'SNAPSHOT_RECALL':
        return {
          titulo: 'Alguien recuperó una instantánea en la consola.',
          detalle: 'Cambió la instantánea activa, así que cualquier parámetro pudo moverse.',
        };
      case 'GRUPO_DE_CANALES':
        return {
          titulo: 'Cambio masivo detectado en la consola.',
          detalle: `${ev.rutasAfectadas} canales cambiaron el mismo parámetro en menos de un ` +
            'segundo: parece un grupo de faders movido desde otro dispositivo.',
        };
      case 'DESCONOCIDA':
        return {
          titulo: 'Cambio masivo detectado en la consola.',
          detalle: `${ev.rutasAfectadas} parámetros cambiaron en menos de un segundo, y no se ` +
            'puede saber por qué desde el protocolo.',
        };
    }
  });
  readonly error = this.mixer.ultimoError;

  readonly conectado = computed(() => this.conexion.estado() !== 'DISCONNECTED');

  /**
   * Una sola señal calculada con todo formateado.
   *
   * Antes la plantilla llamaba a `formatearDb` dos veces por fila, más
   * `formatearMargen` y `margenEscaso`. Con doce canales y medidores que
   * llegan varias veces por segundo, eran cuarenta y ocho llamadas por ciclo
   * de detección de cambios, en la pantalla que más ciclos genera.
   */
  readonly filas = computed<readonly FilaDeTelemetria[]>(() =>
    this.mixer.canales().map((c) => {
    const procesos = procesosDe(c);
    return {
      indice: c.indice,
      nombre: c.nombre,
      silenciado: c.silenciado,
      nivelDb: c.nivelDb,
      picoDb: c.picoDb,
      nivel: db(c.nivelDb),
      pico: db(c.picoDb),
      picoSalida: db(c.picoSalidaDb),
      margen: !Number.isFinite(c.picoDb) || c.picoDb <= -80 ? '—' : (-c.picoDb).toFixed(1),
      margenEscaso: Number.isFinite(c.picoDb) && c.picoDb > MARGEN_ESCASO_DB,
      // El «≈» no es decoración. La ganancia y el fader salen de curvas que
      // ningún spike midió: el rango está confirmado, la forma del recorrido
      // entre 0 y 1 se supone. Mostrarlos como cifras exactas al lado del
      // nivel medido —que sí lo es— haría creer que tienen la misma
      // procedencia.
      // Sin lectura de la consola no hay ganancia que mostrar. Antes se
      // imprimía «≈-6», que es el extremo del rango: el peor valor posible
      // para equivocarse, y con la misma marca que una estimación real.
      ganancia: c.gainDb === null ? '—' : `${MARCA_ESTIMADO}${c.gainDb.toFixed(0)}`,
      fader: `${MARCA_ESTIMADO}${db(c.faderDb)}`,
      // El clip de la tira del canal es el de la SALIDA, que es lo que la
      // consola dibuja acá. El del previo tiene su propia fila.
      clips: c.saturacionesSalida,
      clipsPrevio: c.saturacionesPrevio,
      condicionada: procesos !== '',
      procesos,
    };
    }),
  );

  /** Si algún canal está mostrando el nivel condicionado por proceso. */
  readonly hayCondicionados = computed(() => this.filas().some((f) => f.condicionada));

  readonly resumen = computed(
    // «Después del proceso» no es un detalle de pie de página: es lo que hace
    // que un pico de entrada de −4 dB signifique una cosa u otra. Medido el
    // 2026-09-09: bajar el umbral del compresor mueve esta columna.
    () => `${this.filas().length} canales · entrada antes del fader y después del `
      + 'proceso dinámico, salida después del fader · '
      + 'solo lectura: esta versión no escribe nada en la consola',
  );

  /** Se apaga solo el día que SPK-P0.2a mida las curvas. */
  readonly hayEstimaciones = !VERIFICADO_CONTRA_CONSOLA;

  irAAjustes(): void { void this.router.navigate(['/ajustes']); }

  reiniciarPicos(): void { this.mixer.reiniciarPicos(); }

  descartarMasivo(): void { this.mixer.descartarCambioMasivo(); }

  readonly releyendo = this.mixer.releyendo;

  /** Si el estado local refleja la consola. Lo que INV-017 exige para escribir. */
  readonly estadoConfirmado = this.conexion.storeValido;

  releer(): void { void this.mixer.releerEstado(); }
}
