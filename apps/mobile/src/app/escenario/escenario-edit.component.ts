import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, viewChild,
  type OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  emplazar, makeId, validarNombre,
  type ElementoCaptacion, type ElementoFuente, type Emplazamiento, type Escenario,
  type EscenarioElementoId, type Fijeza, type PAComponentSpec, type PAProfile,
  type PatronPolar, type PuntoM, type VenueProfile, type VenueProfileId,
} from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  ButtonComponent, CardComponent, CargandoComponent, DialogComponent, EmptyStateComponent,
  FalloComponent, FieldComponent, Lectura, PageHeaderComponent, PuedeSalir, SalidaSinGuardar,
  SalirSinGuardarComponent, ToastService, intentarGuardar,
} from '../ui';
import { PlanoEscenarioComponent, type FichaMovida } from './plano-escenario.component';
import {
  aCentimetros, aplicarMovida, elDedoEsMasGruesoQueLaDuda, loQueLeFaltaAlMicrofono,
  loQueVaEnElPlano, type DimensionesDelLocal, type EstadoDelPlano,
} from './plano';

const FIJEZAS: readonly { id: Fijeza; etiqueta: string; ayuda: string }[] = [
  { id: 'FIJO', etiqueta: 'Fijo', ayuda: 'Colgado, atornillado o apoyado y nadie lo toca. No se mueve, pero se mide peor que algo que está al alcance de la mano.' },
  { id: 'EN_PIE', etiqueta: 'En un pie', ayuda: 'Se puede medir con cinta. Es la puesta que menos duda arrastra.' },
  { id: 'EN_MANO', etiqueta: 'En la mano', ayuda: 'Micrófono de mano o inalámbrico encima de alguien: se mueve medio metro mientras se canta.' },
];

const PATRONES: readonly { id: PatronPolar; etiqueta: string }[] = [
  { id: 'CARDIOIDE', etiqueta: 'Cardioide' },
  { id: 'SUPERCARDIOIDE', etiqueta: 'Supercardioide' },
  { id: 'HIPERCARDIOIDE', etiqueta: 'Hipercardioide' },
  { id: 'OMNI', etiqueta: 'Omnidireccional' },
  { id: 'BIDIRECCIONAL', etiqueta: 'Bidireccional' },
  { id: 'DESCONOCIDO', etiqueta: 'No lo sé todavía' },
];

/**
 * El escenario: poner cada cosa en el plano del local.
 *
 * **Sin dimensiones del local no hay plano, y no se inventa uno.** Es la única
 * puerta cerrada de esta pantalla: dibujar una sala de medidas supuestas y
 * dejar que alguien arrastre cosas adentro produciría un escenario entero de
 * datos falsos que después van a contradecir al analizador sin que nadie sepa
 * por qué. Se manda a cargarlas, que es una pantalla de tres campos.
 *
 * **La precisión del arrastre se dice, no se finge.** La aplicación acepta
 * centímetros porque el usuario los sabe para algunas cosas, pero un dedo sobre
 * un plano de sala chica vale casi un metro. Cuando el dedo es más grueso que
 * la duda ya cargada de un elemento, la pantalla lo marca y ofrece escribir los
 * números: arrastrarlo ahí **empeora** el dato.
 */
