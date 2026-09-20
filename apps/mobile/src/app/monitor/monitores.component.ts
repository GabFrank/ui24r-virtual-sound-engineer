import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import type { BandMember, PAComponentSpec, PAProfile } from '@vse/domain';
import { BandService } from '../core/band.service';
import { MixerService } from '../core/mixer.service';
import { Repositorios } from '../core/repos/repositorios';
import { SesionService } from '../core/sesion.service';
import {
  BadgeComponent, ButtonComponent, CardComponent, Cargable, CargandoComponent,
  EmptyStateComponent, FalloComponent, PageHeaderComponent, StatComponent,
  type TonoDeInsignia,
} from '../ui';
import {
  loQueLlegaALaCuna, NOMINAL_DB,
  type CaminoALaCuna, type NivelDelEnvio,
} from './cuna-del-musico.ts';

/**
 * Las clases de amplificación que son la cuña de alguien.
 *
 * **Los intraurales entran**, aunque no radien al aire: para el análisis de
 * acople no cuentan y para esto sí, porque lo que el músico oye sale igual por
 * un auxiliar. Confundir las dos listas dejaría sin pantalla justo al monitoreo
 * que más se usa cuando la sala es chica.
 */
const CLASES_DE_CUNA = ['MONITOR_CUNA', 'MONITOR_LATERAL', 'IEM'] as const;

/** Una cuña elegible: un componente de amplificación que sale por un auxiliar. */
interface CunaElegible {
  readonly componenteId: string;
  readonly nombre: string;
  readonly auxiliar: number;
  readonly esIntraural: boolean;
}

/** Una fila ya resuelta: la plantilla no calcula ni formatea nada. */
interface FilaDeLaCuna {
  readonly canal: number;
  readonly que: string;
  readonly esSuyo: boolean;
  readonly nivel: string;
  readonly detalle: string;
  readonly tono: TonoDeInsignia;
  /** Si de este camino no se pudo leer nada. Decide el aviso de arriba. */
  readonly sinLeer: boolean;
}

/** Cómo se dice cada nivel, y con qué tono. La cuenta está en el módulo puro. */
function comoSeDice(n: NivelDelEnvio): Pick<FilaDeLaCuna, 'nivel' | 'detalle' | 'tono'> {
  switch (n.tipo) {
    case 'EN_DB':
      return {
        nivel: `${n.db.toFixed(1)} dB`,
        detalle: n.aNominalDb >= 0
          ? `${n.aNominalDb.toFixed(1)} dB hasta el techo`
          : `${(-n.aNominalDb).toFixed(1)} dB por encima del techo`,
        tono: n.aNominalDb >= 0 ? 'neutro' : 'aviso',
      };
    case 'EN_SILENCIO':
      return { nivel: 'Cerrado', detalle: 'no le llega nada por este camino', tono: 'neutro' };
    case 'FUERA_DEL_TRAMO_MEDIDO':
      return {
        nivel: 'Muy abajo',
        detalle: 'por debajo de donde se midió la ley: decir cuántos dB sería inventarlo',
        tono: 'aviso',
      };
    case 'SIN_LEER':
      return { nivel: '—', detalle: 'la consola no lo publicó', tono: 'peligro' };
  }
}

/**
 * La cuña de un músico: qué le llega y en qué nivel está cada cosa.
 *
 * **Sólo mira.** Es la primera mitad de la pantalla por músico, que es lo único
 * que le faltaba a la pieza 1 de la hoja de ruta: subir, escuchar y anotar
 * estaban enteros y probados desde el 2026-09-19 y **ninguna pantalla los
 * llamaba**. Esta tampoco los llama todavía: primero hay que poder ver la cuña
 * antes de que nada se mueva, que es lo que el usuario eligió el 2026-09-20.
 *
 * **Un envío por vez, decisión del usuario del 2026-09-20.** Cuando esta
 * pantalla empiece a subir, va a subir un camino y escuchar, no varios juntos.
 * No es una limitación de comodidad: el motor no cruza el canal de la medición
 * contra la ruta, así que **una sola escucha autoriza a la vez todas las rutas
 * que la citen** —medido, y es lo que [ADR-035](../../../../../docs/adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md)
 * viene a cerrar—. Esta pantalla tiene varias rutas del mismo músico a mano, así
 * que es exactamente la que podría cometer ese error sin querer.
 *
 * El detalle del trabajo previo —el MOREME de la consola, que es la misma idea—
 * está en [`cuna-del-musico.ts`](./cuna-del-musico.ts).
 */
