/**
 * Quién llena `techoPorRuta`, que hasta hoy no tenía productor.
 *
 * **El agujero.** `ContextoSeguridad.techoPorRuta` es un mapa que el motor
 * consulta en cada envío a monitor, y **nada en producción lo llenaba**: sólo los
 * tests. Un motor que consulta un mapa siempre vacío no rechaza nada, así que la
 * regla que ADR-028 decidió existía en el código y no en el comportamiento.
 *
 * La auditoría robusta lo tenía registrado: *«`techoPorRuta` no tiene productor.
 * La regla “sólo si la app bajó” está en el motor y nadie llena el mapa.»*
 *
 * **La regla es del usuario, textual**, eligiendo entre opciones el 2026-09-11:
 *
 * > *«Hasta donde estaba antes de que yo lo bajara, y ni un paso más.»*
 *
 * Y ADR-028 fija cómo se ancla: **el valor que la ruta tenía cuando la aplicación
 * la bajó**. Si la aplicación no la bajó, no hay techo.
 *
 * **Lo que este módulo NO puede hacer, y hay que decirlo.** El usuario dijo
 * «antes de que **yo** lo bajara»; esto se ancla en lo que bajó **la aplicación**.
 * Si él baja a mano, la app no se entera: haría falta seguir los cambios externos
 * de la consola, y eso no existe todavía. La diferencia está declarada en el
 * propio `ContextoSeguridad` y no se tapa acá.
 */
import type { CambioPropuesto } from './types.ts';

/**
 * Registra el techo que deja un cambio ya aplicado.
 *
 * Devuelve un mapa nuevo: el estado de seguridad no se muta en el lugar, porque
 * un mapa compartido que alguien modifica mientras el motor lo lee es la clase de
 * error que no se reproduce.
 *
 * **Sólo los envíos a monitor**, que es el único tipo al que ADR-028 le puso
 * techo. Y **sólo cuando la aplicación BAJA**: subir no ancla nada, porque el
 * techo existe para acotar la vuelta de algo que la aplicación bajó.
 *
 * **El primer descenso manda.** Si la ruta ya tiene techo, se conserva: después
 * del primero, el valor que la ruta «tenía» ya no es el del usuario sino uno que
 * la aplicación puso. Subir hasta ahí sería subir hasta donde la aplicación la
 * dejó, no hasta donde estaba.
 */
export function registrarTecho(
  techos: ReadonlyMap<string, number>,
  cambio: Pick<CambioPropuesto, 'kind' | 'path' | 'magnitudEsperada' | 'magnitudPropuesta'>,
): ReadonlyMap<string, number> {
  if (cambio.kind !== 'MONITOR_AUX_SEND') return techos;
  if (!(cambio.magnitudPropuesta < cambio.magnitudEsperada)) return techos;
  if (techos.has(cambio.path)) return techos;
  if (!Number.isFinite(cambio.magnitudEsperada)) return techos;
  const nuevo = new Map(techos);
  nuevo.set(cambio.path, cambio.magnitudEsperada);
  return nuevo;
}

/**
 * Registra una tanda de cambios aplicados, en orden.
 *
 * El orden importa por la regla del primer descenso: dos bajadas sobre la misma
 * ruta anclan en la primera.
 */
export function registrarTechos(
  techos: ReadonlyMap<string, number>,
  cambios: readonly Pick<
    CambioPropuesto, 'kind' | 'path' | 'magnitudEsperada' | 'magnitudPropuesta'
  >[],
): ReadonlyMap<string, number> {
  let acumulado = techos;
  for (const c of cambios) acumulado = registrarTecho(acumulado, c);
  return acumulado;
}

/**
 * Olvida el techo de una ruta.
 *
 * **Para cuando el usuario mueve el envío a mano**, que es el caso que el anclaje
 * automático no puede ver. No se llama solo: lo llama quien sepa que el usuario
 * tocó esa ruta, y hoy nadie lo sabe. Existe para que ese día la pieza esté, y
 * para que quede escrito que **sin eso el techo puede quedar desactualizado**.
 */
export function olvidarTecho(
  techos: ReadonlyMap<string, number>,
  path: string,
): ReadonlyMap<string, number> {
  if (!techos.has(path)) return techos;
  const nuevo = new Map(techos);
  nuevo.delete(path);
  return nuevo;
}
