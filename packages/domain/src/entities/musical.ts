import type { BandMemberId, BandProfileId, ChannelAssignmentId, ChannelProfileId,
  MixSceneId, Ui24rInputIndex } from '../ids.ts';
// Solo el tipo: `data/instrumentos.ts` importa de acá el tipo de perfil de
// canal, así que la dependencia es mutua. Como `verbatimModuleSyntax` borra los
// `import type` al compilar, el ciclo no existe en tiempo de ejecución.
import type { Instrumento } from '../data/instrumentos.ts';

/**
 * Rol musical de una fuente dentro de la mezcla.
 *
 * El asistente de mezcla no busca que todos los canales tengan el mismo nivel:
 * busca las relaciones que corresponden a cada rol. Un bajo bien puesto no
 * suena al mismo nivel que la voz principal.
 */
export type MusicalRole =
  | 'LEAD'        // lleva la melodía en este momento
  | 'SUPPORT'     // acompaña armónicamente
  | 'RHYTHMIC'    // sostiene el pulso
  | 'FOUNDATION'  // sostiene el registro grave
  | 'AMBIENCE'    // aporta textura
  | 'SOLO'        // protagonista temporal
  | 'BACKGROUND'; // presente pero deliberadamente atrás

export type ChannelProfileType =
  | 'LEAD_VOCAL' | 'BACKING_VOCAL' | 'ACOUSTIC_GUITAR' | 'ELECTRIC_GUITAR'
  | 'BASS' | 'CAJON' | 'CONGA' | 'SHAKER' | 'FLUTE' | 'KEYBOARD'
  | 'PLAYBACK' | 'SPEECH' | 'CUSTOM';

/**
 * Perfil de canal: rangos y objetivos, no valores fijos.
 *
 * Un preset diría "filtro pasa altos en 80 Hz". Un perfil dice "para esta
 * fuente el filtro suele estar entre 70 y 110 Hz". La recomendación concreta
 * sale de la medición; el perfil solo acota qué es razonable.
 */
export interface ChannelProfile {
  readonly id: ChannelProfileId;
  readonly type: ChannelProfileType;
  readonly nombre: string;
  readonly defaultRole: MusicalRole;
  /** Rango donde vive el contenido útil de la fuente, en hercios. */
  readonly bandaUtilHz: readonly [number, number];
  /** Rango razonable del filtro pasa altos, en hercios. */
  readonly hpfRangoHz: readonly [number, number];
  /** Margen buscado entre el pico y el fondo de escala, en decibeles. */
  readonly margenObjetivoDb: number;
  /** Diferencia típica entre pasajes suaves y fuertes, en decibeles. */
  readonly rangoDinamicoEsperadoDb: number;
  /** Por debajo de esto se avisa de ruido, en decibeles. */
  readonly snrMinimoDb: number;
  readonly compresorRatio: number | null;
  readonly usaPuerta: boolean;
  readonly usaDeesser: boolean;
}

export interface BandMember {
  readonly id: BandMemberId;
  readonly nombre: string;
  /**
   * Instrumentos clasificados por fuente, variante y rol (ver
   * `data/instrumentos.ts`).
   *
   * Era `readonly string[]` —texto libre— y los perfiles guardados hasta hoy
   * tienen cadenas ahí dentro. Ninguna se tira: `Instrumento.textoOriginal`
   * conserva lo que el usuario escribió, y la migración 4 del almacén le da
   * forma al documento sin tocar el contenido. Se construyen con
   * `normalizarInstrumentos`, que también acepta cadenas y las interpreta.
   */
  readonly instrumentos: readonly Instrumento[];
}

/**
 * Une la entrada física de la consola con quién la usa, con qué instrumento,
 * bajo qué perfil y con qué rol.
 *
 * Sin esta entidad no se puede persistir nada de lo demás: el plan original
 * tenía tipos de canal, perfiles y roles sueltos, pero nada los unía con la
 * entrada real de la mesa.
 */
