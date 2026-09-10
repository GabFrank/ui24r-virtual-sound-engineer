import { Injectable, inject, signal } from '@angular/core';
import { normalizarBanda } from '@vse/domain';
import type {
  BandProfile, BandProfileId, PAProfile, PAProfileId, SoundSession, SessionId,
  VenueProfile, VenueProfileId,
} from '@vse/domain';
import type { Coleccion, Documento } from '@vse/store';
import { ALMACEN } from '../almacen/almacen';
import { Logger } from '../logger';

/**
 * Repositorios de las entidades que el usuario crea y edita.
 *
 * Un solo servicio y no cuatro: las entidades son pocas, se guardan igual y
 * casi siempre se leen juntas. Cuatro servicios con el mismo cuerpo repetido
 * cuatro veces habría sido más ceremonia y el mismo código.
 *
 * Todo devuelve la entidad del dominio, no el documento: el documento es un
 * detalle del almacén y no debería salir de acá.
 */
@Injectable({ providedIn: 'root' })
export class Repositorios {
  private readonly almacen = inject(ALMACEN);
  private readonly log = inject(Logger);

  /**
   * Se marca cuando cambia algo, para que las pantallas que muestran listas
   * se recarguen sin tener que suscribirse a cada operación.
   */
  private readonly _revision = signal(0);
  readonly revision = this._revision.asReadonly();

  private tocar(): void { this._revision.update((n) => n + 1); }

  private doc(id: string, indices: Documento['indices'], datos: unknown): Documento {
    return { id, indices, datos };
  }

  private async leerTodo<T>(coleccion: Coleccion, ordenarPor?: string): Promise<readonly T[]> {
    const docs = await this.almacen.listar(coleccion, ordenarPor ? { ordenarPor } : {});
    return docs.map((d) => d.datos as T);
  }

  // --- Bandas -------------------------------------------------------------

  async guardarBanda(b: BandProfile): Promise<void> {
    await this.almacen.guardar('band_profile', this.doc(b.id, {
      nombre: b.nombre,
      actualizado_el: new Date().toISOString(),
    }, b));
    this.log.info('system', 'banda_guardada', { id: b.id, integrantes: b.integrantes.length });
    this.tocar();
  }

  /**
   * Las bandas se clasifican **al leer**, no solo al guardar.
   *
   * La migración 4 le da forma al documento pero no clasifica —SQL no sabe qué
   * es un djembe— y hasta ahora la clasificación solo ocurría cuando alguien
   * abría el perfil y lo guardaba. Mientras tanto, los instrumentos de una banda
   * migrada quedaban sin fuente: al asignar un canal no habrían traído ningún
   * perfil, y el catálogo no habría servido justo en los perfiles que ya
   * existían. Encima, el almacén del navegador no ejecuta las migraciones, así
   * que ahí ni siquiera había una primera mitad.
   *
   * No se guarda lo clasificado: leer no escribe. Lo que se lee ya viene bien y
   * el disco se pone al día la próxima vez que se guarde ese perfil.
   * `normalizarBanda()` conserva el texto original y devuelve el mismo objeto
   * cuando no había nada que hacer.
   */
  async bandas(): Promise<readonly BandProfile[]> {
    const docs = await this.almacen.listar('band_profile', { ordenarPor: 'nombre' });
    return docs.map((d) => normalizarBanda(d.datos as BandProfile));
  }

  async banda(id: BandProfileId): Promise<BandProfile | null> {
    const d = await this.almacen.obtener('band_profile', id);
    return d === null ? null : normalizarBanda(d.datos as BandProfile);
  }

  async borrarBanda(id: BandProfileId): Promise<void> {
    await this.almacen.borrar('band_profile', id);
    this.tocar();
  }

  // --- Sistemas de amplificación ------------------------------------------

  async guardarPa(p: PAProfile): Promise<void> {
    await this.almacen.guardar('pa_profile', this.doc(p.id, {
      nombre: p.nombre,
      actualizado_el: new Date().toISOString(),
    }, p));
    this.tocar();
  }

  pas(): Promise<readonly PAProfile[]> {
    return this.leerTodo<PAProfile>('pa_profile', 'nombre');
  }

