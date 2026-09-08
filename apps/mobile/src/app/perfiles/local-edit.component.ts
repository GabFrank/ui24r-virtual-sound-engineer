import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal,
  type OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  reunirErrores, validarNombre, validarNumero, validarUnico, RANGO_DIMENSION,
  type HouseCurvePreset, type PAProfile, type VenueProfile, type VenueProfileId, type VenueType,
} from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  ButtonComponent, CamposTocados, CardComponent, CargandoComponent, DialogComponent,
  EmptyStateComponent, FalloComponent, FieldComponent, Lectura, PageHeaderComponent,
  PuedeSalir, SalidaSinGuardar, SalirSinGuardarComponent, ToastService, intentarGuardar,
} from '../ui';

const TIPOS: readonly { id: VenueType; etiqueta: string }[] = [
  { id: 'INDOOR_SMALL', etiqueta: 'Interior chico — hasta unas 80 personas' },
  { id: 'INDOOR_MEDIUM', etiqueta: 'Interior mediano — hasta unas 250' },
  { id: 'INDOOR_LARGE', etiqueta: 'Interior grande' },
  { id: 'WAREHOUSE', etiqueta: 'Galpón — mucho volumen y superficies duras' },
  { id: 'OUTDOOR', etiqueta: 'Exterior' },
  { id: 'CUSTOM', etiqueta: 'Otro' },
];

const CURVAS: readonly { id: HouseCurvePreset; etiqueta: string; detalle: string }[] = [
  { id: 'LIVE_MUSIC', etiqueta: 'Música en vivo', detalle: 'Curva por defecto: graves algo por encima y agudos algo por debajo de plano.' },
  { id: 'ACOUSTIC', etiqueta: 'Acústico', detalle: 'Más plana; pensada para formaciones sin batería ni bajo eléctrico.' },
  { id: 'SPEECH', etiqueta: 'Palabra', detalle: 'Prioriza inteligibilidad sobre cuerpo.' },
  { id: 'BASS_ENHANCED', etiqueta: 'Graves realzados', detalle: 'Para música que vive en el registro grave.' },
  { id: 'BAND_SIGNATURE', etiqueta: 'Firma de la banda', detalle: 'La aprendida midiendo. Necesita sesiones previas.' },
  { id: 'CUSTOM', etiqueta: 'Propia', detalle: 'Definida por tercio de octava.' },
];

/**
 * Edición de un local.
 *
 * Las dimensiones son opcionales y lo dicen. Pedirlas como obligatorias
 * llevaría a que alguien las invente antes de un show, y una sala declarada de
 * ocho por seis cuando en realidad son veinte por doce es peor que no tener el
 * dato: la aplicación calcularía tiempos de reverberación esperados que no
 * tienen nada que ver con lo que va a medir.
 */
