import { Injectable, inject } from '@angular/core';
import type { Measurement } from '@vse/domain';
import { DatabaseService } from './database.service';

/**
 * Las mediciones de una sesión, leídas de la base.
 *
 * **Por qué existe, que no es para mostrar nada.** `historialDeLaSesion` resuelve
 * `EntradaDiario.medicionPosteriorId` contra la lista que le pasa el llamador,
 * y con esa lista decide si entre un paso y el siguiente **se escuchó de
 * verdad**. Hasta el 2026-09-18 los dos servicios de producción le pasaban `[]`,
 * así que ninguna ruta quedaba con escucha comprobada y **el segundo paso de
 * cualquier rampa se rechazaba**. Eso frena, no afloja, pero frena la pieza que
 * la hoja de ruta pide: una cuña se levanta en varios pasos de 2 dB escuchando
 * entre uno y otro, y el segundo no llegaba nunca.
 *
 * El compilador no podía cazarlo: una lista vacía es una lista válida.
 *
 * **La tabla `measurement` está en el esquema desde la primera migración y nadie
 * la leía.** Lo que faltaba era esto. Escribirla es de quien capture, que es la
 * pantalla de monitor.
 *
 * **El detalle va como JSON en `datos`, igual que el diario.** El esquema tiene
 * columnas para lo que se consulta —sesión, fecha, señal, canal— y el resto se
 * guarda entero, porque la forma de `Measurement` la manda el paquete de dominio
 * y normalizarla obligaría a migrar la base cada vez que ese paquete agregue un
 * campo, para consultas que nadie hace.
 */
@Injectable({ providedIn: 'root' })
export class MedicionesService {
  private readonly db = inject(DatabaseService);

  /**
   * Todas las mediciones de una sesión.
   *
   * **Sin `ORDER BY`, y es deliberado.** El diario sí ordena porque el historial
   * necesita «la última transacción que tocó cada ruta»; acá el consumidor
   * **indexa por identificador** —`historialDeLaSesion` arma un mapa de `id` a
   * medición— así que el orden no cambia ningún veredicto. Ordenar por
   * `timestamp` en SQL sería además ordenar **texto**, y eso ya se pagó una vez
   * en este mismo camino: con `09:00Z` y `07:00-05:00` la comparación
   * lexicográfica elige la primera siendo la segunda más tarde. Si algún día
   * hace falta un orden, se ordena por instante y no por cadena.
   *
   * **Las fechas sin huso no se filtran acá.** No es un olvido: `escuchaComprobada`
   * ya las rechaza —`instante()` devuelve nulo y la guarda no concede— y poner
   * una segunda comprobación acá dejaría dos reglas que pueden divergir. La
   * autoridad es la guarda; esto es una lectura.
   */
  async deLaSesion(sessionId: string): Promise<readonly Measurement[]> {
    const filas = await this.db.consultar<{ datos: string }>(
      `SELECT datos FROM measurement WHERE session_id = ?`,
      [sessionId],
    );
    return filas.map((f) => JSON.parse(f.datos) as Measurement);
  }
}