  async pa(id: PAProfileId): Promise<PAProfile | null> {
    const d = await this.almacen.obtener('pa_profile', id);
    return d === null ? null : (d.datos as PAProfile);
  }

  /**
   * Los locales que usan este sistema.
   *
   * Se consulta antes de borrar. El esquema declara claves foráneas pero
   * **nadie las aplica** —no se ejecuta «PRAGMA foreign_keys = ON»— así que la
   * base no impide dejar un local apuntando a un sistema que ya no está. Y un
   * local sin sistema no es un local incompleto: es uno sobre el que la
   * aplicación no puede decidir dónde corregir, porque no sabe qué equipo hay.
   */
  async localesQueUsanPa(id: PAProfileId): Promise<readonly string[]> {
    const locales = await this.locales();
    return locales.filter((l) => l.paProfileId === id).map((l) => l.nombre);
  }

  async borrarPa(id: PAProfileId): Promise<void> {
    const enUso = await this.localesQueUsanPa(id);
    if (enUso.length > 0) {
      throw new Error(`Lo usan ${enUso.length} local(es): ${enUso.join(', ')}.`);
    }
    await this.almacen.borrar('pa_profile', id);
    this.log.info('system', 'pa_borrado', { id });
    this.tocar();
  }

  // --- Locales ------------------------------------------------------------

  async guardarLocal(v: VenueProfile): Promise<void> {
    await this.almacen.guardar('venue_profile', this.doc(v.id, {
      nombre: v.nombre,
      tipo: v.tipo,
      actualizado_el: new Date().toISOString(),
    }, v));
    this.tocar();
  }

  locales(): Promise<readonly VenueProfile[]> {
    return this.leerTodo<VenueProfile>('venue_profile', 'nombre');
  }

  async local(id: VenueProfileId): Promise<VenueProfile | null> {
    const d = await this.almacen.obtener('venue_profile', id);
    return d === null ? null : (d.datos as VenueProfile);
  }

  async borrarLocal(id: VenueProfileId): Promise<void> {
    await this.almacen.borrar('venue_profile', id);
    this.tocar();
  }

  // --- Sesiones -----------------------------------------------------------

  async guardarSesion(s: SoundSession): Promise<void> {
    await this.almacen.guardar('sound_session', this.doc(s.id, {
      state: s.state,
      band_profile_id: s.bandProfileId,
      venue_profile_id: s.venueProfileId,
      iniciada_el: s.iniciadaEl,
      cerrada_el: s.cerradaEl,
    }, s));
    this.log.info('system', 'sesion_guardada', { id: s.id, estado: s.state });
    this.tocar();
  }

  /** Más reciente primero: el historial se lee de arriba hacia abajo. */
  async sesiones(limite = 50): Promise<readonly SoundSession[]> {
    const docs = await this.almacen.listar('sound_session', {
      ordenarPor: 'iniciada_el', descendente: true, limite,
    });
    return docs.map((d) => d.datos as SoundSession);
  }

  async sesion(id: SessionId): Promise<SoundSession | null> {
    const d = await this.almacen.obtener('sound_session', id);
    return d === null ? null : (d.datos as SoundSession);
  }

  /**
   * La sesión abierta, si hay alguna.
   *
   * Solo puede haber una: se busca la que no tiene fecha de cierre. Si
   * apareciera más de una, es un error de programación en alguna transición y
   * se registra, pero se devuelve la más reciente en vez de fallar — dejar al
   * usuario sin sesión antes de un show sería peor que la inconsistencia.
   */
  async sesionAbierta(): Promise<SoundSession | null> {
    const docs = await this.almacen.listar('sound_session', {
      donde: { cerrada_el: null }, ordenarPor: 'iniciada_el', descendente: true,
    });
    const abiertas = docs.map((d) => d.datos as SoundSession).filter((s) => s.state !== 'CLOSED');
    if (abiertas.length > 1) {
      this.log.warn('system', 'varias_sesiones_abiertas', {
        cantidad: abiertas.length, ids: abiertas.map((s) => s.id),
      });
    }
    return abiertas[0] ?? null;
  }

  async borrarSesion(id: SessionId): Promise<void> {
    await this.almacen.borrar('sound_session', id);
    this.tocar();
  }

  // --- Volcado ------------------------------------------------------------

  exportar(): Promise<string> { return this.almacen.exportar(); }
}
