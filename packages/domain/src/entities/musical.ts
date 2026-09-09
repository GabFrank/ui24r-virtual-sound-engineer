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
   * Declarada opcional y no `Instrumento | null`, que es lo que manda el
   * estilo de este repositorio. El motivo es concreto y temporal: la pantalla
   * de canales construye literales de `ChannelAssignment` y un campo
   * obligatorio los rompería hoy, sin que nadie gane nada, porque esa pantalla
   * todavía no tiene de dónde sacar la clasificación. Pasa a `| null`
   * obligatorio cuando la pantalla la escriba.
   */
  readonly instrumentoDetalle?: Instrumento;
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
