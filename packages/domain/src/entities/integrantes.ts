import type { BandMemberId } from '../ids.ts';
import type { BandMember } from './musical.ts';
import {
  etiquetaDeInstrumento, interpretarInstrumento, reinterpretarInstrumento,
  type Instrumento,
} from '../data/instrumentos.ts';

/**
 * Corregir lo que ya está cargado de un integrante.
 *
 * Está en el dominio y no en la pantalla por una razón concreta: el
 * identificador del integrante es lo que enlaza a la persona con su asignación
 * de canal (`ChannelAssignment.bandMemberId`). Corregir un nombre mal escrito
 * borrando al integrante y cargándolo de nuevo le da un identificador nuevo, y
 * con eso se pierde en silencio todo lo que apuntaba al anterior. Editar
 * **conserva la identidad**; esa es la regla, y por eso vive acá y no en un
 * componente.
 */

/**
 * Instrumentos tal como los normaliza el dominio: sin espacios sobrantes, sin
 * entradas vacías y ya clasificados por el catálogo.
 *
 * Acepta cadenas y también instrumentos ya armados, porque las dos cosas
 * entran por acá: la pantalla vieja escribe texto y la nueva elige de la
 * lista. Una cadena se interpreta; un instrumento que llegó sin clasificar
 * pero con su texto —lo que deja la migración de la base— se vuelve a leer.
 * Todo lo demás pasa igual.
 *
 * La usan el alta y la edición, para que corregir un integrante deje
 * exactamente lo mismo que haberlo cargado bien la primera vez.
 */
export function normalizarInstrumentos(
  instrumentos: readonly (string | Instrumento)[],
): readonly Instrumento[] {
  return instrumentos
    .map((i) => (typeof i === 'string' ? interpretarInstrumento(i) : reinterpretarInstrumento(i)))
    // Se descarta lo que no dice nada: ni fuente ni texto. Un instrumento con
    // texto se conserva siempre, aunque el catálogo no lo reconozca.
    .filter((i) => i.fuente !== null || (i.textoOriginal ?? '').length > 0);
}

/**
 * Los instrumentos escritos en una sola línea, separados por comas.
 *
 * Es la forma en que se piden y se muestran: «voz, guitarra acústica». Separar
 * y unir viven juntos para que no se separen dos criterios distintos.
 */
export function instrumentosDesdeTexto(texto: string): readonly Instrumento[] {
  return normalizarInstrumentos(texto.split(','));
}

/**
 * La vuelta: una línea con los instrumentos separados por comas.
 *
 * Muestra el texto original cuando lo hay, así que un perfil cargado a mano se
 * sigue leyendo tal cual se escribió después de clasificarlo.
 */
export function textoDeInstrumentos(instrumentos: readonly (string | Instrumento)[]): string {
  return instrumentos
    .map((i) => (typeof i === 'string' ? i : etiquetaDeInstrumento(i)))
    .join(', ');
}

/**
 * Reemplaza a un integrante de la lista por su versión corregida.
 *
 * Conserva el identificador y el lugar en la lista. Lo segundo también importa:
 * un integrante que salta al final cada vez que se le corrige una letra hace
 * dudar de si se editó al que se quería editar.
 *
 * Si el identificador no está en la lista, la lista vuelve igual: no hay nada
 * que corregir y agregarlo sería inventar un integrante que nadie pidió.
 */
export function editarIntegrante(
  integrantes: readonly BandMember[],
  id: BandMemberId,
  nombre: string,
  instrumentos: readonly (string | Instrumento)[],
): readonly BandMember[] {
  return integrantes.map((m) => (m.id === id
    ? { id: m.id, nombre: nombre.trim(), instrumentos: normalizarInstrumentos(instrumentos) }
    : m));
}
