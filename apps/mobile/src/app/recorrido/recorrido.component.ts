import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ETAPAS_EN_ORDEN, LEY_MEDIDA, instrumentoDeAsignacion, moverPaso, recorridoDeLaBanda,
  type ChannelAssignment, type ChannelAssignmentId, type EtapaDeInstrumento,
  type PasoDelRecorrido,
} from '@vse/domain';
import { BandService } from '../core/band.service';
import { SesionService } from '../core/sesion.service';
import { Logger } from '../core/logger';
import {
  ButtonComponent, CardComponent, EmptyStateComponent, PageHeaderComponent, ToastService,
  intentarGuardar,
} from '../ui';
import {
  destinoDelArrastre, desplazamientoVisual, ordenEnVuelo, type ArrastreDeLista,
} from './arrastre-de-lista';

const NOMBRE_DE_ETAPA: Readonly<Record<EtapaDeInstrumento, string>> = {
  GANANCIA: 'Ganancia',
  PUERTA: 'Puerta',
  ECUALIZADOR: 'Ecualizador',
  COMPRESOR: 'Compresor',
  ENVIO_A_EFECTOS: 'A efectos',
  ENVIO_A_MONITORES: 'A monitores',
};

/**
 * El recorrido guiado: en qué orden se ajusta la banda.
 *
 * **Qué hace esta pantalla y qué no.** Ordena y navega. No escribe en la
 * consola —está prohibido por `CONTRIBUTING.md` y verificado por
 * `validate:limites`—, no reordena por su cuenta, y no ajusta ninguna etapa: la
 * ganancia lleva a su pantalla, que ya existe.
 *
 * **El orden no lo calcula acá.** Sale de `recorridoDeLaBanda()`, en el dominio.
 * Un auditor señaló, antes de que esto existiera, que una copia del cálculo en
 * el componente pasaría cualquier inspección a ojo y se desincronizaría en
 * silencio: `sort` es estable, así que empataría por el orden de entrada
 * mientras el dominio empata por número de canal.
 *
 * **Y el orden que el usuario elige se guarda por `BandService`**, no por el
 * repositorio. El servicio guarda haciendo `{ ...banda }` sobre su propia señal
 * cacheada, así que una escritura por otro camino se perdería en cuanto alguien
 * asignara un canal. Un solo camino, y la caché no se queda vieja.
 */
