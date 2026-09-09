import type { DinamicaDeCanal, EstadoDeProceso } from '@vse/domain';

/**
 * Qué procesamiento dinámico tiene puesto cada canal, leído del volcado.
 *
 * Las claves ya llegaban en el volcado inicial desde el primer día y no las
 * leía nadie, así que el asistente de ganancia calculaba sobre un nivel que
 * podía venir comprimido sin tener manera de saberlo.
 *
 * **Las banderas no tienen todas la misma polaridad, y confundirlas invierte el
 * sentido entero.** `bypass = 1` significa *puenteado*, o sea inactivo;
 * `enabled = 1` significa *activo*. Un canal con el compresor puenteado y otro
 * con la puerta encendida traen los dos un 1, y significan lo contrario.
 */

/** Lo mínimo que hace falta del almacén de estado confirmado. */
export type LectorDeEstado = (path: string) => { readonly valor: number } | undefined;

/**
 * El umbral de un booleano que viaja como número.
 *
 * El mismo que usa el adaptador para el silencio: la consola manda 0 y 1, pero
 * el valor es un `number` y comparar por igualdad exacta contra 1 es pedirle a
 * un flotante que se porte bien.
 */
const VERDADERO = 0.5;

/**
 * Bandera con polaridad directa: `1` es que el proceso está actuando.
 * `null` cuando la consola no dijo nada de esta clave.
 */
function desdeHabilitado(e: { readonly valor: number } | undefined): EstadoDeProceso | null {
  if (e === undefined) return null;
  return e.valor > VERDADERO ? 'ACTIVO' : 'INACTIVO';
}

/**
 * Bandera con polaridad invertida: `1` es que el proceso está **puenteado**.
 *
 * Es la que se lee mal. `i.N.dyn.bypass = 1` es un canal **sin** compresor en
 * el camino, no un canal con compresor.
 */
function desdePuenteo(e: { readonly valor: number } | undefined): EstadoDeProceso | null {
  if (e === undefined) return null;
  return e.valor > VERDADERO ? 'INACTIVO' : 'ACTIVO';
}

/**
 * Si el umbral de la puerta puede alcanzarse alguna vez.
 *
 * **Una puerta habilitada con el umbral en el fondo no es una puerta activa.**
 * Recorriendo la aplicación en la tablet, la insignia «PUERTA» salía en los 24
 * canales: los 24 tienen `gate.enabled = 1`, pero 23 tienen `gate.thresh = 0`,
 * que con `VtoTHRESH = 96a − 90` son **−90 dB**. Ninguna señal baja de ahí, así
 * que esa puerta no se cierra nunca y no toca nada de lo que se escucha. Una
 * insignia que aparece siempre no informa: es ruido con forma de advertencia.
 *
 * Esto no es interpretar de más lo que la consola declara. Las banderas dicen
 * si el bloque está habilitado; el umbral dice si puede actuar, y para lo que
 * la insignia sirve —«¿esto afecta a lo que estoy midiendo o escuchando?»— la
 * segunda pregunta es la que importa.
 *
 * Se compara contra el mínimo exacto y no contra un margen elegido: el crudo 0
 * es el fondo de la escala, y decir «por debajo de tanto tampoco cuenta» sería
 * agregar un umbral nuestro sobre el de la consola.
 */
function puertaAlcanzable(entrada: { readonly valor: number } | undefined): EstadoDeProceso | null {
  if (entrada === undefined) return null;
  return entrada.valor > 0 ? 'ACTIVO' : 'INACTIVO';
}

/**
 * Junta las banderas de un mismo proceso.
 *
 * La puerta tiene dos —`enabled` y `bypass`— y pueden decir cosas distintas:
 * una puerta encendida pero puenteada no está actuando. La regla es que **un
 * negativo es concluyente y un positivo no**: para afirmar que un proceso está
 * actuando hace falta que ninguna bandera lo desmienta, y basta con que una
 * diga que no para que no lo esté.
 *
 * Si ninguna de las banderas llegó, la respuesta es DESCONOCIDO y no INACTIVO.
 * Dar por apagado lo que no se leyó es exactamente el error que este archivo
 * existe para evitar. Y alcanza con que llegue **una** de las dos: si un
 * firmware publica `gate.enabled` y no `gate.bypass`, se responde con lo que
 * hay en vez de declarar toda la puerta desconocida.
 */
function combinar(...señales: readonly (EstadoDeProceso | null)[]): EstadoDeProceso {
  const conocidas = señales.filter((s): s is EstadoDeProceso => s !== null);
  if (conocidas.length === 0) return 'DESCONOCIDO';
  return conocidas.includes('INACTIVO') ? 'INACTIVO' : 'ACTIVO';
}

/**
 * Lee la dinámica de un canal del estado confirmado.
 *
 * `n` es el índice de la **ruta**, que es de base cero: el canal 1 es `i.0`.
 * Quien llama ya hizo esa conversión, igual que para el fader y el silencio.
 */
export function leerDinamica(leer: LectorDeEstado, n: number): DinamicaDeCanal {
  return {
    // El compresor solo publica `bypass`; no hay `dyn.enabled` en el modelo de
    // estado de esta consola.
    compresor: combinar(desdePuenteo(leer(`i.${n}.dyn.bypass`))),
    puerta: combinar(
      desdeHabilitado(leer(`i.${n}.gate.enabled`)),
      desdePuenteo(leer(`i.${n}.gate.bypass`)),
      puertaAlcanzable(leer(`i.${n}.gate.thresh`)),
    ),
    // El de-esser solo publica `enabled`.
    deesser: combinar(desdeHabilitado(leer(`i.${n}.deesser.enabled`))),
  };
}
