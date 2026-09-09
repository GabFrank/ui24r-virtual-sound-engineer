import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { REDUCCION_RELEVANTE_DB } from '@vse/assistants';
import type { ChannelAssignment } from '@vse/domain';
import { BandService } from '../core/band.service';
import { MixerService } from '../core/mixer.service';
import { SesionService } from '../core/sesion.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent,
  PageHeaderComponent, StatComponent, type TonoDeInsignia,
} from '../ui';
import { DURACION_CAPTURA_S, GainAssistantService } from './gain-assistant.service';
import { VERIFICADO_CONTRA_CONSOLA } from '@vse/mixer-adapter';

/** Una fila ya resuelta: la plantilla no calcula ni formatea nada. */
interface FilaDeGanancia {
  readonly asignacion: ChannelAssignment;
  readonly indice: number;
  readonly nombre: string;
  readonly medido: boolean;
  readonly pico: string;
  readonly margen: string;
  readonly objetivo: string;
  readonly ganancia: string;
  readonly delta: string;
  readonly sube: boolean;
  readonly baja: boolean;
  readonly confianza: string;
  readonly tonoConfianza: TonoDeInsignia;
  readonly accion: string;
  /** Si el nivel de este canal viene condicionado por proceso dinámico. */
  readonly condicionada: boolean;
  /** Qué lo condiciona, en corto, para la insignia que va junto al nivel. */
  readonly procesos: string;
}

const CONFIANZA: Readonly<Record<string, { texto: string; tono: TonoDeInsignia }>> = {
  HIGH: { texto: 'Alta', tono: 'ok' },
  MEDIUM: { texto: 'Media', tono: 'aviso' },
  LOW: { texto: 'Baja', tono: 'peligro' },
};

/** Lo que la pantalla necesita saber del proceso de un canal. */
interface ProcesoDeCanal {
  /** Reducción de pico redondeada a decibeles enteros. Cero si no comprime. */
  readonly comprimeDb: number;
  readonly puerta: boolean;
  readonly deesser: boolean;
}

const SIN_PROCESO: ProcesoDeCanal = { comprimeDb: 0, puerta: false, deesser: false };

/**
 * Igualdad de la tabla de procesos, para que los medidores no rehagan las filas.
 *
 * Las tramas de medidores llegan varias veces por segundo y traen la reducción
 * adentro. Sin esta comparación, la señal de procesos cambiaría de identidad en
 * cada trama y arrastraría el recálculo de `filas` —doce a veinticuatro filas
 * con seis formateos cada una— en la pantalla que ya tiene una cuenta regresiva
 * corriendo. Con ella, `filas` se rehace solo cuando de verdad cambia algo:
 * alguien puenteó un compresor, o la reducción cruzó un decibel entero.
 */
function mismosProcesos(
  a: ReadonlyMap<number, ProcesoDeCanal>,
  b: ReadonlyMap<number, ProcesoDeCanal>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [indice, x] of a) {
    const y = b.get(indice);
    if (y === undefined) return false;
    if (x.comprimeDb !== y.comprimeDb || x.puerta !== y.puerta || x.deesser !== y.deesser) {
      return false;
    }
  }
  return true;
}

/** La insignia que va junto al nivel. Cadena vacía si nada lo condiciona. */
function etiquetaDeProceso(p: ProcesoDeCanal): string {
  const partes: string[] = [];
  if (p.comprimeDb > 0) partes.push(`Comp −${p.comprimeDb} dB`);
  if (p.puerta) partes.push('Puerta');
  if (p.deesser) partes.push('De-esser');
  return partes.join(' · ');
}

/**
 * Asistente de ganancia.
 *
 * Muestra la recomendación con su porqué y su evidencia, nunca solo un número.
 * Y no aplica nada: en esta versión la aplicación no escribe en la consola, y
 * la pantalla lo dice en cada recomendación en vez de dejarlo en la
 * documentación.
 */
