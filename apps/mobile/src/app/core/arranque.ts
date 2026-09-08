import { APP_INITIALIZER, inject } from '@angular/core';
import { ALMACEN } from './almacen/almacen';
import { Logger } from './logger';
import { SesionService } from './sesion.service';

/**
 * Lo que tiene que pasar antes de mostrar la primera pantalla.
 *
 * Son dos cosas y en este orden: abrir el almacén y recuperar la sesión que
 * hubiera quedado abierta. La recuperación importa más de lo que parece: si la
 * aplicación se cerró en mitad de un ensayo —la tablet se quedó sin batería,
 * alguien la reinició—, al volver tiene que encontrar la sesión donde estaba y
 * no ofrecer empezar una nueva, porque una sesión nueva perdería el hilo de lo
 * que ya se midió.
 *
 * Si algo falla, la aplicación arranca igual. Quedarse en una pantalla en
 * blanco antes de un show sería peor que arrancar sin datos: al menos así se
 * puede ver la telemetría y usar el paro de emergencia.
 */
export function proveerArranque() {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const log = inject(Logger);
      const almacen = inject(ALMACEN);
      const sesiones = inject(SesionService);
      return async () => {
        try {
          await almacen.abrir();
          log.info('system', 'almacen_abierto', { donde: almacen.descripcion });
          await sesiones.recuperar();
        } catch (e) {
          log.error('system', 'arranque_incompleto', { error: String(e) });
        }
      };
    },
  };
}
