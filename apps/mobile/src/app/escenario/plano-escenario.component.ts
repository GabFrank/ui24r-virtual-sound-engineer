import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output,
  signal, viewChild, type OnDestroy,
} from '@angular/core';
import type { Emplazamiento } from '@vse/domain';
import {
  aPantalla, calcularEscala, elDedoEsMasGruesoQueLaDuda, moverArrastre, precisionDelDedoM,
  puntaDeLaFlecha, radioIncertidumbrePx,
  BLANCO_MINIMO_PX, type Arrastre, type DimensionesDelLocal, type FichaDelPlano, type PuntoPx,
} from './plano';

/** Lo que el componente avisa cuando alguien suelta una ficha. */
export interface FichaMovida {
  readonly id: string;
  readonly emplazamiento: Emplazamiento;
}

/**
 * El plano del local, con las fichas arrastrables.
 *
 * **Por qué eventos de puntero y no de toque.** `pointerdown` / `pointermove` /
 * `pointerup` con `setPointerCapture` sirven igual para el dedo, el lápiz y el
 * ratón, y la captura es lo que hace que un arrastre no se pierda cuando el
 * dedo se sale del blanco —que con un blanco de 48 px y una sala entera en
 * pantalla pasa todo el tiempo—.
 *
 * **Lo que este componente no hace: no guarda.** Avisa que algo se movió y
 * quien lo contiene decide. Un plano que escribe en el almacén en cada
 * `pointermove` deja el disco caliente y, peor, hace imposible el «salir sin
 * guardar» que el resto de la aplicación ofrece.
 *
 * **Y dibuja siempre el círculo de duda.** Una ficha sin su círculo invita a
 * creer que la posición es exacta, y la mitad de este modelo consiste en no
 * creer eso. Cuando el dedo es más grueso que la duda ya cargada, la ficha se
 * marca: arrastrarla ahí **empeora** el dato, y hay que escribir los números.
 */
