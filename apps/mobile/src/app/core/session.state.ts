import { Injectable, computed, signal } from '@angular/core';
import type { SessionState } from '@vse/domain';

/**
 * Estado de la sesión de sonido en curso, para la interfaz.
 *
 * Existe separado del modelo de dominio porque hay decisiones que dependen de
 * "hay una sesión abierta" sin necesitar la sesión entera: la más clara es
 * INV-034, que prohíbe actualizar la aplicación mientras se está trabajando.
 */
@Injectable({ providedIn: 'root' })
export class SessionStateService {
  private readonly _estado = signal<SessionState | null>(null);
  private readonly _transaccionEnCurso = signal(false);

  readonly estado = this._estado.asReadonly();
  readonly transaccionEnCurso = this._transaccionEnCurso.asReadonly();

  /**
   * Una sesión cerrada no es una sesión activa, y no haber abierto ninguna
   * tampoco. Todo lo demás sí, incluido `CREATED`: desde ahí el usuario ya
   * está en medio de algo.
   */
  readonly sesionActiva = computed(() => {
    const e = this._estado();
    return e !== null && e !== 'CLOSED';
  });

  fijarEstado(e: SessionState | null): void {
    this._estado.set(e);
  }

  fijarTransaccionEnCurso(enCurso: boolean): void {
    this._transaccionEnCurso.set(enCurso);
  }
}
