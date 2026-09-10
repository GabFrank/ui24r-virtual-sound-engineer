import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, signal,
  type OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  crearIntegrante, editarIntegrante, nombresDeOtrosIntegrantes, reunirErrores,
  textoDeInstrumentos, validarNombre, validarNombreDeIntegrante, validarUnico,
  type BandMember, type BandMemberId, type BandProfile, type BandProfileId, type Instrumento,
} from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  ButtonComponent, CamposTocados, CardComponent, CargandoComponent, DialogComponent,
  EmptyStateComponent, FalloComponent, FieldComponent, Lectura, PageHeaderComponent,
  PuedeSalir, SalidaSinGuardar, SalirSinGuardarComponent, ToastService, intentarGuardar,
} from '../ui';
import { ElegirInstrumentosComponent } from './elegir-instrumentos.component';

/** Un integrante tal como lo muestra la lista: con los instrumentos ya unidos. */
interface FilaDeIntegrante {
  readonly id: BandMemberId;
  readonly nombre: string;
  /** Cómo se leen en la lista, en una línea. */
  readonly texto: string;
  /**
   * Los instrumentos tal como están guardados.
   *
   * La fila los lleva además del texto porque es lo que el diálogo necesita al
   * corregir: volver a interpretar la línea que se muestra sería releer nuestra
   * propia salida, y un instrumento escrito a mano perdería su texto en el
   * viaje de ida y vuelta.
   */
  readonly instrumentos: readonly Instrumento[];
}

/**
 * Edición de una banda.
 *
 * Guarda al confirmar y no mientras se escribe. La diferencia importa: si
 * guardara en cada tecla, un nombre a medio escribir se convertiría en un
 * nombre válido y las validaciones dispararían mientras el usuario todavía
 * está tecleando.
 */