export interface ChannelAssignment {
  readonly id: ChannelAssignmentId;
  readonly ui24rInputIndex: Ui24rInputIndex;
  readonly bandMemberId: BandMemberId | null;
  /**
   * La etiqueta del instrumento: lo que se muestra y lo que se sincroniza con
   * el nombre del canal en la consola. Sigue siendo texto.
   */
  readonly instrumento: string;
  /**
   * El mismo instrumento, ya clasificado.
   *
   * No son dos verdades: `instrumento` es la etiqueta y esto es la
   * clasificación. `instrumentoDeAsignacion()` es la única forma correcta de
   * leerla, porque cae en interpretar la etiqueta cuando la clasificación
   * todavía no está —que es el caso de todo lo guardado hasta hoy—.
   *
   * Estuvo declarada opcional mientras la pantalla de canales no tenía de
   * dónde sacar la clasificación. Ahora la escribe —el instrumento se elige
   * entre los que toca el integrante—, así que pasa a ser obligatoria y
   * `| null`, que es lo que manda el estilo de este repositorio: quien arme
   * una asignación tiene que **decidir** si la clasificación está o no está,
   * en vez de olvidarse del campo.
   *
   * `null` sigue siendo el caso de todo lo guardado hasta hoy, y también el de
   * una asignación cuyo instrumento se escribió a mano en la consola. Los
   * documentos viejos ni siquiera traen la clave; `instrumentoDeAsignacion()`
   * trata los dos casos igual.
   */
  readonly instrumentoDetalle: Instrumento | null;
  readonly channelProfileId: ChannelProfileId;
  readonly defaultRole: MusicalRole;
  readonly micModelo: string | null;
  /** Nombre sincronizado desde la consola. */
  readonly nombreEnConsola: string;
  /**
   * Si el canal recibe una fuente en vivo durante el show.
   *
   * Es una marca de seguridad: activar el modo soundcheck sustituye las
   * entradas patcheadas por pistas grabadas. Si el micrófono del cantante
   * está marcado en vivo, la aplicación no deja activar ese modo sin
   * verificar antes su fuente (INV-029).
   */
  readonly isLive: boolean;
}

export interface BandProfile {
  readonly id: BandProfileId;
  readonly nombre: string;
  readonly integrantes: readonly BandMember[];
  readonly asignaciones: readonly ChannelAssignment[];
  /** Relaciones aprendidas entre fuentes. Vacío hasta la fase de aprendizaje. */
  readonly mixSignature: Readonly<Record<string, number>> | null;
  /**
   * El orden en que el usuario quiere recorrer los instrumentos, si lo cambió.
   *
   * **`null` no es una lista vacía**: significa que el usuario nunca reordenó, y
   * entonces manda la propuesta. Esa diferencia es la que hace que «restaurar el
   * orden propuesto» pueda **olvidar** en vez de congelar: volviendo a `null`,
   * el recorrido sigue acompañando a la propuesta, y si mañana el catálogo
   * aprende a clasificar los toms el orden mejora solo. Decisión del usuario,
   * `docs/pedidos/2026-09-11-recorrido.md`.
   *
   * Se guardan identificadores de asignación y **no números de canal**: si se
   * repatchea un instrumento a otra entrada, el orden tiene que seguir al
   * instrumento y no al zócalo.
   */
  readonly ordenDelRecorrido: readonly ChannelAssignmentId[] | null;
  /**
   * Canales asignados que el usuario sacó del recorrido.
   *
   * Un talkback, un canal de repuesto o una pista grabada están asignados y no
   * se recorren. **La aplicación no adivina cuál sobra**: no hay ningún dato que
   * lo diga con certeza —`isLive` es una marca de seguridad del modo soundcheck
   * (INV-029) y su valor normal es `false`—, así que lo saca el usuario.
   */
  readonly fueraDelRecorrido: readonly ChannelAssignmentId[];
}

/**
 * La prioridad de una fuente cambia dentro de una misma canción: en el solo de
 * flauta, la flauta es la principal y la voz pasa a fondo.
 */
export interface MixScene {
  readonly id: MixSceneId;
  readonly cancion: string;
  readonly seccion: string;
  /** Rol efectivo por canal. Sobreescribe al rol por defecto del perfil. */
  readonly roles: Readonly<Record<string, MusicalRole>>;
  readonly fuentesInactivas: readonly ChannelAssignmentId[];
  readonly intensidad: 'BAJA' | 'MEDIA' | 'ALTA';
}

/**
 * Rol efectivo de un canal: manda la escena, y si la escena no dice nada,
 * el rol por defecto del perfil.
 */
export function rolEfectivo(
  asignacion: ChannelAssignment,
  escena: MixScene | null,
): MusicalRole {
  return escena?.roles[asignacion.id] ?? asignacion.defaultRole;
}
