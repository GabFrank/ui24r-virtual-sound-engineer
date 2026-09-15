import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { BandMember, BandMemberId, ChannelProfileType } from '@vse/domain';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BandService } from '../core/band.service';
import { MixerService } from '../core/mixer.service';
import { SesionService } from '../core/sesion.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent,
  PageHeaderComponent, ToastService,
} from '../ui';
import {
  avisoDePerfilDeAsignacion, instrumentoElegido, instrumentosDeIntegrante,
  opcionesDeIntegrantes, valorDelInstrumento, type OpcionDeInstrumento,
} from './asignar-instrumento';

/** Una fila ya resuelta: la plantilla no calcula nada. */
interface FilaDeCanal {
  readonly indice: number;
  readonly nombre: string;
  /** Quién toca en este canal. Cadena vacía cuando no hay nadie elegido. */
  readonly integranteId: string;
  /** Qué opción de instrumento está puesta. Cadena vacía cuando ninguna. */
  readonly instrumentoValor: string;
  readonly instrumentos: readonly OpcionDeInstrumento[];
  /** Por qué no hay instrumentos que ofrecer, con qué hacer al respecto. */
  readonly porQueVacio: string | null;
  readonly tipo: ChannelProfileType | '';
  readonly tipoNombre: string;
  /** Por qué el perfil no se pudo traer del instrumento. */
  readonly sinPerfilPorque: string | null;
  readonly margen: string;
  readonly enVivo: boolean;
  readonly asignado: boolean;
}