@Component({
  selector: 'app-banda-edit',
  standalone: true,
  imports: [
    ButtonComponent, CardComponent, CargandoComponent, DialogComponent,
    ElegirInstrumentosComponent, EmptyStateComponent, FalloComponent, FieldComponent, FormsModule,
    PageHeaderComponent, SalirSinGuardarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Banda"
        descripcion="Quiénes tocan y con qué. La asignación de canales se hace en la sesión, sobre los nombres que ya tiene la consola.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (lectura.problema(); as p) {
        <ui-fallo [mensaje]="p" (reintentar)="recargar()" />
      } @else if (lectura.cargando()) {
        <ui-cargando texto="Leyendo la banda" />
      } @else if (banda() === null) {
        <ui-empty icono="error" titulo="Esa banda ya no existe"
                  detalle="Puede que se haya borrado desde otra pantalla." />
      } @else {
        <div class="pila-lg">
          <ui-card titulo="Identidad">
            <ui-field rotulo="Nombre" idControl="banda-nombre"
                      [error]="errorNombreVisible()"
                      ayuda="Se usa para agrupar las sesiones en el historial.">
              <input id="banda-nombre" type="text" [(ngModel)]="nombre"
                     (blur)="tocados.marcar('nombre')" />
            </ui-field>
          </ui-card>

          <ui-card titulo="Integrantes"
                   [subtitulo]="integrantes().length + ' en total'">
            <ui-button acciones variante="secundario" icono="mas"
                       (pulsado)="abrirNuevo()">Agregar</ui-button>

            @if (integrantes().length === 0) {
              <ui-empty icono="banda" titulo="Sin integrantes todavía"
                detalle="No es obligatorio cargarlos, pero saber quién canta y quién toca qué es lo que permite decir «el micrófono de Ana» en vez de «el canal 3»." />
            } @else {
              <ul class="lista">
                @for (m of integrantesConTexto(); track m.id) {
                  <li>
                    <div class="quien">
                      <span class="nombre">{{ m.nombre }}</span>
                      @if (m.texto) {
                        <span class="instrumentos">{{ m.texto }}</span>
                      }
                    </div>
                    <div class="fila-acciones">
                      <!-- Un solo botón en la fila, y el de quitar adentro del
                           diálogo. La fila ya no tiene ningún gesto destructivo
                           al lado de uno que no lo es. Ver la nota de
                           «quitarIntegrante». -->
                      <ui-button class="solo-icono" variante="sutil" icono="editar"
                                 [rotuloAccesible]="'Abrir a ' + m.nombre"
                                 (pulsado)="abrirEdicion(m)">Abrir</ui-button>
                    </div>
                  </li>
                }
              </ul>
            }
          </ui-card>

          <div class="racimo racimo-entre">
            <ui-button variante="peligro" icono="borrar" (pulsado)="confirmarBorrado.set(true)">
              Borrar banda
            </ui-button>
            <ui-button variante="primario" icono="guardar" [deshabilitado]="!sePuedeGuardar()"
                       (pulsado)="guardar()">Guardar</ui-button>
          </div>
        </div>
      }
    </div>

    <!-- Un solo diálogo para el alta y para la corrección. Son el mismo
         formulario, y dos diálogos gemelos se convierten en dos formularios
         distintos al primer campo que se agregue. -->
    <ui-dialog [titulo]="tituloDelDialogo()" [abierto]="dialogoAbierto()"
               (cerrado)="cerrarDialogo()">
      <div class="pila">
        <ui-field rotulo="Nombre" idControl="int-nombre" [error]="errorDelIntegranteVisible()">
          <input id="int-nombre" type="text" [(ngModel)]="nombreDelIntegrante"
                 (blur)="tocadosDialogo.marcar('nombre')" />
        </ui-field>
        <app-elegir-instrumentos [instrumentos]="instrumentosDelIntegrante()"
                                 (cambiado)="instrumentosDelIntegrante.set($event)" />
      </div>
      <div pie class="pie-integrante">
        <!-- «Quitar» vive acá y no en la fila, y no pide confirmación aparte:
             llegar hasta este botón exige haber abierto a esa persona y estar
             viendo su nombre y sus instrumentos, que es una confirmación que
             además informa. Ver la nota de «quitarIntegrante». -->
        @if (integranteEditado() !== null) {
          <ui-button class="quitar" variante="peligro" icono="borrar"
                     (pulsado)="quitarIntegrante()">Quitar</ui-button>
        }
        <ui-button variante="sutil" (pulsado)="cerrarDialogo()">Cancelar</ui-button>
        <ui-button variante="primario" [deshabilitado]="errorDelIntegrante() !== null"
                   (pulsado)="confirmarIntegrante()">{{ accionDelDialogo() }}</ui-button>
      </div>
    </ui-dialog>

    <ui-salir-sin-guardar que="Lo que cambiaste de la banda" [abierto]="salida.abierto()"
                          (respuesta)="salida.responder($event)" />

    <ui-dialog titulo="Borrar la banda" [abierto]="confirmarBorrado()"
               [cerrableAlTocarFuera]="false" (cerrado)="confirmarBorrado.set(false)">
      <p class="lectura">
        Se borra la banda y su asignación de canales. Las sesiones que la usaron
        quedan en el historial, pero ya no se va a poder saber a quién
        correspondía cada canal.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="confirmarBorrado.set(false)">Cancelar</ui-button>
        <ui-button variante="peligro" icono="borrar" (pulsado)="borrar()">Borrar</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    @use 'tokens' as *;

    .lista { list-style: none; margin: 0; padding: 0; }
    .lista li {
      display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
      padding: var(--sp-2) 0;
      border-bottom: 1px solid var(--line);
    }
    .lista li:last-child { border-bottom: 0; }
    .quien { display: flex; flex-direction: column; min-width: 0; }
    .nombre { overflow: hidden; text-overflow: ellipsis; }
    .instrumentos { font-size: var(--txt-sm); color: var(--muted); }
    .fila-acciones { display: flex; flex: none; gap: var(--sp-3); }

    /* «Quitar» a la izquierda del todo, separado del resto por el espacio que
       sobre. Es el mismo reparto que el pie de la página —«Borrar banda» a un
       lado, «Guardar» al otro— y por el mismo motivo: la acción destructiva no
       comparte borde con ninguna otra. */
    .pie-integrante { display: flex; gap: var(--sp-2); width: 100%; }
    .pie-integrante .quitar { margin-right: auto; }

    @include hasta($bp-telefono) {
      /* En teléfono el pie del diálogo apila a lo ancho. «Quitar» queda arriba,
         lejos del pulgar, que es donde tiene que estar. */
      .pie-integrante { flex-direction: column; }
      .pie-integrante .quitar { margin-right: 0; margin-bottom: var(--sp-3); }
    }
  `],
})
export class BandaEditComponent implements PuedeSalir, OnDestroy {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  /** Llega de la ruta gracias a `withComponentInputBinding`. */
  readonly id = input.required<string>();

  readonly banda = signal<BandProfile | null>(null);
  readonly nombre = signal('');
  readonly integrantes = signal<readonly BandMember[]>([]);

  /** La lista de instrumentos, ya unida: unirla en la plantilla la volvería a
   *  unir en cada ciclo de detección de cambios. */
  readonly integrantesConTexto = computed<readonly FilaDeIntegrante[]>(
    () => this.integrantes().map((m) => ({
      id: m.id,
      nombre: m.nombre,
      texto: textoDeInstrumentos(m.instrumentos),
      instrumentos: m.instrumentos,
    })));
  private readonly otrosNombres = signal<readonly string[]>([]);

  readonly dialogoAbierto = signal(false);
  readonly nombreDelIntegrante = signal('');
  /**
   * Los instrumentos que se están eligiendo, ya clasificados.
   *
   * Se guardan como instrumentos y no como la línea de texto que se mostraba
   * antes: la línea era una interpretación de ida y una reinterpretación de
   * vuelta, y en ese viaje un instrumento escrito a mano en un perfil viejo
   * perdía su texto original en cuanto alguien abría el diálogo y confirmaba.
   */
  readonly instrumentosDelIntegrante = signal<readonly Instrumento[]>([]);
  /**
   * A quién se está corrigiendo, o `null` si es un alta.
   *
   * Es lo único que distingue los dos usos del diálogo, y es también lo que
   * hace que corregir conserve el identificador: sin él, la única salida era
   * quitar al integrante y cargarlo de nuevo, y eso le da un identificador
   * nuevo que deja huérfana su asignación de canal.
   */
  readonly integranteEditado = signal<BandMemberId | null>(null);
  readonly confirmarBorrado = signal(false);

  readonly tituloDelDialogo = computed(
    () => (this.integranteEditado() === null ? 'Nuevo integrante' : 'Corregir integrante'));

  /**
   * «Agregar» y «Actualizar», no «Guardar»: el diálogo cambia la lista que está
   * en pantalla, y lo que persiste es el «Guardar» de la banda. Llamar
   * «Guardar» a los dos haría creer que corregir un nombre ya quedó guardado.
   */
  readonly accionDelDialogo = computed(
    () => (this.integranteEditado() === null ? 'Agregar' : 'Actualizar'));

  /**
   * Una señal calculada por campo, en vez de un mapa consultado desde la
   * plantilla: leer un mapa exige llamar a una función en el enlace, y una
   * función en el enlace se reevalúa en cada ciclo de detección de cambios.
   */
  readonly errorNombre = computed(() =>
    validarNombre(this.nombre(), 'El nombre de la banda')
    ?? validarUnico(this.nombre(), this.otrosNombres(), 'Ese nombre de banda'));

  readonly sePuedeGuardar = computed(
    () => Object.keys(reunirErrores({ nombre: this.errorNombre() })).length === 0);

  /**
   * Los nombres de los demás, para que no haya dos «Ana».
   *
   * Se excluye a quien se está corrigiendo: sin eso, abrir a Ana y confirmar
   * sin tocar nada diría que «Ana» ya está en uso —por ella misma— y el botón
   * quedaría apagado sin salida. En un alta no hay a quién excluir.
   */
  private readonly otrosNombresDeIntegrantes = computed(
    () => nombresDeOtrosIntegrantes(this.integrantes(), this.integranteEditado()));

  /**
   * Dos «Ana» rompen la premisa de la pantalla de canales, que es poder decir
   * «el micrófono de Ana» en vez de «el canal 3»: el desplegable de «quién»
   * muestra dos veces lo mismo y quien elige no tiene con qué distinguirlas.
   * La regla y su mensaje viven en el dominio, no acá.
   */
  readonly errorDelIntegrante = computed(
    () => validarNombreDeIntegrante(
      this.nombreDelIntegrante(), this.otrosNombresDeIntegrantes()));

  /**
   * Los errores no se muestran hasta que el campo se abandona o se intenta
   * guardar. Siguen decidiendo si se puede guardar; lo que cambia es cuándo se
   * ven.
   */
  readonly tocados = new CamposTocados();
  readonly tocadosDialogo = new CamposTocados();
  readonly errorNombreVisible = this.tocados.visible('nombre', this.errorNombre);
  readonly errorDelIntegranteVisible =
    this.tocadosDialogo.visible('nombre', this.errorDelIntegrante);

  /** Estado de la lectura: mientras lee no dice que no existe. */
  readonly lectura = new Lectura();

  readonly salida = new SalidaSinGuardar();

  /**
   * Si lo que está en pantalla difiere de lo guardado.
   *
   * Se compara contra la entidad tal como se leyó, y no contra una bandera que
   * se marque al escribir: escribir una letra y borrarla no es un cambio, y
   * preguntar en ese caso enseña a contestar que sí sin leer.
   */
  private readonly hayCambios = computed(() => {
    const b = this.banda();
    if (b === null) return false;
    if (this.nombre().trim() !== b.nombre) return true;
    return JSON.stringify(this.integrantes()) !== JSON.stringify(b.integrantes);
  });

  ngOnDestroy(): void {
    // Si la pantalla se va con la pregunta abierta, la promesa quedaría sin
    // resolver y el router esperando para siempre.
    this.salida.cancelar();
  }

  puedeSalir(): boolean | Promise<boolean> {
    return this.hayCambios() ? this.salida.preguntar() : true;
  }

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
    const id = this.id() as BandProfileId;
    void this.lectura.correr(() => this.leer(id), (v) => this.aplicar(id, v));
  }

  private leer(id: BandProfileId): Promise<[BandProfile | null, readonly BandProfile[]]> {
    return Promise.all([this.repos.banda(id), this.repos.bandas()]);
  }

  private aplicar(id: BandProfileId, [b, todas]: [BandProfile | null, readonly BandProfile[]]): void {
    this.banda.set(b);
    if (b !== null) {
      this.nombre.set(b.nombre);
      this.integrantes.set(b.integrantes);
    }
    this.otrosNombres.set(todas.filter((x) => x.id !== id).map((x) => x.nombre));
  }

  abrirNuevo(): void {
    this.nombreDelIntegrante.set('');
    this.instrumentosDelIntegrante.set([]);
    this.integranteEditado.set(null);
    this.tocadosDialogo.reiniciar();
    this.dialogoAbierto.set(true);
  }

  /**
   * Abre el mismo diálogo con lo que ya está cargado.
   *
   * Recibe la fila que la plantilla ya tiene calculada, con los instrumentos
   * dentro: volver a buscarlos por identificador sería recorrer la lista para
   * conseguir algo que estaba a mano.
   *
   * Se cargan los instrumentos tal cual están guardados, no la línea que se ve
   * en la lista. Un integrante migrado de texto libre se abre con su texto
   * intacto, se ve como lo escribió su dueño y vuelve a guardarse igual.
   */
  abrirEdicion(m: FilaDeIntegrante): void {
    this.nombreDelIntegrante.set(m.nombre);
    this.instrumentosDelIntegrante.set(m.instrumentos);
    this.integranteEditado.set(m.id);
    this.tocadosDialogo.reiniciar();
    this.dialogoAbierto.set(true);
  }

  /**
   * Cerrar sin confirmar deja la lista como estaba y olvida a quién se estaba
   * corrigiendo: si no, el siguiente «Agregar» heredaría el modo edición y
   * sobreescribiría a esa persona en vez de sumar una nueva.
   */
  cerrarDialogo(): void {
    this.dialogoAbierto.set(false);
    this.integranteEditado.set(null);
  }

  confirmarIntegrante(): void {
    // Sin convertir: ya son instrumentos del catálogo. El dominio los vuelve a
    // normalizar en «crearIntegrante» y «editarIntegrante», que es idempotente.
    const instrumentos = this.instrumentosDelIntegrante();
    const nombre = this.nombreDelIntegrante();
    const editado = this.integranteEditado();
    if (editado === null) {
      this.integrantes.update((l) => [...l, crearIntegrante(nombre, instrumentos)]);
    } else {
      this.integrantes.update((l) => editarIntegrante(l, editado, nombre, instrumentos));
    }
    this.cerrarDialogo();
  }

  /**
   * Quita al integrante que el diálogo está mostrando.
   *
   * **Por qué acá y no en la fila, y por qué sin un «¿estás seguro?».** El
   * botón estaba en la lista, pegado al de editar, los dos del mismo tamaño y
   * del mismo color. A un metro de la tablet, con poca luz y apurado, un toque
   * de más borraba a una persona con sus instrumentos y con el identificador
   * que enlaza sus canales, y no había forma de deshacerlo.
   *
   * Las dos salidas obvias eran malas. Dejarlo donde estaba y pedir
   * confirmación agrega un diálogo a cada borrado, incluidos los que el usuario
   * tenía decididos; y un «¿estás seguro?» que aparece siempre se contesta que
   * sí sin leer, que es el mismo argumento por el que la salida sin guardar
   * compara entidades en vez de marcar una bandera. Quitar el botón sin más
   * dejaría sin manera de corregir una carga equivocada.
   *
   * Lo que se hizo es mover el gesto: para llegar hasta acá hay que haber
   * abierto a esa persona y estar viendo su nombre y sus instrumentos. Eso ya
   * es una confirmación, y a diferencia de un «¿estás seguro?» **muestra a
   * quién se está por quitar** en vez de preguntarlo en abstracto. Cuesta los
   * mismos dos toques que confirmar, y el primero de los dos es informativo.
   * La fila queda con un solo botón, así que no hay ningún toque equivocado
   * posible entre dos acciones distintas.
   *
   * Sigue sin ser irreversible de verdad: esto cambia la lista en pantalla y lo
   * que persiste es el «Guardar» de la banda, así que salir sin guardar deja
   * todo como estaba —y la guarda de salida lo pregunta—.
   */
  quitarIntegrante(): void {
    const id = this.integranteEditado();
    if (id === null) return;
    this.integrantes.update((l) => l.filter((m) => m.id !== id));
    this.cerrarDialogo();
  }

  async guardar(): Promise<void> {
    this.tocados.intentarGuardar();
    const b = this.banda();
    if (b === null) return;
    const guardada = { ...b, nombre: this.nombre().trim(), integrantes: this.integrantes() };
    const ok = await intentarGuardar(
      () => this.repos.guardarBanda(guardada), (m) => this.avisos.error(m), 'guardar la banda');
    if (!ok) return;
    // La entidad de referencia pasa a ser la guardada: si no, al volver el
    // formulario seguiría diferiendo de lo leído y preguntaría por cambios que
    // acaban de guardarse.
    this.banda.set(guardada);
    this.avisos.ok('Banda guardada.');
    await this.volver();
  }

  async borrar(): Promise<void> {
    const b = this.banda();
    if (b === null) return;
    const ok = await intentarGuardar(
      () => this.repos.borrarBanda(b.id), (m) => this.avisos.error(m), 'borrar la banda');
    if (!ok) { this.confirmarBorrado.set(false); return; }
    // Ya no hay contra qué comparar: sin esto, salir tras borrar preguntaría
    // por los cambios de una banda que ya no existe.
    this.banda.set(null);
    this.confirmarBorrado.set(false);
    this.avisos.ok('Banda borrada.');
    await this.volver();
  }

  volver(): Promise<boolean> {
    return this.router.navigate(['/perfiles']);
  }
}
