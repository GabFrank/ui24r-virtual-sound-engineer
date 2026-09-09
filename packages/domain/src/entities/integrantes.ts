import type { BandMemberId } from '../ids.ts';
import type { BandMember, BandProfile } from './musical.ts';
import {
  etiquetaDeInstrumento, interpretarInstrumento, reinterpretarInstrumento,
  type Instrumento,
} from '../data/instrumentos.ts';
import { validarNombre, validarUnico, type ResultadoValidacion } from '../rules/validacion.ts';

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

/**
 * Los nombres de los demás integrantes, para comprobar que el que se está
 * escribiendo no repite ninguno.
 *
 * `excepto` es quién se está corrigiendo, y es la mitad de la regla: sin
 * excluirlo, abrir a Ana y confirmar sin tocar nada diría que «Ana» ya está en
 * uso —por ella misma— y el botón de confirmar quedaría apagado para siempre.
 * En un alta se pasa `null`, porque todavía no hay nadie a quien excluir.
 */
export function nombresDeOtrosIntegrantes(
  integrantes: readonly BandMember[],
  excepto: BandMemberId | null,
): readonly string[] {
  return integrantes.filter((m) => m.id !== excepto).map((m) => m.nombre);
}

/**
 * El nombre de un integrante: que esté, que tenga largo razonable y que no
 * repita al de otro.
 *
 * La unicidad no es cosmética. La premisa de la pantalla de canales es poder
 * decir «el micrófono de Ana» en vez de «el canal 3», y con dos Anas esa frase
 * deja de señalar a alguien: el desplegable muestra dos veces lo mismo y quien
 * elige no tiene con qué distinguirlas. Por eso el mensaje no dice «ya está en
 * uso» sino qué hacer, que es agregar un apellido o una inicial.
 *
 * La comparación la hace `validarUnico`, para que «Ana» y «ana» sigan siendo
 * la misma persona acá y en el resto de la aplicación.
 */
export function validarNombreDeIntegrante(
  nombre: string,
  otros: readonly string[],
): ResultadoValidacion {
  const error = validarNombre(nombre, 'El nombre');
  if (error !== null) return error;
  if (validarUnico(nombre, otros) === null) return null;
  return `Ya hay otro integrante que se llama «${nombre.trim()}». Agregale un apellido o `
    + 'una inicial: el nombre es lo que permite decir «el micrófono de Ana» en vez de '
    + '«el canal 3».';
}

/** Si las dos listas son los mismos objetos, en el mismo orden. */
function mismos(a: readonly Instrumento[], b: readonly (string | Instrumento)[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Un integrante con sus instrumentos ya clasificados.
 *
 * Devuelve **el mismo objeto** cuando no había nada que clasificar. No es una
 * optimización: quien lee un perfil lo compara después contra lo que tiene en
 * pantalla para saber si hay cambios sin guardar, y una copia idéntica pero
 * nueva se lee como un cambio que nadie hizo.
 */
export function normalizarIntegrante(m: BandMember): BandMember {
  const instrumentos = normalizarInstrumentos(m.instrumentos);
  return mismos(instrumentos, m.instrumentos) ? m : { ...m, instrumentos };
}

/**
 * Una banda con los instrumentos de todos sus integrantes ya clasificados.
 *
 * Se aplica **al leer**, no solo al guardar. La migración 4 del almacén le da
 * forma al documento pero no clasifica —SQL no sabe qué es un djembe— y hasta
 * hoy la clasificación solo ocurría cuando alguien abría el perfil y lo
 * guardaba. Mientras tanto, una banda migrada tenía todos sus instrumentos sin
 * fuente: la elección de instrumento en la asignación de canal no habría
 * podido traer ningún perfil, y el catálogo no habría servido para nada
 * justamente en los perfiles que ya existían.
 *
 * No pierde nada: `reinterpretarInstrumento()` solo mira lo que quedó sin
 * fuente y conserva `textoOriginal` intacto, así que un integrante cargado con
 * «GUITARRA CRIOLLA» se sigue leyendo «GUITARRA CRIOLLA». Y es idempotente,
 * así que leer, guardar y volver a leer da lo mismo.
 */
export function normalizarBanda(b: BandProfile): BandProfile {
  const integrantes = b.integrantes.map(normalizarIntegrante);
  return integrantes.every((m, i) => m === b.integrantes[i]) ? b : { ...b, integrantes };
}
