import type { BandProfileId, MeasurementId, MixCandidateId, RecommendationId,
  SessionId, SnapshotId, TakeId, TransactionId, VenueProfileId } from '../ids.ts';

/**
 * Estados de una sesión de sonido, en el orden en que ocurren de verdad.
 *
 * El orden importa: la sala se mide antes de configurar canales, porque
 * ecualizar un canal sobre una sala sin corregir lleva a corregir en el canal
 * lo que es problema del recinto (ADR-009).
 */
export type SessionState =
  | 'CREATED'
  | 'SETUP'
  | 'CALIBRATING'
  | 'ROOM_OBSERVE'
  | 'CHANNEL_SETUP'
  | 'SOUNDCHECK_REC'
  | 'MIX'
  | 'SOUNDCHECK_PLAY'
  | 'ROOM_CORRECT'
  | 'FULL_BAND'
  | 'RINGOUT'
  | 'SHOW'
  | 'CLOSED';

/**
 * Cómo se nombra cada estado cuando el motivo de un rechazo llega a la
 * pantalla. Los identificadores son técnicos y correctos para el código; nadie
 * de pie antes de un show quiere leer `ROOM_OBSERVE`.
 */
const ETIQUETAS: Readonly<Record<SessionState, string>> = {
  CREATED: 'Creada',
  SETUP: 'Configuración',
  CALIBRATING: 'Calibrando',
  ROOM_OBSERVE: 'Observando la sala',
  CHANNEL_SETUP: 'Configurando canales',
  SOUNDCHECK_REC: 'Grabando prueba',
  MIX: 'Mezclando',
  SOUNDCHECK_PLAY: 'Reproduciendo prueba',
  ROOM_CORRECT: 'Corrigiendo la sala',
  FULL_BAND: 'Banda completa',
  RINGOUT: 'Buscando realimentación',
  SHOW: 'En show',
  CLOSED: 'Cerrada',
};

/** Transiciones permitidas. Ver docs/session-lifecycle.md. */
export const TRANSICIONES: Readonly<Record<SessionState, readonly SessionState[]>> = {
  CREATED: ['SETUP', 'CLOSED'],
  SETUP: ['CALIBRATING', 'CLOSED'],
  CALIBRATING: ['ROOM_OBSERVE', 'CHANNEL_SETUP', 'SETUP', 'CLOSED'],
  ROOM_OBSERVE: ['CHANNEL_SETUP', 'ROOM_CORRECT', 'CALIBRATING', 'MIX', 'CLOSED'],
  CHANNEL_SETUP: ['SOUNDCHECK_REC', 'MIX', 'ROOM_OBSERVE', 'CLOSED'],
  SOUNDCHECK_REC: ['MIX', 'CHANNEL_SETUP', 'CLOSED'],
  MIX: ['SOUNDCHECK_PLAY', 'FULL_BAND', 'ROOM_OBSERVE', 'ROOM_CORRECT', 'CHANNEL_SETUP', 'CLOSED'],
  SOUNDCHECK_PLAY: ['MIX', 'CLOSED'],
  ROOM_CORRECT: ['MIX', 'ROOM_OBSERVE', 'FULL_BAND', 'CLOSED'],
  FULL_BAND: ['MIX', 'RINGOUT', 'SHOW', 'CLOSED'],
  RINGOUT: ['ROOM_OBSERVE', 'FULL_BAND', 'SHOW', 'CLOSED'],
  SHOW: ['CLOSED'],
  CLOSED: [],
};

/**
 * Los estados en que hay gente escuchando y no se puede interrumpir.
 *
 * **Vivía sólo en la capa de pantalla**, y desde que el motor de seguridad la
 * necesita —ADR-027 restringe el silencio de canal a los estados que no están en
 * vivo— tiene que estar donde los dos la lean. Dos listas de lo mismo en dos
 * capas distintas se separan, y la que se separaría acá decide si la aplicación
 * puede dejar un canal mudo durante un show.
 */
export const ESTADOS_EN_VIVO: readonly SessionState[] = ['FULL_BAND', 'RINGOUT', 'SHOW'];

export interface TransicionRechazada {
  readonly permitida: false;
  readonly razon: string;
}
export interface TransicionAceptada {
  readonly permitida: true;
  /** Mediciones y candidatos que dejan de ser válidos al retroceder. */
  readonly invalida: readonly MeasurementId[];
}
export type ResultadoTransicion = TransicionAceptada | TransicionRechazada;

export interface SoundSession {
  readonly id: SessionId;
  readonly state: SessionState;
  readonly bandProfileId: BandProfileId;
  readonly venueProfileId: VenueProfileId;
  readonly iniciadaEl: string;
  readonly cerradaEl: string | null;
  readonly snapshotInicialId: SnapshotId | null;
  readonly snapshotFinalId: SnapshotId | null;
  readonly measurementIds: readonly MeasurementId[];
  readonly recommendationIds: readonly RecommendationId[];
  readonly transactionIds: readonly TransactionId[];
  readonly takeIds: readonly TakeId[];
  readonly mixCandidateIds: readonly MixCandidateId[];
  readonly roomScore: number | null;
  readonly mixScore: number | null;
}

/**
 * Comprueba si una transición es legal y qué invalida.
 *
 * El retroceso a la configuración de canales está permitido, pero no mientras
 * exista una toma de soundcheck: la grabación ocurre después del preamplificador,
 * así que cambiar la ganancia hace que la toma deje de representar al show
 * (INV-006).
 */
export function puedeTransicionar(
  desde: SessionState,
  hacia: SessionState,
  contexto: {
    readonly tieneTakeActivo: boolean;
    readonly medicionesPosteriores: readonly MeasurementId[];
  },
): ResultadoTransicion {
  const permitidas = TRANSICIONES[desde];
  if (!permitidas.includes(hacia)) {
    return {
      permitida: false,
      razon:
        `no se puede pasar de «${ETIQUETAS[desde]}» a «${ETIQUETAS[hacia]}» directamente. ` +
        'Los estados siguen el orden en que ocurren las cosas de verdad.',
    };
  }
  if (hacia === 'CHANNEL_SETUP' && contexto.tieneTakeActivo) {
    return {
      permitida: false,
      razon:
        'hay una toma de soundcheck activa. La grabación es posterior al ' +
        'preamplificador: cambiar la ganancia haría que la toma deje de ' +
        'representar al show. Descartá la toma primero.',
    };
  }
  const esRetroceso =
    ORDEN_NOMINAL.indexOf(hacia) < ORDEN_NOMINAL.indexOf(desde) && hacia !== 'CLOSED';
  return {
    permitida: true,
    invalida: esRetroceso ? contexto.medicionesPosteriores : [],
  };
}

const ORDEN_NOMINAL: readonly SessionState[] = [
  'CREATED', 'SETUP', 'CALIBRATING', 'ROOM_OBSERVE', 'CHANNEL_SETUP',
  'SOUNDCHECK_REC', 'MIX', 'SOUNDCHECK_PLAY', 'ROOM_CORRECT', 'FULL_BAND',
  'RINGOUT', 'SHOW', 'CLOSED',
];
