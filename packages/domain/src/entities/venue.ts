import type { PAComponentId, PAProfileId, VenueProfileId } from '../ids.ts';
import type { Escenario } from './escenario.ts';

export type VenueType =
  | 'INDOOR_SMALL' | 'INDOOR_MEDIUM' | 'INDOOR_LARGE'
  | 'WAREHOUSE' | 'OUTDOOR' | 'CUSTOM';

export type BusRef =
  | { readonly tipo: 'MASTER' }
  | { readonly tipo: 'AUX'; readonly indice: number }
  | { readonly tipo: 'MTX'; readonly indice: number };

/**
 * Qué papel cumple un componente del sistema.
 *
 * Un monitor **es** un componente de amplificación alimentado por un auxiliar:
 * no hace falta un modelo aparte para los monitores, hace falta que este diga
 * cuál lo es. Lo contrario --una lista de monitores al lado de una lista de
 * componentes-- deja dos verdades que se contradicen en cuanto alguien cambia
 * un cable de bus.
 */
export type ClaseDeAmplificacion =
  | 'PRINCIPAL'
  | 'SUBGRAVE'
  /** Cuña en el piso, apuntando a quien toca. */
  | 'MONITOR_CUNA'
  /** Refuerzo lateral o de retorno lejano. */
  | 'MONITOR_LATERAL'
  /** Caja de refuerzo retardada, sala grande. */
  | 'RETARDO'
  /**
   * Monitoreo intraural, que sale por un auxiliar y **no radia al aire**.
   *
   * Está en la lista por lo que evita: sin esta clase, unos intraurales
   * cargados con su emplazamiento —en la cabeza de quien canta— salen como un
   * emisor a cero metros y en el eje del micrófono de voz, o sea el par más
   * riesgoso de todo el escenario, y es el único que **no puede realimentar
   * nunca**. La alternativa era dejarlos sin lugar, y entonces se informan como
   * «no analizados», que tampoco es cierto.
   */
  | 'IEM'
  | 'OTRO';

/**
 * Las clases que ponen presión sonora en el aire de la sala.
 *
 * Lo que no está acá no participa de ningún análisis de realimentación, y no
 * por falta de datos sino porque no puede acoplar.
 */
export const CLASES_QUE_RADIAN: readonly ClaseDeAmplificacion[] = [
  'PRINCIPAL', 'SUBGRAVE', 'MONITOR_CUNA', 'MONITOR_LATERAL', 'RETARDO', 'OTRO',
];

/**
 * Un componente del sistema de amplificación y por qué bus sale.
 *
 * Importa para la medición por componente: "solo el lado izquierdo" únicamente
 * es posible si ese lado tiene un bus con silencio propio. En un general
 * estéreo con un solo silencio, no se puede separar (INV-028).
 */
export interface PAComponentSpec {
  /**
   * Identidad propia, que el nombre no da.
   *
   * Es lo que permite que el local diga dónde está puesto **este** componente:
   * dos pueden llamarse igual, y la posición en la lista cambia en cuanto
   * alguien borra uno del medio.
   */
  readonly id: PAComponentId;
  readonly nombre: string;
  readonly bus: BusRef;
  readonly silenciable: boolean;
  readonly clase: ClaseDeAmplificacion;
  readonly modelo: string | null;
}

/**
 * **Dónde está puesto un componente NO vive acá, y es deliberado.**
 *
 * Este perfil describe **qué** equipo es: qué caja, por qué bus sale, si se
 * puede silenciar sola. Dónde está puesta es un dato de la **sala**, y vive en
 * el escenario del local, que lo referencia por `id`.
 *
 * La primera versión guardaba el emplazamiento acá y una auditoría encontró lo
 * que eso significaba: dos locales que comparten el mismo sistema —que la
 * aplicación permite y tiene un selector para eso— se pisaban las posiciones
 * entre sí, sin aviso. Ubicar las cuñas en un galpón movía las del bar. El
 * mismo equipo en dos salas distintas está en dos lugares distintos, y el
 * modelo tiene que poder decirlo.
 */

export interface PAProfile {
  readonly id: PAProfileId;
  readonly nombre: string;
  readonly cajasPrincipales: string;
  readonly subgraves: string | null;
  /**
   * Rango donde el sistema entrega nivel útil, en hercios.
   *
   * Fuera de este rango no se generan recomendaciones: pedirle 20 Hz a un
   * sistema que empieza en 45 produce una corrección absurda y potencialmente
   * destructiva.
   */
  readonly rangoUtilHz: readonly [number, number];
  readonly crossoverHz: number | null;
  readonly componentes: readonly PAComponentSpec[];
  /** Buses sobre los que se permite escribir ecualización desde MVP4b. */
  readonly outputBuses: readonly BusRef[];
  /**
   * Nivel del fader del reproductor aceptado por el usuario en este lugar.
   *
   * Arranca en −30 dB y sube solo con acción explícita. Nunca se supera
   * automáticamente (INV-015).
   */
  readonly generatorFaderDb: number | null;
  readonly procesadorExterno: string | null;
}

export type HouseCurvePreset =
  | 'LIVE_MUSIC' | 'ACOUSTIC' | 'SPEECH' | 'BASS_ENHANCED' | 'CUSTOM' | 'BAND_SIGNATURE';

export interface VenueProfile {
  readonly id: VenueProfileId;
  readonly nombre: string;
  readonly tipo: VenueType;
  readonly dimensionesM: { readonly largo: number; readonly ancho: number; readonly alto: number } | null;
  readonly interior: boolean;
  readonly paProfileId: PAProfileId;
  readonly houseCurve: HouseCurvePreset;
  /** Curva personalizada por banda de tercio de octava, si el preset es propio. */
  readonly houseCurveCustom: Readonly<Record<string, number>> | null;
  /** Puntajes de sala de sesiones anteriores, para comparar con hoy. */
  readonly historicoRoomScore: readonly { readonly fecha: string; readonly score: number }[];
  /**
   * Desviación típica del puntaje medida en este lugar.
   *
   * Sin este número el lazo cerrado no tiene tolerancia y oscilaría sobre el
   * ruido de su propia medición. Una sala sin él no habilita automatización
   * (INV-023, spike de repetibilidad).
   */
  readonly sigmaRoomScore: number | null;
  /**
   * El plano del local: dónde están las fuentes y los micrófonos.
   *
   * Cuelga del local y no de la banda porque los monitores y las cajas se
   * mueven de sala en sala mientras la formación no cambia. Los emisores no
   * están acá: viven en los componentes del perfil de amplificación, que ahora
   * llevan emplazamiento.
   */
  readonly escenario: Escenario | null;
  readonly notas: string | null;
}
