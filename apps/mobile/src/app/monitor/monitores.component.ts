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
  EN_NOMINAL_DB, loQueLlegaALaCuna, NOMINAL_DB, PASO_DB, proximoPasoDb,
  type CaminoALaCuna, type NivelDelEnvio,
} from './cuna-del-musico.ts';
import { EnvioAMonitorService } from './envio-a-monitor.service';
import { EscuchaDeLaCunaService } from './escucha-de-la-cuna.service';

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
  /** Si la aplicación puede mover este camino. Sólo los 24 canales. */
  readonly laMueveLaAplicacion: boolean;
  /** El camino entero, para que subir no tenga que reconstruirlo. */
  readonly camino: CaminoALaCuna;
  /** Cuánto pediría el próximo paso, o `null` si no hay ninguno que pedir. */
  readonly pasoDb: number | null;
  /** Lo que dice el botón. Vacío si no hay botón. */
  readonly textoSubir: string;
  /**
   * Por qué no hay botón, cuando la aplicación sí podría mover este camino.
   *
   * **Va visible y no en un `title`**: en una tablet no hay puntero que lo
   * revele, así que un botón que falta sin texto obliga a adivinar. Es la misma
   * decisión que la pantalla de ganancia tomó por el mismo motivo.
   */
  readonly porQueNoSube: string;
  /** Si el botón de «así está bien» va habilitado en esta fila. */
  readonly sePuedeMarcar: boolean;
  /** Si esta ruta ya quedó marcada en esta sesión. */
  readonly marcada: boolean;
}

/** Cómo se dice cada nivel, y con qué tono. La cuenta está en el módulo puro. */
/** Sin cero negativo: «−0.0 dB» ya llegó a la tablet una vez. */
function dbDeTabla(db: number): string {
  const x = Math.abs(db) < EN_NOMINAL_DB ? 0 : db;
  return `${x.toFixed(1)} dB`;
}

