import { APP_INITIALIZER, inject } from '@angular/core';
import { ALMACEN } from './almacen/almacen';
import { Logger } from './logger';
import { MixerService } from './mixer.service';
import { Preferencias } from './preferencias.service';
import { RegistroService } from './registro.service';
import { SesionService } from './sesion.service';

/**
 * Lo que tiene que pasar antes de mostrar la primera pantalla.
 *
 * Son tres cosas y en este orden: abrir el almacén, conectarle el registro y
 * recuperar la sesión que hubiera quedado abierta.
 *
 * El registro se conecta después de abrir porque antes no hay dónde guardar, y
 * antes de recuperar porque lo que pase durante la recuperación es
 * precisamente lo que hay que poder leer cuando algo salió mal en el arranque
 * anterior.
 *
 * La recuperación importa más de lo que parece: si la
 * aplicación se cerró en mitad de un ensayo —la tablet se quedó sin batería,
 * alguien la reinició—, al volver tiene que encontrar la sesión donde estaba y
 * no ofrecer empezar una nueva, porque una sesión nueva perdería el hilo de lo
 * que ya se midió.
 *
 * Si algo falla, la aplicación arranca igual. Quedarse en una pantalla en
 * blanco antes de un show sería peor que arrancar sin datos: al menos así se
 * puede ver la telemetría y usar el paro de emergencia.
 *
 * La conexión con la consola se lanza al final y **sin esperarla**. Es una
 * cuarta cosa y va aparte de las tres anteriores a propósito: el apretón de
 * manos puede tardar, y contra una consola apagada tarda hasta que la red se
 * rinda. Esperarla dejaría la aplicación en blanco todo ese rato, que es
 * justo lo que este arranque evita.
 */
export function proveerArranque() {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const log = inject(Logger);
      const almacen = inject(ALMACEN);
      const registro = inject(RegistroService);
      const sesiones = inject(SesionService);
      const prefs = inject(Preferencias);
      const mixer = inject(MixerService);
      return async () => {
        try {
          await almacen.abrir();
          registro.conectar();
          log.info('system', 'almacen_abierto', { donde: almacen.descripcion });
          await sesiones.recuperar();
        } catch (e) {
          log.error('system', 'arranque_incompleto', { error: String(e) });
        } finally {
          // El volcado va en el `finally` justo porque puede haber fallado
          // algo: el arranque que no terminó es el que más falta hace leer, y
          // sin esto su error se quedaría en la cola.
          await registro.volcar();
        }

        if (prefs.autoconectar()) {
          const host = prefs.host();
          log.info('mixer', 'autoconexion_intento', { host });
          // Sin `await`: ver la nota de arriba. El error ya lo registra y lo
          // muestra `MixerService`; acá solo hay que evitar que un rechazo sin
          // dueño llegue a la consola del navegador.
          void mixer.conectar(host).catch(() => { /* queda en pantalla y en el registro */ });
        }
      };
    },
  };
}
