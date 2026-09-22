/**
 * El SQL con que se leen y se escriben las mediciones de una sesión.
 *
 * ## Por qué vive en su propio archivo y no en el servicio
 *
 * **Para que un test pueda ejercitar éste y no una copia.** La primera versión
 * tenía la consulta escrita en el servicio y **otra igual escrita en el test**,
 * así que nada en el repositorio comprobaba la consulta de producción: un error
 * de tipeo ahí no lo cazaba nadie. Lo marcó una auditoría el 2026-09-19.
 *
 * Y no puede vivir en `mediciones.service.ts` porque ese archivo lleva un
 * decorador de Angular, y el modo de eliminación de tipos de Node —con el que
 * corren los tests— **no parsea un decorador**: importarlo desde un test rompe
 * con `SyntaxError`. Es exactamente el mismo motivo por el que `LEY_DEL_ENVIO`
 * tiene su propio archivo, y la misma solución.
 *
 * **El archivo se llamaba `consulta-de-mediciones.ts` y se renombró al agregar
 * la escritura**, porque un archivo llamado «consulta» que exporta un `INSERT`
 * es de la clase de imprecisión chica que este repositorio pasa el tiempo
 * corrigiendo.
 */

/**
 * Las mediciones de una sesión.
 *
 * **Sin `ORDER BY`, y es deliberado.** El consumidor —`historialDeLaSesion`—
 * indexa por identificador, así que el orden no cambia ningún veredicto. Ordenar
 * por `timestamp` en SQL sería ordenar **texto**, y eso ya se pagó una vez en
 * este mismo camino: con `09:00Z` y `07:00-05:00` la comparación lexicográfica
 * elige la primera siendo la segunda más tarde.
 */
export const CONSULTA_DE_MEDICIONES = 'SELECT datos FROM measurement WHERE session_id = ?';

/**
 * Guardar una medición.
 *
 * **Las columnas son las que se consultan; el resto va entero como JSON en
 * `datos`.** Es la misma decisión que tomó el diario y por el mismo motivo: la
 * forma de `Measurement` la manda el paquete de dominio, y normalizarla en
 * columnas obligaría a migrar la base cada vez que ese paquete agregue un campo,
 * para consultas que nadie hace. El orden de los parámetros es el de la lista de
 * columnas, que es lo que `MedicionesService.guardar` respeta.
 *
 * **`INSERT` y no `INSERT OR REPLACE`.** Una medición es el registro de un
 * instante que ya pasó: reescribirla no es corregir un dato sino cambiar la
 * historia, y el identificador lo genera quien captura. Si alguna vez choca, que
 * falle y se vea, en vez de pisar una escucha con otra.
 */
export const INSERCION_DE_MEDICION =
  `INSERT INTO measurement
     (id, session_id, timestamp, signal_type, channel_id, posicion,
      pa_component, calibration_state_id, datos)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * Los valores de una medición, en el orden exacto que `INSERCION_DE_MEDICION`
 * espera.
 *
 * **Existe porque el test decía ejercitar este orden y no lo ejercitaba.** El
 * `INSERT` salía de producción, sí, pero la lista de parámetros era una **copia a
 * mano** en el test: una auditoría del 2026-09-19 permutó `channelId` con
 * `posicion` y `paComponent` con `calibrationStateId` en el servicio y la suite
 * entera quedó en verde. O sea el mismo defecto que este archivo vino a arreglar
 * —el SQL duplicado en el test— cometido en el renglón de al lado, sobre la mitad
 * que nadie miró.
 *
 * Con esto el orden vive en un solo sitio y el test lo usa, así que permutar dos
 * columnas rompe algo.
 *
 * **Qué se rompe si se permutan, para que se entienda por qué importa aunque hoy
 * no cambie ningún veredicto:** el motor lee el JSON de `datos`, no las columnas,
 * así que una permutación no afloja ninguna guarda. Lo que queda mal es la tabla:
 * `channel_id` guardaría la posición, y esas columnas existen justamente para
 * poder consultarlas sin abrir el JSON.
 */
export function valoresDeLaMedicion(m: {
  readonly id: string;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly signalType: string;
  readonly channelId: string | null;
  readonly posicion: string | null;
  readonly paComponent: string | null;
  readonly calibrationStateId: string;
}): readonly unknown[] {
  return [
    m.id, m.sessionId, m.timestamp, m.signalType, m.channelId, m.posicion,
    m.paComponent, m.calibrationStateId, JSON.stringify(m),
  ];
}
