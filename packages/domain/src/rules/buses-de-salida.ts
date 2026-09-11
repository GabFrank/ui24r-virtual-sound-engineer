import type { BusRef } from '../entities/venue.ts';

/**
 * De qué bus habla una ruta de ecualización de salida.
 *
 * **Existe porque la lista blanca de INV-008 comparaba rutas completas contra
 * una ruta que no existe.** El único test del proyecto donde el motor aprobaba
 * una escritura de sala declaraba `busesDeSalidaPermitidos: new Set(['m.eq.b1.gain'])`
 * y comparaba por igualdad exacta. Esa ruta **no existe en la consola**: el
 * ecualizador de un bus de salida no es paramétrico.
 *
 * **Lo que la Ui24R tiene de verdad**, medido el 2026-09-11 sobre las 6732
 * claves que publica:
 *
 * - **Canal**: `i.N.eq.bM.freq`, `.gain`, `.q` — paramétrico, tres parámetros
 *   por banda.
 * - **General**: `m.eq.peak.l.0` a `.30` y `m.eq.peak.r.0` a `.30` — **gráfico
 *   de 31 bandas por lado**, un escalar por banda, sin frecuencia ni Q. Más
 *   `m.eq.hpf.l/r`, `m.eq.lpf.l/r`, `m.eq.bypass` y `m.eq.linked`.
 * - **Auxiliar**: `a.N.eq.peak.0` a `.30`, mono, con `hpf`, `lpf`, `bypass` y
 *   `linked`.
 *
 * Un bus son **setenta claves** en el general y treinta y siete en un auxiliar.
 * Enumerarlas una por una en una lista blanca no era viable, y por eso la lista
 * quedó con una ruta inventada que nadie ejercitó contra el aparato.
 *
 * **Por eso se compara el BUS y no la ruta.** El perfil del sistema de
 * amplificación declara buses —`{tipo:'MASTER'}`, `{tipo:'AUX',indice:3}`— que
 * es lo que un técnico sabe decir; la traducción a prefijos vive acá, en un solo
 * lugar, y se puede contrastar contra el inventario.
 */

/** El prefijo de las claves de un bus. `m` para el general, `a.N` para un auxiliar. */
export function prefijoDeBus(bus: BusRef): string | null {
  switch (bus.tipo) {
    case 'MASTER': return 'm';
    case 'AUX': return `a.${bus.indice}`;
    // **La matriz no tiene ecualizador propio.** En las 6732 claves observadas,
    // `mtx` aparece solo como envío --`<fuente>.mtx.<destino>.value`-- y no hay
    // ninguna `mtx.N.eq.*`. Devolver `null` es decir eso, y no inventar un
    // prefijo que haría pasar una escritura sobre una ruta inexistente.
    case 'MTX': return null;
  }
}

/**
 * Los prefijos que el perfil autoriza, listos para el motor de seguridad.
 *
 * Un bus que no tiene ecualizador se descarta acá y no llega al motor: así el
 * rechazo dice «no está entre los buses declarados», que es la verdad, en vez de
 * dejar pasar una ruta que la consola no conoce.
 */
export function prefijosPermitidos(buses: readonly BusRef[]): ReadonlySet<string> {
  const s = new Set<string>();
  for (const b of buses) {
    const p = prefijoDeBus(b);
    if (p !== null) s.add(p);
  }
  return s;
}

/**
 * Si una ruta de ecualización de salida cae en un bus autorizado.
 *
 * Se exige `<prefijo>.eq.` y no solo el prefijo: `a.3.mix` es el fader del
 * auxiliar 3, no su ecualizador, y autorizar el bus para ecualizar no autoriza a
 * mover su nivel.
 */
export function ecualizacionPermitida(
  path: string,
  prefijos: ReadonlySet<string>,
): boolean {
  for (const p of prefijos) if (path.startsWith(`${p}.eq.`)) return true;
  return false;
}

/**
 * Si esta ruta de ecualización de salida admite un factor de calidad.
 *
 * **La respuesta en esta consola es siempre «no», y eso deja una cláusula
 * normativa sin poder cumplirse.** INV-004 exige «Q ≥ 0,7 en salidas» y el
 * motor la comprueba con `if (c.q !== undefined && c.q < Q_MINIMO)`. Sobre un
 * ecualizador gráfico **`c.q` es `undefined` siempre**, así que la regla no se
 * dispara nunca: es la forma nueva de «la constante que nadie consulta».
 *
 * Se deja escrito acá, junto al dato que lo explica, en vez de en una nota al
 * pie: el peligro que INV-004 quiere evitar —un realce estrecho sobre el
 * sistema— **en un gráfico de 31 bandas lo acota `REALCE_MAXIMO_SALA_DB`**, que
 * sí se consulta. La cláusula de Q sigue teniendo sentido para un ecualizador
 * paramétrico de salida, que esta consola no tiene.
 */
export function admiteFactorDeCalidad(path: string): boolean {
  // Paramétrico: `…eq.bN.q`. Gráfico: `…eq.peak.…`, sin q.
  return /\.eq\.b\d+\./.test(path);
}