@Component({
  selector: 'app-monitores',
  standalone: true,
  imports: [
    BadgeComponent, ButtonComponent, CardComponent, CargandoComponent,
    EmptyStateComponent, FalloComponent, PageHeaderComponent, StatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <ui-page-header titulo="Monitores"
        descripcion="Qué le llega a la cuña de cada músico, su propio instrumento primero. Por ahora esta pantalla sólo mira: no le escribe nada a la consola." />

      @if (sinSesion()) {
        <ui-empty icono="sesion" titulo="No hay ninguna sesión abierta"
          detalle="La cuña de un músico se arma dentro de una sesión: es donde queda anotado qué se escuchó y qué se movió." />
      } @else if (cargando()) {
        <ui-cargando />
      } @else if (problema() !== null) {
        <!-- El mensaje se saca con otra llamada y no con un alias: Angular sólo
             lo admite en el primer bloque de la cadena, y anidar uno más acá
             para ganarlo esconde el resto de los casos. -->
        <ui-fallo [mensaje]="problema() ?? ''" (reintentar)="recargar()" />
      } @else if (musicos().length === 0) {
        <ui-empty icono="banda" titulo="Todavía no hay músicos con canal"
          detalle="Asigná al menos un canal a un integrante en Canales. Sin eso no se puede decir de quién es una cuña." />
      } @else if (cunas().length === 0) {
        <ui-empty icono="medidor" titulo="El sistema no declara ninguna cuña"
          detalle="En Perfiles → Amplificación, cargá los monitores con el auxiliar por el que salen. Sin eso la aplicación no sabe qué auxiliar es la cuña de quién." />
      } @else {
        <ui-card titulo="Quién" subtitulo="De quién es la cuña que se está mirando">
          <div class="racimo">
            @for (m of musicos(); track m.id) {
              <ui-button [variante]="m.id === musicoElegidoId() ? 'primario' : 'secundario'"
                         (pulsado)="elegirMusico(m.id)">{{ m.nombre }}</ui-button>
            }
          </div>
        </ui-card>

        <ui-card titulo="Cuál" subtitulo="Por qué auxiliar sale su monitor">
          <div class="racimo">
            @for (c of cunas(); track c.componenteId) {
              <ui-button [variante]="c.auxiliar === auxiliar() ? 'primario' : 'secundario'"
                         (pulsado)="elegirCuna(c.auxiliar)">{{ c.nombre }}</ui-button>
            }
          </div>
          @if (cunaElegida(); as c) {
            <div class="racimo-insignias">
              <ui-badge tono="neutro">Auxiliar {{ c.auxiliar }}</ui-badge>
              @if (c.esIntraural) { <ui-badge tono="neutro">Intraural</ui-badge> }
            </div>
          }
        </ui-card>

        @if (cunaSinLeer()) {
          <p class="aviso">
            De esta cuña no se pudo leer ni un envío, así que no se sabe en qué
            nivel está nada. Lo que se ve abajo es quién le manda, no cuánto.
            @if (!hayVolcado()) {
              La consola no está conectada.
            } @else {
              La consola está conectada pero no publicó estos datos.
            }
          </p>
        }

        @if (cunaElegida(); as c) {
          <ui-card [titulo]="tituloDeLaCuna()" subtitulo="Lo que sale hacia el parlante ahora">
            <div class="numeros">
              <ui-stat rotulo="Sale hacia la cuña" [valor]="saleDeLaCuna()" unidad=" dB" tono="senal" />
              <ui-stat rotulo="Llega al auxiliar" [valor]="llegaAlAuxiliar()" unidad=" dB" />
              <ui-stat rotulo="Techo de la aplicación" [valor]="techo" unidad=" dB" />
            </div>
            <p class="nota">
              Los dos primeros se diferencian en el fader de ese auxiliar, y esa
              diferencia es la que explica una cuña que recibe señal y no suena.
              El techo es hasta dónde puede llevarla la aplicación: de ahí para
              arriba lo subís vos.
            </p>
          </ui-card>
        }

        @if (filas().length === 0) {
          <ui-empty icono="canales" titulo="A esta cuña no le llega nada"
            detalle="Ningún canal manda a este auxiliar, y el músico elegido no tiene ninguno asignado. Revisá a quién pertenece esta cuña." />
        } @else {
          <div class="desplaza-x ancho">
            <table>
              <thead>
                <tr>
                  <th class="izq">Qué le llega</th>
                  <th class="num">Manda</th>
                  <th class="izq">Detalle</th>
                </tr>
              </thead>
              <tbody>
                @for (f of filas(); track f.canal) {
                  <tr [class.suyo]="f.esSuyo">
                    <td class="izq">
                      <span class="idx num">{{ f.canal }}</span> {{ f.que }}
                      @if (f.esSuyo) { <ui-badge tono="ok">Su instrumento</ui-badge> }
                    </td>
                    <td class="num">{{ f.nivel }}</td>
                    <td class="izq det">{{ f.detalle }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="angosto pila">
            @for (f of filas(); track f.canal) {
              <ui-card [titulo]="f.que" [subtitulo]="'Entrada ' + f.canal">
                <div class="racimo-insignias">
                  @if (f.esSuyo) { <ui-badge tono="ok">Su instrumento</ui-badge> }
                  <ui-badge [tono]="f.tono">{{ f.nivel }}</ui-badge>
                </div>
                <p class="det">{{ f.detalle }}</p>
              </ui-card>
            }
          </div>
        }

        <p class="nota-cierre">
          Todavía no se puede subir nada desde acá, y tampoco marcar «así está
          bien». Eso es lo que sigue.
        </p>
      }
    </div>
  `,
  styles: [`
    @use 'tokens' as *;

    .racimo { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
    .racimo-insignias {
      display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3);
    }

    .aviso {
      margin-bottom: var(--sp-4); padding: var(--sp-3);
      border-left: 2px solid var(--warn); color: var(--muted);
      font-size: var(--txt-sm); line-height: var(--alto-linea);
    }

    .numeros {
      display: grid; gap: var(--sp-3);
      grid-template-columns: repeat(3, 1fr);
      margin-bottom: var(--sp-3);
    }

    table { border-collapse: collapse; width: 100%; margin-bottom: var(--sp-5); }
    th, td { text-align: center; padding: var(--sp-3); border-bottom: 1px solid var(--line); }
    th { color: var(--muted); font-weight: var(--peso-medio); font-size: var(--txt-sm); }
    .izq { text-align: left; }
    .idx { color: var(--signal); font-size: var(--txt-xs); margin-right: var(--sp-2); }
    .det { color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea); }
    /* El propio instrumento se separa del resto, que es lo que hace el MOREME
       de la consola resaltándolo. Con el borde y no con el color del texto:
       una fila entera teñida a un metro y con poca luz se lee como un aviso. */
    tr.suyo td:first-child { border-left: 2px solid var(--signal); }
    td ui-badge { margin-left: var(--sp-2); }

    .nota, .nota-cierre {
      color: var(--muted); font-size: var(--txt-sm); line-height: var(--alto-linea);
      margin-top: var(--sp-3);
    }

    .angosto { display: none; }
    @include hasta($bp-telefono) {
      .ancho { display: none; }
      .angosto { display: flex; }
    }
  `],
})
export class MonitoresComponent {
  private readonly sesion = inject(SesionService);
  private readonly banda = inject(BandService);
  private readonly mixer = inject(MixerService);
  private readonly repos = inject(Repositorios);

  readonly techo = NOMINAL_DB.toFixed(0);

  readonly sinSesion = computed(() => this.sesion.actual() === null);

  /**
   * El perfil de amplificación del local de esta sesión.
   *
   * Se lee acá y no se hereda de la sesión porque **dónde sale cada monitor es
   * un dato del sistema, no de la banda**: la sesión trae el local, y el local
   * dice qué sistema usa.
   */
  private readonly datos = new Cargable<PAProfile | null>(null, async () => {
    const local = this.sesion.actual()?.local ?? null;
    if (local === null) return null;
    return this.repos.pa(local.paProfileId);
  });

  readonly cargando = this.datos.cargando;
  readonly problema = this.datos.problema;

  constructor() {
    // Relee cuando cambia el local de la sesión o cuando alguien edita el
    // sistema de amplificación desde Perfiles. Sin la segunda dependencia, el
    // usuario carga sus monitores, vuelve acá y sigue viendo «el sistema no
    // declara ninguna cuña» -- que es la forma de error que `Cargable` existe
    // para no repetir: decirle «no hay» a quien sí tiene.
    effect(() => {
      this.repos.revision();
      this.sesion.actual()?.local?.paProfileId;
      this.recargar();
    }, { allowSignalWrites: true });
  }

  recargar(): void { void this.datos.recargar(); }

  private readonly musicoId = signal<string | null>(null);
  private readonly auxiliarElegido = signal<number | null>(null);

  /** Los integrantes que tienen al menos un canal: de los demás no hay cuña que mirar. */
  readonly musicos = computed<readonly BandMember[]>(() => {
    const integrantes = this.sesion.actual()?.banda?.integrantes ?? [];
    const conCanal = new Set(
      this.banda.asignaciones()
        .map((a) => a.bandMemberId as string | null)
        .filter((id): id is string => id !== null),
    );
    return integrantes.filter((m) => conCanal.has(m.id as string));
  });

  readonly cunas = computed<readonly CunaElegible[]>(() => {
    const componentes = this.datos.valor()?.componentes ?? [];
    return componentes.filter(esCuna).map((c) => ({
      componenteId: c.id as string,
      nombre: c.nombre,
      // `esCuna` ya garantizó que el bus es un auxiliar; el índice se lleva a
      // base uno acá, que es como lo nombra el resto de la aplicación.
      auxiliar: (c.bus as { readonly indice: number }).indice,
      esIntraural: c.clase === 'IEM',
    }));
  });

  /**
   * A quién se está mirando. Si nadie eligió, el primero de la lista.
   *
   * **Elegir por omisión y no dejar la pantalla vacía** es lo que hace que
   * llegue sirviendo: el usuario entra con el músico enfrente, no a configurar.
   */
  readonly musico = computed<BandMember | null>(() => {
    const lista = this.musicos();
    const elegido = this.musicoId();
    return lista.find((m) => (m.id as string) === elegido) ?? lista[0] ?? null;
  });

  readonly cunaElegida = computed<CunaElegible | null>(() => {
    const lista = this.cunas();
    const elegida = this.auxiliarElegido();
    return lista.find((c) => c.auxiliar === elegida) ?? lista[0] ?? null;
  });

  readonly auxiliar = computed(() => this.cunaElegida()?.auxiliar ?? null);

  /**
   * El identificador del músico que se está mirando, elegido o por omisión.
   *
   * **Sale de `musico()` y no de la señal de la elección**, que es lo que hace
   * que el primero de la lista se vea marcado al entrar. Comparar contra la
   * señal dejaba la pantalla mostrando la cuña del primero con ningún botón
   * encendido, que se lee como que todavía no se eligió a nadie.
   */
  readonly musicoElegidoId = computed(() => this.musico()?.id ?? null);

  readonly tituloDeLaCuna = computed(() => {
    const m = this.musico();
    const c = this.cunaElegida();
    if (m === null || c === null) return 'La cuña';
    return `${c.nombre} — ${m.nombre}`;
  });

  /**
   * El estado confirmado de la consola, y **la señal que lo hace vivir**.
   *
   * `volcadoDelEstado()` es un método, no una señal: devuelve una copia del
   * almacén. La primera versión de esta línea era
   * `computed(() => this.mixer.volcadoDelEstado())` a secas, y con eso el
   * `computed` **no leía ninguna señal**, así que Angular no lo recalculaba
   * nunca. Medido el 2026-09-20 con el motor de señales real: la tabla quedaba
   * congelada en el primer instante --llegaba el volcado, llegaban los
   * medidores, alguien movía el envío en la consola, y nada--, mientras los dos
   * medidores de arriba sí se movían. Parecía viva.
   *
   * `revisionDelEstado()` se lee **antes** y ése es todo el arreglo. Va primero
   * y no dentro de una condición para que no se lo pueda saltear.
   */
  private readonly volcado = computed(() => {
    this.mixer.revisionDelEstado();
    return this.mixer.volcadoDelEstado();
  });
  readonly hayVolcado = computed(() => this.volcado().size > 0);

  private readonly laCuna = computed(() => {
    const aux = this.auxiliar();
    if (aux === null) return undefined;
    return this.mixer.auxiliares().find((a) => a.indice === aux);
  });

  readonly saleDeLaCuna = computed(() => dbLegible(this.laCuna()?.nivelDb));
  readonly llegaAlAuxiliar = computed(() => dbLegible(this.laCuna()?.nivelAntesDelFaderDb));

  readonly filas = computed<readonly FilaDeLaCuna[]>(() => {
    const aux = this.auxiliar();
    if (aux === null) return [];
    const caminos = loQueLlegaALaCuna(
      aux,
      (this.musico()?.id as string | undefined) ?? null,
      this.mixer.canales().map((c) => ({ indice: c.indice, nombre: c.nombre })),
      this.banda.asignaciones().map((a) => ({
        entrada: a.ui24rInputIndex as number,
        instrumento: a.instrumento,
        integranteId: a.bandMemberId as string | null,
      })),
      this.volcado(),
    );
    return caminos.map(aFila);
  });

  /**
   * De esta cuña no se pudo leer nada.
   *
   * **No es lo mismo que «la consola no está conectada»**, y la primera versión
   * de esta pantalla las confundía: miraba si el volcado estaba vacío. Con el
   * simulador --que publica canales pero no modela los envíos a auxiliar-- el
   * volcado venía lleno, el aviso no salía, y la tabla mostraba veinticuatro
   * filas diciendo «la consola no lo publicó» debajo de un cartel que decía
   * «conectado». Se vio mirando la pantalla, no leyendo el código.
   */
  readonly cunaSinLeer = computed(() => {
    const f = this.filas();
    return f.length > 0 && f.every((x) => x.sinLeer);
  });

  elegirMusico(id: BandMember['id']): void { this.musicoId.set(id as string); }
  elegirCuna(auxiliar: number): void { this.auxiliarElegido.set(auxiliar); }
}

function aFila(c: CaminoALaCuna): FilaDeLaCuna {
  return {
    canal: c.canal, que: c.que, esSuyo: c.esSuyo,
    sinLeer: c.nivel.tipo === 'SIN_LEER',
    ...comoSeDice(c.nivel),
  };
}

/** Si un componente del sistema es la cuña de alguien y sale por un auxiliar. */
function esCuna(c: PAComponentSpec): boolean {
  return (CLASES_DE_CUNA as readonly string[]).includes(c.clase) && c.bus.tipo === 'AUX';
}

/**
 * Decibeles para leer en una tarjeta, sin `Infinity` ni `-Infinity`.
 *
 * Con el auxiliar en silencio el medidor da −∞, y `toFixed` lo imprime tal cual.
 * Ya llegó así a la tablet una vez, en la pantalla de ganancia.
 */
function dbLegible(db: number | undefined): string {
  if (db === undefined) return '—';
  if (!Number.isFinite(db)) return '−∞';
  return db.toFixed(1);
}
