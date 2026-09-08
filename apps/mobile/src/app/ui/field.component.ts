import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, viewChild,
} from '@angular/core';

let contador = 0;

/**
 * Envoltorio de campo de formulario: rótulo, ayuda y error.
 *
 * El control real va por proyección de contenido, así que este componente no
 * sabe nada de formularios de Angular y sirve igual para un `input`, un
 * `select` o un grupo de botones de opción.
 *
 * El rótulo se enlaza al control por identificador generado acá. Es la parte
 * aburrida y la que siempre se olvida: sin ella, tocar el rótulo no enfoca el
 * campo y el lector de pantalla lee un control sin nombre.
 */
@Component({
  selector: 'ui-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [attr.for]="idControl()">
      {{ rotulo() }}
      @if (opcional()) { <span class="opcional">opcional</span> }
    </label>

    <div class="control" [class.con-error]="!!error()" #caja>
      <ng-content />
    </div>

    @if (error(); as e) {
      <p class="error" [id]="idError()" role="alert">{{ e }}</p>
    } @else {
      @if (ayuda(); as a) {
        <p class="ayuda" [id]="idAyuda()">{{ a }}</p>
      }
    }
  `,
  styles: [`
    :host { display: block; }

    label {
      display: flex; align-items: baseline; gap: var(--sp-2);
      font-size: var(--txt-sm);
      color: var(--ink-2);
      margin-bottom: var(--sp-2);
    }
    .opcional {
      font-size: var(--txt-xs); color: var(--muted);
      text-transform: lowercase;
    }

    /* Los estilos del control se aplican desde acá con ::ng-deep acotado al
       propio componente: el control lo proyecta quien nos usa, y pedirle que
       repita quince líneas de estilo en cada formulario sería peor. */
    .control ::ng-deep input,
    .control ::ng-deep select,
    .control ::ng-deep textarea {
      width: 100%;
      min-height: var(--tap-min);
      padding: var(--sp-2) var(--sp-3);
      background: var(--surface-2);
      border: 1px solid var(--line-fuerte);
      border-radius: var(--radio-md);
      color: var(--ink);
      font: inherit;
      transition: border-color var(--mov-rapido) var(--curva);
    }
    .control ::ng-deep textarea { min-height: 96px; resize: vertical; line-height: var(--alto-linea); }
    .control ::ng-deep input:focus,
    .control ::ng-deep select:focus,
    .control ::ng-deep textarea:focus { border-color: var(--signal); }
    .control.con-error ::ng-deep input,
    .control.con-error ::ng-deep select,
    .control.con-error ::ng-deep textarea { border-color: var(--danger); }

    /* El teclado numérico del sistema alinea mejor si el campo es monoespaciado. */
    .control ::ng-deep input[inputmode='decimal'],
    .control ::ng-deep input[inputmode='numeric'] {
      font-family: var(--mono); font-variant-numeric: tabular-nums;
    }

    .ayuda, .error { margin-top: var(--sp-2); font-size: var(--txt-sm); line-height: 1.4; }
    .ayuda { color: var(--muted); }
    .error { color: var(--danger); }
  `],
})
export class FieldComponent {
  readonly rotulo = input.required<string>();
  readonly idControl = input<string>(`campo-${++contador}`);
  readonly ayuda = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly opcional = input(false);

  protected readonly idAyuda = computed(() => `${this.idControl()}-ayuda`);
  protected readonly idError = computed(() => `${this.idControl()}-error`);

  /**
   * `viewChild` y no `contentChild`: la caja es un elemento de la plantilla de
   * este componente, no contenido proyectado. Lo proyectado es lo que va
   * dentro. Con `contentChild.required` la consulta nunca encontraba nada y
   * Angular lanzaba NG0951 en cada pintado — lo detectó el recorrido
   * automático, que falla ante cualquier error de consola.
   */
  private readonly caja = viewChild.required<ElementRef<HTMLElement>>('caja');

  constructor() {
    /**
     * Enlaza el control proyectado con su ayuda y su error.
     *
     * El componente ya generaba los dos identificadores y los ponía como «id»
     * en los párrafos, pero ningún control los referenciaba: el error existía
     * visualmente y no existía programáticamente. Un lector de pantalla lo
     * anunciaba una vez al aparecer, por el «role=alert», y si el usuario
     * volvía al campo después leía «Nombre, cuadro de edición» y nada más.
     *
     * Se hace desde acá y no desde quien usa el componente porque el control
     * llega por proyección de contenido: pedirle a cada formulario que repita
     * tres atributos es cómo se llega a que la mitad no los tenga.
     */
    effect(() => {
      const control = this.caja().nativeElement.querySelector('input, select, textarea');
      if (!(control instanceof HTMLElement)) return;

      const hayError = this.error() !== null;
      const descriptores = hayError ? this.idError() : (this.ayuda() === null ? null : this.idAyuda());

      if (descriptores === null) control.removeAttribute('aria-describedby');
      else control.setAttribute('aria-describedby', descriptores);

      if (hayError) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    });
  }
}