@Component({
  selector: 'app-escenario-edit',
  standalone: true,
  imports: [
    ButtonComponent, CardComponent, CargandoComponent, DialogComponent, EmptyStateComponent,
    FalloComponent, FieldComponent, FormsModule, PageHeaderComponent, PlanoEscenarioComponent,
    SalirSinGuardarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Escenario"
        descripcion="Dónde está cada cosa y hacia dónde apunta. Sirve para diagnosticar qué monitor está acoplando con qué micrófono, y para estimar qué se filtra en qué.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
        <ui-button variante="primario" icono="guardar" (pulsado)="guardar()">Guardar</ui-button>
      </ui-page-header>

      @if (lectura.problema(); as p) {
        <ui-fallo [mensaje]="p" (reintentar)="recargar()" />
      } @else if (lectura.cargando()) {
        <ui-cargando texto="Leyendo el local" />
      } @else if (local() === null) {
        <ui-empty icono="error" titulo="Ese local ya no existe" />
      } @else if (dimensiones() === null) {
        <ui-empty icono="local" titulo="Falta el tamaño del local"
                  detalle="Sin largo, ancho y alto no hay plano sobre el que poner nada. Son tres números en la ficha del local; si no los tenés medidos, una estimación a ojo es peor que nada: el escenario entero saldría corrido.">
          <ui-button variante="primario" (pulsado)="irAlLocal()">Cargar el tamaño</ui-button>
        </ui-empty>
      } @else {
        <div class="tablero">
          <ui-card titulo="Plano" [subtitulo]="subtituloDelPlano()">
            <app-plano-escenario
              [fichas]="plano().fichas"
              [dimensiones]="dimensiones()!"
              [seleccionada]="seleccionada()"
              (movida)="alMover($event)"
              (elegida)="seleccionada.set($event === '' ? null : $event)" />
          </ui-card>

          <div class="pila-lg">
            <ui-card titulo="Agregar">
              <div class="pila">
                <ui-field rotulo="Nombre" idControl="esc-nuevo">
                  <input id="esc-nuevo" type="text" [(ngModel)]="nuevoNombre"
                         placeholder="Voz de Ana, cuña del bajo, amplificador" />
                </ui-field>
                <div class="fila">
                  <ui-button variante="secundario" icono="mas" [deshabilitado]="errorNuevo() !== null"
                             (pulsado)="agregar('FUENTE')">Fuente</ui-button>
                  <ui-button variante="secundario" icono="mas" [deshabilitado]="errorNuevo() !== null"
                             (pulsado)="agregar('CAPTACION')">Micrófono</ui-button>
                </div>
                @if (errorNuevo(); as e) { <p class="aviso">{{ e }}</p> }
                <p class="nota">
                  Lo que se acopla es el micrófono, no el instrumento. Un amplificador de
                  guitarra es una fuente; lo que el monitor realimenta es el micrófono que
                  tiene delante.
                </p>
              </div>
            </ui-card>

            @if (pa() === null) {
              <ui-card titulo="Sin sistema de amplificación">
                <p class="nota">
                  Este local no tiene perfil de amplificación cargado, así que el plano no
                  muestra ninguna caja ni ningún monitor. No es que no haya: es que la
                  aplicación no sabe cuáles son.
                </p>
              </ui-card>
            }

            @if (perdidos().length > 0) {
              <ui-card titulo="Fuera del plano" [subtitulo]="perdidos().length + ' sin dibujar'">
                <div class="pila">
                  @for (f of perdidos(); track f.id) {
                    <div class="fila entre">
                      <span>{{ f.etiqueta }}</span>
                      <ui-button variante="sutil" (pulsado)="rescatar(f.id)">Traer al plano</ui-button>
                    </div>
                  }
                  <p class="nota">
                    Sus coordenadas caen fuera de las paredes, así que no se dibujan y no se
                    pueden tocar. Pasa al achicar el local después de cargar el escenario.
                  </p>
                </div>
              </ui-card>
            }

            @if (sinUbicar().length > 0) {
              <ui-card titulo="Falta ubicarlos"
                       [subtitulo]="sinUbicar().length + ' del sistema de amplificación'">
                <div class="pila">
                  @for (c of sinUbicar(); track c.nombre) {
                    <div class="fila entre">
                      <span>{{ c.nombre }}</span>
                      <ui-button variante="sutil" icono="mas" (pulsado)="ubicar(c)">Poner en el plano</ui-button>
                    </div>
                  }
                  <p class="nota">
                    Mientras no estén, quedan fuera del análisis. No desaparecen en silencio
                    justamente porque un monitor sin ubicar es la explicación más probable de
                    que la geometría y el analizador se contradigan.
                  </p>
                </div>
              </ui-card>
            }

            @if (noRadian().length > 0) {
              <ui-card titulo="No hace falta ubicarlos">
                <div class="pila">
                  @for (c of noRadian(); track c.nombre) { <span>{{ c.nombre }}</span> }
                  <p class="nota">No suenan en la sala, así que no pueden realimentar ningún micrófono.</p>
                </div>
              </ui-card>
            }

            @if (elegido(); as el) {
              <ui-card [titulo]="el.etiqueta" [subtitulo]="el.detalle">
                <div class="pila">
                  @if (avisoDeSinUbicar(); as a) { <p class="aviso">{{ a }}</p> }
                  @if (avisoDePrecision(); as a) { <p class="aviso">{{ a }}</p> }
                  @if (avisoDeFueraDelPlano(); as a) { <p class="aviso">{{ a }}</p> }
                  @if (avisoDelMicrofono(); as a) { <p class="aviso">{{ a }}</p> }

                  <div class="fila">
                    <ui-field rotulo="Cruce (m)" idControl="esc-x" ayuda="Desde la esquina izquierda.">
                      <input id="esc-x" inputmode="decimal" [ngModel]="campoX()" (ngModelChange)="fijarX($event)" />
                    </ui-field>
                    <ui-field rotulo="Fondo (m)" idControl="esc-y" ayuda="Desde el borde del escenario hacia el público.">
                      <input id="esc-y" inputmode="decimal" [ngModel]="campoY()" (ngModelChange)="fijarY($event)" />
                    </ui-field>
                    <ui-field rotulo="Altura (m)" idControl="esc-z" ayuda="No se puede arrastrar: un plano se mira desde arriba.">
                      <input id="esc-z" inputmode="decimal" [ngModel]="campoZ()" (ngModelChange)="fijarZ($event)" />
                    </ui-field>
                  </div>

                  <ui-field rotulo="Cómo está puesto" idControl="esc-fijeza" [ayuda]="ayudaDeFijeza()">
                    <select id="esc-fijeza" [ngModel]="campoFijeza()" (ngModelChange)="fijarFijeza($event)">
                      @for (f of fijezas; track f.id) { <option [value]="f.id">{{ f.etiqueta }}</option> }
                    </select>
                  </ui-field>

                  <ui-field rotulo="Duda de la posición (cm)" idControl="esc-duda"
                            ayuda="Sale de cómo está puesto, y se puede cambiar si lo mediste mejor. Toda conclusión sale con este margen adentro.">
                    <input id="esc-duda" inputmode="decimal" [ngModel]="campoDuda()" (ngModelChange)="fijarDuda($event)" />
                  </ui-field>

                  <div class="fila">
                    <ui-field rotulo="Apunta a (°)" idControl="esc-az"
                              ayuda="0 es hacia el público, 90 a la derecha. Vacío es «no apunta a ningún lado».">
                      <input id="esc-az" inputmode="decimal" [ngModel]="campoAzimut()" (ngModelChange)="fijarAzimut($event)" />
                    </ui-field>
                    <ui-field rotulo="Inclinación (°)" idControl="esc-inc"
                              ayuda="Positiva hacia arriba. Una cuña en el piso mirando a la cara va cerca de 35.">
                      <input id="esc-inc" inputmode="decimal" [ngModel]="campoInclinacion()" (ngModelChange)="fijarInclinacion($event)" />
                    </ui-field>
                  </div>

                  @if (el.origen === 'CAPTACION') {
                    <ui-field rotulo="Patrón polar" idControl="esc-patron"
                              ayuda="Viene impreso en el micrófono. Sin él, el ángulo no dice nada.">
                      <select id="esc-patron" [ngModel]="campoPatron()" (ngModelChange)="fijarPatron($event)">
                        @for (p of patrones; track p.id) { <option [value]="p.id">{{ p.etiqueta }}</option> }
                      </select>
                    </ui-field>
                  }

                  @if (el.origen !== 'EMISOR') {
                    <ui-button variante="peligro" icono="borrar"
                               (pulsado)="confirmarQuitar.set(true)">Quitar del escenario</ui-button>
                  }
                </div>
              </ui-card>
            } @else {
              <ui-card titulo="Nada elegido">
                <p class="nota">Tocá algo en el plano para ver y corregir sus números.</p>
              </ui-card>
            }
          </div>
        </div>
      }
    </div>

    <ui-dialog titulo="Quitar del escenario" [abierto]="confirmarQuitar()"
               (cerrado)="confirmarQuitar.set(false)">
      <p>Se borra {{ elegido()?.etiqueta }} del plano. Sus números se pierden.</p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="confirmarQuitar.set(false)">Cancelar</ui-button>
        <ui-button variante="peligro" (pulsado)="quitar()">Quitar</ui-button>
      </div>
    </ui-dialog>

    <ui-salir-sin-guardar que="Lo que cambiaste del escenario" [abierto]="salida.abierto()"
                          (respuesta)="salida.responder($event)" />
  `,
  styles: [`
    .tablero { display: grid; gap: var(--sp-4); grid-template-columns: 1fr; align-items: start; }
    @media (min-width: 900px) { .tablero { grid-template-columns: minmax(0, 1.3fr) minmax(320px, 1fr); } }
    .fila { display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: flex-end; }
    .fila.entre { justify-content: space-between; align-items: center; }
    .nota { color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
    .aviso { color: var(--warn); font-size: var(--txt-sm); line-height: var(--alto-linea); }
  `],
})
export class EscenarioEditComponent implements OnDestroy, PuedeSalir {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly id = input.required<string>();
  readonly fijezas = FIJEZAS;
  readonly patrones = PATRONES;

  readonly lectura = new Lectura();
  readonly salida = new SalidaSinGuardar();

  readonly local = signal<VenueProfile | null>(null);
  readonly pa = signal<PAProfile | null>(null);
  /** El escenario y los componentes tal como están en pantalla. */
  readonly estado = signal<EstadoDelPlano | null>(null);
  private readonly leido = signal<string>('');
  readonly seleccionada = signal<string | null>(null);
  readonly nuevoNombre = signal('');
  readonly confirmarQuitar = signal(false);

  constructor() {
    // La selección es de este local: si no se limpia, al cambiar de `:id` el
    // componente se reusa y queda elegida una ficha que ya no existe.
    effect(() => { this.id(); this.seleccionada.set(null); this.recargar(); }, { allowSignalWrites: true });
  }

  ngOnDestroy(): void { this.salida.cancelar(); }

  puedeSalir(): boolean | Promise<boolean> {
    return this.hayCambios() ? this.salida.preguntar() : true;
  }

  private readonly hayCambios = computed(() => {
    const e = this.estado();
    return e !== null && JSON.stringify(e) !== this.leido();
  });

  recargar(): void {
    const id = this.id() as VenueProfileId;
    void this.lectura.correr(
      async () => {
        const l = await this.repos.local(id);
        const p = l === null ? null : await this.repos.pa(l.paProfileId);
        return [l, p] as const;
      },
      ([l, p]) => this.aplicar(id, l, p),
    );
  }

  private aplicar(id: VenueProfileId, l: VenueProfile | null, p: PAProfile | null): void {
    this.local.set(l);
    this.pa.set(p);
    if (l === null) { this.estado.set(null); return; }
    // `emisores` puede faltar en un escenario guardado antes de que existiera
    // la lista, y el editor no puede reventar por eso.
    const vacio: Escenario = {
      venueProfileId: id, elementos: [], emisores: [],
      actualizado: new Date().toISOString(), notas: null,
    };
    const escenario: Escenario = l.escenario === null
      ? vacio
      : { ...l.escenario, emisores: l.escenario.emisores ?? [] };
    const estado: EstadoDelPlano = { escenario, componentes: p?.componentes ?? [] };
    this.estado.set(estado);
    this.leido.set(JSON.stringify(estado));
  }

  readonly dimensiones = computed(() => this.local()?.dimensionesM ?? null);

  readonly plano = computed(() => {
    const e = this.estado();
    if (e === null) return { fichas: [], sinUbicar: [], noRadian: [] };
    return loQueVaEnElPlano(e.escenario, e.componentes);
  });

  readonly sinUbicar = computed(() => this.plano().sinUbicar);
  readonly noRadian = computed(() => this.plano().noRadian);
  readonly elegido = computed(() => this.plano().fichas.find((f) => f.id === this.seleccionada()) ?? null);

  readonly subtituloDelPlano = computed(() => {
    const n = this.plano().fichas.length;
    return n === 0
      ? 'Todavía no hay nada puesto'
      : `${n} ${n === 1 ? 'elemento' : 'elementos'} · el escenario arriba, el público abajo`;
  });

  /**
   * El aviso que impide que el arrastre mienta.
   *
   * **Le pregunta al plano, no repite la cuenta.** La primera versión decía
   * usar la misma escala y en realidad comparaba contra un umbral fijo de
   * 25 cm: las dos cifras ya estaban separadas y discrepaban —un elemento con
   * 30 cm de duda no recibía el aviso aunque el plano lo marcara—. Lo encontró
   * una auditoría ejecutando las dos.
   *
   * El plano es quien sabe cuánto vale el dedo, porque mide su propio ancho.
   */
  private readonly vistaDelPlano = viewChild(PlanoEscenarioComponent);

  readonly avisoDePrecision = computed(() => {
    const el = this.elegido();
    const vista = this.vistaDelPlano();
    if (el === null || vista === undefined) return null;
    if (!elDedoEsMasGruesoQueLaDuda(el.emplazamiento, vista.escala())) return null;
    const duda = el.emplazamiento.incertidumbrePosicionM;
    return `Este elemento está cargado con ±${Math.round(duda * 100)} cm de duda, y el dedo sobre `
      + `este plano vale ±${Math.round(vista.precisionM() * 100)} cm. Arrastrarlo empeora el dato: `
      + 'escribí los números si querés conservar la precisión.';
  });

  /**
   * Una posición que puso la aplicación, no el usuario.
   *
   * Se reconoce por la duda: {@link sinUbicarTodavia} la pone en una fracción
   * del local, mucho más grande que cualquier fijeza. No es una bandera aparte
   * porque una bandera se olvida de actualizarse; la duda es el dato mismo.
   */
  readonly avisoDeSinUbicar = computed(() => {
    const el = this.elegido();
    const d = this.dimensiones();
    if (el === null || d === null) return null;
    if (el.emplazamiento.incertidumbrePosicionM < dudaDeSinUbicar(d)) return null;
    return 'Esta posición la puso la aplicación para que tengas de dónde agarrarlo, y no es una '
      + 'medición: hasta que lo ubiques, la duda es de varios metros. Arrastralo al lugar y después '
      + 'decí cómo está puesto, que es lo que fija la duda de verdad.';
  });

  /**
   * Lo que quedó fuera de las paredes, que si no es invisible e intocable.
   *
   * Pasa al achicar el local después de cargar el escenario, o al escribir un
   * número de más en un campo. El plano dibuja la ficha fuera del recorte del
   * dibujo: no se ve, no se puede tocar, y si se pierde la selección no hay
   * forma de recuperarla.
   */
  readonly avisoDeFueraDelPlano = computed(() => {
    const el = this.elegido();
    const d = this.dimensiones();
    if (el === null || d === null) return null;
    return fueraDeLasParedes(el.emplazamiento.posicion, d)
      ? 'Este elemento está fuera de las paredes del local, así que no se dibuja en el plano. '
        + 'Corregí los números, o el tamaño del local.'
      : null;
  });

  /** Los que están fuera del plano y no son el elegido: si no, se pierden. */
  readonly perdidos = computed(() => {
    const d = this.dimensiones();
    if (d === null) return [];
    return this.plano().fichas.filter((f) => fueraDeLasParedes(f.emplazamiento.posicion, d));
  });

  readonly avisoDelMicrofono = computed(() => {
    const e = this.estado();
    const el = this.elegido();
    if (e === null || el === null || el.origen !== 'CAPTACION') return null;
    const c = this.captacionElegida(e, el.id);
    if (c === null) return null;
    return loQueLeFaltaAlMicrofono(c.captacion, c.patron, c.emplazamiento.orientacion !== null);
  });

  private captacionElegida(e: EstadoDelPlano, idFicha: string): ElementoCaptacion | null {
    const propio = idFicha.slice(idFicha.indexOf(':') + 1);
    return e.escenario.elementos.find(
      (x): x is ElementoCaptacion => x.tipo === 'CAPTACION' && x.id === propio,
    ) ?? null;
  }

  // --- Campos del elemento elegido -----------------------------------------

  private em(): Emplazamiento | null { return this.elegido()?.emplazamiento ?? null; }

  readonly campoX = computed(() => textoDe(this.em()?.posicion.x));
  readonly campoY = computed(() => textoDe(this.em()?.posicion.y));
  readonly campoZ = computed(() => textoDe(this.em()?.posicion.z));
  // En centímetros y con un decimal: el campo dice «cm» y antes redondeaba al
  // centímetro entero, así que escribir 7,5 guardaba 8.
  readonly campoDuda = computed(() => textoDe(this.em() ? this.em()!.incertidumbrePosicionM * 100 : undefined, 1));
  readonly campoFijeza = computed(() => this.em()?.fijeza ?? 'FIJO');
  // Grados enteros: el medio grado no existe en ninguna cinta métrica de sala.
  readonly campoAzimut = computed(() => textoDe(this.em()?.orientacion?.azimutGrados, 0));
  readonly campoInclinacion = computed(() => textoDe(this.em()?.orientacion?.inclinacionGrados, 0));
  readonly campoPatron = computed(() => {
    const e = this.estado();
    const el = this.elegido();
    if (e === null || el === null) return 'DESCONOCIDO';
    return this.captacionElegida(e, el.id)?.patron ?? 'DESCONOCIDO';
  });
  readonly ayudaDeFijeza = computed(
    () => FIJEZAS.find((f) => f.id === this.campoFijeza())?.ayuda ?? '');

  fijarX(v: string): void { this.conPosicion((p) => ({ ...p, x: numero(v, p.x) })); }
  fijarY(v: string): void { this.conPosicion((p) => ({ ...p, y: numero(v, p.y) })); }
  fijarZ(v: string): void { this.conPosicion((p) => ({ ...p, z: numero(v, p.z) })); }

  fijarDuda(v: string): void {
    this.conEmplazamiento((em) => ({
      ...em,
      // Al milímetro, porque el campo está en centímetros y admite decimales.
      incertidumbrePosicionM: Math.max(
        0, Math.round(numero(v, em.incertidumbrePosicionM * 100) * 10) / 1000),
    }));
  }

  /**
   * Cambiar cómo está puesto trae su duda por defecto.
   *
   * **Pisa lo que hubiera escrito a mano**, y es a propósito: si alguien pasa un
   * micrófono de un pie a la mano de quien canta, la duda de ±5 cm que tenía
   * cargada dejó de ser cierta. Dejarla sería conservar un número que ya no
   * describe nada.
   */
  fijarFijeza(v: string): void {
    const f = v as Fijeza;
    this.conEmplazamiento((em) => ({ ...emplazar(em.posicion, f, em.orientacion), }));
  }

  fijarAzimut(v: string): void { this.conOrientacion(v, true); }
  fijarInclinacion(v: string): void { this.conOrientacion(v, false); }

  /**
   * Vaciar el azimut es decir «no apunta a ningún lado», y se guarda así.
   *
   * Una caja directa o un instrumento acústico no tienen eje, y forzar un cero
   * los haría mirar al público por decreto.
   */
  private conOrientacion(v: string, esAzimut: boolean): void {
    this.conEmplazamiento((em) => {
      if (esAzimut && v.trim() === '') return { ...em, orientacion: null };
      const base = em.orientacion ?? { azimutGrados: 0, inclinacionGrados: 0 };
      return {
        ...em,
        orientacion: esAzimut
          ? { ...base, azimutGrados: numero(v, base.azimutGrados) }
          : { ...base, inclinacionGrados: numero(v, base.inclinacionGrados) },
      };
    });
  }

  fijarPatron(v: string): void {
    this.conElemento((el) => (el.tipo === 'CAPTACION' ? { ...el, patron: v as PatronPolar } : el));
  }

  private conPosicion(f: (p: PuntoM) => PuntoM): void {
    this.conEmplazamiento((em) => ({ ...em, posicion: f(em.posicion) }));
  }

  private conEmplazamiento(f: (em: Emplazamiento) => Emplazamiento): void {
    const el = this.elegido();
    const e = this.estado();
    if (el === null || e === null) return;
    this.estado.set(aplicarMovida(e, { id: el.id, emplazamiento: f(el.emplazamiento) }));
  }

  private conElemento(f: (el: ElementoFuente | ElementoCaptacion) => ElementoFuente | ElementoCaptacion): void {
    const el = this.elegido();
    const e = this.estado();
    if (el === null || e === null) return;
    const propio = el.id.slice(el.id.indexOf(':') + 1);
    const buscado = el.origen === 'FUENTE' ? 'FUENTE' : 'CAPTACION';
    this.estado.set({
      ...e,
      escenario: {
        ...e.escenario,
        elementos: e.escenario.elementos.map((x) => (x.tipo === buscado && x.id === propio ? f(x) : x)),
      },
    });
  }

  // --- Agregar, ubicar, quitar ---------------------------------------------

  readonly errorNuevo = computed(() => {
    const v = this.nuevoNombre();
    if (v.trim() === '') return null;
    return validarNombre(v, 'El nombre');
  });

  agregar(origen: 'FUENTE' | 'CAPTACION'): void {
    const e = this.estado();
    const d = this.dimensiones();
    const nombre = this.nuevoNombre().trim();
    if (e === null || d === null || nombre === '' || this.errorNuevo() !== null) return;
    const id = makeId<'EscenarioElementoId'>('esc') as EscenarioElementoId;
    // Cerca del centro del borde del escenario, que es de donde el usuario lo
    // va a arrastrar. Ponerlo en el origen lo escondería bajo el rótulo.
    const donde = { x: aCentimetros(d.ancho / 2), y: aCentimetros(Math.min(1, d.largo / 4)), z: 1.4 };
    const nuevo: ElementoFuente | ElementoCaptacion = origen === 'FUENTE'
      ? { tipo: 'FUENTE', id, nombre, emplazamiento: sinUbicarTodavia(donde, d, null), bandMemberId: null }
      : {
        tipo: 'CAPTACION', id, nombre,
        emplazamiento: sinUbicarTodavia(donde, d, { azimutGrados: 180, inclinacionGrados: 0 }),
        // **Nace sin patrón declarado, no con un cardioide supuesto.** Poner el
        // más común ahorraría un toque y metería un dato inventado en la
        // entrada de una inferencia geométrica.
        captacion: 'MICROFONO', patron: 'DESCONOCIDO', asignacionId: null, fuenteId: null,
      };
    this.estado.set({ ...e, escenario: { ...e.escenario, elementos: [...e.escenario.elementos, nuevo] } });
    this.seleccionada.set(`${origen === 'FUENTE' ? 'f' : 'c'}:${id}`);
    this.nuevoNombre.set('');
  }

  ubicar(c: PAComponentSpec): void {
    const e = this.estado();
    const d = this.dimensiones();
    if (e === null || d === null) return;
    const esMonitor = c.clase === 'MONITOR_CUNA' || c.clase === 'MONITOR_LATERAL';
    const donde = { x: aCentimetros(d.ancho / 2), y: esMonitor ? 0.8 : 0.2, z: esMonitor ? 0.3 : 1.8 };
    // Una cuña apunta a quien toca y una caja principal al público; las dos, en
    // esta convención, miran hacia +y. Es el arranque más probable y el usuario
    // lo corrige arrastrando. Lo que no se hace es dejarlas sin eje, porque
    // entonces no entran en ningún análisis y no se ve por qué.
    const em = sinUbicarTodavia(donde, d, { azimutGrados: 0, inclinacionGrados: esMonitor ? 35 : 0 });
    // **Se escribe en el escenario del local, no en el componente.** El mismo
    // equipo en otra sala está en otro lugar.
    this.estado.set({
      ...e,
      escenario: { ...e.escenario, emisores: [...e.escenario.emisores, { componenteId: c.id, emplazamiento: em }] },
    });
    this.seleccionada.set(`e:${c.id}`);
  }

  /** Devuelve al plano algo cuyas coordenadas se salieron de las paredes. */
  rescatar(id: string): void {
    const e = this.estado();
    const d = this.dimensiones();
    const ficha = this.plano().fichas.find((f) => f.id === id);
    if (e === null || d === null || ficha === undefined) return;
    this.estado.set(aplicarMovida(e, {
      id,
      emplazamiento: sinUbicarTodavia(
        { x: aCentimetros(d.ancho / 2), y: aCentimetros(d.largo / 2), z: Math.min(ficha.emplazamiento.posicion.z, d.alto) },
        d, ficha.emplazamiento.orientacion),
    }));
    this.seleccionada.set(id);
  }

  quitar(): void {
    this.confirmarQuitar.set(false);
    const el = this.elegido();
    const e = this.estado();
    if (el === null || e === null || el.origen === 'EMISOR') return;
    const propio = el.id.slice(el.id.indexOf(':') + 1);
    const buscado = el.origen === 'FUENTE' ? 'FUENTE' : 'CAPTACION';
    this.estado.set({
      ...e,
      escenario: {
        ...e.escenario,
        elementos: e.escenario.elementos.filter((x) => !(x.tipo === buscado && x.id === propio)),
      },
    });
    this.seleccionada.set(null);
  }

  alMover(m: FichaMovida): void {
    const e = this.estado();
    if (e === null) return;
    this.estado.set(aplicarMovida(e, m));
  }

  // --- Guardar --------------------------------------------------------------

  async guardar(): Promise<void> {
    const l = this.local();
    const e = this.estado();
    if (l === null || e === null) return;
    const escenario: Escenario = { ...e.escenario, actualizado: new Date().toISOString() };
    // **Una sola escritura, a un solo documento.** Antes había dos --el local y
    // el perfil de amplificación-- encadenadas dentro de un mismo intento que
    // no es transaccional: si fallaba la segunda, el escenario quedaba escrito,
    // el perfil no, y el usuario leía «no se pudo guardar» creyendo que no se
    // había guardado nada. Con el lugar viviendo en el local, el problema
    // desaparece en vez de necesitar una transacción.
    const ok = await intentarGuardar(
      () => this.repos.guardarLocal({ ...l, escenario }),
      (m) => this.avisos.error(m), 'guardar el escenario');
    if (!ok) return;
    const guardado: EstadoDelPlano = { escenario, componentes: e.componentes };
    this.estado.set(guardado);
    this.leido.set(JSON.stringify(guardado));
    this.local.set({ ...l, escenario });
    this.avisos.ok('Escenario guardado.');
  }

  irAlLocal(): Promise<boolean> { return this.router.navigate(['/perfiles/locales', this.id()]); }
  volver(): Promise<boolean> { return this.router.navigate(['/perfiles/locales', this.id()]); }
}

/**
 * Un número a texto de campo, sin arrastrar decimales que no existen.
 *
 * `decimales` se pasa porque este mismo ayudante muestra metros, centímetros y
 * grados: **redondear grados al centímetro no significa nada**, y redondear un
 * valor que ya está en centímetros a dos decimales de centímetro tampoco. La
 * primera versión aplicaba el redondeo de metros a las tres cosas, y lo
 * encontró una auditoría mirando las unidades.
 */
function textoDe(v: number | undefined, decimales = 2): string {
  if (v === undefined || !Number.isFinite(v)) return '';
  const f = 10 ** decimales;
  return String(Math.round(v * f) / f);
}

/**
 * Texto de campo a número, aceptando la coma decimal.
 *
 * **Rechaza lo que no sea un decimal escrito a mano.** `Number()` acepta
 * notación científica, hexadecimal y espacios: `1e3` entraba como mil metros y
 * `0x10` como dieciséis. Ninguno de los dos es algo que alguien tipee queriendo
 * en un campo de una tablet, y los dos metían un número absurdo sin avisar.
 * Si no se entiende, se conserva lo anterior.
 */
function numero(v: string, anterior: number): number {
  const limpio = v.trim().replace(',', '.');
  if (!/^-?\d*\.?\d*$/.test(limpio) || limpio === '' || limpio === '-' || limpio === '.') return anterior;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : anterior;
}

/**
 * La duda que corresponde a una posición que puso la aplicación y no el usuario.
 *
 * Un cuarto de la dimensión menor del local, con un piso de un metro: es
 * deliberadamente enorme, porque **no es una medición sino un lugar donde
 * agarrar la ficha**. Declararla con los ±5 cm de un pie de micrófono —que era
 * lo que hacía la primera versión— metía una precisión inventada en la entrada
 * de una inferencia geométrica, que es exactamente lo que el resto de este
 * trabajo se cuida de no hacer.
 */
function dudaDeSinUbicar(d: DimensionesDelLocal): number {
  return Math.max(1, Math.min(d.ancho, d.largo) / 4);
}

/** Un emplazamiento que la aplicación puso, con la duda que eso merece. */
function sinUbicarTodavia(
  posicion: { readonly x: number; readonly y: number; readonly z: number },
  d: DimensionesDelLocal,
  orientacion: { readonly azimutGrados: number; readonly inclinacionGrados: number } | null,
): Emplazamiento {
  return emplazar(posicion, 'FIJO', orientacion, { posicionM: dudaDeSinUbicar(d), orientacionGrados: 90 });
}

/** Si un punto quedó fuera de las paredes, y por lo tanto fuera del dibujo. */
function fueraDeLasParedes(p: PuntoM, d: DimensionesDelLocal): boolean {
  return p.x < 0 || p.x > d.ancho || p.y < 0 || p.y > d.largo || p.z < 0 || p.z > d.alto;
}