@Component({
  selector: 'app-recorrido',
  standalone: true,
  imports: [ButtonComponent, CardComponent, EmptyStateComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina pagina-angosta">
      <ui-page-header titulo="Recorrido"
        descripcion="En qué orden se ajusta la banda, instrumento por instrumento.">
        <ui-button variante="sutil" icono="atras" (pulsado)="volver()">Volver</ui-button>
      </ui-page-header>

      @if (!enConfiguracionDeCanales()) {
        <ui-empty icono="aviso" titulo="El recorrido se hace en configuración de canales"
                  [detalle]="motivoDelEstado()">
          <ui-button variante="primario" (pulsado)="volver()">Ir a la sesión</ui-button>
        </ui-empty>
      } @else if (pasos().length === 0 && fuera().length === 0) {
        <ui-empty icono="canales" titulo="Todavía no hay canales asignados"
                  detalle="El recorrido se arma con los canales que tienen un instrumento asignado. Sin eso no hay a qué llevar a la banda.">
          <ui-button variante="primario" (pulsado)="irACanales()">Asignar canales</ui-button>
        </ui-empty>
      } @else {
        <ui-card titulo="El orden" [subtitulo]="subtitulo()">
          <div class="lista" #lista>
            @for (i of enPantalla(); track pasos()[i]!.asignacionId) {
              <div class="fila"
                   [class.levantada]="levantada() === i"
                   [style.transform]="levantada() === i ? corrimiento() : null">
                <button class="asidero" type="button"
                        [attr.aria-label]="'Mover ' + pasos()[i]!.etiqueta"
                        (pointerdown)="alApoyar($event, i)"
                        (pointermove)="alMover($event)"
                        (pointerup)="alSoltar($event)"
                        (pointercancel)="alCancelar($event)">
                  <span class="rayas" aria-hidden="true"></span>
                </button>
                <div class="datos">
                  <strong>{{ pasos()[i]!.etiqueta }}</strong>
                  <span class="canal">canal {{ pasos()[i]!.canal }}</span>
                </div>
                <div class="etapas" aria-hidden="true">
                  @for (e of etapas; track e.id) {
                    <span class="etapa" [class.medida]="e.medida" [title]="e.titulo">{{ e.corto }}</span>
                  }
                </div>
                <ui-button variante="sutil" (pulsado)="sacar(pasos()[i]!.asignacionId)">Sacar</ui-button>
              </div>
            }
          </div>

          <p class="nota">
            El orden que propone la aplicación sale de una tabla de oficio para las familias
            que el catálogo reconoce, y de una decisión de este proyecto para la percusión y
            las entradas de línea. <strong>Es una propuesta</strong>: arrastrá por la manija
            para cambiarla, y queda guardada al soltar.
          </p>
          @if (ordenPropio()) {
            <ui-button variante="sutil" icono="refrescar" (pulsado)="restaurar()">
              Volver al orden propuesto
            </ui-button>
          }
        </ui-card>

        @if (fuera().length > 0) {
          <ui-card titulo="Fuera del recorrido" [subtitulo]="fuera().length + ' sin recorrer'">
            <div class="lista">
              @for (p of fuera(); track p.asignacionId) {
                <div class="fila sacada">
                  <div class="datos">
                    <strong>{{ p.etiqueta }}</strong>
                    <span class="canal">canal {{ p.canal }}</span>
                  </div>
                  <ui-button variante="sutil" icono="mas" (pulsado)="traer(p.asignacionId)">Traer</ui-button>
                </div>
              }
            </div>
            <p class="nota">
              Un talkback, un canal de repuesto o una pista no se recorren. La aplicación no
              adivina cuál sobra: lo sacás vos y queda guardado.
            </p>
          </ui-card>
        }

        <ui-card titulo="Qué se ajusta de cada instrumento">
          <div class="leyenda">
            @for (e of etapas; track e.id) {
              <div class="renglon">
                <span class="etapa" [class.medida]="e.medida">{{ e.corto }}</span>
                <span>{{ e.titulo }}</span>
                @if (!e.medida) { <span class="pendiente">la ley no está medida</span> }
              </div>
            }
          </div>
          <p class="nota">
            La aplicación sólo ajusta sola lo que tiene su ley medida contra la consola. Las
            otras cinco se miden con el usuario en la sala, antes de la primera entrega.
          </p>
        </ui-card>
      }
    </div>
  `,
  styles: [`
    .lista { display: flex; flex-direction: column; }
    .fila {
      display: grid; grid-template-columns: auto 1fr auto auto; gap: var(--sp-3);
      align-items: center; padding: var(--sp-2) 0; border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    .fila.levantada { position: relative; z-index: 2; box-shadow: var(--sombra-flotante); }
    .fila.sacada { grid-template-columns: 1fr auto; opacity: .75; }
    /* El asidero es el blanco táctil: la fila entera queda libre para
       desplazar la lista, que es lo que permite llegar a la fila 20 de 24. */
    .asidero {
      width: var(--tap-min); height: var(--tap-min);
      display: grid; place-items: center; background: none; border: 0;
      touch-action: none; cursor: grab; color: var(--muted);
    }
    .rayas { width: 18px; height: 12px; border-top: 2px solid currentColor;
             border-bottom: 2px solid currentColor; }
    .datos { display: flex; flex-direction: column; min-width: 0; }
    .canal { color: var(--muted); font-size: var(--txt-xs); }
    .etapas { display: flex; gap: 2px; }
    .etapa {
      font-size: var(--txt-xxs); padding: 0 var(--sp-1); border-radius: var(--radio-sm);
      background: var(--surface-2); color: var(--muted); border: 1px solid var(--line);
    }
    .etapa.medida { background: var(--ok-tenue); color: var(--ok); border-color: var(--ok); }
    .leyenda { display: flex; flex-direction: column; gap: var(--sp-2); }
    .renglon { display: flex; gap: var(--sp-3); align-items: center; }
    .pendiente { color: var(--warn); font-size: var(--txt-sm); }
    .nota { color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
            margin-top: var(--sp-3); }
  `],
})
export class RecorridoComponent {
  private readonly banda = inject(BandService);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);
  private readonly avisos = inject(ToastService);
  private readonly log = inject(Logger);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');

  readonly etapas = ETAPAS_EN_ORDEN.map((id) => ({
    id,
    titulo: NOMBRE_DE_ETAPA[id],
    // Dos letras alcanzan para distinguirlas en una fila angosta, y el nombre
    // entero está en la leyenda de abajo.
    corto: NOMBRE_DE_ETAPA[id].slice(0, 2),
    // **Se lee del dominio, no de una lista escrita acá.** El día que una ley se
    // mida, esta pantalla cambia sola.
    medida: LEY_MEDIDA[id],
  }));

  /** INV-006: la ganancia sólo se toca en configuración de canales. */
  readonly enConfiguracionDeCanales = computed(
    () => this.sesion.actual()?.sesion.state === 'CHANNEL_SETUP');

  readonly motivoDelEstado = computed(() => {
    const s = this.sesion.actual()?.sesion.state;
    if (s === undefined) return 'No hay ninguna sesión en curso. El recorrido ajusta canales, así que necesita una.';
    return `La sesión está en otro estado y el recorrido toca la ganancia, que sólo se puede `
      + `mover en configuración de canales. Volvé a la sesión para cambiar de etapa.`;
  });

  private readonly recorrido = computed(() => {
    const b = this.banda.banda();
    return recorridoDeLaBanda(
      b?.asignaciones ?? [],
      (a: ChannelAssignment) => instrumentoDeAsignacion(a),
      b?.ordenDelRecorrido ?? null,
      b?.fueraDelRecorrido ?? [],
    );
  });

  readonly pasos = computed<readonly PasoDelRecorrido[]>(() => this.recorrido().pasos);
  readonly fuera = computed<readonly PasoDelRecorrido[]>(() => this.recorrido().fuera);
  readonly ordenPropio = computed(() => this.recorrido().ordenPropio);

  readonly subtitulo = computed(() => {
    const n = this.pasos().length;
    const cuantos = `${n} ${n === 1 ? 'instrumento' : 'instrumentos'}`;
    return this.ordenPropio() ? `${cuantos} · tu orden` : `${cuantos} · orden propuesto`;
  });

  // --- El arrastre ----------------------------------------------------------

  private readonly arrastre = signal<ArrastreDeLista | null>(null);
  private readonly destino = signal<number | null>(null);
  private readonly dedoY = signal(0);

  /** Los índices en el orden que se ve, con la fila levantada ya corrida. */
  readonly enPantalla = computed<readonly number[]>(() => {
    const a = this.arrastre();
    const d = this.destino();
    const n = this.pasos().length;
    if (a === null || d === null) return Array.from({ length: n }, (_, i) => i);
    return ordenEnVuelo(n, a.desde, d);
  });

  /** Qué fila está levantada, si hay alguna. La plantilla no ve el arrastre. */
  readonly levantada = computed(() => this.arrastre()?.desde ?? null);

  readonly corrimiento = computed(() => {
    const a = this.arrastre();
    if (a === null) return null;
    return `translateY(${desplazamientoVisual(a, this.dedoY())}px)`;
  });

  alApoyar(ev: PointerEvent, indice: number): void {
    const filas = this.lista()?.nativeElement.querySelectorAll('.fila');
    // **El alto se mide, no se supone.** Una constante escrita acá se separaría
    // del estilo en cuanto alguien cambiara un relleno, y el arrastre saltaría
    // de a puestos equivocados sin que nada fallara.
    const alto = filas?.[0]?.getBoundingClientRect().height ?? 0;
    if (alto <= 0) return;
    this.arrastre.set({
      desde: indice, pointerId: ev.pointerId, agarreY: ev.clientY,
      altoDeFila: alto, cuantas: this.pasos().length,
    });
    this.dedoY.set(ev.clientY);
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    ev.preventDefault();
  }

  alMover(ev: PointerEvent): void {
    const a = this.arrastre();
    // Un segundo dedo no secuestra el arrastre en curso.
    if (a === null || a.pointerId !== ev.pointerId) return;
    this.dedoY.set(ev.clientY);
    this.destino.set(destinoDelArrastre(a, ev.clientY));
    ev.preventDefault();
  }

  alSoltar(ev: PointerEvent): void {
    const a = this.arrastre();
    if (a === null || a.pointerId !== ev.pointerId) return;
    const hasta = destinoDelArrastre(a, ev.clientY);
    this.limpiarArrastre();
    if (hasta === null) return;
    // `moverPaso` devuelve `null` cuando la fila volvió a donde estaba: un
    // arrastre de desplazamiento neto cero no es un cambio y no escribe nada.
    const orden = moverPaso(this.pasos(), a.desde, hasta);
    if (orden === null) return;
    void this.guardar(orden, this.fueraActual());
  }

  /**
   * Un `pointercancel` **descarta**, no confirma.
   *
   * Lo dispara el sistema —una llamada, la persiana de notificaciones—, no el
   * usuario, y en ese momento el dedo puede estar en cualquier lado.
   */
  alCancelar(ev: PointerEvent): void {
    const a = this.arrastre();
    if (a === null || a.pointerId !== ev.pointerId) return;
    this.limpiarArrastre();
  }

  private limpiarArrastre(): void {
    this.arrastre.set(null);
    this.destino.set(null);
  }

  // --- Sacar, traer, restaurar ---------------------------------------------

  private fueraActual(): readonly ChannelAssignmentId[] {
    return this.banda.banda()?.fueraDelRecorrido ?? [];
  }

  sacar(id: ChannelAssignmentId): void {
    // **El orden se conserva explícitamente.** Sacar un canal no puede ser
    // también un modo de perder el orden que el usuario armó.
    const orden = this.banda.banda()?.ordenDelRecorrido ?? null;
    void this.guardar(orden, [...this.fueraActual(), id]);
  }

  traer(id: ChannelAssignmentId): void {
    const orden = this.banda.banda()?.ordenDelRecorrido ?? null;
    void this.guardar(orden, this.fueraActual().filter((x) => x !== id));
  }

  /**
   * Olvida el orden propio, no lo congela.
   *
   * Con el orden en `null`, la propuesta vuelve a mandar **y sigue
   * acompañando**: si mañana el catálogo aprende a clasificar los toms, el
   * recorrido mejora solo. Copiar la propuesta de hoy lo dejaría congelado para
   * siempre. Decisión del usuario, `docs/pedidos/2026-09-11-recorrido.md`.
   */
  restaurar(): void {
    void this.guardar(null, this.fueraActual());
  }

  private async guardar(
    orden: readonly ChannelAssignmentId[] | null,
    fuera: readonly ChannelAssignmentId[],
  ): Promise<void> {
    const ok = await intentarGuardar(
      () => this.banda.guardarRecorrido(orden, fuera),
      (m) => this.avisos.error(m), 'guardar el orden del recorrido');
    if (!ok) this.log.warn('system', 'recorrido_no_guardado', {});
  }

  irAGanancia(): Promise<boolean> { return this.router.navigate(['/sesion/ganancia']); }
  irACanales(): Promise<boolean> { return this.router.navigate(['/sesion/canales']); }
  volver(): Promise<boolean> { return this.router.navigate(['/sesion']); }
}
