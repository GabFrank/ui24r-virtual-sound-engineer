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

  /**
   * Lo llama el ejecutor de transacciones, y solo él.
   *
   * No se llama a mano desde ninguna pantalla: quien sabe si hay una
   * transacción en curso es quien la está corriendo. `SafetyService.crearEjecutor`
   * conecta las dos puntas, para que no se pueda armar un ejecutor que se
   * olvide de avisar -- que es exactamente lo que pasaba antes, con esta señal
   * en `false` para siempre y la cláusula de INV-034 sin dispararse nunca.
   */
  /**
   * Cuántos ejecutores tienen una transacción abierta ahora mismo.
   *
   * Cuenta acá y no solo dentro del ejecutor porque `SafetyService.crearEjecutor`
   * devuelve uno nuevo en cada llamada, y el contador del ejecutor es por
   * instancia: con dos, el paso por cero del primero apagaba el aviso con el
   * segundo todavía escribiendo. Es el mismo fallo que el contador arregló un
   * nivel más abajo, reintroducido por el método fábrica.
   */
  private abiertas = 0;

  fijarTransaccionEnCurso(enCurso: boolean): void {
    this.abiertas = Math.max(0, this.abiertas + (enCurso ? 1 : -1));
    this._transaccionEnCurso.set(this.abiertas > 0);
  }
}
