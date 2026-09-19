/**
 * La consulta con que se leen las mediciones de una sesión.
 *
 * ## Por qué vive en su propio archivo y no en el servicio
 *
 * **Para que un test pueda ejercitar ésta y no una copia.** La primera versión
 * tenía la cadena escrita en el servicio y **otra igual escrita en el test**, así
 * que nada en el repositorio comprobaba la consulta de producción: un error de
 * tipeo ahí no lo cazaba nadie. Lo marcó una auditoría el 2026-09-19.
 *
 * Y no puede vivir en `mediciones.service.ts` porque ese archivo lleva un
 * decorador de Angular, y el modo de eliminación de tipos de Node —con el que
 * corren los tests— **no parsea un decorador**: importarlo desde un test rompe
 * con `SyntaxError`. Es exactamente el mismo motivo por el que `LEY_DEL_ENVIO`
 * tiene su propio archivo, y la misma solución.
 *
 * **Sin `ORDER BY`, y es deliberado.** El consumidor —`historialDeLaSesion`—
 * indexa por identificador, así que el orden no cambia ningún veredicto. Ordenar
 * por `timestamp` en SQL sería ordenar **texto**, y eso ya se pagó una vez en
 * este mismo camino: con `09:00Z` y `07:00-05:00` la comparación lexicográfica
 * elige la primera siendo la segunda más tarde.
 */
export const CONSULTA_DE_MEDICIONES = 'SELECT datos FROM measurement WHERE session_id = ?';
