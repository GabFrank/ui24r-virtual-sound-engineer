/**
 * Qué se queda afuera del punto de retorno de INV-001.
 *
 * **La promesa y su letra chica.** INV-001 dice que ninguna transacción pasa a
 * aplicar sin una instantánea verificada: el punto de retorno. Lo que la
 * promesa no decía es que **hay cosas que una recuperación no devuelve**, y ya
 * van dos clases distintas:
 *
 * 1. **`m.afs.enabled`**, la supresión de realimentación. Medido el 2026-09-10:
 *    de 45 campos movidos, un `LOADSNAPSHOT` devolvió 44 y ése no. Es el
 *    parámetro que le mete filtros de −18 dB al audio por su cuenta.
 * 2. **Los «safe»**, que son cincuenta en esta consola: 24 canales, 10
 *    auxiliares, 6 subgrupos, 4 efectos, 2 del reproductor, 2 de línea, el
 *    general y `var.unsaved.chsafes`. Marcar algo como protegido es decirle a
 *    la consola «esto no me lo muevan», **incluso en una recuperación**.
 *
 * **Lo que este módulo NO afirma, y es importante.** Que un safe impida la
 * restauración es lo que el nombre y el manual sugieren — y el manual técnico
 * del firmware dice, con todas las letras, que *«el alcance exacto de cada
 * safe, las prioridades de recall y la persistencia durante un corte eléctrico
 * necesitan ensayos sobre una copia de show»*. **No está medido contra el
 * aparato**, a diferencia de `m.afs.enabled`, que sí.
 *
 * Por eso acá se informa **qué está marcado**, no qué va a pasar. La diferencia
 * entre las dos cosas es exactamente lo que este proyecto viene aprendiendo a
 * los golpes.
 */

/** Algo que el operador marcó como protegido. */
export interface Protegida {
  /** La ruta del safe: `i.8.safe`, `m.safe`. */
  readonly ruta: string;
  /** El prefijo de lo que protege: `i.8`, `m`. */
  readonly fuente: string;
  /** El nombre que la consola le da a esa fuente, si tiene. */
  readonly nombre: string | null;
}

/** Lo que el punto de retorno no promete devolver. */
export interface FueraDelPuntoDeRetorno {
  /**
   * Lo marcado como protegido por el operador.
   *
   * **Observado, no medido**: que un safe impida la restauración no se comprobó
   * contra el aparato.
   */
  readonly protegidas: readonly Protegida[];
  /**
   * Campos que un `LOADSNAPSHOT` **no devuelve**, esto sí medido.
   *
   * Hoy es uno solo. Se deja como lista porque la forma de descubrirlos —mover
   * campos y recuperar— va a encontrar más.
   */
  readonly sinRestaurar: readonly string[];
}

/** El único campo de 45 que un recall no devolvió, medido el 2026-09-10. */
const SIN_RESTAURAR_MEDIDO = ['m.afs.enabled'] as const;

/**
 * Lee del estado confirmado qué queda fuera del punto de retorno.
 *
 * `leer` devuelve el valor numérico de una ruta o `null`; `leerTexto`, el de una
 * de texto. Se pasan como funciones para poder probar esto sin consola.
 */
export function fueraDelPuntoDeRetorno(
  rutas: Iterable<string>,
  leer: (ruta: string) => number | null,
  leerTexto: (ruta: string) => string | null,
): FueraDelPuntoDeRetorno {
  const protegidas: Protegida[] = [];
  for (const r of rutas) {
    if (!r.endsWith('.safe')) continue;
    // **Encendido, no «distinto de cero».** Es un interruptor y la consola lo
    // publica como 0 o 1; leerlo con un umbral invitaría a discutir qué pasa
    // con 0,5, que no ocurre.
    if ((leer(r) ?? 0) < 0.5) continue;
    const fuente = r.slice(0, -'.safe'.length);
    protegidas.push({ ruta: r, fuente, nombre: leerTexto(`${fuente}.name`) });
  }
  protegidas.sort((a, b) => a.ruta.localeCompare(b.ruta));
  return { protegidas, sinRestaurar: [...SIN_RESTAURAR_MEDIDO] };
}

/**
 * Si el punto de retorno devuelve todo lo que se le va a pedir.
 *
 * Devuelve `null` cuando no hay nada marcado — que es el caso normal y no
 * necesita decir nada— y un aviso en castellano cuando sí lo hay.
 *
 * **Se redacta acá y no en la pantalla** para que el mismo texto vaya al
 * registro y al cartel: un diario que dice algo distinto de lo que vio el
 * operador es peor que uno vacío.
 */
export function avisoDelPuntoDeRetorno(f: FueraDelPuntoDeRetorno): string | null {
  if (f.protegidas.length === 0) return null;
  const cuáles = f.protegidas
    .map((p) => (p.nombre !== null && p.nombre !== '' ? `${p.fuente} (${p.nombre})` : p.fuente))
    .join(', ');
  return (
    `Hay ${f.protegidas.length} ${f.protegidas.length === 1 ? 'fuente marcada' : 'fuentes marcadas'} `
    + `como protegida: ${cuáles}. La consola las trata aparte, y no está medido si una `
    + 'recuperación las devuelve. Lo que sí está medido es que la supresión de '
    + 'realimentación del general no vuelve.'
  );
}
