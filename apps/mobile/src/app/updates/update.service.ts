import { Injectable, computed, inject, signal } from '@angular/core';
import {
  decidirActualizacion,
  formatearVersion,
  leerCatalogo,
  leerSuma,
  type ContextoDeActualizacion,
  type Decision,
  type FaseDeActualizacion,
  type Publicacion,
} from '@vse/updater';
import { ConnectionStateService } from '../core/connection.state';
import { Logger } from '../core/logger';
import { SessionStateService } from '../core/session.state';
import { Actualizador, type ResultadoDeDescarga } from './actualizador.plugin';

/**
 * Origen de las publicaciones.
 *
 * Está escrito acá y no en configuración porque es parte de la identidad de la
 * aplicación: cambiarlo por un valor que venga de fuera equivaldría a dejar que
 * otro decida qué se instala en el dispositivo.
 */
export const CATALOGO_URL =
  'https://api.github.com/repos/GabFrank/ui24r-virtual-sound-engineer/releases?per_page=20';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly log = inject(Logger);
  private readonly sesion = inject(SessionStateService);
  private readonly conexion = inject(ConnectionStateService);

  private readonly _fase = signal<FaseDeActualizacion>('INACTIVA');
  private readonly _decision = signal<Decision | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _bytesRecibidos = signal(0);
  private readonly _bytesTotales = signal(0);
  private readonly _versionInstalada = signal<string | null>(null);
  private readonly _permisoConcedido = signal(false);
  private readonly _descargada = signal<ResultadoDeDescarga | null>(null);

  readonly fase = this._fase.asReadonly();
  readonly decision = this._decision.asReadonly();
  readonly error = this._error.asReadonly();
  readonly versionInstalada = this._versionInstalada.asReadonly();
  readonly permisoConcedido = this._permisoConcedido.asReadonly();

  /** Entero de 0 a 100, o `null` mientras el servidor no informe el tamaño. */
  readonly porcentaje = computed(() => {
    const total = this._bytesTotales();
    if (total <= 0) return null;
    return Math.min(100, Math.round((this._bytesRecibidos() * 100) / total));
  });

  readonly hayNovedad = computed(() => {
    const d = this._decision();
    return d !== null && (d.tipo === 'DISPONIBLE' || d.tipo === 'BLOQUEADA');
  });

  /** Consulta el catálogo y decide. No descarga nada. */
  async buscar(): Promise<void> {
    this._error.set(null);
    this._fase.set('CONSULTANDO');
    try {
      const info = await Actualizador.infoInstalada();
      this._versionInstalada.set(info.versionNombre);
      this._permisoConcedido.set((await Actualizador.permisoDeInstalacion()).concedido);

      const respuesta = await fetch(CATALOGO_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!respuesta.ok) {
        throw new Error(`GitHub respondió ${respuesta.status}.`);
      }
      const { publicaciones, descartadas } = leerCatalogo(await respuesta.json());

      const bateria = await Actualizador.estadoDeBateria();
      const contexto: ContextoDeActualizacion = {
        versionInstalada: info.versionNombre,
        sesionActiva: this.sesion.sesionActiva(),
        transaccionEnCurso: this.sesion.transaccionEnCurso(),
        conectadoAConsola: this.conexion.estado() !== 'DISCONNECTED',
        redDisponible: true,
        bateriaPorcentaje: bateria.porcentaje,
        enCargador: bateria.enCargador,
      };

      const decision = decidirActualizacion(contexto, publicaciones);
      this._decision.set(decision);
      this._fase.set('INACTIVA');
      this.log.info('system', 'actualizacion.consultada', {
        instalada: info.versionNombre,
        decision: decision.tipo,
        publicaciones: publicaciones.length,
        descartadas: descartadas.map((d) => `${d.etiqueta}: ${d.motivo}`),
      });
    } catch (e) {
      this.fallar('No se pudo consultar si hay una versión nueva.', e);
    }
  }

  /** Lleva al usuario a los ajustes del sistema y relee el permiso al volver. */
  async pedirPermiso(): Promise<void> {
    this._error.set(null);
    this._fase.set('PIDIENDO_PERMISO');
    try {
      const { concedido } = await Actualizador.pedirPermisoDeInstalacion();
      this._permisoConcedido.set(concedido);
      this._fase.set('INACTIVA');
    } catch (e) {
      this.fallar('No se pudo abrir el ajuste de instalación.', e);
    }
  }

  /**
   * Descarga y verifica. La instalación va aparte a propósito: entre una y otra
   * el usuario ve el tamaño y la suma antes de que Android pida confirmación.
   */
  async descargar(publicacion: Publicacion): Promise<void> {
    // Se vuelve a evaluar el contexto justo antes de empezar. Entre la consulta
    // y este momento el usuario pudo abrir una sesión, y la decisión anterior ya
    // no valdría (INV-034).
    if (
      this.sesion.sesionActiva() ||
      this.sesion.transaccionEnCurso() ||
      this.conexion.estado() !== 'DISCONNECTED'
    ) {
      this._error.set('Cambió el estado mientras tanto. La actualización queda para después.');
      await this.buscar();
      return;
    }

    this._error.set(null);
    this._bytesRecibidos.set(0);
    this._bytesTotales.set(0);
    this._fase.set('DESCARGANDO');

    const oyente = await Actualizador.addListener('progresoDeDescarga', (p) => {
      this._bytesRecibidos.set(p.bytesRecibidos);
      this._bytesTotales.set(p.bytesTotales);
    });

    try {
      const respuesta = await fetch(publicacion.suma.url);
      if (!respuesta.ok) {
        throw new Error(`No se pudo leer la suma de verificación (${respuesta.status}).`);
      }
      const suma = leerSuma(await respuesta.text());
      if (suma === null) {
        throw new Error('La suma de verificación publicada no tiene el formato esperado.');
      }

      this._fase.set('VERIFICANDO');
      const resultado = await Actualizador.descargar({
        url: publicacion.apk.url,
        sha256: suma,
        nombre: `vse-${formatearVersion(publicacion.version)}.apk`,
      });
      this._descargada.set(resultado);
      this._fase.set('LISTA_PARA_INSTALAR');
      this.log.info('system', 'actualizacion.descargada', {
        version: publicacion.etiqueta,
        bytes: resultado.bytes,
        sha256: resultado.sha256,
      });
    } catch (e) {
      this.fallar('Falló la descarga de la actualización.', e);
    } finally {
      await oyente.remove();
    }
  }

  async instalar(): Promise<void> {
    const descargada = this._descargada();
    if (descargada === null) {
      this._error.set('No hay ninguna descarga verificada para instalar.');
      return;
    }
    this._error.set(null);
    this._fase.set('INSTALANDO');
    try {
      await Actualizador.instalar({ ruta: descargada.ruta });
      // Si llega acá, Android reemplazó la aplicación y va a reiniciarla.
      this.log.info('system', 'actualizacion.instalada', { ruta: descargada.ruta });
    } catch (e) {
      this.fallar('Falló la instalación.', e);
    }
  }

  private fallar(contexto: string, e: unknown): void {
    const detalle = e instanceof Error ? e.message : String(e);
    this._error.set(`${contexto} ${detalle}`);
    this._fase.set('FALLIDA');
    this.log.warn('system', 'actualizacion.fallida', { contexto, detalle });
  }
}
