import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { FuenteId, Instrumento, RolDeInstrumento, VarianteId } from '@vse/domain';
import { ButtonComponent, IconComponent } from '../ui';
import {
  FUENTES_ELEGIBLES, agregarFuente, alternarRol, alternarVariante, filasDeInstrumentos,
  quitarInstrumento,
} from './elegir-instrumentos';

let contador = 0;

/**
 * Elegir los instrumentos de un integrante, del catálogo.
 *
 * **Para quién.** Un músico de pie, a un metro de la tablet, con poca luz, tres
 * minutos antes de empezar y a veces con un instrumento en la mano. Eso descarta
 * la cascada de tres menús —fuente, después variante, después rol— aunque el
 * catálogo tenga tres facetas: cada menú anidado es un toque preciso más y un
 * sitio más donde perderse.
 *
 * **La interacción, en un orden.**
 *
 * 1. La grilla de fuentes está siempre a la vista, abajo, con blancos grandes.
 *    Un toque agrega el instrumento. La fuente es lo único que el usuario trae
 *    decidido de antemano —«voz», «djembe»— y por eso es lo único obligatorio.
 * 2. Recién entonces, y solo si esa fuente las declara, la fila que se acaba de
 *    agregar muestra sus variantes y sus roles. Lo que la fuente no admite no
 *    se dibuja: no hay opción imposible que descartar porque no llega a verse.
 * 3. Se pueden sumar todos los que hagan falta. Alguien canta y toca la
 *    guitarra, y dos congas son dos filas.
 * 4. Lo elegido está arriba, en una lista, cada fila con su «Quitar».
 *
 * **Por qué las facetas se ven desplegadas y no detrás de un toque.** Esconder
 * la variante y el rol tras un «afinar» ahorra alto de pantalla y cuesta un
 * descubrimiento: con poca luz y prisa, lo que no se ve no existe. Y el gesto
 * que las abriría estaría pegado al que quita la fila.
 *
 * **Lo que se agrega y lo que se quita, separados.** La grilla que agrega está
 * debajo de una línea y a una separación grande de la última fila, que es la
 * que lleva el «Quitar» más cercano. A un metro, con una mano, la distancia
 * entre esos dos blancos es lo único que evita el toque equivocado.
 */
