import { Injectable, computed, inject, signal } from '@angular/core';
import {
  PERFILES_DE_CANAL, perfilPorTipo, ui24rInput, makeId,
  type BandProfile, type BandProfileId, type ChannelAssignment,
  type ChannelProfileType, type Instrumento, type MusicalRole,
} from '@vse/domain';
import { podarIdsMuertos } from '@vse/domain';
import type { ChannelAssignmentId, BandMemberId } from '@vse/domain';
import { Logger } from './logger';
import { Repositorios } from './repos/repositorios';

/**
 * Asignación de canales: qué entrada de la consola es qué instrumento.
 *
 * **Escribe sobre el perfil de banda persistido**, no sobre una señal suelta en
 * memoria. Antes había dos fuentes de verdad para el mismo dato: este servicio
 * y `BandProfile.asignaciones`, que nadie escribía nunca. Las consecuencias
 * eran visibles y confusas: la pantalla de canales decía «12 de 12 asignados»
 * mientras el tablero de la sesión —la pantalla de inicio, la que se mira de un
 * vistazo entre canción y canción— decía «0 canales», y al reiniciar la
 * aplicación se perdía la asignación entera sin ningún aviso, incluida la marca
 * de canal en vivo de la que depende INV-029.
 */
@Injectable({ providedIn: 'root' })
export class BandService {
  private readonly repos = inject(Repositorios);
  private readonly log = inject(Logger);

  readonly perfiles = PERFILES_DE_CANAL;

  private readonly _banda = signal<BandProfile | null>(null);
  readonly banda = this._banda.asReadonly();

  readonly asignaciones = computed<readonly ChannelAssignment[]>(
    () => this._banda()?.asignaciones ?? [],
  );

  readonly asignados = computed(() => this.asignaciones().length);

  /** Canales marcados como fuente en vivo durante el show. */
  readonly enVivo = computed(() => this.asignaciones().filter((a) => a.isLive));

  /** Carga la banda con la que se está trabajando. `null` la descarga. */
  async cargar(id: BandProfileId | null): Promise<void> {
    if (id === null) {
      this._banda.set(null);
      return;
    }
    this._banda.set(await this.repos.banda(id));
  }

  asignacionDe(indice: number): ChannelAssignment | undefined {
    return this.asignaciones().find((a) => a.ui24rInputIndex === indice);
  }

  /**
   * Escribe la asignación de un canal.
   *
   * Los campos opcionales que **no se pasan conservan lo que la asignación ya
   * tenía**, en vez de volver a su valor por defecto. La diferencia no es
   * cosmética: la pantalla vuelve a llamar acá para cambiar una sola cosa —la
   * marca de «en vivo», el instrumento, el perfil— y con `?? null` cada una de
   * esas llamadas borraba en silencio a quién pertenecía el canal. Se distingue
   * «no lo menciono» de «lo pongo en nulo» por `undefined`, que es lo único que
   * los separa.
   */
  async asignar(
    indice: number,
    datos: {
      instrumento: string;
      tipo: ChannelProfileType;
      nombreEnConsola: string;
      isLive: boolean;
      instrumentoDetalle?: Instrumento | null;
      bandMemberId?: BandMemberId | null;
      micModelo?: string | null;
      rol?: MusicalRole;
    },
  ): Promise<ChannelAssignment | null> {
    const banda = this._banda();
    if (banda === null) {
      // Sin banda cargada no hay dónde guardar. Antes se guardaba en memoria y
      // parecía que funcionaba.
      this.log.warn('system', 'asignacion_sin_banda', { indice });
      return null;
    }

    const perfil = perfilPorTipo(datos.tipo);
    const previa = this.asignacionDe(indice);

    const asignacion: ChannelAssignment = {
      id: previa?.id ?? makeId<'ChannelAssignmentId'>('ch') as ChannelAssignmentId,
      ui24rInputIndex: ui24rInput(indice),
      bandMemberId: datos.bandMemberId === undefined
        ? previa?.bandMemberId ?? null
        : datos.bandMemberId,
      instrumento: datos.instrumento,
      instrumentoDetalle: datos.instrumentoDetalle === undefined
        ? previa?.instrumentoDetalle ?? null
        : datos.instrumentoDetalle,
      channelProfileId: perfil.id,
      defaultRole: datos.rol ?? perfil.defaultRole,
      micModelo: datos.micModelo === undefined ? previa?.micModelo ?? null : datos.micModelo,
      nombreEnConsola: datos.nombreEnConsola,
      isLive: datos.isLive,
    };

    const resto = banda.asignaciones.filter((a) => a.ui24rInputIndex !== indice);
    await this.guardar(banda, [...resto, asignacion]);
    return asignacion;
  }

  async quitar(indice: number): Promise<void> {
    const banda = this._banda();
    if (banda === null) return;
    await this.guardar(
      banda,
      banda.asignaciones.filter((a) => a.ui24rInputIndex !== indice),
    );
  }

