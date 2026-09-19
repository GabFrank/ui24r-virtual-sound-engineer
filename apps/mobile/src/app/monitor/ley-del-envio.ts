import type { LeyDelEnvioAMonitor } from '@vse/assistants';
import { aRaw, entrada, esNivelDeEnvioAMonitor } from '@vse/mixer-adapter';

/**
 * La ley del envío a monitor, tal como la mide el adaptador, para dársela al
 * asistente.
 *
 * `packages/assistants` no puede importar el adaptador —regla 3 del
 * repositorio, y `validate-limites` la hace cumplir— así que la ley viaja por
 * parámetro y esta constante es la que la aplicación le pasa. Que sean las
 * tres funciones reales y no copias suyas es lo que hace que el crudo que sale
 * quede atado a los dB por la misma medición que el motor va a exigir después
 * (`MAGNITUD_NO_ATADA`).
 *
 * ## Por qué es un archivo propio y no una constante del servicio
 *
 * **Para que un test pueda sujetarla.** Mientras el asistente importaba el
 * adaptador, el `import` *era* el cableado y no se podía equivocar; al pasar la
 * ley por parámetro apareció una costura nueva, y una auditoría midió que no la
 * sujetaba nada: cambiando estas tres funciones por otras inventadas, la suite
 * entera seguía en verde.
 *
 * Vivía en `envio-a-monitor.service.ts`, que lleva un decorador de Angular, y el
 * modo de eliminación de tipos de Node —con el que corren los tests— no parsea
 * un decorador. O sea que un test que importara el servicio no compilaría, y
 * uno que reconstruyera el objeto probaría la ley sin probar que la aplicación
 * la usa. Un archivo sin decoradores resuelve las dos cosas.
 */
export const LEY_DEL_ENVIO: LeyDelEnvioAMonitor = { aRaw, entrada, esNivelDeEnvioAMonitor };
