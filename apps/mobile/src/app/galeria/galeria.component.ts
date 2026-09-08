import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent,
  FieldComponent, IconComponent, PageHeaderComponent, StatComponent, StepperComponent,
  ToastService, type NombreDeIcono, type PasoDeAsistente,
} from '../ui';

const ICONOS: readonly NombreDeIcono[] = [
  'atras', 'adelante', 'cerrar', 'mas', 'menos', 'chequeo', 'aviso', 'error',
  'info', 'buscar', 'ajustes', 'medidor', 'canales', 'ganancia', 'sesion',
  'banda', 'local', 'historial', 'descargar', 'refrescar', 'paro', 'conectar',
  'editar', 'borrar', 'guardar', 'menu', 'expandir', 'contraer',
];

const PASOS: readonly PasoDeAsistente[] = [
  { id: 'banda', titulo: 'Banda' },
  { id: 'local', titulo: 'Local' },
  { id: 'consola', titulo: 'Consola' },
  { id: 'canales', titulo: 'Canales' },
  { id: 'listo', titulo: 'Listo' },
];

/**
 * Galería del sistema de diseño.
 *
 * No es una demostración: es la referencia viva. Cuando alguien duda de qué
 * variante de botón corresponde, mira acá y ve las cuatro juntas. Y es lo que
 * se captura para revisar el diseño sin tener que recorrer la aplicación
 * entera pantalla por pantalla.
 *
 * Solo se muestra en compilaciones de desarrollo.
 */
