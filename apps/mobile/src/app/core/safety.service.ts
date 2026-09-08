import { Injectable, inject, signal } from '@angular/core';
import { EjecutorDeTransacciones, type Diario, type OpcionesEjecutor } from '@vse/safety';
import { SafetyEngine } from '@vse/safety';
import type { MixerDomainAPI } from '@vse/mixer-adapter';
import { Logger } from './logger';
import { ConnectionStateService } from './connection.state';
import { SessionStateService } from './session.state';

/**
 * Bloqueo de escrituras y paro de emergencia.
 *
 * Implementa la parte local de INV-019: lo que tiene que funcionar aunque no
 * haya red. Las acciones remotas se agregan cuando exista el adaptador de
 * consola; su ausencia hoy no debilita la parte local, que es la que da la
 * garantía de tiempo.
 */

@Injectable({ providedIn: 'root' })
export class SafetyService {
  private readonly log = inject(Logger);
  private readonly conexion = inject(ConnectionStateService);
  private readonly sesion = inject(SessionStateService);

  /**
   * El motor vive en su propio paquete, sin dependencias de framework, y es el
   * mismo que ejercitan los tests. La aplicación no reimplementa ninguna regla:
   * tener la misma regla en dos lugares ya nos costó un error real con la
   * detección de conexión inestable.
   */
  readonly engine = new SafetyEngine();

  private readonly _bloqueado = signal(false);
  readonly bloqueado = this._bloqueado.asReadonly();

  /**
   * Única puerta de entrada a una escritura.
   *
   * Con el paro activo solo pasan las de la lista blanca. Sin conexión estable
   * no pasa ninguna: INV-017 exige vaciar la cola y suspender las transacciones
   * en curso, no seguir intentando.
   */
  permiteEscritura(tipo: string): { permitido: boolean; motivo?: string } {
    if (this._bloqueado() && !this.engine.esDeSeguridad(tipo)) {
      return {
        permitido: false,
        motivo: 'el paro de emergencia está activo: solo pasan las escrituras de seguridad',
      };
    }
    if (!this.conexion.permiteEscribir()) {
      return {
        permitido: false,
        motivo: `la conexión está en ${this.conexion.estado()} o el estado no está confirmado`,
      };
    }
    return { permitido: true };
  }

  /**
   * Construye el ejecutor de transacciones ya conectado al estado de sesión.
   *
   * Es un método y no una constante porque el ejecutor necesita la consola,
   * que puede no estar. Y existe para que **nadie pueda armar uno sin el
   * aviso**: la cláusula de INV-034 que prohíbe actualizar en medio de una
   * escritura dependía de una señal que ningún código ponía en `true`, y así
   * estuvo desde que se escribió. Un ejecutor que se arma solo con el aviso
   * puesto no se puede olvidar de avisar.
   */
  crearEjecutor(
    mixer: MixerDomainAPI,
    diario: Diario,
    opciones: OpcionesEjecutor = {},
  ): EjecutorDeTransacciones {
    return new EjecutorDeTransacciones(mixer, this.engine, diario, {
      ...opciones,
      alCambiarActividad: (enCurso) => {
        this.sesion.fijarTransaccionEnCurso(enCurso);
        this.log.debug('transaction', enCurso ? 'transaccion_iniciada' : 'transaccion_terminada', {});
      },
    });
  }

  /**
   * Acciones locales del paro. Sin red, sin espera, sin excusas.
   * El objetivo es 200 ms; en la práctica esto son operaciones en memoria.
   */
  pararTodoLocal(): void {
    this._bloqueado.set(true);
    this.engine.bloquear();
    // Detener el generador local, cancelar la automatización y vaciar la cola
    // se enganchan acá cuando existan esos servicios. El bloqueo ya impide que
    // cualquier escritura nueva salga.
    this.log.warn('safety', 'paro_local_ejecutado', {});
  }

  /**
   * Acciones remotas: detener el reproductor y la grabación, y silenciar el
   * reproductor. Con confirmación y reintentos, porque son las que pueden
   * fallar justamente cuando hacen falta.
   */
  async pararTodoRemoto(): Promise<void> {
    this.log.info('safety', 'paro_remoto_pendiente', {
      nota: 'se implementa con el adaptador de consola',
    });
  }

  /** El rearme relee el estado completo antes de volver a permitir escrituras. */
  async rearmar(): Promise<void> {
    this.conexion.invalidarPorCambioMasivo();
    this.engine.desbloquear();
    this._bloqueado.set(false);
    this.log.info('safety', 'rearme_solicitado', {
      nota: 'el estado queda inválido hasta el volcado completo',
    });
  }
}
