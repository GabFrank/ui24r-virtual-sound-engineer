import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent, type NombreDeIcono } from './icon.component';

export type VarianteDeBoton = 'primario' | 'secundario' | 'sutil' | 'peligro';
export type TamanioDeBoton = 'md' | 'lg';

/**
 * Botón.
 *
 * Cuatro variantes y no más. La jerarquía es la que importa: en cualquier
 * pantalla hay a lo sumo un `primario`, porque si todo destaca nada destaca —
 * y acá el usuario decide en segundos, de pie y con prisa.
 *
 * `peligro` está reservado para lo destructivo o lo que suena en la sala. No
 * es un color más fuerte: es una categoría distinta y por eso además cambia
 * el texto del rótulo accesible.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button [type]="tipo()" [class]="clases()" [disabled]="deshabilitado() || cargando()"
            [attr.aria-busy]="cargando() ? 'true' : null"
            [attr.aria-label]="rotuloAccesible()"
            (click)="pulsado.emit()">
      @if (cargando()) {
        <span class="girador" aria-hidden="true"></span>
      } @else {
        @if (icono(); as i) {
          <ui-icon [nombre]="i" [tamanio]="tamanioDeIcono()" />
        }
      }
      <span class="texto"><ng-content /></span>
    </button>
  `,
  styles: [`
    @use 'tokens' as *;

    :host { display: inline-flex; }
    :host(.ancho), :host(.ancho) button { width: 100%; }

    button {
      display: inline-flex; align-items: center; justify-content: center;
      gap: var(--sp-2);
      min-height: var(--tap-min);
      padding: 0 var(--sp-4);
      border: 1px solid transparent;
      border-radius: var(--radio-md);
      background: transparent;
      color: var(--ink);
      font: inherit;
      font-weight: var(--peso-medio);
      cursor: pointer;
      transition: background var(--mov-rapido) var(--curva),
                  border-color var(--mov-rapido) var(--curva),
                  color var(--mov-rapido) var(--curva);
      /* Sin esto, un doble toque rápido en una tablet hace zoom en vez de
         disparar la acción dos veces. */
      touch-action: manipulation;
    }
    button.lg { min-height: var(--tap-comodo); padding: 0 var(--sp-5); font-size: var(--txt-lg); }

    button.primario { background: var(--signal); color: var(--sobre-signal); }
    button.primario:not(:disabled):active { background: var(--signal-pulsado); }

    button.secundario { border-color: var(--line-fuerte); color: var(--ink); }
    button.secundario:not(:disabled):active { background: var(--surface-2); }

    button.sutil { color: var(--ink-2); }
    button.sutil:not(:disabled):active { background: var(--surface-2); }

    button.peligro { border-color: var(--danger); color: var(--danger); }
    button.peligro:not(:disabled):active { background: var(--danger-tenue); }

    /* Deshabilitado: se atenúa el color, no toda la caja. Con opacidad al 42 %
       el texto quedaba en 2,3:1 y a un metro no se podía leer qué decía el
       botón que no responde, que es justo lo que hay que saber. */
    button:disabled { color: var(--muted); border-color: var(--line); cursor: default; }
    button.primario:disabled { background: var(--surface-3); color: var(--muted); }

    .girador {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid currentColor; border-top-color: transparent;
      animation: giro 700ms linear infinite;
    }
    @keyframes giro { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      /* Sin giro, pero tiene que seguir viéndose que algo está en curso. */
      .girador { animation: parpadeo 1.4s ease-in-out infinite; }
      @keyframes parpadeo { 50% { opacity: 0.3; } }
    }

    /* En teléfono el texto puede no entrar: se recorta con puntos suspensivos
       en vez de romper la fila de botones. */
    .texto { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* Solo icono: el texto sigue en el árbol para los lectores de pantalla,
       pero no ocupa espacio. No se puede reutilizar la clase global .sr
       porque los estilos del componente están encapsulados. */
    :host(.solo-icono) .texto {
      position: absolute; width: 1px; height: 1px;
      padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0 0 0 0); white-space: nowrap;
    }
    :host(.solo-icono) button { padding: 0; width: var(--tap-min); }
  `],
})
export class ButtonComponent {
  readonly variante = input<VarianteDeBoton>('secundario');
  readonly tamanio = input<TamanioDeBoton>('md');
  readonly icono = input<NombreDeIcono | null>(null);
  readonly deshabilitado = input(false);
  readonly cargando = input(false);
  readonly tipo = input<'button' | 'submit'>('button');
  /** Para el caso en que el texto visible no alcanza como nombre accesible. */
  readonly rotuloAccesible = input<string | null>(null);

  readonly pulsado = output<void>();

  protected readonly clases = computed(() => `${this.variante()} ${this.tamanio()}`);
  protected readonly tamanioDeIcono = computed(() => (this.tamanio() === 'lg' ? 22 : 20));
}
