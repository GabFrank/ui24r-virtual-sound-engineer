import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  reunirErrores, validarNombre, validarRangoUtil, validarUnico,
  type BusRef, type PAComponentSpec, type PAProfile, type PAProfileId,
} from '@vse/domain';
import { Repositorios } from '../core/repos/repositorios';
import {
  BadgeComponent, ButtonComponent, CardComponent, DialogComponent,
  FieldComponent, PageHeaderComponent, ToastService,
} from '../ui';

function textoDeBus(b: BusRef): string {
  switch (b.tipo) {
    case 'MASTER': return 'General';
    case 'AUX': return `Auxiliar ${b.indice}`;
    case 'MTX': return `Matriz ${b.indice}`;
  }
}

/**
 * Edición de un sistema de amplificación.
 *
 * Dos datos de esta pantalla condicionan todo lo que la aplicación puede
 * proponer después, y por eso están explicados en la propia pantalla y no solo
 * en la documentación:
 *
 * - **El rango útil.** Fuera de él no se generan recomendaciones. Pedirle
 *   20 Hz a un sistema que empieza en 60 produce una corrección absurda y
 *   potencialmente destructiva.
 * - **Qué componentes se pueden silenciar por separado.** Medir «solo el lado
 *   izquierdo» únicamente es posible si ese lado tiene un bus con silencio
 *   propio (INV-028). En un general estéreo con un solo silencio no se puede,
 *   y decir lo contrario haría que la aplicación ofreciera una medición que no
 *   puede hacer.
 */
