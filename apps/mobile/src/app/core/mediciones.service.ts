import { Injectable, inject } from '@angular/core';
import type { Measurement } from '@vse/domain';
import { DatabaseService } from './database.service';
import { CONSULTA_DE_MEDICIONES, INSERCION_DE_MEDICION, valoresDeLaMedicion } from './sql-de-mediciones.ts';

/**
 * Las mediciones de una sesión, leídas y escritas en la base.
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
 * la leía ni la escribía.** La lectura llegó el 2026-09-18 y **la escritura el
 * 2026-09-19**, que es la mitad que faltaba: sin ella la lectura devolvía siempre
 * la lista vacía, y con la lista vacía ninguna ruta queda con escucha comprobada
 * —o sea que el arreglo anterior no podía cambiar nada todavía—.
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
   * Guarda una medición.
   *
   * **Qué se desbloquea guardándola.** El motor exige una medición entre un
   * cambio y el siguiente sobre el mismo parámetro y la resuelve contra esta
   * tabla. Mientras nadie escribía, **el segundo ajuste sobre el mismo canal se
   * rechazaba siempre** con `SIN_MEDICION_INTERMEDIA`, aunque el músico hubiera
   * tocado los dieciocho segundos que la pantalla le pidió. La aplicación sabía
   * que había escuchado y no se lo decía al motor.
   *
   * **Esta comprobación tapa UN caso y no la fila huérfana, y el motivo que
   * estaba escrito acá era falso.** Decía que una fila huérfana «la aceptaría en
   * silencio y la lectura por sesión nunca la encontraría». La segunda mitad no es
   * cierta: **quien pregunte por ese mismo identificador la encuentra**, y con ella
   * el motor concede. Lo midió una auditoría adversarial el 2026-09-19 con la base
   * como corre en la tablet —`sessionId` en `'   '` o en una sesión borrada entra,
   * se lee y autoriza el paso siguiente—.
   *
   * Lo que sí es cierto, y hay que decirlo porque cambia quién protege qué:
   * `session_id` es una clave foránea a `sound_session` y **la aplicación nunca
   * ejecuta `PRAGMA foreign_keys = ON`**, así que la base no rechaza nada. En los
   * tests sí las rechaza, porque `node:sqlite` las activa por omisión: o sea que
   * esa garantía **existe en el test y no en el aparato**, y es la tercera vez que
   * este repositorio corrige esa misma confusión.
   *
   * **Lo que de verdad evita la fila huérfana hoy es el llamador**, que no guarda
   * nada sin sesión abierta. Esto es el último cierre, y tapa sólo la cadena
   * vacía: `''` sería un identificador válido para la lectura por sesión, y con él
   * el permiso de escucha viviría en una sesión que no existe. Un identificador
   * inventado pero no vacío pasa, y eso **queda como tarea**.
   */
  async guardar(m: Measurement): Promise<void> {
    if (m.sessionId === '') {
      throw new Error(
        'una medición sin sesión no se guarda: la tabla se lee por sesión y esa fila ' +
        'no la encontraría nadie. Quien captura tiene que esperar a que haya sesión.',
      );
    }
    // El orden de los parámetros sale de `valoresDeLaMedicion` y no se escribe
    // acá: es lo único que un test puede ejercitar, y escrito acá no lo ejercitaba
    // nadie.
    await this.db.ejecutar(INSERCION_DE_MEDICION, valoresDeLaMedicion(m));
  }

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
    const filas = await this.db.consultar<{ datos: string }>(CONSULTA_DE_MEDICIONES, [sessionId]);
    const salida: Measurement[] = [];
    for (const f of filas) {
      // **Una fila ilegible se descarta, no tira la pantalla.** El patrón del
      // diario hace `JSON.parse` sin capturar, y acá se copió; una auditoría del
      // 2026-09-19 midió la diferencia: con una fila truncada o con `datos` en
      // `'null'`, la excepción sube por `contexto()` y **rechaza la promesa de
      // subir, bajar Y aplicar ganancia**. Antes de esta clase esa fila no se
      // leía nunca, así que el patrón heredado no traía el riesgo heredado.
      //
      // **Descartar es lo seguro y no lo cómodo.** Una medición que no se puede
      // leer es una escucha que no se puede comprobar, y sin escucha comprobada
      // el motor rechaza el paso siguiente: se falla hacia el lado de frenar,
      // que es el mismo lado al que fallaba la lista vacía.
      let m: Measurement | null = null;
      try {
        const leido: unknown = JSON.parse(f.datos);
        if (leido !== null && typeof leido === 'object') m = leido as Measurement;
      } catch {
        m = null;
      }
      if (m !== null) salida.push(m);
    }
    return salida;
  }
}
