import { Injectable, computed, inject, signal } from '@angular/core';
import {
  crearSesion, puedeTransicionar, TRANSICIONES,
  type BandProfile, type BandProfileId, type SessionState, type SoundSession,
  type VenueProfile, type VenueProfileId,
} from '@vse/domain';
import { BandService } from './band.service';
import { Logger } from './logger';
import { Repositorios } from './repos/repositorios';
import { SessionStateService } from './session.state';

export interface SesionEnCurso {
  readonly sesion: SoundSession;
  readonly banda: BandProfile | null;
  readonly local: VenueProfile | null;
}

/**
 * La sesión de sonido en curso.
 *
 * Es el único sitio donde se crea, avanza y cierra una sesión. La razón de que
 * no lo haga cada pantalla es la tabla de transiciones: está en el dominio,
 * probada, y si cada pantalla decidiera por su cuenta a qué estado pasar, la
 * tabla dejaría de ser la verdad en cuanto alguien se olvidara de consultarla.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private readonly repos = inject(Repositorios);
  private readonly estadoGlobal = inject(SessionStateService);
  private readonly banda = inject(BandService);
  private readonly log = inject(Logger);

  private readonly _actual = signal<SesionEnCurso | null>(null);
  readonly actual = this._actual.asReadonly();

  readonly hayActiva = computed(() => this._actual() !== null);

  /**
   * Estados a los que se puede avanzar desde el actual.
   *
   * `CLOSED` queda fuera a propósito, aunque la tabla lo permita desde casi
   * cualquier estado: cerrar la sesión es irreversible y tiene su propia
   * acción, con confirmación. Ofrecerlo como un botón más, al lado de
   * «Configuración», invitaría a cerrar la sesión por error justo cuando se
   * está intentando avanzar.
   */
  readonly siguientes = computed<readonly SessionState[]>(() => {
    const s = this._actual()?.sesion;
    if (s === undefined) return [];
    return TRANSICIONES[s.state]
      .filter((destino) => destino !== 'CLOSED')
      .filter((destino) =>
        puedeTransicionar(s.state, destino, {
          tieneTakeActivo: s.takeIds.length > 0,
          medicionesPosteriores: [],
        }).permitida,
      );
  });

  /** Recupera la sesión abierta al arrancar, si la hubiera. */
  async recuperar(): Promise<void> {
    const s = await this.repos.sesionAbierta();
    if (s === null) {
      this.publicar(null);
      await this.banda.cargar(null);
      return;
    }
    await this.cargar(s);
    this.log.info('system', 'sesion_recuperada', { id: s.id, estado: s.state });
  }

  async iniciar(bandaId: BandProfileId, localId: VenueProfileId): Promise<SoundSession> {
    const abierta = await this.repos.sesionAbierta();
    if (abierta !== null) {
      // No se abren dos sesiones a la vez. Si pasara, las mediciones de una
      // podrían atribuirse a la otra y el historial dejaría de significar nada.
      throw new Error('Ya hay una sesión abierta. Cerrala antes de empezar otra.');
    }
    const s = crearSesion(bandaId, localId);
    await this.repos.guardarSesion(s);
    await this.cargar(s);
    this.log.info('system', 'sesion_iniciada', { id: s.id, banda: bandaId, local: localId });
    return s;
  }

  /**
   * Cambia de estado si la tabla lo permite. Devuelve el motivo si no.
   */
  async transicionar(hacia: SessionState): Promise<string | null> {
    const actual = this._actual();
    if (actual === null) return 'No hay ninguna sesión abierta.';
    const s = actual.sesion;
    const r = puedeTransicionar(s.state, hacia, {
      tieneTakeActivo: s.takeIds.length > 0,
      medicionesPosteriores: [],
    });
    if (!r.permitida) {
      this.log.warn('system', 'transicion_rechazada', { desde: s.state, hacia, razon: r.razon });
      return r.razon;
    }
    const actualizada: SoundSession = {
      ...s,
      state: hacia,
      cerradaEl: hacia === 'CLOSED' ? new Date().toISOString() : s.cerradaEl,
    };
    await this.repos.guardarSesion(actualizada);
    if (hacia === 'CLOSED') {
      this.publicar(null);
      await this.banda.cargar(null);
      this.log.info('system', 'sesion_cerrada', { id: s.id });
    } else {
      await this.cargar(actualizada);
      this.log.info('system', 'sesion_transicionada', { id: s.id, desde: s.state, hacia });
    }
    return null;
  }

  /** Guarda cambios en la sesión sin tocar el estado. */
  async actualizar(cambios: Partial<SoundSession>): Promise<void> {
    const actual = this._actual();
    if (actual === null) return;
    const s: SoundSession = { ...actual.sesion, ...cambios };
    await this.repos.guardarSesion(s);
    await this.cargar(s);
  }

  private async cargar(s: SoundSession): Promise<void> {
    // La banda se carga en su servicio, que es el único que escribe las
    // asignaciones. Así el tablero de la sesión y la pantalla de canales leen
    // exactamente el mismo dato.
    await this.banda.cargar(s.bandProfileId);
    const [banda, local] = await Promise.all([
      this.repos.banda(s.bandProfileId),
      this.repos.local(s.venueProfileId),
    ]);
    this.publicar({ sesion: s, banda, local });
  }

  private publicar(v: SesionEnCurso | null): void {
    this._actual.set(v);
    // El estado global es lo que consulta el actualizador para no reemplazar
    // la aplicación en medio del trabajo (INV-034). Se mantiene acá para que
    // no haya dos fuentes de verdad sobre si hay una sesión abierta.
    this.estadoGlobal.fijarEstado(v?.sesion.state ?? null);
    // Y el registro pasa a etiquetar cada evento con la sesión en curso.
    // `fijarSesion` existía desde el primer día y no la llamaba nadie: todas
    // las filas de `log_event` iban con `session_id` en nulo, el índice por
    // sesión no servía para nada, y filtrar el registro por sesión —que es
    // como se lee después de un show— no podía devolver nada.
    this.log.fijarSesion(v?.sesion.id ?? null);
  }
}