@Component({
  selector: 'app-local-edit',
  standalone: true,
  imports: [
    ButtonComponent, CardComponent, CargandoComponent, DialogComponent, EmptyStateComponent,
    FalloComponent, FieldComponent, FormsModule, PageHeaderComponent,
    SalirSinGuardarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Local"
        descripcion="Dónde se toca. Guarda el historial de puntajes de sala, para poder comparar el de hoy con el de la última vez en el mismo sitio.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (lectura.problema(); as p) {
        <ui-fallo [mensaje]="p" (reintentar)="recargar()" />
      } @else if (lectura.cargando()) {
        <ui-cargando texto="Leyendo el local" />
      } @else if (local() === null) {
        <ui-empty icono="error" titulo="Ese local ya no existe"
                  detalle="Puede que se haya borrado desde otra pantalla." />
      } @else {
        <div class="pila-lg">
          <ui-card titulo="Identidad">
            <div class="pila">
              <ui-field rotulo="Nombre" idControl="loc-nombre" [error]="errorNombreVisible()">
                <input id="loc-nombre" type="text" [(ngModel)]="nombre" (blur)="tocados.marcar('nombre')" />
              </ui-field>

              <ui-field rotulo="Tipo" idControl="loc-tipo">
                <select id="loc-tipo" [(ngModel)]="tipo">
                  @for (t of tipos; track t.id) {
                    <option [value]="t.id">{{ t.etiqueta }}</option>
                  }
                </select>
              </ui-field>

              <ui-field rotulo="Ubicación" idControl="loc-interior">
                <select id="loc-interior" [ngModel]="interiorTexto()" (ngModelChange)="fijarInterior($event)">
                  <option value="si">Interior</option>
                  <option value="no">Exterior</option>
                </select>
              </ui-field>
            </div>
          </ui-card>

          <ui-card titulo="Sistema de amplificación">
            @if (pas().length === 0) {
              <p class="nota">No hay ningún sistema cargado.</p>
            } @else {
              <ui-field rotulo="Sistema" idControl="loc-pa"
                        ayuda="El rango útil declarado ahí es lo que impide que la aplicación proponga corregir donde el equipo no entrega nada.">
                <select id="loc-pa" [(ngModel)]="paId">
                  @for (p of pas(); track p.id) {
                    <option [value]="p.id">{{ p.nombre }}</option>
                  }
                </select>
              </ui-field>
            }
          </ui-card>

          <ui-card titulo="Dimensiones" subtitulo="Opcionales, y conviene dejarlas vacías antes que inventarlas">
            <div class="dims">
              <ui-field rotulo="Largo" idControl="loc-largo" [opcional]="true"
                        [error]="errorLargoVisible()">
                <input id="loc-largo" inputmode="decimal" [(ngModel)]="largo"
                       (blur)="tocados.marcar('largo')" />
              </ui-field>
              <ui-field rotulo="Ancho" idControl="loc-ancho" [opcional]="true"
                        [error]="errorAnchoVisible()">
                <input id="loc-ancho" inputmode="decimal" [(ngModel)]="ancho"
                       (blur)="tocados.marcar('ancho')" />
              </ui-field>
              <ui-field rotulo="Alto" idControl="loc-alto" [opcional]="true"
                        [error]="errorAltoVisible()">
                <input id="loc-alto" inputmode="decimal" [(ngModel)]="alto"
                       (blur)="tocados.marcar('alto')" />
              </ui-field>
            </div>
            @if (errorDimensionesParciales(); as e) {
              <p class="error">{{ e }}</p>
            }
            <p class="nota">
              En metros, y <strong>las tres o ninguna</strong>: con dos no se
              calcula ningún modo propio. Con las tres, la aplicación puede
              anticipar dónde esperar problemas; sin ellas, mide igual pero no
              los explica.
            </p>
          </ui-card>

          <ui-card titulo="Curva objetivo">
            <ui-field rotulo="Curva" idControl="loc-curva">
              <select id="loc-curva" [(ngModel)]="curva">
                @for (c of curvas; track c.id) {
                  <option [value]="c.id">{{ c.etiqueta }}</option>
                }
              </select>
            </ui-field>
            <p class="nota">{{ detalleDeCurva() }}</p>
          </ui-card>

          <ui-card titulo="Notas">
            <ui-field rotulo="Lo que convenga recordar" idControl="loc-notas" [opcional]="true">
              <textarea id="loc-notas" [(ngModel)]="notas"
                        placeholder="Dónde está la toma de corriente, con quién hablar, qué salió mal la última vez"></textarea>
            </ui-field>
          </ui-card>

          <div class="racimo racimo-entre">
            <ui-button variante="peligro" icono="borrar" (pulsado)="confirmarBorrado.set(true)">
              Borrar local
            </ui-button>
            <ui-button variante="primario" icono="guardar" [deshabilitado]="!sePuedeGuardar()"
                       (pulsado)="guardar()">Guardar</ui-button>
          </div>
        </div>
      }
    </div>

    <ui-salir-sin-guardar que="Lo que cambiaste del local" [abierto]="salida.abierto()"
                          (respuesta)="salida.responder($event)" />

    <ui-dialog titulo="Borrar el local" [abierto]="confirmarBorrado()"
               [cerrableAlTocarFuera]="false" (cerrado)="confirmarBorrado.set(false)">
      <p class="lectura">
        Se borra el local y con él su historial de puntajes de sala, que es lo
        que permite comparar una noche con la anterior en el mismo sitio. Las
        sesiones quedan en el historial.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="confirmarBorrado.set(false)">Cancelar</ui-button>
        <ui-button variante="peligro" icono="borrar" (pulsado)="borrar()">Borrar</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    @use 'tokens' as *;
    .dims { display: grid; gap: var(--sp-3); grid-template-columns: repeat(3, 1fr); }
    @include hasta($bp-telefono) { .dims { grid-template-columns: 1fr; } }
    .nota { margin-top: var(--sp-3); color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
    .nota strong { color: var(--ink-2); }
    .error { margin-top: var(--sp-3); color: var(--danger); font-size: var(--txt-sm); }
  `],
})
export class LocalEditComponent implements PuedeSalir, OnDestroy {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly id = input.required<string>();

  readonly tipos = TIPOS;
  readonly curvas = CURVAS;

  readonly local = signal<VenueProfile | null>(null);
  readonly pas = signal<readonly PAProfile[]>([]);
  private readonly otrosNombres = signal<readonly string[]>([]);

  readonly nombre = signal('');
  readonly tipo = signal<VenueType>('INDOOR_SMALL');
  readonly interior = signal(true);
  readonly paId = signal('');
  readonly largo = signal('');
  readonly ancho = signal('');
  readonly alto = signal('');
  readonly curva = signal<HouseCurvePreset>('LIVE_MUSIC');
  readonly notas = signal('');
  readonly confirmarBorrado = signal(false);
  readonly salida = new SalidaSinGuardar();

  /**
   * Si lo que está en pantalla difiere de lo guardado.
   *
   * Se compara el local que se guardaría contra el que se leyó, y no campo por
   * campo: una comparación campo por campo se olvida del campo que se agregue
   * mañana, y se olvida en silencio. Tampoco vale una bandera que se marque al
   * escribir, porque escribir una letra y borrarla no es un cambio y preguntar
   * ahí enseña a contestar que sí sin leer.
   */
  private readonly hayCambios = computed(() => {
    const l = this.local();
    return l !== null && JSON.stringify(this.aGuardar(l)) !== JSON.stringify(l);
  });

  ngOnDestroy(): void {
    // Si la pantalla se va con la pregunta abierta, la promesa quedaría sin
    // resolver y el router esperando para siempre.
    this.salida.cancelar();
  }

  puedeSalir(): boolean | Promise<boolean> {
    return this.hayCambios() ? this.salida.preguntar() : true;
  }

  readonly interiorTexto = computed(() => (this.interior() ? 'si' : 'no'));

  readonly detalleDeCurva = computed(
    () => CURVAS.find((c) => c.id === this.curva())?.detalle ?? '',
  );

  /**
   * Una dimensión vacía no es un error: son opcionales. Solo se valida lo que
   * el usuario efectivamente escribió.
   */
  private validarDimension(v: string, que: string): string | null {
    return v.trim() === '' ? null : validarNumero(v, RANGO_DIMENSION, que);
  }

  /** Una señal por campo: leer un mapa desde la plantilla exigiría una función
   *  en el enlace, y eso se reevalúa en cada ciclo de detección de cambios. */
  readonly errorNombre = computed(() =>
    validarNombre(this.nombre(), 'El nombre del local')
    ?? validarUnico(this.nombre(), this.otrosNombres(), 'Ese nombre de local'));
  readonly errorLargo = computed(() => this.validarDimension(this.largo(), 'El largo'));
  readonly errorAncho = computed(() => this.validarDimension(this.ancho(), 'El ancho'));
  readonly errorAlto = computed(() => this.validarDimension(this.alto(), 'El alto'));

  /**
   * Las dimensiones son opcionales, pero se piden **las tres o ninguna**: con
   * dos de tres no se calcula ningún modo propio. Antes, guardar dos las
   * descartaba las dos en silencio y mostraba un aviso verde de éxito. Alguien
   * medía el local con una cinta, cargaba dos números, se distraía, guardaba y
   * se iba convencido de que había quedado.
   */
  readonly errorDimensionesParciales = computed(() => {
    const vacias = [this.largo(), this.ancho(), this.alto()].filter((v) => v.trim() === '').length;
    return vacias === 0 || vacias === 3
      ? null
      : 'Hacen falta las tres para calcular modos propios, o ninguna.';
  });

  readonly tocados = new CamposTocados();
  readonly errorNombreVisible = this.tocados.visible('nombre', this.errorNombre);
  readonly errorLargoVisible = this.tocados.visible('largo', this.errorLargo);
  readonly errorAnchoVisible = this.tocados.visible('ancho', this.errorAncho);
  readonly errorAltoVisible = this.tocados.visible('alto', this.errorAlto);

  readonly sePuedeGuardar = computed(() => this.errorDimensionesParciales() === null
    && Object.keys(reunirErrores({
      nombre: this.errorNombre(), largo: this.errorLargo(),
      ancho: this.errorAncho(), alto: this.errorAlto(),
    })).length === 0);

  /** Estado de la lectura: mientras lee no dice que no existe. */
  readonly lectura = new Lectura();

  constructor() {
    // «allowSignalWrites» porque empezar a leer marca «cargando», y eso es una
    // escritura de señal dentro del efecto. La prohibición existe para evitar
    // bucles: acá no hay ninguno, porque el efecto depende del identificador y
    // de la revisión del repositorio, y no del estado de la lectura. Antes esto
    // no saltaba solo porque la escritura ocurría dentro de un `await`, o sea
    // que el efecto ya había terminado -- estaba igual de mal y no se veía.
    effect(() => {
      this.id();
      this.recargar();
    }, { allowSignalWrites: true });
  }

  recargar(): void {
    const id = this.id() as VenueProfileId;
    void this.lectura.correr(() => this.leer(id), (v) => this.aplicar(id, v));
  }

  private leer(id: VenueProfileId): Promise<
    [VenueProfile | null, readonly VenueProfile[], readonly PAProfile[]]
  > {
    return Promise.all([this.repos.local(id), this.repos.locales(), this.repos.pas()]);
  }

  private aplicar(
    id: VenueProfileId,
    [l, todos, pas]: [VenueProfile | null, readonly VenueProfile[], readonly PAProfile[]],
  ): void {
    this.pas.set(pas);
    this.local.set(l);
    this.otrosNombres.set(todos.filter((x) => x.id !== id).map((x) => x.nombre));
    if (l === null) return;
    this.nombre.set(l.nombre);
    this.tipo.set(l.tipo);
    this.interior.set(l.interior);
    this.paId.set(l.paProfileId);
    this.largo.set(l.dimensionesM ? String(l.dimensionesM.largo) : '');
    this.ancho.set(l.dimensionesM ? String(l.dimensionesM.ancho) : '');
    this.alto.set(l.dimensionesM ? String(l.dimensionesM.alto) : '');
    this.curva.set(l.houseCurve);
    this.notas.set(l.notas ?? '');
  }

  fijarInterior(v: string): void { this.interior.set(v === 'si'); }

  private dimensiones(): VenueProfile['dimensionesM'] {
    const n = (s: string) => Number(s.replace(',', '.'));
    // Las tres o ninguna: con dos de tres no se puede calcular ningún modo
    // propio, así que guardar un par sueltas solo daría la falsa impresión de
    // que el dato está cargado.
    if ([this.largo(), this.ancho(), this.alto()].some((v) => v.trim() === '')) return null;
    return { largo: n(this.largo()), ancho: n(this.ancho()), alto: n(this.alto()) };
  }

  /** El local tal como quedaría al guardar. */
  private aGuardar(l: VenueProfile): VenueProfile {
    return {
      ...l,
      nombre: this.nombre().trim(),
      tipo: this.tipo(),
      interior: this.interior(),
      paProfileId: (this.paId() || l.paProfileId) as VenueProfile['paProfileId'],
      dimensionesM: this.dimensiones(),
      houseCurve: this.curva(),
      notas: this.notas().trim() === '' ? null : this.notas().trim(),
    };
  }

  async guardar(): Promise<void> {
    this.tocados.intentarGuardar();
    const l = this.local();
    if (l === null) return;
    const guardado = this.aGuardar(l);
    const ok = await intentarGuardar(
      () => this.repos.guardarLocal(guardado), (m) => this.avisos.error(m), 'guardar el local');
    if (!ok) return;
    // La entidad de referencia pasa a ser la guardada: si no, al volver
    // preguntaría por cambios que acaban de guardarse.
    this.local.set(guardado);
    this.avisos.ok('Local guardado.');
    await this.volver();
  }

  async borrar(): Promise<void> {
    const l = this.local();
    if (l === null) return;
    const ok = await intentarGuardar(
      () => this.repos.borrarLocal(l.id), (m) => this.avisos.error(m), 'borrar el local');
    if (!ok) { this.confirmarBorrado.set(false); return; }
    this.local.set(null);
    this.confirmarBorrado.set(false);
    this.avisos.ok('Local borrado.');
    await this.volver();
  }

  volver(): Promise<boolean> { return this.router.navigate(['/perfiles']); }
}