/**
 * Asignación de canales: qué entrada de la consola es qué instrumento, y de
 * quién.
 *
 * **El instrumento se elige entre los que toca esa persona**, y de ahí sale el
 * perfil de canal. Antes el perfil se elegía a mano de una lista de trece
 * nombres nuestros —«Voz de acompañamiento», «Reproducción»—; ahora se elige
 * «Ana» y «guitarra de nylon, base», que es vocabulario del usuario, y el
 * perfil viene solo. Eso es lo que hace que cargar los instrumentos en
 * Perfiles → Banda sirva para algo.
 *
 * El desplegable de perfil **no desaparece**. Sigue siendo la salida para los
 * cuatro casos en los que el instrumento no puede traer nada: la banda sin
 * integrantes cargados, el canal sin integrante, el integrante sin instrumentos
 * y las fuentes que a propósito no tienen perfil —djembe y bombo—. En todos, la
 * pantalla dice qué pasa y qué hacer, y se sigue pudiendo asignar a mano igual
 * que antes.
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
    FormsModule, BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Canales"
        [descripcion]="resumen()">
        <ui-button variante="secundario" icono="canales"
                   [deshabilitado]="filas().length === 0 || !hayBanda()"
                   (pulsado)="autoasignar()">Proponer todos</ui-button>
      </ui-page-header>

      @if (!hayBanda()) {
        <!-- La asignación pertenece a la banda de la sesión: sin sesión abierta
             no hay dónde guardarla. Antes la pantalla dejaba asignar igual y
             se perdía todo en silencio. -->
        <ui-empty icono="sesion" titulo="No hay ninguna sesión abierta"
          detalle="La asignación de canales pertenece a la banda de la sesión. Abrí una sesión y la asignación queda guardada con ella.">
          <ui-button variante="primario" icono="adelante" (pulsado)="irASesion()">
            Ir a Sesión
          </ui-button>
        </ui-empty>
      } @else if (filas().length === 0) {
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
                <th scope="col" class="izq">Entrada</th>
                <th scope="col" class="izq">Nombre en consola</th>
                <th scope="col" class="izq">Quién</th>
                <th scope="col" class="izq">Instrumento</th>
                <th scope="col" class="izq">Perfil de canal</th>
                <th scope="col" class="num">Margen objetivo</th>
                <th scope="col">En vivo</th>
              </tr>
            </thead>
            <tbody>
              @for (f of filas(); track f.indice) {
                <tr [class.asignado]="f.asignado">
                  <td class="izq"><span class="idx num">{{ f.indice }}</span></td>
                  <td class="izq">{{ f.nombre }}</td>
                  <td class="izq">
                    <select class="quien" [ngModel]="f.integranteId"
                            [attr.aria-label]="'quién toca en el canal ' + f.indice"
                            (ngModelChange)="cambiarIntegrante(f.indice, $event)">
                      <option value="">Nadie</option>
                      @for (m of integrantesElegibles(); track m.id) {
                        <option [value]="m.id">{{ m.nombre }}</option>
                      }
                    </select>
                  </td>
                  <td class="izq">
                    @if (f.instrumentos.length > 0) {
                      <select [ngModel]="f.instrumentoValor"
                              [attr.aria-label]="'instrumento del canal ' + f.indice"
                              (ngModelChange)="cambiarInstrumento(f.indice, $event)">
                        <option value="">Sin elegir</option>
                        @for (i of f.instrumentos; track i.valor) {
                          <option [value]="i.valor">{{ i.texto }}</option>
                        }
                      </select>
                    } @else if (f.porQueVacio) {
                      <p class="nota">{{ f.porQueVacio }}</p>
                    }
                  </td>
                  <td class="izq">
                    <!-- ngModel y no [value]: el enlace de propiedad sobre el
                         select se aplica antes de que existan las opciones que
                         genera el @for de dentro, así que no hacía nada y no
                         se reintentaba nunca. La pantalla mostraba «Sin
                         asignar» sobre canales que sí estaban asignados,
                         contradiciendo a su propio encabezado. -->
                    <select [ngModel]="f.tipo" [attr.aria-label]="'perfil del canal ' + f.indice"
                            (ngModelChange)="cambiarTipo(f.indice, f.nombre, $event)">
                      <option value="">Sin asignar</option>
                      @for (p of perfiles; track p.id) {
                        <option [value]="p.type">{{ p.nombre }}</option>
                      }
                    </select>
                    @if (f.sinPerfilPorque; as porque) {
                      <div class="sin-perfil">
                        <ui-badge tono="aviso">Sin perfil</ui-badge>
                        <p class="nota">{{ porque }}</p>
                      </div>
                    }
                  </td>
                  <td class="num">{{ f.margen }}</td>
                  <td>
                    <!-- El area pulsable abarca la etiqueta, no solo la
                         casilla: 22 pixeles es el objetivo mas dificil de
                         acertar de toda la aplicacion, y decide si una fuente
                         real se sustituye por una pista grabada. -->
                    <label class="envivo-celda">
                      <input type="checkbox" [checked]="f.enVivo" [disabled]="!f.asignado"
                             (change)="cambiarEnVivo(f.indice, $event)"
                             [attr.aria-label]="'canal ' + f.indice + ' en vivo'" />
                    </label>
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
                <div class="campo">
                  <span class="rotulo">Quién</span>
                  <select [ngModel]="f.integranteId"
                          [attr.aria-label]="'quién toca en el canal ' + f.indice"
                          (ngModelChange)="cambiarIntegrante(f.indice, $event)">
                    <option value="">Nadie</option>
                    @for (m of integrantesElegibles(); track m.id) {
                      <option [value]="m.id">{{ m.nombre }}</option>
                    }
                  </select>
                </div>

                <div class="campo">
                  <span class="rotulo">Instrumento</span>
                  @if (f.instrumentos.length > 0) {
                    <select [ngModel]="f.instrumentoValor"
                            [attr.aria-label]="'instrumento del canal ' + f.indice"
                            (ngModelChange)="cambiarInstrumento(f.indice, $event)">
                      <option value="">Sin elegir</option>
                      @for (i of f.instrumentos; track i.valor) {
                        <option [value]="i.valor">{{ i.texto }}</option>
                      }
                    </select>
                  } @else if (f.porQueVacio) {
                    <p class="nota">{{ f.porQueVacio }}</p>
                  }
                </div>

                <div class="campo">
                  <span class="rotulo">Perfil de canal</span>
                  <select [ngModel]="f.tipo" [attr.aria-label]="'perfil del canal ' + f.indice"
                          (ngModelChange)="cambiarTipo(f.indice, f.nombre, $event)">
                    <option value="">Sin asignar</option>
                    @for (p of perfiles; track p.id) {
                      <option [value]="p.type">{{ p.nombre }}</option>
                    }
                  </select>
                  @if (f.sinPerfilPorque; as porque) {
                    <div class="sin-perfil">
                      <ui-badge tono="aviso">Sin perfil</ui-badge>
                      <p class="nota">{{ porque }}</p>
                    </div>
                  }
                </div>

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
    th, td { text-align: center; padding: var(--sp-3); border-bottom: 1px solid var(--line);
             vertical-align: top; }
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
    /* Los nombres de persona son cortos y son tres desplegables en la misma
       fila: sin esto, la tabla obliga a desplazarse de lado en una tablet
       entera solo para llegar a «En vivo».

       ESTE ANCHO LE PONE UN LIMITE AL TEXTO DE LA OPCION FIJA, y hay que
       decirlo acá porque el que edite la plantilla no va a venir a leer el CSS.
       De los 130 px, el recuadro del texto se queda con unos 84: doce de relleno
       a cada lado, uno de borde a cada lado, y la flecha del desplegable. A 15
       px eso son unas once letras. Decía «Sin integrante», que son catorce, y en
       la tablet se leía «Sin integrant» — el usuario ve que nadie miró, justo
       antes de que la aplicación le pida confiar en números que él no puede
       comprobar. Hay un test que fija el límite en ocho. */
    select.quien { min-width: 130px; }

    input[type=checkbox] { width: 24px; height: 24px; accent-color: var(--signal); }
    .envivo-celda {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: var(--tap-min); min-height: var(--tap-min);
      cursor: pointer;
    }

    /* La explicación de por qué no hay instrumentos o por qué no hay perfil.
       Se limita el ancho porque son frases, no etiquetas: a todo el ancho de
       una celda de tabla el ojo pierde el renglón. */
    .nota {
      margin-top: var(--sp-2);
      max-width: 34ch;
      color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
      text-align: left;
    }
    .sin-perfil { display: flex; flex-direction: column; align-items: flex-start; }

    .aviso {
      margin-bottom: var(--sp-4); padding: var(--sp-3);
      border-left: 2px solid var(--warn); color: var(--muted);
      font-size: var(--txt-sm); line-height: var(--alto-linea);
    }
    .dato { color: var(--muted); font-size: var(--txt-sm); }
    .campo { display: flex; flex-direction: column; gap: var(--sp-1); }
    .rotulo { color: var(--muted); font-size: var(--txt-xs); }
    .envivo {
      display: flex; align-items: center; gap: var(--sp-2);
      font-size: var(--txt-sm);
      min-height: var(--tap-min); padding: 0 var(--sp-2);
      cursor: pointer;
    }

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
  private readonly avisos = inject(ToastService);
  private readonly router = inject(Router);

  /** Sin banda cargada no hay dónde guardar la asignación. */
  readonly hayBanda = computed(() => this.banda.banda() !== null);

  readonly perfiles = this.banda.perfiles;

  private readonly integrantes = computed<readonly BandMember[]>(
    () => this.banda.banda()?.integrantes ?? []);

  readonly integrantesElegibles = computed(() => opcionesDeIntegrantes(this.integrantes()));

  /**
   * Quién se eligió en un canal que todavía no tiene asignación.
   *
   * Elegir a la persona no crea la asignación, y por eso hace falta guardarlo
   * en algún sitio hasta que haya algo que guardar. Crearla en ese momento
   * obligaría a inventarle un instrumento y un perfil que el usuario no eligió,
   * y dejaría el canal contado como «asignado» —y la casilla de «en vivo»
   * habilitada— con un perfil que no describe nada. Es exactamente el relleno
   * que «Proponer todos» dejó de hacer.
   */
  private readonly integranteTentativo = signal<Readonly<Record<number, BandMemberId>>>({});

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
    const integrantes = this.integrantes();
    const tentativos = this.integranteTentativo();
    const asignaciones = this.banda.asignaciones();
    return this.mixer.canales().map((c) => {
      const a = asignaciones.find((x) => x.ui24rInputIndex === c.indice);
      // Manda lo guardado: la asignación es la verdad, y lo tentativo solo
      // existe mientras no hay ninguna.
      const quien = a?.bandMemberId ?? tentativos[c.indice] ?? null;
      const { opciones, porQueVacio } = instrumentosDeIntegrante(integrantes, quien);
      const comun = {
        indice: c.indice,
        nombre: c.nombre,
        integranteId: quien ?? '',
        instrumentoValor: valorDelInstrumento(integrantes, a, quien),
        instrumentos: opciones,
        porQueVacio,
      };
      if (a === undefined) {
        return {
          ...comun, tipo: '' as const, tipoNombre: '', sinPerfilPorque: null,
          margen: '—', enVivo: false, asignado: false,
        };
      }
      const perfil = this.banda.perfilDe(a);
      return {
        ...comun,
        tipo: perfil.type,
        tipoNombre: perfil.nombre,
        sinPerfilPorque: avisoDePerfilDeAsignacion(a, perfil.type),
        margen: `${perfil.margenObjetivoDb} dB`,
        enVivo: a.isLive,
        asignado: true,
      };
    });
  });

  readonly resumen = computed(() => {
    const total = this.filas().length;
    const puestos = this.filas().filter((f) => f.asignado).length;
    return `${puestos} de ${total} asignados. Elegí quién toca cada canal y con qué: el perfil `
      + 'sale del instrumento. Marcá «en vivo» los canales que llevan una fuente real durante '
      + 'el show: sirve de protección al activar el modo de reproducción, que sustituye las '
      + 'entradas por pistas grabadas.';
  });

  irASesion(): void { void this.router.navigate(['/sesion']); }

  /**
   * Cambia quién toca en el canal.
   *
   * Si el canal ya está asignado se guarda; si no, se recuerda para poder
   * ofrecerle sus instrumentos, y se guardará con la asignación cuando la haya.
   *
   * No se borra el instrumento que el canal ya tenía. Cambiar de persona no
   * dice que el canal deje de ser un micrófono de voz principal —muchas veces
   * es justo lo contrario, alguien reemplaza a otro en el mismo canal— y borrar
   * el perfil obligaría a rehacer trabajo que estaba bien. Si el instrumento
   * guardado no está entre los de la persona nueva, el desplegable queda sin
   * elegir y se ve.
   */
  cambiarIntegrante(indice: number, valor: string): void {
    const id = valor === '' ? null : (valor as BandMemberId);
    this.integranteTentativo.update((m) => {
      const copia: Record<number, BandMemberId> = { ...m };
      if (id === null) delete copia[indice]; else copia[indice] = id;
      return copia;
    });

    const a = this.banda.asignacionDe(indice);
    if (a === undefined) return;
    void this.banda.asignar(indice, {
      instrumento: a.instrumento,
      tipo: this.banda.perfilDe(a).type,
      nombreEnConsola: a.nombreEnConsola,
      isLive: a.isLive,
      bandMemberId: id,
    });
  }

  /**
   * Elige el instrumento entre los que toca esa persona, y trae su perfil.
   *
   * Es el camino que reemplaza a elegir el perfil a mano. Cuando la fuente no
   * tiene perfil —djembe, bombo— se guarda «Personalizado» y la fila explica
   * por qué; lo que no se hace es dejar puesto el perfil anterior, que describía
   * otro instrumento.
   */
  cambiarInstrumento(indice: number, valor: string): void {
    const fila = this.filas().find((f) => f.indice === indice);
    if (fila === undefined) return;
    const quien = fila.integranteId === '' ? null : (fila.integranteId as BandMemberId);

    if (valor === '') {
      // Se quita el instrumento, no el canal: el perfil y la marca de «en vivo»
      // siguen donde estaban, y la etiqueta vuelve a ser el nombre que el canal
      // tiene en la consola, que es de donde salía antes de que alguien
      // eligiera.
      const a = this.banda.asignacionDe(indice);
      if (a === undefined) return;
      void this.banda.asignar(indice, {
        instrumento: a.nombreEnConsola,
        instrumentoDetalle: null,
        tipo: this.banda.perfilDe(a).type,
        nombreEnConsola: a.nombreEnConsola,
        isLive: a.isLive,
      });
      return;
    }

    const elegido = instrumentoElegido(this.integrantes(), quien, valor);
    if (elegido === null) return;
    void this.banda.asignar(indice, {
      instrumento: elegido.etiqueta,
      instrumentoDetalle: elegido.instrumento,
      tipo: elegido.tipo,
      nombreEnConsola: fila.nombre,
      isLive: fila.enVivo,
      bandMemberId: quien,
    });
  }

  /**
   * Elige el perfil a mano.
   *
   * Sigue existiendo, y es la salida de todos los casos en que el instrumento
   * no puede traer uno. No toca ni al integrante ni al instrumento: `asignar()`
   * conserva lo que no se le pasa.
   */
  cambiarTipo(indice: number, nombre: string, valor: string): void {
    if (valor === '') {
      void this.banda.quitar(indice);
      return;
    }
    const previa = this.banda.asignacionDe(indice);
    void this.banda.asignar(indice, {
      instrumento: previa?.instrumento ?? nombre,
      tipo: valor as ChannelProfileType,
      nombreEnConsola: nombre,
      isLive: previa?.isLive ?? false,
      bandMemberId: previa?.bandMemberId ?? this.integranteTentativo()[indice] ?? null,
    });
  }

  cambiarEnVivo(indice: number, ev: Event): void {
    const a = this.banda.asignacionDe(indice);
    if (a === undefined) return;
    void this.banda.asignar(indice, {
      instrumento: a.instrumento,
      tipo: this.banda.perfilDe(a).type,
      nombreEnConsola: a.nombreEnConsola,
      isLive: (ev.target as HTMLInputElement).checked,
    });
  }

  /**
   * Propone un tipo para cada canal sin asignar, a partir del nombre que ya
   * tiene en la consola.
   *
   * Informa el resultado siempre. Antes, si no reconocía ningún nombre, el
   * botón principal de la pantalla no hacía nada visible y no había forma de
   * saber si había funcionado.
   */
  async autoasignar(): Promise<void> {
    const pendientes = this.filas().filter((f) => !f.asignado);
    let puestos = 0;
    for (const f of pendientes) {
      const tipo = this.banda.sugerirTipo(f.nombre);
      if (tipo === null) continue;
      await this.banda.asignar(f.indice, {
        instrumento: f.nombre,
        tipo,
        nombreEnConsola: f.nombre,
        isLive: false,
        // Si ya se había elegido a alguien para ese canal, la propuesta no lo
        // pierde: es lo único que el usuario había dicho de ese canal.
        bandMemberId: this.integranteTentativo()[f.indice] ?? null,
      });
      puestos++;
    }

    if (pendientes.length === 0) {
      this.avisos.mostrar('Todos los canales ya estaban asignados.');
    } else if (puestos === 0) {
      this.avisos.mostrar(
        `No se reconoció ninguno de los ${pendientes.length} nombres. Asignalos a mano.`,
        'aviso',
      );
    } else if (puestos < pendientes.length) {
      this.avisos.ok(
        `Se propusieron ${puestos} de ${pendientes.length}. ` +
        'Los demás no se reconocieron por el nombre.',
      );
    } else {
      this.avisos.ok(`Se propusieron los ${puestos} canales pendientes.`);
    }
  }
}