@Component({
  selector: 'app-plano-escenario',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg #lienzo
         [attr.viewBox]="'0 0 ' + anchoPx() + ' ' + altoPx()"
         [attr.aria-label]="resumenParaLector()"
         role="group"
         (pointerdown)="alApoyar($event)"
         (pointermove)="alMover($event)"
         (pointerup)="alSoltar($event)"
         (pointercancel)="alCancelar($event)">

      <!-- El recinto. El escenario arriba, el público abajo. -->
      <rect class="sala" [attr.x]="escala().origenX" [attr.y]="escala().origenY"
            [attr.width]="escala().anchoPx" [attr.height]="escala().altoPx" />
      <line class="borde-escenario"
            [attr.x1]="escala().origenX" [attr.y1]="escala().origenY"
            [attr.x2]="escala().origenX + escala().anchoPx" [attr.y2]="escala().origenY" />
      <text class="rotulo" [attr.x]="escala().origenX + 6" [attr.y]="escala().origenY - 8">escenario</text>
      <text class="rotulo" [attr.x]="escala().origenX + 6"
            [attr.y]="escala().origenY + escala().altoPx + 16">público</text>

      @for (f of dibujables(); track f.ficha.id) {
        <g class="ficha" [class.seleccionada]="f.ficha.id === seleccionada()"
           [class.dedo-grueso]="f.dedoGrueso" [attr.data-ficha]="f.ficha.id">
          <!-- La duda, primero, para que quede debajo de todo lo demás. -->
          <circle class="duda" [attr.cx]="f.centro.x" [attr.cy]="f.centro.y" [attr.r]="f.radioDuda" />
          @if (f.punta !== null) {
            <line class="eje" [attr.x1]="f.centro.x" [attr.y1]="f.centro.y"
                  [attr.x2]="f.punta.x" [attr.y2]="f.punta.y" />
          }
          <circle [class]="'punto ' + f.ficha.origen.toLowerCase()"
                  [attr.cx]="f.centro.x" [attr.cy]="f.centro.y" [attr.r]="10" />
          <!-- El blanco táctil, invisible y de 48 px: el punto dibujado es
               chico a propósito, porque agrandarlo mentiría sobre la duda. -->
          <circle class="blanco" [attr.cx]="f.centro.x" [attr.cy]="f.centro.y"
                  [attr.r]="blancoPx / 2" [attr.data-ficha]="f.ficha.id" />
          <!-- La etiqueta se da vuelta cerca de la pared derecha: el SVG
               recorta, y un nombre que se sale queda invisible. -->
          <text [class]="'etiqueta ' + (f.etiquetaALaIzquierda ? 'izq' : 'der')"
                [attr.x]="f.centro.x + (f.etiquetaALaIzquierda ? -14 : 14)"
                [attr.y]="f.centro.y + 4">{{ f.ficha.etiqueta }}</text>
        </g>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; touch-action: none; }
    svg { display: block; width: 100%; height: auto; }
    .sala { fill: var(--surface-2); stroke: var(--line); stroke-width: 1.5; }
    .borde-escenario { stroke: var(--signal); stroke-width: 3; }
    .rotulo { fill: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .duda { fill: var(--signal-tenue); stroke: none; }
    .eje { stroke: var(--muted); stroke-width: 2; stroke-linecap: round; }
    .punto { stroke: var(--surface); stroke-width: 2; }
    .punto.fuente { fill: #d98b3a; }
    .punto.captacion { fill: #4fa87a; }
    .punto.emisor { fill: var(--signal); }
    .blanco { fill: transparent; cursor: grab; }
    .etiqueta { fill: var(--ink); font-size: 12px; pointer-events: none; }
    .etiqueta.izq { text-anchor: end; }
    .ficha.seleccionada .punto { stroke: var(--ink); stroke-width: 3; }
    .ficha.dedo-grueso .duda { stroke: var(--warn); stroke-width: 1.5; stroke-dasharray: 3 3; }
  `],
})
export class PlanoEscenarioComponent implements OnDestroy {
  readonly fichas = input.required<readonly FichaDelPlano[]>();
  readonly dimensiones = input.required<DimensionesDelLocal>();
  readonly seleccionada = input<string | null>(null);

  readonly movida = output<FichaMovida>();
  readonly elegida = output<string>();

  readonly blancoPx = BLANCO_MINIMO_PX;
  private readonly lienzo = viewChild.required<ElementRef<SVGSVGElement>>('lienzo');
  private readonly anfitrion = inject(ElementRef<HTMLElement>);

  /**
   * El ancho con que el lienzo se está mostrando, medido, no supuesto.
   *
   * **Es la diferencia entre decir la verdad sobre la precisión y no decirla.**
   * Antes había un ancho fijo de 720 que nadie ligaba, y como el SVG se estira
   * al hueco disponible, una unidad de dibujo no era un píxel de pantalla: en
   * una tablet de 400 px, el blanco táctil declarado de 48 medía 26,7 —por
   * debajo del mínimo que el sistema de diseño exige— y la ambigüedad del dedo
   * se informaba casi a la mitad de lo que era. Lo encontraron las dos
   * auditorías, cada una por su lado.
   *
   * Midiéndolo, el `viewBox` coincide con los píxeles CSS y las dos cifras que
   * esta pantalla promete no falsear dejan de estar falseadas.
   */
  private readonly medido = signal(720);
  private readonly observador: ResizeObserver | null = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entradas) => {
      const ancho = entradas[0]?.contentRect.width ?? 0;
      if (ancho > 0) this.medido.set(Math.round(ancho));
    });

  constructor() {
    this.observador?.observe(this.anfitrion.nativeElement);
  }

  ngOnDestroy(): void { this.observador?.disconnect(); }

  readonly anchoPx = computed(() => this.medido());

  /**
   * Alto proporcional al local, con tope.
   *
   * Proporcional porque deformar el plano rompería los ángulos, que es lo único
   * que este editor existe para poder mirar. Con tope porque una sala de 6 por
   * 30 daría un lienzo de tres mil y pico de píxeles de alto, y como el
   * anfitrión desactiva el gesto de desplazar para poder arrastrar, quedaría
   * sin forma de bajar. Cuando el tope actúa, el local no llena el ancho y
   * queda centrado: la escala se encarga.
   */
  readonly altoPx = computed(() => {
    const d = this.dimensiones();
    const proporcional = Math.round(this.medido() * (d.largo / d.ancho));
    return Math.max(240, Math.min(proporcional, Math.round(this.medido() * 1.6)));
  });

  readonly escala = computed(() =>
    calcularEscala(this.dimensiones(), this.anchoPx(), this.altoPx(), 28));

  readonly dibujables = computed(() => {
    const e = this.escala();
    const bordeDerecho = e.origenX + e.anchoPx;
    return this.fichas().map((ficha) => {
      const centro = aPantalla(ficha.emplazamiento.posicion, e);
      return {
        ficha,
        centro,
        radioDuda: radioIncertidumbrePx(ficha.emplazamiento, e),
        punta: puntaDeLaFlecha(ficha.emplazamiento, e, 26),
        dedoGrueso: elDedoEsMasGruesoQueLaDuda(ficha.emplazamiento, e),
        // A menos de metro y medio de la pared derecha, el nombre no entra.
        etiquetaALaIzquierda: centro.x > bordeDerecho - 1.5 * e.pxPorMetro,
      };
    });
  });

  /** Cuántos metros vale el dedo acá, para que la pantalla lo pueda decir. */
  readonly precisionM = computed(() => precisionDelDedoM(this.escala()));

  /**
   * El plano leído en voz alta.
   *
   * Un dibujo sin texto alternativo deja fuera a quien use lector de pantalla,
   * y además es lo único que se puede afirmar en un test sin montar un
   * navegador.
   */
  readonly resumenParaLector = computed(() => {
    const n = this.fichas().length;
    const d = this.dimensiones();
    return `Plano del local, ${d.ancho} por ${d.largo} metros, con ${n} `
      + `${n === 1 ? 'elemento ubicado' : 'elementos ubicados'}. `
      + 'El escenario está arriba y el público abajo.';
  });

  private readonly arrastre = signal<Arrastre | null>(null);

  private idDesde(ev: PointerEvent): string | null {
    const t = ev.target as Element | null;
    return t?.getAttribute('data-ficha') ?? null;
  }

  /** Del evento al sistema de coordenadas del dibujo, que no es el de la página. */
  private aLienzo(ev: PointerEvent): PuntoPx {
    const svg = this.lienzo().nativeElement;
    const caja = svg.getBoundingClientRect();
    // `viewBox` y tamaño en pantalla no coinciden --el SVG se estira al ancho
    // disponible-- así que hay que reescalar. Usar las coordenadas de la página
    // directamente pondría las fichas cada vez más lejos del dedo cuanto más
    // chica fuera la tablet.
    const fx = caja.width === 0 ? 1 : this.anchoPx() / caja.width;
    const fy = caja.height === 0 ? 1 : this.altoPx() / caja.height;
    return { x: (ev.clientX - caja.left) * fx, y: (ev.clientY - caja.top) * fy };
  }

  /**
   * Apoyar el dedo **elige**; no mueve.
   *
   * Se guarda dónde cayó el dedo y dónde estaba el elemento, y a partir de ahí
   * se mueve el desplazamiento. Antes se mandaba el elemento a la posición
   * absoluta del dedo, así que tocar una ficha para leer sus números la corría
   * hasta el radio del blanco —una auditoría lo midió en 34 cm— y dejaba la
   * pantalla en «sin guardar».
   */
  alApoyar(ev: PointerEvent): void {
    const id = this.idDesde(ev);
    if (id === null) {
      // Tocar el fondo deselecciona, en vez de dejar elegido algo que ya no se
      // está mirando.
      if (this.arrastre() === null) this.elegida.emit('');
      return;
    }
    const ficha = this.fichas().find((f) => f.id === id);
    if (ficha === undefined) return;
    this.arrastre.set({
      id, pointerId: ev.pointerId,
      agarrePx: this.aLienzo(ev),
      origenM: ficha.emplazamiento.posicion,
    });
    this.elegida.emit(id);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  alMover(ev: PointerEvent): void {
    if (!this.esElDedoQueArrastra(ev)) return;
    this.emitir(ev);
    ev.preventDefault();
  }

  alSoltar(ev: PointerEvent): void {
    if (!this.esElDedoQueArrastra(ev)) return;
    this.emitir(ev);
    this.arrastre.set(null);
  }

  /**
   * Un `pointercancel` **no confirma** la posición: la descarta.
   *
   * Lo cancela el sistema —una llamada entrante, un gesto del borde—, no el
   * usuario, y en ese momento el dedo puede estar en cualquier lado. Tratarlo
   * como un soltar dejaba el elemento donde el sistema interrumpió.
   */
  alCancelar(ev: PointerEvent): void {
    if (!this.esElDedoQueArrastra(ev)) return;
    const a = this.arrastre()!;
    this.arrastre.set(null);
    const ficha = this.fichas().find((f) => f.id === a.id);
    if (ficha !== undefined) {
      this.movida.emit({ id: a.id, emplazamiento: { ...ficha.emplazamiento, posicion: a.origenM } });
    }
  }

  /**
   * Un segundo dedo no secuestra el arrastre en curso.
   *
   * Sin comparar el puntero, apoyar otro dedo sobre otra ficha cambiaba el
   * objetivo y los movimientos del **primer** dedo pasaban a arrastrar la
   * segunda. Es el gesto más natural en una tablet.
   */
  private esElDedoQueArrastra(ev: PointerEvent): boolean {
    const a = this.arrastre();
    return a !== null && a.pointerId === ev.pointerId;
  }

  private emitir(ev: PointerEvent): void {
    const a = this.arrastre();
    if (a === null) return;
    const ficha = this.fichas().find((f) => f.id === a.id);
    if (ficha === undefined) return;
    const posicion = moverArrastre(a, this.aLienzo(ev), this.escala(), this.dimensiones());
    if (posicion === null) return;
    this.movida.emit({ id: a.id, emplazamiento: { ...ficha.emplazamiento, posicion } });
  }
}
