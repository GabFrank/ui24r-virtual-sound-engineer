/**
 * Procesamiento dinámico de un canal: qué hay puesto y si está actuando.
 *
 * **Por qué el dominio y no el adaptador.** El adaptador sabe qué ruta del
 * protocolo dice qué; el asistente de ganancia sabe qué hacer con un nivel
 * condicionado; y los dos tienen que hablar del mismo objeto o la regla queda
 * escrita dos veces y una de las dos se pudre. El vocabulario vive acá, la
 * lectura del protocolo vive en `packages/mixer-adapter/src/dinamica.ts` y la
 * decisión vive en `packages/assistants/src/gain.ts`.
 */

/**
 * Si un proceso está actuando sobre el canal.
 *
 * Tres valores y no un booleano, porque «no lo sé» no es «no». Cuando la
 * consola no dijo una de las banderas, dar por sentado que el proceso está
 * apagado es exactamente el error que hace que un consejo de ganancia salga
 * calculado sobre una señal ya procesada sin que nadie se entere.
 */
export type EstadoDeProceso = 'ACTIVO' | 'INACTIVO' | 'DESCONOCIDO';

/**
 * Qué procesamiento dinámico tiene puesto un canal.
 *
 * Es **configuración**, no medición: dice qué está en el camino, no cuánto
 * está haciendo. Cuánto hace el compresor se mide aparte y en vivo —viaja en
 * la trama de medidores— porque un compresor puesto que nunca llega a su
 * umbral no condiciona ninguna lectura.
 */
export interface DinamicaDeCanal {
  /** Compresor. Sale de `i.N.dyn.bypass`. */
  readonly compresor: EstadoDeProceso;
  /** Puerta de ruido. Sale de `i.N.gate.enabled` y `i.N.gate.bypass`. */
  readonly puerta: EstadoDeProceso;
  /** De-esser. Sale de `i.N.deesser.enabled`. */
  readonly deesser: EstadoDeProceso;
}

/** Lo que se sabe de un canal del que todavía no llegó ninguna bandera. */
export const DINAMICA_SIN_LEER: DinamicaDeCanal = {
  compresor: 'DESCONOCIDO',
  puerta: 'DESCONOCIDO',
  deesser: 'DESCONOCIDO',
};

/** Un canal con todo el proceso fuera del camino. */
export const DINAMICA_LIMPIA: DinamicaDeCanal = {
  compresor: 'INACTIVO',
  puerta: 'INACTIVO',
  deesser: 'INACTIVO',
};

/**
 * Nombre de cada proceso tal como se le dice al usuario.
 *
 * Está acá y no en cada pantalla para que el aviso del asistente y la insignia
 * de la tabla no le pongan dos nombres distintos a la misma cosa.
 */
const NOMBRES: Readonly<Record<keyof DinamicaDeCanal, string>> = {
  compresor: 'compresor',
  puerta: 'puerta de ruido',
  deesser: 'de-esser',
};

const ORDEN: readonly (keyof DinamicaDeCanal)[] = ['compresor', 'puerta', 'deesser'];

/** Los procesos que están en el estado pedido, con su nombre legible. */
export function procesosEn(
  d: DinamicaDeCanal,
  estado: EstadoDeProceso,
): readonly string[] {
  return ORDEN.filter((k) => d[k] === estado).map((k) => NOMBRES[k]);
}

/**
 * «el compresor y la puerta de ruido», con el artículo y la coma que
 * corresponden. Devuelve cadena vacía si no hay ninguno.
 */
export function describirProcesos(nombres: readonly string[]): string {
  if (nombres.length === 0) return '';
  const conArticulo = nombres.map((n) => (n === 'puerta de ruido' ? `la ${n}` : `el ${n}`));
  if (conArticulo.length === 1) return conArticulo[0]!;
  return `${conArticulo.slice(0, -1).join(', ')} y ${conArticulo[conArticulo.length - 1]!}`;
}