@Component({
  selector: 'app-gain',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent,
    PageHeaderComponent, StatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Ganancia"
        descripcion="Cuánto margen tiene cada canal antes de saturar. La aplicación propone; el cambio se aplica a mano en la consola." />

      @if (!permiteAjustar()) {
        <p class="aviso">
          La ganancia está congelada en este estado de la sesión. Se
          puede medir para ver cómo está, pero el ajuste corresponde a la
          configuración de canales: cambiarla después de grabar una toma haría
          que la toma dejara de representar al show.
        </p>
      }

      @if (filas().length === 0) {
        <ui-empty icono="canales" titulo="Todavía no hay canales asignados"
          detalle="Asigná al menos uno en Canales. Sin saber qué instrumento es, no hay margen objetivo con el que comparar." />
      } @else {
        @if (capturando()) {
          <ui-card class="acento captura">
            <p class="etiqueta">{{ tituloCaptura() }}</p>
            <p class="cuenta num">{{ segundos() }}</p>
            <p class="instruccion">{{ instruccion() }}</p>
            <ui-button variante="sutil" (pulsado)="cancelar()">Cancelar</ui-button>
          </ui-card>
        }

        <div class="desplaza-x ancho">
          <table>
            <thead>
              <tr>
                <th class="izq">Canal</th>
                <th class="num">Pico</th>
                <th class="num">Margen</th>
                <th class="num">Objetivo</th>
                <th class="num">Ganancia</th>
                <th class="num">Propuesta</th>
                <th>Confianza</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.indice) {
                <tr>
                  <td class="izq"><span class="idx num">{{ f.indice }}</span> {{ f.nombre }}</td>
                  @if (f.medido) {
                    <!-- La insignia va pegada al nivel y no en una nota al pie:
                         quien lee este pico tiene que ver en el mismo golpe de
                         vista que entre ese número y lo que va a escuchar hay
                         un compresor sacando decibeles. -->
                    <td class="num">
                      {{ f.pico }}
                      @if (f.condicionada) {
                        <ui-badge tono="aviso">{{ f.procesos }}</ui-badge>
                      }
                    </td>
                    <td class="num">{{ f.margen }}</td>
                    <td class="num">{{ f.objetivo }}</td>
                    <td class="num">{{ f.ganancia }}</td>
                    <td class="num propuesta" [class.sube]="f.sube" [class.baja]="f.baja">
                      {{ f.delta }}
                    </td>
                    <td><ui-badge [tono]="f.tonoConfianza">{{ f.confianza }}</ui-badge></td>
                  } @else {
                    <td class="num sin" colspan="6">
                      sin medir
                      @if (f.condicionada) {
                        <ui-badge tono="aviso">{{ f.procesos }}</ui-badge>
                      }
                    </td>
                  }
                  <td>
                    <ui-button variante="secundario" [deshabilitado]="capturando()"
                               (pulsado)="medir(f.asignacion)">{{ f.accion }}</ui-button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="angosto pila">
          @for (f of filas(); track f.indice) {
            <ui-card [titulo]="f.nombre" [subtitulo]="'Entrada ' + f.indice">
              <ui-button acciones variante="secundario" [deshabilitado]="capturando()"
                         (pulsado)="medir(f.asignacion)">{{ f.accion }}</ui-button>
              @if (f.medido) {
                <div class="numeros">
                  <ui-stat rotulo="Pico" [valor]="f.pico" unidad=" dB" />
                  <ui-stat rotulo="Margen" [valor]="f.margen" unidad=" dB" />
                  <ui-stat rotulo="Propuesta" [valor]="f.delta" unidad=" dB"
                           [tono]="f.baja ? 'aviso' : 'senal'" />
                </div>
                <div class="racimo-insignias">
                  @if (f.condicionada) {
                    <ui-badge tono="aviso">{{ f.procesos }}</ui-badge>
                  }
                  <ui-badge [tono]="f.tonoConfianza">Confianza {{ f.confianza }}</ui-badge>
                </div>
              } @else {
                <p class="sin">Sin medir.</p>
                @if (f.condicionada) {
                  <ui-badge tono="aviso">{{ f.procesos }}</ui-badge>
                }
              }
            </ui-card>
          }
        </div>

        @if (hayCondicionados()) {
          <p class="nota-estimado">
            Los canales marcados tienen proceso dinámico entre el previo y lo que
            se escucha. <strong>El pico y la propuesta son correctos igual</strong>:
            se miden antes del compresor, no en la columna que muestra la consola.
            Lo que cambia es el efecto: «Comp −9 dB» quiere decir que al subir la
            ganancia vas a escuchar bastante menos de lo que subiste, porque el
            compresor se come parte. Si querés el cambio entero, puenteá el
            compresor mientras ajustás.
          </p>
        }

        @if (gananciaEsEstimada) {
          <p class="nota-estimado">
            La ganancia actual que se lee de la consola es una estimación: su
            rango está confirmado, pero la curva que traduce el valor a
            decibeles todavía no se midió. La propuesta hereda esa suposición,
            así que conviene comprobar en la consola dónde queda la perilla.
          </p>
        }

        @for (r of recomendaciones(); track r.indice) {
          <ui-card class="recomendacion" [titulo]="r.nombre" subtitulo="Recomendación">
            <p class="razon">{{ r.propuesta.razon }}</p>
            @if (r.propuesta.avisos.length > 0) {
              <ul class="avisos">
                @for (av of r.propuesta.avisos; track av) { <li>{{ av }}</li> }
              </ul>
            }
            <p class="evidencia num">{{ r.evidencia }}</p>
            <p class="nota">
              Sin corrección de sala todavía: esta recomendación mira la señal
              del canal, no lo que se oye en el recinto. Aplicá el cambio a mano
              en la consola.
            </p>
          </ui-card>
        }
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    .aviso {
      margin-bottom: var(--sp-4); padding: var(--sp-3);
      border-left: 2px solid var(--warn); color: var(--muted);
      font-size: var(--txt-sm); line-height: var(--alto-linea);
    }

    .captura { text-align: center; margin-bottom: var(--sp-5); }
    .etiqueta { color: var(--muted); font-size: var(--txt-sm); }
    .cuenta { font-size: var(--txt-3xl); line-height: 1; color: var(--signal); margin: var(--sp-2) 0; }
    .instruccion { margin-bottom: var(--sp-4); font-size: var(--txt-lg); }

    table { border-collapse: collapse; width: 100%; margin-bottom: var(--sp-5); }
    th, td { text-align: center; padding: var(--sp-3); border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: var(--peso-medio); font-size: var(--txt-sm); }
    .izq { text-align: left; }
    .idx { color: var(--signal); font-size: var(--txt-xs); margin-right: var(--sp-2); }
    .sin { color: var(--muted); font-size: var(--txt-sm); }

    .nota-estimado {
      color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
      margin: var(--sp-4) 0 0;
    }
    .propuesta.sube { color: var(--ok); }
    .propuesta.baja { color: var(--warn); }

    .numeros {
      display: grid; gap: var(--sp-3);
      grid-template-columns: repeat(3, 1fr);
      margin-bottom: var(--sp-3);
    }

    .recomendacion { margin-top: var(--sp-4); }
    .razon { line-height: var(--alto-linea); }
    .racimo-insignias { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
    td ui-badge { margin-left: var(--sp-2); }
    .avisos { margin: var(--sp-3) 0 0; padding-left: var(--sp-4); color: var(--warn); }
    .avisos li { font-size: var(--txt-sm); line-height: var(--alto-linea); }
    .evidencia { margin-top: var(--sp-3); color: var(--muted); font-size: var(--txt-sm); }
    .nota { margin-top: var(--sp-2); color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }

    .angosto { display: none; }
    @include hasta($bp-telefono) {
      .ancho { display: none; }
      .angosto { display: flex; }
      .numeros { grid-template-columns: repeat(3, 1fr); }
    }
  `],
})
export class GainComponent {
  private readonly banda = inject(BandService);
  private readonly asistente = inject(GainAssistantService);
  private readonly sesion = inject(SesionService);
  private readonly mixer = inject(MixerService);

  /**
   * Qué proceso tiene puesto cada canal, **en vivo**.
   *
   * Se muestra antes de medir a propósito. Ver que un canal está comprimiendo
   * antes de gastar dieciocho segundos midiéndolo es la diferencia entre
   * puentear el compresor y medir una vez, o medir, leer que no hay propuesta,
   * puentear y medir de nuevo. Para alguien a tres minutos del show son
   * dieciocho segundos que valen.
   *
   * La reducción se redondea a decibeles enteros para que la comparación de
   * `mismosProcesos` sirva de algo: sin redondear, cambiaría en cada trama.
   */
  private readonly procesos = computed<ReadonlyMap<number, ProcesoDeCanal>>(
    () => new Map(this.mixer.canales().map((c) => [c.indice, {
      // El pico de reducción y no el instantáneo: la insignia tiene que seguir
      // ahí cuando el compresor suelta entre frase y frase. Se reinicia con los
      // demás picos.
      comprimeDb: c.reduccionPicoDb >= REDUCCION_RELEVANTE_DB
        ? Math.round(c.reduccionPicoDb)
        : 0,
      puerta: c.dinamica.puerta === 'ACTIVO',
      deesser: c.dinamica.deesser === 'ACTIVO',
    }])),
    { equal: mismosProcesos },
  );

  readonly resultados = this.asistente.resultados;

  /** La evidencia ya formateada: cuatro `toFixed` en la plantilla se
   *  reevaluaban en cada ciclo, con la cuenta regresiva corriendo. */
  /** Se apaga solo el día que SPK-P0.2a mida la curva de la ganancia. */
  readonly gananciaEsEstimada = !VERIFICADO_CONTRA_CONSOLA;

  readonly recomendaciones = computed(() => this.resultados().map((r) => ({
    indice: r.indice,
    nombre: r.nombre,
    propuesta: r.propuesta,
    evidencia:
      `Ventana de ${r.analisis.duracionS.toFixed(0)} s · ` +
      `${r.analisis.muestras} muestras con señal · ` +
      `variación de ${r.analisis.rangoDinamicoDb.toFixed(0)} dB · ` +
      `estabilidad ${r.analisis.estabilidadDb.toFixed(1)} dB`,
  })));
  readonly capturando = this.asistente.capturando;
  readonly segundos = this.asistente.segundosRestantes;

  /** INV-006: el preamplificador solo se escribe en configuración de canales. */
  readonly permiteAjustar = computed(() => {
    const estado = this.sesion.actual()?.sesion.state;
    return estado === undefined || estado === 'CHANNEL_SETUP';
  });

  /**
   * Una sola señal calculada con todo formateado.
   *
   * Antes la plantilla llamaba a cinco funciones por fila —`resultado`,
   * `margenObjetivo`, `delta`, `confianza`— y todas se reevaluaban en cada
   * ciclo de detección de cambios, con la cuenta regresiva actualizándose cada
   * segundo.
   */
  readonly filas = computed<readonly FilaDeGanancia[]>(() => {
    // Se lee la señal de resultados para que el cálculo se rehaga cuando
    // termina una captura: `resultadoDe` consulta el mismo estado pero no lo
    // declara como dependencia.
    this.asistente.resultados();
    const procesos = this.procesos();
    return this.banda.asignaciones().map((a) => {
      const indice = a.ui24rInputIndex as number;
      const perfil = this.banda.perfilDe(a);
      const r = this.asistente.resultadoDe(indice);
      const proceso = procesos.get(indice) ?? SIN_PROCESO;
      const etiqueta = etiquetaDeProceso(proceso);
      if (r === undefined) {
        return {
          asignacion: a, indice, nombre: a.nombreEnConsola, medido: false,
          pico: '—', margen: '—', objetivo: `${perfil.margenObjetivoDb}`,
          ganancia: '—', delta: '—', sube: false, baja: false,
          confianza: 'Sin datos', tonoConfianza: 'neutro' as TonoDeInsignia,
          accion: 'Medir',
          condicionada: etiqueta !== '', procesos: etiqueta,
        };
      }
      const db = r.propuesta.deltaDb;
      const conf = CONFIANZA[r.propuesta.confianza] ?? { texto: 'Sin datos', tono: 'neutro' as TonoDeInsignia };
      return {
        asignacion: a,
        indice,
        nombre: a.nombreEnConsola,
        medido: true,
        pico: r.analisis.picoDb.toFixed(1),
        margen: r.analisis.margenDb.toFixed(1),
        objetivo: `${perfil.margenObjetivoDb}`,
        // «—» y no un número: si la consola no dijo la ganancia, no hay
        // ganancia que mostrar. El delta sigue valiendo, porque sale del pico
        // medido y no de la ganancia.
        ganancia: r.propuesta.gainActualDb === null ? '—' : r.propuesta.gainActualDb.toFixed(0),
        delta: Math.abs(db) < 0.05 ? '—' : `${db > 0 ? '+' : ''}${db.toFixed(1)}`,
        sube: db > 0.05,
        baja: db < -0.05,
        confianza: conf.texto,
        tonoConfianza: conf.tono,
        accion: 'Repetir',
        // La insignia sale del estado **de ahora**, no del de la captura: si el
        // usuario puenteó el compresor después de medir, la insignia se apaga y
        // lo que queda es la recomendación vieja diciendo que hay que repetir.
        // Es lo correcto: el canal ya no está condicionado, la medición sí.
        condicionada: etiqueta !== '',
        procesos: etiqueta,
      };
    });
  });

  /** Si algún canal de la lista tiene proceso entre el previo y el parlante. */
  readonly hayCondicionados = computed(() => this.filas().some((f) => f.condicionada));

  readonly tituloCaptura = computed(() => {
    const i = this.asistente.canalEnCurso();
    const a = i === null ? undefined : this.banda.asignacionDe(i);
    return a?.nombreEnConsola ?? 'Capturando';
  });

  readonly instruccion = computed(() =>
    this.asistente.estado() === 'CUENTA_REGRESIVA'
      ? 'Preparate'
      : `Tocá o cantá la parte más fuerte que vayas a hacer en el show, durante ${DURACION_CAPTURA_S} segundos`,
  );

  medir(a: ChannelAssignment): void { void this.asistente.capturar(a); }

  cancelar(): void { this.asistente.cancelar(); }
}
