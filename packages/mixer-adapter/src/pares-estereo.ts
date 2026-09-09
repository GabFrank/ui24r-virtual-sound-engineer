/**
 * Qué canales forman un par estéreo, leído de la consola en vez de declarado.
 *
 * **El plan era pedírselo al usuario.** `docs/instrumentos.md` lo tenía primero
 * en la lista de lo que falta para el panorama: «qué canales forman un par
 * estéreo es el dato que ninguna faceta contiene». El teclado llega por dos
 * canales y hoy son dos asignaciones sin nada que las relacione.
 *
 * Resultó que el dato ya existe. Medido el 2026-09-09: **`i.N.stereoIndex`
 * está en los 24 canales**, y las entradas de línea —que sí son un par— valen
 * `l.0 = 0` y `l.1 = 1`.
 *
 * **Qué significa el número**, leído del `mixer.html` de la consola:
 *
 *     setValue(this.name + "stereoIndex", 0);              // el primero del par
 *     setValue(this.linkTarget.name + "stereoIndex", 1);   // el segundo
 *
 * y `linkTarget = allStrips[this.id + 1]`. O sea: **0 es el izquierdo y su
 * compañero es el canal siguiente; 1 es el derecho y su compañero es el
 * anterior; −1 es sin enlazar.** No es un identificador de par: es la posición
 * dentro del par, y por eso los dos miembros valen distinto.
 *
 * **La consola no mantiene la relación, la escribe el cliente.** Medido con la
 * conexión testigo: escribir `i.4.stereoIndex = 0` no movió `i.5`. Hacen falta
 * las dos escrituras. Importa para leer con cuidado —puede haber un estado a
 * medias si alguien escribió una sola— y todavía más para escribir.
 *
 * **Enlazar desde la aplicación sería destructivo, y por eso acá solo se lee.**
 * El cliente de la consola, antes de escribir las dos claves, hace
 * `copySettings()` sobre el izquierdo y `pasteSettings()` sobre el derecho: el
 * enlace **pisa todos los ajustes del canal derecho**. Escribir solo las dos
 * claves no copia nada —la copia es del lado del cliente— pero dejaría un par
 * que la consola dibuja enlazado con dos canales que suenan distinto. Ninguna
 * de las dos cosas es aceptable sin una decisión explícita.
 */

/** Un par estéreo, por número de canal de cara al usuario. */
export interface ParEstereo {
  readonly izquierdo: number;
  readonly derecho: number;
}

/** El valor de `stereoIndex` que dice «no estoy enlazado». */
export const SIN_ENLACE = -1;

/**
 * El compañero de un canal, o `null` si no está enlazado.
 *
 * `indices` va por número de canal, no por índice de ruta: la traducción de
 * base cero ya se hizo en el borde del adaptador.
 */
export function companeroDe(canal: number, indices: ReadonlyMap<number, number>): number | null {
  const propio = indices.get(canal);
  if (propio === undefined || propio === SIN_ENLACE) return null;
  if (propio === 0) return canal + 1;
  if (propio === 1) return canal - 1;
  // Cualquier otro valor es algo que esta consola no nos enseñó. No se
  // interpreta: preferimos decir «no hay par» antes que emparejar mal.
  return null;
}

/**
 * Los pares completos, descartando los que están a medias.
 *
 * Un par cuenta solo si **las dos mitades se declaran entre sí**: el izquierdo
 * dice 0 y el de al lado dice 1. Como las dos escrituras son independientes,
 * un estado a medias es posible —y leerlo como par válido significaría abrir
 * el panorama de dos canales que la consola no tiene enlazados.
 */
export function paresEstereo(indices: ReadonlyMap<number, number>): readonly ParEstereo[] {
  const pares: ParEstereo[] = [];
  for (const [canal, valor] of [...indices].sort((a, b) => a[0] - b[0])) {
    if (valor !== 0) continue;
    if (indices.get(canal + 1) !== 1) continue;
    pares.push({ izquierdo: canal, derecho: canal + 1 });
  }
  return pares;
}