  private async guardar(
    banda: BandProfile,
    asignaciones: readonly ChannelAssignment[],
  ): Promise<void> {
    const ordenadas = [...asignaciones].sort((a, b) => a.ui24rInputIndex - b.ui24rInputIndex);
    const actualizada: BandProfile = { ...banda, asignaciones: ordenadas };
    await this.repos.guardarBanda(actualizada);
    this._banda.set(actualizada);
  }

  /**
   * Guarda el orden del recorrido y lo que quedó afuera.
   *
   * **Pasa por acá y no por el repositorio, y ése es todo el punto.** Un auditor
   * de expectativas lo encontró antes de que existiera la pantalla: este
   * servicio guarda haciendo `{ ...banda }` sobre su **propia señal cacheada**,
   * así que si otra pantalla escribiera el orden por el repositorio, la
   * siguiente asignación de canal lo pisaría sin decir nada. Un solo camino de
   * escritura y la caché no se puede quedar vieja.
   *
   * `orden` en `null` es «el usuario no tiene orden propio»: es lo que hace que
   * restaurar **olvide** en vez de congelar, y que la propuesta siga
   * acompañando si mañana el catálogo clasifica mejor.
   */
  async guardarRecorrido(
    orden: readonly ChannelAssignmentId[] | null,
    fuera: readonly ChannelAssignmentId[],
  ): Promise<void> {
    const enCache = this._banda();
    if (enCache === null) {
      this.log.warn('system', 'recorrido_sin_banda', {});
      return;
    }
    // **Se relee antes de escribir, y no es una precaución de más.** Hay tres
    // caminos de escritura al perfil de banda: éste, la asignación de canales, y
    // las pantallas de perfiles, que escriben por el repositorio sin tocar esta
    // caché. Un auditor señaló la dirección que faltaba: editar la banda en
    // perfiles durante una sesión deja esta caché vieja, y el primer arrastre en
    // el recorrido reescribiría el perfil entero desde ella, **pisando el nombre
    // y los integrantes recién guardados**.
    //
    // Releer cuesta una lectura del almacén local por arrastre y cierra esa
    // puerta. La puerta general --que tres pantallas escriban la misma entidad
    // por caminos distintos-- sigue abierta y es una tarea aparte.
    const banda = (await this.repos.banda(enCache.id)) ?? enCache;
    // **Se podan los identificadores muertos al guardar.** Quitar la asignación
    // de un canal y volver a asignarla acuña un identificador nuevo, así que un
    // canal que el usuario sacó del recorrido, desasignó y reasignó volvería
    // adentro solo: su decisión se revertiría sin aviso. Y los dos arreglos
    // crecerían sin techo dentro del documento de la banda.
    const actualizada: BandProfile = {
      ...banda,
      ordenDelRecorrido: orden === null ? null : podarIdsMuertos(orden, banda.asignaciones),
      fueraDelRecorrido: podarIdsMuertos(fuera, banda.asignaciones),
    };
    await this.repos.guardarBanda(actualizada);
    this._banda.set(actualizada);
    this.log.info('system', 'recorrido_guardado', {
      id: banda.id, ordenPropio: orden !== null, fuera: fuera.length,
    });
  }

  perfilDe(asignacion: ChannelAssignment) {
    return this.perfiles.find((p) => p.id === asignacion.channelProfileId)!;
  }

  /**
   * Propone una asignación a partir del nombre que ya tiene el canal en la
   * consola. Ahorra la mayor parte del trabajo cuando el usuario ya nombró sus
   * canales, que es lo habitual.
   *
   * Devuelve `null` cuando no reconoce el nombre. Antes devolvía `CUSTOM`, que
   * no es una propuesta sino un relleno: dejaba doce canales asignados a un
   * perfil genérico y al usuario convencido de que la aplicación había
   * entendido algo.
   */
  sugerirTipo(nombreEnConsola: string): ChannelProfileType | null {
    const n = nombreEnConsola.toUpperCase();
    const reglas: readonly [RegExp, ChannelProfileType][] = [
      [/VOZ PRINCIPAL|LEAD|VOCAL PPAL/, 'LEAD_VOCAL'],
      [/CORO|BACKING|VOZ \d/, 'BACKING_VOCAL'],
      [/GUIT.*AC|ACUSTICA/, 'ACOUSTIC_GUITAR'],
      [/GUIT/, 'ELECTRIC_GUITAR'],
      [/BAJO|BASS/, 'BASS'],
      [/CAJON/, 'CAJON'],
      [/CONGA|BONGO|TUMBA/, 'CONGA'],
      [/SHAKER|PANDER|GUIRO/, 'SHAKER'],
      [/FLAUTA|FLUTE/, 'FLUTE'],
      [/TECLA|KEY|PIANO/, 'KEYBOARD'],
      [/PLAYBACK|PISTA|TRACK/, 'PLAYBACK'],
      [/CHARLA|SPEECH|LOCUTOR/, 'SPEECH'],
    ];
    for (const [re, tipo] of reglas) if (re.test(n)) return tipo;
    return null;
  }
}
