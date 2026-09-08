import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  crearIntegrante, reunirErrores, validarNombre, validarUnico,
  type BandMember, type BandMemberId, type BandProfile, type BandProfileId,
} from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  ButtonComponent, CamposTocados, CardComponent, DialogComponent, EmptyStateComponent,
  FieldComponent, PageHeaderComponent, ToastService,
} from '../ui';

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
    FormsModule, ButtonComponent, CardComponent, DialogComponent,
    EmptyStateComponent, FieldComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Banda"
        descripcion="Quiénes tocan y con qué. La asignación de canales se hace en la sesión, sobre los nombres que ya tiene la consola.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (banda() === null) {
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
                      @if (m.instrumentos) {
                        <span class="instrumentos">{{ m.instrumentos }}</span>
                      }
                    </div>
                    <ui-button class="solo-icono" variante="sutil" icono="borrar"
                               [rotuloAccesible]="'Quitar a ' + m.nombre"
                               (pulsado)="quitar(m.id)">Quitar</ui-button>
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

    <ui-dialog titulo="Nuevo integrante" [abierto]="nuevoAbierto()"
               (cerrado)="nuevoAbierto.set(false)">
      <div class="pila">
        <ui-field rotulo="Nombre" idControl="int-nombre" [error]="errorNuevoVisible()">
          <input id="int-nombre" type="text" [(ngModel)]="nuevoNombre"
                 (blur)="tocadosDialogo.marcar('nombre')" />
        </ui-field>
        <ui-field rotulo="Instrumentos" idControl="int-instr" [opcional]="true"
                  ayuda="Separados por comas: voz, guitarra acústica.">
          <input id="int-instr" type="text" [(ngModel)]="nuevoInstrumentos" />
        </ui-field>
      </div>
      <div pie>
        <ui-button variante="sutil" (pulsado)="nuevoAbierto.set(false)">Cancelar</ui-button>
        <ui-button variante="primario" [deshabilitado]="errorNuevo() !== null"
                   (pulsado)="agregar()">Agregar</ui-button>
      </div>
    </ui-dialog>

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
  `],
})
export class BandaEditComponent {
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
  readonly integrantesConTexto = computed(() => this.integrantes().map((m) => ({
    id: m.id,
    nombre: m.nombre,
    instrumentos: m.instrumentos.join(', '),
  })));
  private readonly otrosNombres = signal<readonly string[]>([]);

  readonly nuevoAbierto = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoInstrumentos = signal('');
  readonly confirmarBorrado = signal(false);

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

  readonly errorNuevo = computed(() => validarNombre(this.nuevoNombre(), 'El nombre'));

  /**
   * Los errores no se muestran hasta que el campo se abandona o se intenta
   * guardar. Siguen decidiendo si se puede guardar; lo que cambia es cuándo se
   * ven.
   */
  readonly tocados = new CamposTocados();
  readonly tocadosDialogo = new CamposTocados();
  readonly errorNombreVisible = this.tocados.visible('nombre', this.errorNombre);
  readonly errorNuevoVisible = this.tocadosDialogo.visible('nombre', this.errorNuevo);

  constructor() {
    effect(() => {
      const id = this.id();
      void this.cargar(id as BandProfileId);
    });
  }

  private async cargar(id: BandProfileId): Promise<void> {
    const [b, todas] = await Promise.all([this.repos.banda(id), this.repos.bandas()]);
    this.banda.set(b);
    if (b !== null) {
      this.nombre.set(b.nombre);
      this.integrantes.set(b.integrantes);
    }
    this.otrosNombres.set(todas.filter((x) => x.id !== id).map((x) => x.nombre));
  }

  abrirNuevo(): void {
    this.nuevoNombre.set('');
    this.nuevoInstrumentos.set('');
    this.tocadosDialogo.reiniciar();
    this.nuevoAbierto.set(true);
  }

  agregar(): void {
    const instrumentos = this.nuevoInstrumentos().split(',');
    this.integrantes.update((l) => [...l, crearIntegrante(this.nuevoNombre(), instrumentos)]);
    this.nuevoAbierto.set(false);
  }

  quitar(id: BandMemberId): void {
    this.integrantes.update((l) => l.filter((m) => m.id !== id));
  }

  async guardar(): Promise<void> {
    this.tocados.intentarGuardar();
    const b = this.banda();
    if (b === null) return;
    await this.repos.guardarBanda({
      ...b,
      nombre: this.nombre().trim(),
      integrantes: this.integrantes(),
    });
    this.avisos.ok('Banda guardada.');
    await this.volver();
  }

  async borrar(): Promise<void> {
    const b = this.banda();
    if (b === null) return;
    await this.repos.borrarBanda(b.id);
    this.confirmarBorrado.set(false);
    this.avisos.ok('Banda borrada.');
    await this.volver();
  }

  volver(): Promise<boolean> {
    return this.router.navigate(['/perfiles']);
  }
}
