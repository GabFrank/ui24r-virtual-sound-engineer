import {
  FUENTES, NOMBRE_DE_ROL, crearInstrumento, etiquetaCanonicaDeInstrumento,
  etiquetaDeInstrumento, fuentePorId,
  type FuenteDeSonido, type FuenteId, type Instrumento, type RolDeInstrumento, type VarianteId,
} from '@vse/domain';

/**
 * Lo que la pantalla necesita para dejar elegir instrumentos del catálogo.
 *
 * Vive fuera del componente por la misma razón que `telemetry/escala-medidor.ts`:
 * es transformación pura sobre datos del dominio y así se prueba con
 * `node --test`, sin montar Angular. El componente solo consulta y emite.
 *
 * **Qué decide este fichero y qué no.** No decide qué variantes ni qué roles
 * existen —eso lo declara cada fuente en `packages/domain`— ni cómo se muestra
 * un instrumento —eso es `etiquetaDeInstrumento()`—. Decide únicamente la forma
 * en que esas listas llegan a la plantilla: ya resueltas, con la marca de cuál
 * está elegida, para que la plantilla no tenga que buscar nada. Buscar desde la
 * plantilla es llamar a una función desde la plantilla, y eso se reevalúa en
 * cada ciclo de detección de cambios.
 *
 * **Por qué las operaciones devuelven la lista entera.** Agregar, quitar y
 * alternar una faceta son cambios sobre una lista inmutable que el componente
 * emite de una pieza. Con métodos que mutaran en el sitio, la señal del padre
 * no cambiaría de referencia y la pantalla no se repintaría; y además esta
 * forma es la que se puede probar sin señales de por medio.
 */

/** Una opción de faceta ya resuelta para la plantilla: nombre y si está puesta. */
export interface OpcionDeFaceta<T extends string> {
  readonly id: T;
  readonly nombre: string;
  readonly elegida: boolean;
}

/** Una fuente tal como se ofrece en la grilla: identificador y nombre visible. */
export interface FuenteElegible {
  readonly id: FuenteId;
  readonly nombre: string;
}

/**
 * Un instrumento ya elegido, tal como se muestra en la lista.
 *
 * `variantes` y `roles` vienen vacíos cuando la fuente no admite ninguno —un
 * shaker no tiene tesitura, una entrada de línea no cumple función musical—.
 * Que la plantilla no tenga nada que dibujar es exactamente lo que hace que las
 * combinaciones imposibles no se ofrezcan: la lista vacía no se pinta.
 */
export interface FilaDeInstrumento {
  /** Posición en la lista. Es lo que identifica a la fila: dos congas iguales
   *  son dos instrumentos distintos hasta que se les elige el tamaño. */
  readonly indice: number;
  readonly etiqueta: string;
  /**
   * Qué contar de un instrumento que vino escrito a mano, o `null` si no vino
   * de texto.
   *
   * Se dice y no se esconde porque la fila se ve distinta —no ofrece facetas— y
   * sin explicación eso parece un fallo. Además muestra si el catálogo lo
   * entendió, que es lo que el usuario no puede saber de otra forma.
   */
  readonly nota: string | null;
  readonly variantes: readonly OpcionDeFaceta<VarianteId>[];
  readonly roles: readonly OpcionDeFaceta<RolDeInstrumento>[];
}

/**
 * Las fuentes de la grilla, en el orden del catálogo.
 *
 * No se reordenan ni se agrupan acá. El catálogo ya las tiene puestas por
 * familia —voz y palabra, después lo melódico, después la percusión, y la
 * entrada de línea al final— y reordenarlas en la pantalla haría que el orden
 * dependiera de dos sitios.
 */
export const FUENTES_ELEGIBLES: readonly FuenteElegible[] =
  FUENTES.map((f) => ({ id: f.id, nombre: f.nombre }));

/**
 * Un instrumento se puede afinar si se eligió del catálogo.
 *
 * Los que traen `textoOriginal` no: son lo que el usuario escribió a mano en un
 * perfil viejo, y la regla del dominio es que ese texto no se pierde nunca.
 * Cambiarle una faceta obligaría a elegir entre dos cosas malas —dejar el texto
 * y mostrar «GUITARRA CRIOLLA» junto a unas fichas que dicen «eléctrica», o
 * tirarlo y reescribirle al usuario lo que él escribió—. Se quitan y se vuelven
 * a elegir, que son dos toques y no pierde nada.
 */
function seAfina(instrumento: Instrumento): boolean {
  return instrumento.fuente !== null && instrumento.textoOriginal === null;
}

