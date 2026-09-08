import type { Almacen } from '@vse/store';
import { ORDEN_NIVEL, type LogEvent, type LogLevel } from './tipos.ts';

/**
 * Lectura del registro guardado, para verlo y para exportarlo.
 *
 * `docs/logging.md` promete un `events.jsonl` dentro del paquete que se adjunta
 * a un informe de campo. Una línea por evento y nada más: es el formato que se
 * puede recortar con `grep` y abrir a la mitad sin que se rompa, que es lo que
 * hace falta cuando el archivo llega por mensaje desde otra ciudad.
 */

export interface FiltroRegistro {
  readonly sesion?: string | null;
  readonly desdeNivel?: LogLevel;
  readonly limite?: number;
}

/** Los más recientes primero: un registro se lee empezando por lo último. */
export async function leerEventos(
  almacen: Almacen,
  filtro: FiltroRegistro = {},
): Promise<readonly LogEvent[]> {
  const donde = filtro.sesion === undefined ? undefined : { session_id: filtro.sesion };
  const docs = await almacen.listar('log_event', {
    ...(donde ? { donde } : {}),
    ordenarPor: 'id',
    descendente: true,
    // Se pide de más cuando hay filtro de nivel, porque ese filtro se aplica
    // acá: el puerto compara por igualdad y «warn o peor» no es una igualdad.
    ...(filtro.limite === undefined ? {}
      : { limite: filtro.desdeNivel ? filtro.limite * 10 : filtro.limite }),
  });
  let eventos = docs.map((d) => d.datos as LogEvent);
  if (filtro.desdeNivel !== undefined) {
    const minimo = ORDEN_NIVEL[filtro.desdeNivel];
    eventos = eventos.filter((e) => ORDEN_NIVEL[e.level] >= minimo);
  }
  return filtro.limite === undefined ? eventos : eventos.slice(0, filtro.limite);
}

/** Un evento por línea, en orden cronológico: así se lee un registro. */
export function aJsonl(eventos: readonly LogEvent[]): string {
  return [...eventos].reverse().map((e) => JSON.stringify(e)).join('\n');
}