@Component({
  selector: 'app-galeria',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, CardComponent, DialogComponent, EmptyStateComponent,
    FieldComponent, IconComponent, PageHeaderComponent, StatComponent, StepperComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Sistema de diseño"
        descripcion="Referencia viva de las fichas y las primitivas. Si un componente necesita algo que no está acá, primero se agrega acá.">
        <ui-button variante="secundario" icono="refrescar" (pulsado)="avisar()">Probar aviso</ui-button>
      </ui-page-header>

      <div class="pila-lg">

        <ui-card titulo="Superficies y texto" subtitulo="Cuatro niveles de superficie, tres de texto">
          <div class="muestras">
            @for (m of superficies; track m.nombre) {
              <div class="muestra" [style.background]="'var(' + m.ficha + ')'">
                <code>{{ m.ficha }}</code>
              </div>
            }
          </div>
          <div class="pila-sm textos">
            <p style="color: var(--ink)">Texto principal — lo que hay que leer</p>
            <p style="color: var(--ink-2)">Texto secundario — contexto y rótulos</p>
            <p style="color: var(--muted)">Texto atenuado — el mínimo legible; por debajo se quita, no se aclara menos</p>
          </div>
        </ui-card>

        <ui-card titulo="Color con significado" subtitulo="Ninguno es decorativo">
          <div class="racimo">
            <ui-badge tono="neutro">Sin medir</ui-badge>
            <ui-badge tono="senal">Propuesto</ui-badge>
            <ui-badge tono="ok">Confirmado</ui-badge>
            <ui-badge tono="aviso">Sin verificar</ui-badge>
            <ui-badge tono="peligro">Rechazado</ui-badge>
          </div>
          <p class="pie">Cada estado lleva texto además de color: el tono solo refuerza.</p>
        </ui-card>

        <ui-card titulo="Botones" subtitulo="Un solo primario por pantalla">
          <div class="pila">
            <div class="racimo">
              <ui-button variante="primario" icono="guardar">Guardar</ui-button>
              <ui-button variante="secundario" icono="editar">Editar</ui-button>
              <ui-button variante="sutil" icono="info">Detalles</ui-button>
              <ui-button variante="peligro" icono="borrar">Borrar</ui-button>
            </div>
            <div class="racimo">
              <ui-button variante="primario" tamanio="lg" icono="medidor">Empezar a medir</ui-button>
              <ui-button variante="secundario" [cargando]="true">Cargando</ui-button>
              <ui-button variante="secundario" [deshabilitado]="true">Deshabilitado</ui-button>
              <ui-button class="solo-icono" variante="secundario" icono="ajustes"
                         rotuloAccesible="Ajustes">Ajustes</ui-button>
            </div>
          </div>
        </ui-card>

        <ui-card titulo="Números" subtitulo="El producto de la aplicación">
          <div class="rejilla">
            <ui-stat rotulo="Pico" valor="-4.2" unidad=" dBFS" tono="aviso" nota="cerca de saturar" />
            <ui-stat rotulo="Margen" valor="12.0" unidad=" dB" tono="ok" />
            <ui-stat rotulo="Puntaje de sala" valor="79" tono="senal" nota="σ ± 3" />
            <ui-stat rotulo="Retardo" valor="8.4" unidad=" ms" />
          </div>
        </ui-card>

        <ui-card titulo="Campos">
          <div class="pila" style="max-width: var(--ancho-formulario)">
            <ui-field rotulo="Nombre de la banda" idControl="g-nombre"
                      ayuda="Se usa para agrupar las sesiones en el historial.">
              <input id="g-nombre" type="text" value="Los del Fondo" />
            </ui-field>
            <ui-field rotulo="Metros cuadrados" idControl="g-m2" [opcional]="true"
                      error="Tiene que ser un número mayor que cero.">
              <input id="g-m2" inputmode="decimal" value="0" />
            </ui-field>
            <ui-field rotulo="Notas" idControl="g-notas" [opcional]="true">
              <textarea id="g-notas" placeholder="Lo que convenga recordar del lugar"></textarea>
            </ui-field>
          </div>
        </ui-card>

        <ui-card titulo="Asistentes">
          <ui-stepper [pasos]="pasos" [indice]="2" />
          <div class="racimo">
            <ui-button variante="sutil" icono="atras">Atrás</ui-button>
            <ui-button variante="primario" icono="adelante">Siguiente</ui-button>
          </div>
        </ui-card>

        <ui-card titulo="Estados vacíos" class="sin-relleno">
          <ui-empty icono="sesion" titulo="Todavía no hay sesiones"
                    detalle="Una sesión agrupa todo lo que pasa en un lugar y una fecha: mediciones, recomendaciones y lo que se aplicó.">
            <ui-button variante="primario" icono="mas">Nueva sesión</ui-button>
          </ui-empty>
        </ui-card>

        <ui-card titulo="Diálogo">
          <ui-button variante="secundario" (pulsado)="abierto.set(true)">Abrir diálogo</ui-button>
        </ui-card>

        <ui-card titulo="Iconos" subtitulo="Trazados en el código: la aplicación arranca sin red">
          <div class="iconos">
            @for (i of iconos; track i) {
              <div class="icono"><ui-icon [nombre]="i" [tamanio]="22" /><code>{{ i }}</code></div>
            }
          </div>
        </ui-card>

      </div>
    </div>

    <ui-dialog titulo="Confirmar" [abierto]="abierto()" (cerrado)="abierto.set(false)">
      <p class="lectura">
        En teléfono este diálogo se ancla abajo y ocupa el ancho completo, que es
        donde llega el pulgar. En tablet queda centrado.
      </p>
      <div pie>
        <ui-button variante="sutil" (pulsado)="abierto.set(false)">Cancelar</ui-button>
        <ui-button variante="primario" (pulsado)="abierto.set(false)">Confirmar</ui-button>
      </div>
    </ui-dialog>
  `,
  styles: [`
    .muestras { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-4); }
    .muestra {
      flex: 1 1 120px; min-height: 64px;
      display: flex; align-items: flex-end; padding: var(--sp-2);
      border: 1px solid var(--line); border-radius: var(--radio-md);
    }
    code { font-family: var(--mono); font-size: var(--txt-xs); color: var(--muted); }
    .textos p { line-height: var(--alto-linea); }
    .pie { margin-top: var(--sp-3); font-size: var(--txt-sm); color: var(--muted); }

    .iconos { display: grid; gap: var(--sp-3); grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); }
    .icono {
      display: flex; flex-direction: column; align-items: center; gap: var(--sp-2);
      padding: var(--sp-3); border: 1px solid var(--line); border-radius: var(--radio-md);
      color: var(--ink-2);
    }
  `],
})
export class GaleriaComponent {
  private readonly avisos = inject(ToastService);

  readonly iconos = ICONOS;
  readonly pasos = PASOS;
  readonly abierto = signal(false);

  readonly superficies = [
    { nombre: 'fondo', ficha: '--bg' },
    { nombre: 'superficie', ficha: '--surface' },
    { nombre: 'superficie 2', ficha: '--surface-2' },
    { nombre: 'superficie 3', ficha: '--surface-3' },
  ];

  avisar(): void {
    this.avisos.ok('Así se ve un aviso efímero.');
  }
}