function notaDeInstrumento(instrumento: Instrumento): string | null {
  if (instrumento.textoOriginal === null) return null;
  if (instrumento.fuente === null) {
    return 'Escrito a mano. El catálogo no lo reconoce, así que se guarda tal cual.';
  }
  const canonica = etiquetaCanonicaDeInstrumento(instrumento);
  if (canonica.toLowerCase() === instrumento.textoOriginal.trim().toLowerCase()) {
    return 'Escrito a mano.';
  }
  return `Escrito a mano; se lee como «${canonica}».`;
}

/** Las filas de la lista de elegidos, con sus facetas ya resueltas. */
export function filasDeInstrumentos(
  instrumentos: readonly Instrumento[],
): readonly FilaDeInstrumento[] {
  return instrumentos.map((i, indice) => {
    const base = {
      indice,
      etiqueta: etiquetaDeInstrumento(i),
      nota: notaDeInstrumento(i),
    };
    // La comparación con null va aparte de «seAfina» solo para que el
    // compilador estreche el tipo: dentro de una función no lo hace.
    if (!seAfina(i) || i.fuente === null) {
      return { ...base, variantes: [], roles: [] };
    }
    const f = fuentePorId(i.fuente);
    return {
      ...base,
      variantes: f.variantes.map((v) => ({ id: v.id, nombre: v.nombre, elegida: v.id === i.variante })),
      roles: f.roles.map((r) => ({ id: r, nombre: NOMBRE_DE_ROL[r], elegida: r === i.rol })),
    };
  });
}

/**
 * Suma la fuente al final de la lista, sin variante ni rol.
 *
 * Un toque y ya está elegido: la fuente es la decisión que el usuario trae
 * hecha desde antes de mirar la pantalla, y obligarlo a confirmar variante y rol
 * para poder guardar «voz» convertiría un toque en tres. La variante y el rol se
 * afinan después, sobre la fila, y son opcionales.
 *
 * No se descartan repetidos a propósito: dos congas son dos instrumentos, y
 * arrancan idénticas hasta que se les elige el tamaño.
 */
export function agregarFuente(
  instrumentos: readonly Instrumento[],
  fuente: FuenteId,
): readonly Instrumento[] {
  return [...instrumentos, crearInstrumento(fuente)];
}

/** Quita la fila. Fuera de rango devuelve la lista igual. */
export function quitarInstrumento(
  instrumentos: readonly Instrumento[],
  indice: number,
): readonly Instrumento[] {
  if (indice < 0 || indice >= instrumentos.length) return instrumentos;
  return instrumentos.filter((_, i) => i !== indice);
}

function cambiarFaceta(
  instrumentos: readonly Instrumento[],
  indice: number,
  cambio: (actual: Instrumento, fuente: FuenteId, f: FuenteDeSonido) => Instrumento,
): readonly Instrumento[] {
  const actual = instrumentos[indice];
  if (actual === undefined || !seAfina(actual)) return instrumentos;
  const fuente = actual.fuente;
  if (fuente === null) return instrumentos;
  const nuevo = cambio(actual, fuente, fuentePorId(fuente));
  // La misma lista, y no una copia idéntica, cuando no hubo cambio: quien nos
  // usa la guarda en una señal, y una referencia nueva repinta la pantalla para
  // nada.
  if (nuevo === actual) return instrumentos;
  return instrumentos.map((x, i) => (i === indice ? nuevo : x));
}

/**
 * Pone la variante, o la quita si ya estaba puesta.
 *
 * Alternar y no fijar: una faceta elegida por error no tendría vuelta atrás si
 * el único gesto fuera elegir otra, y quitar el instrumento entero para
 * corregir un tamaño es desproporcionado. Una variante que la fuente no admite
 * deja la lista igual — la pantalla no la ofrece, pero la regla vive acá y no
 * en la confianza de que la pantalla no se equivoque.
 */
export function alternarVariante(
  instrumentos: readonly Instrumento[],
  indice: number,
  variante: VarianteId,
): readonly Instrumento[] {
  return cambiarFaceta(instrumentos, indice, (actual, fuente, f) => (
    f.variantes.some((v) => v.id === variante)
      ? crearInstrumento(fuente, actual.variante === variante ? null : variante, actual.rol)
      : actual));
}

/** Pone el rol, o lo quita si ya estaba puesto. Ver `alternarVariante`. */
export function alternarRol(
  instrumentos: readonly Instrumento[],
  indice: number,
  rol: RolDeInstrumento,
): readonly Instrumento[] {
  return cambiarFaceta(instrumentos, indice, (actual, fuente, f) => (
    f.roles.includes(rol)
      ? crearInstrumento(fuente, actual.variante, actual.rol === rol ? null : rol)
      : actual));
}