@Component({
  selector: 'app-pa-edit',
  standalone: true,
  imports: [
    FormsModule, BadgeComponent, ButtonComponent, CardComponent, DialogComponent,
    FieldComponent, PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Sistema de amplificación"
        descripcion="Qué equipo hay. Dos datos de acá condicionan todo lo que la aplicación puede proponer después: hasta dónde llega el sistema y qué partes se pueden silenciar por separado.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (pa() !== null) {
        <div class="pila-lg">
          <ui-card titulo="Identidad">
            <div class="pila">
              <ui-field rotulo="Nombre" idControl="pa-nombre" [error]="errorNombre()">
                <input id="pa-nombre" type="text" [(ngModel)]="nombre" />
              </ui-field>
              <ui-field rotulo="Cajas principales" idControl="pa-cajas"
                        ayuda="Marca y modelo, o una descripción que sirva para reconocerlas.">
                <input id="pa-cajas" type="text" [(ngModel)]="cajas" />
              </ui-field>
              <ui-field rotulo="Subgraves" idControl="pa-subs" [opcional]="true">
                <input id="pa-subs" type="text" [(ngModel)]="subs" />
              </ui-field>
            </div>
          </ui-card>

          <ui-card titulo="Rango útil">
            <div class="rango">
              <ui-field rotulo="Desde" idControl="pa-desde">
                <input id="pa-desde" inputmode="numeric" [(ngModel)]="desde" />
              </ui-field>
              <ui-field rotulo="Hasta" idControl="pa-hasta">
                <input id="pa-hasta" inputmode="numeric" [(ngModel)]="hasta" />
              </ui-field>
            </div>
            @if (errorRango(); as e) {
              <p class="error">{{ e }}</p>
            }
            <p class="nota">
              En hercios. Es el rango donde el sistema entrega nivel útil, no el
              del folleto. <strong>Fuera de él no se generan recomendaciones:</strong>
              pedirle 40 Hz a un par de cajas de doce pulgadas produce una
              corrección absurda y potencialmente destructiva.
            </p>
          </ui-card>

          <ui-card titulo="Componentes"
                   [subtitulo]="componentes().length + ' declarados'">
            <ui-button acciones variante="secundario" icono="mas"
                       (pulsado)="abrirNuevo()">Agregar</ui-button>

            <ul class="lista">
              @for (c of componentes(); track c.nombre) {
                <li>
                  <div class="quien">
                    <span class="nombre">{{ c.nombre }}</span>
                    <span class="bus">{{ textoBus(c.bus) }}</span>
                  </div>
                  @if (c.silenciable) {
                    <ui-badge tono="ok">Silenciable</ui-badge>
                  } @else {
                    <ui-badge tono="neutro">Sin silencio propio</ui-badge>
                  }
                  <ui-button class="solo-icono" variante="sutil" icono="borrar"
                             [rotuloAccesible]="'Quitar ' + c.nombre"
                             (pulsado)="quitar(c.nombre)">Quitar</ui-button>
                </li>
              }
            </ul>

            @if (!hayAlgunSilenciable()) {
              <p class="nota aviso">
                Ningún componente tiene silencio propio, así que no se va a
                poder medir por componente (INV-028). Es lo normal en un
                general estéreo con un solo silencio; solo cambia si hay
                auxiliares o matrices separadas por lado.
              </p>
            }
          </ui-card>

          <div class="racimo racimo-fin">
            <ui-button variante="primario" icono="guardar" [deshabilitado]="!sePuedeGuardar()"
                       (pulsado)="guardar()">Guardar</ui-button>
          </div>
        </div>
      }
    </div>

    <ui-dialog titulo="Nuevo componente" [abierto]="nuevoAbierto()"
               (cerrado)="nuevoAbierto.set(false)">
      <div class="pila">
        <ui-field rotulo="Nombre" idControl="comp-nombre" [error]="errorNuevo()"
                  ayuda="Por ejemplo: lado izquierdo, subgraves, refuerzo de fondo.">
          <input id="comp-nombre" type="text" [(ngModel)]="nuevoNombre" />
        </ui-field>
        <ui-field rotulo="Sale por" idControl="comp-bus">
          <select id="comp-bus" [(ngModel)]="nuevoBus">
            <option value="MASTER">General</option>
            @for (i of indices; track i) { <option [value]="'AUX' + i">Auxiliar {{ i }}</option> }
            @for (i of indices; track i) { <option [value]="'MTX' + i">Matriz {{ i }}</option> }
          </select>
        </ui-field>
        <ui-field rotulo="¿Tiene silencio propio?" idControl="comp-mute"
                  ayuda="Solo si se puede silenciar sin silenciar el resto. Es lo que decide si se puede medir por separado.">
          <select id="comp-mute" [ngModel]="nuevoSilenciableTexto()" (ngModelChange)="fijarSilenciable($event)">
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </ui-field>
      </div>
      <div pie>
        <ui-button variante="sutil" (pulsado)="nuevoAbierto.set(false)">Cancelar</ui-button>
        <ui-button variante="primario" [deshabilitado]="errorNuevo() !== null"
                   (pulsado)="agregar()">Agregar</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    @use 'tokens' as *;
    .rango { display: grid; gap: var(--sp-3); grid-template-columns: 1fr 1fr; }
    .nota { margin-top: var(--sp-3); color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
    .nota.aviso { color: var(--warn); }
    .error { margin-top: var(--sp-2); color: var(--danger); font-size: var(--txt-sm); }
    .lista { list-style: none; margin: 0; padding: 0; }
    .lista li {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-2) 0; border-bottom: 1px solid var(--line);
    }
    .lista li:last-child { border-bottom: 0; }
    .quien { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .bus { font-size: var(--txt-sm); color: var(--muted); }
  `],
})
export class PaEditComponent {
  private readonly repos = inject(Repositorios);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);

  readonly id = input.required<string>();
  readonly indices = [1, 2, 3, 4, 5, 6];

  readonly pa = signal<PAProfile | null>(null);
  private readonly otrosNombres = signal<readonly string[]>([]);

  readonly nombre = signal('');
  readonly cajas = signal('');
  readonly subs = signal('');
  readonly desde = signal('60');
  readonly hasta = signal('16000');
  readonly componentes = signal<readonly PAComponentSpec[]>([]);

  readonly nuevoAbierto = signal(false);
  readonly nuevoNombre = signal('');
  readonly nuevoBus = signal('MASTER');
  readonly nuevoSilenciable = signal(false);

  readonly textoBus = textoDeBus;

  readonly nuevoSilenciableTexto = computed(() => (this.nuevoSilenciable() ? 'si' : 'no'));

  readonly hayAlgunSilenciable = computed(() => this.componentes().some((c) => c.silenciable));

  readonly errorNombre = computed(() =>
    validarNombre(this.nombre(), 'El nombre del sistema')
    ?? validarUnico(this.nombre(), this.otrosNombres(), 'Ese nombre de sistema'));

  readonly errorRango = computed(
    () => validarRangoUtil(Number(this.desde()), Number(this.hasta())));

  readonly sePuedeGuardar = computed(() => Object.keys(reunirErrores({
    nombre: this.errorNombre(), rango: this.errorRango(),
  })).length === 0);

  readonly errorNuevo = computed(() => {
    const base = validarNombre(this.nuevoNombre(), 'El nombre');
    if (base !== null) return base;
    return validarUnico(
      this.nuevoNombre(),
      this.componentes().map((c) => c.nombre),
      'Ese nombre de componente',
    );
  });

  constructor() {
    effect(() => {
      const id = this.id();
      void this.cargar(id as PAProfileId);
    });
  }

  private async cargar(id: PAProfileId): Promise<void> {
    const [p, todos] = await Promise.all([this.repos.pa(id), this.repos.pas()]);
    this.pa.set(p);
    this.otrosNombres.set(todos.filter((x) => x.id !== id).map((x) => x.nombre));
    if (p === null) return;
    this.nombre.set(p.nombre);
    this.cajas.set(p.cajasPrincipales);
    this.subs.set(p.subgraves ?? '');
    this.desde.set(String(p.rangoUtilHz[0]));
    this.hasta.set(String(p.rangoUtilHz[1]));
    this.componentes.set(p.componentes);
  }

  abrirNuevo(): void {
    this.nuevoNombre.set('');
    this.nuevoBus.set('MASTER');
    this.nuevoSilenciable.set(false);
    this.nuevoAbierto.set(true);
  }

  fijarSilenciable(v: string): void { this.nuevoSilenciable.set(v === 'si'); }

  private aBus(v: string): BusRef {
    if (v === 'MASTER') return { tipo: 'MASTER' };
    const indice = Number(v.slice(3));
    return v.startsWith('AUX') ? { tipo: 'AUX', indice } : { tipo: 'MTX', indice };
  }

  agregar(): void {
    this.componentes.update((l) => [...l, {
      nombre: this.nuevoNombre().trim(),
      bus: this.aBus(this.nuevoBus()),
      silenciable: this.nuevoSilenciable(),
    }]);
    this.nuevoAbierto.set(false);
  }

  quitar(nombre: string): void {
    this.componentes.update((l) => l.filter((c) => c.nombre !== nombre));
  }

  async guardar(): Promise<void> {
    const p = this.pa();
    if (p === null) return;
    // Los buses sobre los que se permite escribir ecualización se derivan de
    // los componentes: nunca se escribe sobre un bus que el usuario no declaró
    // como parte del sistema (INV-008).
    const outputBuses = this.componentes().map((c) => c.bus);
    await this.repos.guardarPa({
      ...p,
      nombre: this.nombre().trim(),
      cajasPrincipales: this.cajas().trim(),
      subgraves: this.subs().trim() === '' ? null : this.subs().trim(),
      rangoUtilHz: [Number(this.desde()), Number(this.hasta())],
      componentes: this.componentes(),
      outputBuses: outputBuses.length > 0 ? outputBuses : [{ tipo: 'MASTER' }],
    });
    this.avisos.ok('Sistema guardado.');
    await this.volver();
  }

  volver(): Promise<boolean> { return this.router.navigate(['/perfiles']); }
}