@Component({
  selector: 'app-elegir-instrumentos',
  standalone: true,
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Instrumentos</legend>

      @if (filas().length === 0) {
        <p class="vacio">
          Ninguno todavía. No es obligatorio, pero elegirlos es lo que después trae
          el perfil de canal que le corresponde a cada uno.
        </p>
      } @else {
        <ul class="elegidos">
          @for (fila of filas(); track fila.indice) {
            <li>
              <div class="cabecera">
                <span class="etiqueta">{{ fila.etiqueta }}</span>
                <ui-button class="solo-icono" variante="sutil" icono="borrar"
                           [rotuloAccesible]="'Quitar ' + fila.etiqueta"
                           (pulsado)="quitar(fila.indice)">Quitar</ui-button>
              </div>

              @if (fila.nota; as n) { <p class="nota">{{ n }}</p> }

              @if (fila.variantes.length > 0) {
                <div class="faceta">
                  <span class="rotulo">Cuál</span>
                  <div class="fichas">
                    @for (v of fila.variantes; track v.id) {
                      <button type="button" class="ficha" [class.elegida]="v.elegida"
                              [attr.aria-pressed]="v.elegida"
                              [attr.aria-label]="v.nombre + ' — ' + fila.etiqueta"
                              (click)="tocarVariante(fila.indice, v.id)">
                        <span class="tilde"><ui-icon nombre="chequeo" /></span>
                        <span>{{ v.nombre }}</span>
                      </button>
                    }
                  </div>
                </div>
              }

              @if (fila.roles.length > 0) {
                <div class="faceta">
                  <span class="rotulo">Para qué</span>
                  <div class="fichas">
                    @for (r of fila.roles; track r.id) {
                      <button type="button" class="ficha" [class.elegida]="r.elegida"
                              [attr.aria-pressed]="r.elegida"
                              [attr.aria-label]="r.nombre + ' — ' + fila.etiqueta"
                              (click)="tocarRol(fila.indice, r.id)">
                        <span class="tilde"><ui-icon nombre="chequeo" /></span>
                        <span>{{ r.nombre }}</span>
                      </button>
                    }
                  </div>
                </div>
              }
            </li>
          }
        </ul>
      }

      <div class="agregar">
        <p class="rotulo" [id]="idAgregar">Agregar</p>
        <div class="grilla" role="group" [attr.aria-labelledby]="idAgregar">
          @for (f of fuentes; track f.id) {
            <button type="button" class="fuente" [attr.data-fuente]="f.id"
                    (click)="agregar(f.id)">{{ f.nombre }}</button>
          }
        </div>
      </div>
    </fieldset>
  `,
  styles: [`
    @use 'tokens' as *;

    :host { display: block; }

    /* El grupo es un «fieldset» y no un campo con rótulo: lo que hay dentro son
       muchos controles, y un «label» con «for» apuntaría a uno solo. */
    fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
    legend {
      padding: 0;
      font-size: var(--txt-sm);
      color: var(--ink-2);
      margin-bottom: var(--sp-2);
    }

    .vacio { color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }

    .elegidos { list-style: none; margin: 0; padding: 0; }
    .elegidos li {
      padding: var(--sp-3) 0;
      border-bottom: 1px solid var(--line);
    }
    .elegidos li:first-child { padding-top: 0; }
    .elegidos li:last-child { border-bottom: 0; }

    .cabecera {
      display: flex; align-items: center; justify-content: space-between;
      gap: var(--sp-3);
      min-height: var(--tap-min);
    }
    /* Envuelve, no se recorta con puntos suspensivos. «guitarra de cuerda de
       acero, refuerzo» no entra en el ancho de un teléfono, y un nombre de
       instrumento cortado a la mitad a un metro de distancia no se reconoce. */
    .etiqueta { min-width: 0; overflow-wrap: anywhere; line-height: var(--alto-linea-apretado); }

    .nota { font-size: var(--txt-xs); color: var(--muted); line-height: var(--alto-linea); }

    /* Rótulo a la izquierda y fichas a la derecha mientras haya ancho; en
       teléfono se apila solo, sin consulta de medios: el rótulo ocupa el ancho
       que necesite y las fichas envuelven debajo. */
    .faceta {
      display: flex; flex-wrap: wrap; align-items: baseline;
      gap: var(--sp-2) var(--sp-3);
      margin-top: var(--sp-2);
    }
    .rotulo { font-size: var(--txt-xs); color: var(--muted); flex: none; }
    .fichas { display: flex; flex-wrap: wrap; gap: var(--sp-2); flex: 1; }

    .ficha {
      display: inline-flex; align-items: center; gap: var(--sp-2);
      min-height: var(--tap-min);
      padding: 0 var(--sp-3);
      border: 1px solid var(--line-fuerte);
      border-radius: var(--radio-full);
      background: var(--surface-2);
      color: var(--ink-2);
      font: inherit;
      cursor: pointer;
      touch-action: manipulation;
      transition: background var(--mov-rapido) var(--curva),
                  border-color var(--mov-rapido) var(--curva);
    }
    /* La ficha elegida lleva además el tilde: el color no puede ser el único
       portador, y acá decide qué se guarda.

       El tilde ocupa su sitio siempre y solo se esconde, no se quita. Si
       apareciera al elegir, la ficha crecería y empujaría a las de al lado:
       corregir la tesitura que se acaba de elegir mal exigiría apuntar a un
       blanco que se movió justo después del toque anterior. */
    .tilde { display: inline-flex; visibility: hidden; }
    .ficha.elegida .tilde { visibility: visible; }
    .ficha.elegida {
      background: var(--signal-tenue);
      border-color: var(--signal);
      color: var(--ink);
      font-weight: var(--peso-medio);
    }
    .ficha:active { background: var(--surface-3); }

    /* Lo que agrega, separado de lo que quita.
       La última fila termina en su «Quitar» y acá arranca la grilla: sin esta
       separación y sin la línea, los dos blancos quedan a un espacio de
       distancia y el error se paga borrando algo. */
    .agregar {
      margin-top: var(--sp-5);
      padding-top: var(--sp-5);
      border-top: 1px solid var(--line-fuerte);
    }
    .agregar .rotulo { display: block; margin-bottom: var(--sp-2); }

    /* Cuántas columnas entran lo decide el ancho, no el dispositivo. El mínimo
       son dos blancos cómodos de ancho: por debajo, «entrada de línea» parte en
       tres renglones. */
    .grilla {
      display: grid;
      gap: var(--sp-2);
      grid-template-columns: repeat(auto-fill, minmax(calc(var(--tap-comodo) * 2), 1fr));
    }
    .fuente {
      min-height: var(--tap-comodo);
      padding: var(--sp-2);
      border: 1px solid var(--line-fuerte);
      border-radius: var(--radio-md);
      background: var(--surface-2);
      color: var(--ink);
      font: inherit;
      line-height: var(--alto-linea-apretado);
      text-align: center;
      cursor: pointer;
      touch-action: manipulation;
      transition: background var(--mov-rapido) var(--curva);
    }
    .fuente:active { background: var(--surface-3); }
  `],
})
export class ElegirInstrumentosComponent {
  readonly instrumentos = input.required<readonly Instrumento[]>();

  /**
   * La lista entera, no el cambio.
   *
   * Quien nos usa guarda una señal con la lista y la reemplaza: así el estado
   * vive en un solo sitio y este componente no tiene ninguno propio que se
   * pueda desincronizar al reabrir el diálogo.
   */
  readonly cambiado = output<readonly Instrumento[]>();

  readonly fuentes = FUENTES_ELEGIBLES;

  /** Enlaza la grilla con su rótulo. Sin esto el lector de pantalla lee trece
   *  botones sueltos y no dice para qué sirven. */
  protected readonly idAgregar = `instr-agregar-${++contador}`;

  readonly filas = computed(() => filasDeInstrumentos(this.instrumentos()));

  agregar(fuente: FuenteId): void {
    this.cambiado.emit(agregarFuente(this.instrumentos(), fuente));
  }

  quitar(indice: number): void {
    this.cambiado.emit(quitarInstrumento(this.instrumentos(), indice));
  }

  tocarVariante(indice: number, variante: VarianteId): void {
    this.cambiado.emit(alternarVariante(this.instrumentos(), indice, variante));
  }

  tocarRol(indice: number, rol: RolDeInstrumento): void {
    this.cambiado.emit(alternarRol(this.instrumentos(), indice, rol));
  }
}