function comoSeDice(n: NivelDelEnvio): Pick<FilaDeLaCuna, 'nivel' | 'detalle' | 'tono'> {
  switch (n.tipo) {
    case 'EN_DB': {
      if (Math.abs(n.aNominalDb) < EN_NOMINAL_DB) {
        return { nivel: dbDeTabla(n.db), detalle: 'en el techo', tono: 'ok' };
      }
      return {
        nivel: dbDeTabla(n.db),
        detalle: n.aNominalDb > 0
          ? `${n.aNominalDb.toFixed(1)} dB hasta el techo`
          : `${(-n.aNominalDb).toFixed(1)} dB por encima del techo`,
        tono: n.aNominalDb > 0 ? 'neutro' : 'aviso',
      };
    }
    case 'EN_SILENCIO':
      return { nivel: 'Cerrado', detalle: 'no le llega nada por este camino', tono: 'neutro' };
    case 'MANDA_SIN_LEY':
      return {
        nivel: 'Manda',
        detalle: 'la ley de este camino no está medida: se sabe que le llega, no cuánto',
        tono: 'aviso',
      };
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
        descripcion="Qué le llega a la cuña de cada músico, su propio instrumento primero, y cómo subirla de a un paso escuchando entre uno y otro. Sólo mueve los envíos de los canales, hasta nominal." />

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
              <ui-button [variante]="c.componenteId === cunaElegida()?.componenteId ? 'primario' : 'secundario'"
                         (pulsado)="elegirCuna(c.componenteId)">{{ c.nombre }}</ui-button>
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

        @if (escuchando()) {
          <ui-card class="acento captura">
            <p class="etiqueta">Escuchando la cuña</p>
            <p class="cuenta num">{{ segundosRestantes() }}</p>
            <p class="instruccion">{{ instruccion() }}</p>
            <ui-button variante="sutil" (pulsado)="cancelarEscucha()">Cancelar</ui-button>
          </ui-card>
        }

        @if (aviso(); as a) {
          <p class="aviso-paso">{{ a }}</p>
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
            @if (porMarcar().length > 0) {
              <ui-button acciones variante="primario"
                         [deshabilitado]="enCurso() !== null || escuchando()"
                         (pulsado)="marcarLaCuna()">
                La cuña de {{ musico()?.nombre }} está lista ({{ porMarcar().length }})
              </ui-button>
            }
          </ui-card>
        }

        @if (filas().length === 0) {
          <ui-empty icono="canales" titulo="A esta cuña no le llega nada"
            detalle="Ninguno de los 32 caminos que entran a este auxiliar manda algo —ni los canales, ni las entradas de línea, ni el reproductor, ni los efectos— y el músico elegido no tiene ningún canal asignado." />
        } @else {
          <div class="desplaza-x ancho">
            <table>
              <thead>
                <tr>
                  <th class="izq">Qué le llega</th>
                  <th class="num">Manda</th>
                  <th class="izq">Detalle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (f of filas(); track f.canal) {
                  <tr [class.suyo]="f.esSuyo">
                    <td class="izq">
                      <span class="idx num">{{ f.canal }}</span> {{ f.que }}
                      @if (f.esSuyo) { <ui-badge tono="ok">Su instrumento</ui-badge> }
                      @if (!f.laMueveLaAplicacion) {
                        <ui-badge tono="neutro">Lo movés vos</ui-badge>
                      }
                    </td>
                    <td class="num">{{ f.nivel }}</td>
                    <td class="izq det">{{ f.detalle }}</td>
                    <td>
                      @if (f.textoSubir) {
                        <ui-button variante="primario"
                                   [deshabilitado]="enCurso() !== null || escuchando()"
                                   (pulsado)="subirUnPaso(f)">{{ f.textoSubir }}</ui-button>
                      } @else if (f.laMueveLaAplicacion) {
                        <span class="det">{{ f.porQueNoSube }}</span>
                      }
                      @if (f.marcada) {
                        <ui-badge tono="ok">Así está bien</ui-badge>
                      } @else if (f.sePuedeMarcar) {
                        <ui-button variante="secundario"
                                   [deshabilitado]="enCurso() !== null || escuchando()"
                                   (pulsado)="marcar(f)">Así está bien</ui-button>
                      }
                    </td>
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
                  @if (!f.laMueveLaAplicacion) {
                    <ui-badge tono="neutro">Lo movés vos</ui-badge>
                  }
                  <ui-badge [tono]="f.tono">{{ f.nivel }}</ui-badge>
                </div>
                <p class="det">{{ f.detalle }}</p>
                @if (f.textoSubir) {
                  <ui-button acciones variante="primario"
                             [deshabilitado]="enCurso() !== null || escuchando()"
                             (pulsado)="subirUnPaso(f)">{{ f.textoSubir }}</ui-button>
                } @else if (f.laMueveLaAplicacion) {
                  <p class="det">{{ f.porQueNoSube }}</p>
                }
                @if (f.marcada) {
                  <ui-badge tono="ok">Así está bien</ui-badge>
                } @else if (f.sePuedeMarcar) {
                  <ui-button acciones variante="secundario"
                             [deshabilitado]="enCurso() !== null || escuchando()"
                             (pulsado)="marcar(f)">Así está bien</ui-button>
                }
              </ui-card>
            }
          </div>
        }

        @if (cuenta(); as c) {
          <p class="nota-cierre">{{ c }}</p>
        }

        <p class="nota-cierre">
          De los canales ajenos se muestran sólo los que le mandan algo. Las
          entradas de línea, el reproductor y los efectos entran a la misma cuña
          y <strong>los movés vos</strong>: la aplicación sólo puede mover los
          canales, que es lo único con la ley medida contra tu consola.
        </p>

        <p class="nota-cierre">
          Cada paso sube, escucha y anota, de a un envío por vez: mientras uno
          está en curso los demás botones se apagan. Cuando el músico dice que
          así está bien, <strong>marcalo</strong>: desde ahí ese envío se retoca
          de a 2 dB contados <strong>desde ese nivel</strong>, en vez de desde
          donde estaba al empezar. Sólo se puede marcar lo que la aplicación
          movió: de lo que tocaste a mano en la consola no tiene con qué probar
          dónde quedó.
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

    .captura { text-align: center; margin-bottom: var(--sp-5); }
    .etiqueta { color: var(--muted); font-size: var(--txt-sm); }
    .cuenta { font-size: var(--txt-3xl); line-height: 1; color: var(--signal); margin: var(--sp-2) 0; }
    .instruccion { margin-bottom: var(--sp-4); font-size: var(--txt-lg); }
    .aviso-paso { margin: 0 0 var(--sp-4); font-size: var(--txt-sm); line-height: var(--alto-linea); }

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
  private readonly envio = inject(EnvioAMonitorService);
  private readonly escucha = inject(EscuchaDeLaCunaService);

  /**
   * La cuenta regresiva y la ventana, que el músico tiene que ver.
   *
   * **Es la razón por la que la orquestación vive acá y no adentro de
   * `subir()`.** Una llamada que se bloquea veintiún segundos no deja mostrar
   * nada ni cancelar, y el músico está tocando: tiene que ver cuánto falta y
   * poder cortar. Está dicho así en ADR-036.
   */
  readonly escuchando = this.escucha.escuchando;
  readonly segundosRestantes = this.escucha.segundosRestantes;
  readonly estadoEscucha = this.escucha.estado;

  /** El canal cuya rampa está en curso, para apagar los demás botones. */
  readonly enCurso = signal<number | null>(null);
  /** Lo último que pasó, en una frase. */
  readonly aviso = signal<string | null>(null);

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
  /**
   * Cuál cuña se está mirando, **por identificador del componente**.
   *
   * La primera versión guardaba el número de auxiliar, y el editor de perfiles
   * deja declarar dos monitores sobre el mismo --una cuña de piso más unos
   * intraurales en la misma mezcla es lo más común que hay--. Con eso, tocar el
   * segundo mostraba el primero: el título decía el nombre del otro, la insignia
   * «Intraural» desaparecía, y los dos botones quedaban encendidos a la vez. Los
   * decibeles no mentían --es el mismo auxiliar-- pero la identidad sí.
   */
  private readonly cunaElegidaId = signal<string | null>(null);

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
    const elegida = this.cunaElegidaId();
    return lista.find((c) => c.componenteId === elegida) ?? lista[0] ?? null;
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

  private readonly loQueLlega = computed(() => {
    const aux = this.auxiliar();
    if (aux === null) return null;
    return loQueLlegaALaCuna(
      aux,
      (this.musico()?.id as string | undefined) ?? null,
      this.mixer.canales().map((c) => ({ indice: c.indice, nombre: c.nombre })),
      this.banda.asignaciones().map((a) => ({
        entrada: a.ui24rInputIndex as number,
        instrumento: a.instrumento,
        integranteId: a.bandMemberId as string | null,
        asignacionId: a.id as string,
      })),
      this.volcado(),
    );
  });

  readonly filas = computed<readonly FilaDeLaCuna[]>(() => {
    const marcadas = this.envio.nivelesMarcados();
    return this.loQueLlega()?.caminos.map(
      (c) => aFila(c, this.envio.sePuedeMarcar(c.ruta), marcadas.has(c.ruta))) ?? [];
  });

  /** Las rutas de esta cuña que la aplicación movió y todavía no se marcaron. */
  readonly porMarcar = computed(() => this.filas().filter((f) => f.sePuedeMarcar));

  /**
   * El recuento de los 32 caminos, para que la pantalla rinda cuentas.
   *
   * **Existe porque la tabla esconde cosas a propósito** --lo cerrado de los
   * demás, y lo ilegible cuando no se leyó nada-- y una tabla que esconde sin
   * decirlo es la que hacía creer que a una cuña no le llegaba nada. Acá se
   * cuentan los 32, se muestren o no, así que se puede comprobar que no falta
   * ninguno.
   */
  readonly cuenta = computed(() => {
    const c = this.loQueLlega()?.cuenta;
    if (c === undefined) return null;
    const partes = [`${c.mandan} mandan algo`];
    if (c.cerrados > 0) partes.push(`${c.cerrados} cerrados`);
    if (c.sinLeer > 0) partes.push(`${c.sinLeer} sin poder leer`);
    return `De los ${c.total} caminos que entran a esta cuña: ${partes.join(', ')}.`;
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

  readonly instruccion = computed(() =>
    this.estadoEscucha() === 'CUENTA_REGRESIVA'
      ? 'Pedile que empiece a tocar'
      : 'Que siga tocando: se está escuchando su cuña');

  /**
   * Un paso de la rampa: subir, escuchar y anotar, en ese orden.
   *
   * **La cadena entera vive acá a propósito.** Los tres servicios existen y
   * están probados desde el 2026-09-19 y ninguno llama al otro: la orquestación
   * es de la pantalla porque el músico tiene que ver la cuenta regresiva y poder
   * cancelar (ADR-036).
   *
   * **Un envío por vez, y la pantalla lo impone.** Decisión del usuario del
   * 2026-09-20, y no es comodidad: el motor no cruza el canal de la medición
   * contra la ruta, así que **una sola escucha autoriza todas las rutas que la
   * citen** --medido, ADR-035--. Esta pantalla tiene varias rutas del mismo
   * músico a mano, así que es justo la que podría cometer ese error. `enCurso`
   * apaga los demás botones mientras dura el paso.
   *
   * **Si la escucha no queda guardada, no se anota nada.** El motor no busca
   * «alguna medición posterior»: resuelve el identificador que la transacción
   * declara, y anotar uno inventado es el agujero que se cerró el 2026-09-18.
   * Lo que se pierde es el permiso para el paso siguiente, que el motor niega
   * con su propio nombre.
   */
  async subirUnPaso(f: FilaDeLaCuna): Promise<void> {
    const aux = this.auxiliar();
    const sesion = this.sesion.actual()?.sesion.id ?? null;
    if (aux === null || sesion === null || f.pasoDb === null) return;
    if (this.enCurso() !== null || this.escuchando()) return;

    this.aviso.set(null);
    this.enCurso.set(f.canal);
    try {
      const n = f.camino.nivel;
      const r = await this.envio.subir({
        canal: f.canal,
        auxiliar: aux,
        ruta: f.camino.ruta,
        // **El nivel y el crudo salen de la misma lectura**, que es lo que el
        // motor va a atar. Pasar uno de la pantalla y otro de otro lado es
        // exactamente lo que `verificarAtaduraDelOrigen` existe para cazar.
        nivelActualDb: n.tipo === 'EN_DB' ? n.db : Number.NEGATIVE_INFINITY,
        crudoActual: n.tipo === 'EN_DB' ? n.crudo : 0,
        subirDb: f.pasoDb,
      }, sesion);

      if (r.estado !== 'APLICADA') {
        this.aviso.set(r.motivo);
        return;
      }
      this.aviso.set(r.salioDelSilencio
        ? `La cuña arrancó en ${r.quedoEnDb.toFixed(1)} dB. Escuchando…`
        : `Quedó en ${r.quedoEnDb.toFixed(1)} dB. Escuchando…`);

      const e = await this.escucha.escuchar({
        canal: f.canal,
        auxiliar: aux,
        channelId: f.camino.channelId,
      }, sesion);

      if (e.cancelada) {
        this.aviso.set('Escucha cancelada. El cambio quedó aplicado, pero sin '
          + 'escuchar no se puede dar otro paso: escuchá antes de seguir.');
        return;
      }
      await this.envio.anotarEscucha(r.id, e.medicionId);
      this.aviso.set(this.comoSalio(e));
    } catch (err) {
      this.aviso.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.enCurso.set(null);
    }
  }

  /** Qué decirle al músico cuando la escucha terminó. */
  private comoSalio(e: {
    readonly medicionId: string | null;
    readonly sonoS: number;
    readonly alcanzaParaOtroPaso: boolean;
    readonly segundosNoOidos: number;
  }): string {
    if (e.medicionId === null) {
      return 'El cambio se aplicó, pero la escucha no se pudo guardar: '
        + 'el paso siguiente va a pedir escuchar de nuevo.';
    }
    // **«No te escuché» y «no tocaste» son cosas distintas.** Decisión del
    // usuario del 2026-09-19: se descuenta lo que no se oyó y se sigue, pero se
    // dice, porque si no el músico vuelve a tocar para nada.
    const corte = e.segundosNoOidos > 0
      ? ` (${e.segundosNoOidos.toFixed(1)} s no se pudieron oír)`
      : '';
    return e.alcanzaParaOtroPaso
      ? `Sonaron ${e.sonoS.toFixed(1)} s${corte}. Se puede dar otro paso.`
      : `Sonaron ${e.sonoS.toFixed(1)} s${corte}: hace falta que toque un poco más `
        + 'para que el motor conceda otro paso.';
  }

  cancelarEscucha(): void { this.escucha.cancelar(); }

  /**
   * «Así está bien» sobre un envío: su nivel pasa a ser el de trabajo.
   *
   * Desde acá esa cuña sale de la primera operación de ADR-034: vuelve el
   * presupuesto de 4 dB por sesión, **medido desde este nivel** y no desde
   * donde estaba al empezar.
   */
  async marcar(f: FilaDeLaCuna): Promise<void> {
    if (!f.sePuedeMarcar || this.enCurso() !== null) return;
    const r = await this.envio.marcarAsiEstaBien(f.camino.ruta);
    this.aviso.set(r.ok
      ? `${f.que}: así queda. Desde acá se retoca de a 2 dB, contados desde este nivel.`
      : `${f.que}: no se pudo marcar — ${r.motivo}`);
  }

  /**
   * «La cuña de esta persona está lista»: marca de una todo lo que se movió.
   *
   * **Sólo alcanza a lo que la aplicación movió en esta sesión**, y la pantalla
   * lo dice: un envío que tocaste a mano en la consola no se puede marcar,
   * porque el motor no tiene con qué probar dónde quedó. Es la misma razón por
   * la que el nivel establecido sale del diario y no de lo que alguien declare.
   */
  async marcarLaCuna(): Promise<void> {
    const pendientes = this.porMarcar();
    if (pendientes.length === 0 || this.enCurso() !== null) return;
    const hechas: string[] = [];
    const fallidas: string[] = [];
    for (const f of pendientes) {
      const r = await this.envio.marcarAsiEstaBien(f.camino.ruta);
      (r.ok ? hechas : fallidas).push(f.que);
    }
    const partes: string[] = [];
    if (hechas.length > 0) partes.push(`Quedaron con su nivel: ${hechas.join(', ')}.`);
    if (fallidas.length > 0) partes.push(`No se pudieron marcar: ${fallidas.join(', ')}.`);
    this.aviso.set(partes.join(' '));
  }

  elegirMusico(id: BandMember['id']): void { this.musicoId.set(id as string); }
  elegirCuna(componenteId: string): void { this.cunaElegidaId.set(componenteId); }
}

function aFila(c: CaminoALaCuna, sePuedeMarcar: boolean, marcada: boolean): FilaDeLaCuna {
  const pasoDb = c.laMueveLaAplicacion ? proximoPasoDb(c.nivel) : null;
  return {
    ...comoSeDice(c.nivel),
    canal: c.canal, que: c.que, esSuyo: c.esSuyo,
    sinLeer: c.nivel.tipo === 'SIN_LEER',
    laMueveLaAplicacion: c.laMueveLaAplicacion,
    camino: c,
    pasoDb,
    // **El botón dice qué va a pasar, no «subir».** Desde el silencio el
    // destino no lo elige quien pide --el motor salta al mínimo que la ley sabe
    // escribir-- y decir «subir 2 dB» ahí sería prometer otra cosa. Y el último
    // paso pide lo que falta, que es la cuenta de los 0,138 dB de ADR-034.
    textoSubir: pasoDb === null ? ''
      : c.nivel.tipo === 'EN_SILENCIO' ? 'Encender'
      : pasoDb < PASO_DB ? `Subir ${pasoDb.toFixed(2)} dB, hasta el techo`
      : `Subir ${pasoDb.toFixed(0)} dB`,
    porQueNoSube: pasoDb !== null ? ''
      : c.nivel.tipo === 'EN_DB' ? 'Ya está en el techo: de acá para arriba lo subís vos'
      : c.nivel.tipo === 'SIN_LEER' ? 'No se sabe dónde está, así que no hay desde dónde subir'
      : 'Está fuera del tramo que se midió: subirlo sería inventar el punto de partida',
    sePuedeMarcar,
    marcada,
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
