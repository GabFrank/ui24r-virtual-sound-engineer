import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Encabezado de pantalla: título, descripción y acciones.
 *
 * La descripción no es decorativa. Esta aplicación propone cambios sobre un
 * sistema de sonido; cada pantalla tiene que decir en una frase qué hace y qué
 * no hace, porque la diferencia entre "esto lo aplico yo a mano" y "esto lo
 * escribe la aplicación en la consola" es la diferencia que más importa.
 */
@Component({
  selector: 'ui-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="texto">
      <!-- «tabindex=-1» para poder enfocarlo al navegar. En una aplicación de
           una sola página, cambiar de pantalla no mueve el foco ni anuncia
           nada: quien usa lector de pantalla o teclado se queda donde estaba,
           en la navegación. -->
      <h1 tabindex="-1">{{ titulo() }}</h1>
      @if (descripcion(); as d) { <p>{{ d }}</p> }
    </div>
    <div class="acciones"><ng-content /></div>
  `,
  styles: [`
    @use 'tokens' as *;

    :host {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: var(--sp-4);
      margin-bottom: var(--sp-5);
    }
    h1 {
      font-size: var(--txt-xl); font-weight: var(--peso-medio);
      line-height: var(--alto-linea-apretado);
    }
    p {
      margin-top: var(--sp-2);
      max-width: var(--ancho-lectura);
      color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
    }
    .acciones { display: flex; gap: var(--sp-2); flex: none; }
    .acciones:empty { display: none; }

    @include hasta($bp-telefono) {
      :host { flex-direction: column; gap: var(--sp-3); margin-bottom: var(--sp-4); }
      .acciones { width: 100%; }
      .acciones ::ng-deep ui-button { flex: 1; }
    }
  `],
})
export class PageHeaderComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input<string | null>(null);
}
