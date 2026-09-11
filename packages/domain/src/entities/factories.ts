import { makeId, type BandMemberId, type BandProfileId, type PAProfileId,
  type SessionId, type VenueProfileId } from '../ids.ts';
import type { BandMember, BandProfile } from './musical.ts';
import { normalizarInstrumentos } from './integrantes.ts';
import type { Instrumento } from '../data/instrumentos.ts';
import type { PAProfile, VenueProfile, VenueType } from './venue.ts';
import type { SoundSession } from './session.ts';

/**
 * Constructores de entidades nuevas.
 *
 * Están acá y no en la interfaz porque los valores por defecto son decisiones
 * del dominio, no de la pantalla. Que un sistema de amplificación arranque
 * declarado de 60 Hz a 16 kHz, o que el fader del reproductor arranque en
 * −30 dB, son afirmaciones sobre cómo funciona esto, y una pantalla nueva no
 * debería poder contradecirlas por descuido.
 */

export function crearIntegrante(
  nombre: string,
  instrumentos: readonly (string | Instrumento)[] = [],
): BandMember {
  return {
    id: makeId<'BandMemberId'>('mbr') as BandMemberId,
    nombre: nombre.trim(),
    // La misma normalización que usa la edición: corregir un integrante tiene
    // que dejar exactamente lo mismo que haberlo cargado bien la primera vez.
    instrumentos: normalizarInstrumentos(instrumentos),
  };
}

export function crearBanda(nombre: string, integrantes: readonly BandMember[] = []): BandProfile {
  return {
    id: makeId<'BandProfileId'>('band') as BandProfileId,
    nombre: nombre.trim(),
    integrantes,
    asignaciones: [],
    // Vacío, no un objeto con ceros: la firma de mezcla se aprende midiendo, y
    // un objeto lleno de ceros se leería como «ya aprendida, y todo plano».
    mixSignature: null,
  };
}

/**
 * Rango útil de partida de un sistema de amplificación.
 *
 * De 60 Hz a 16 kHz describe un sistema de cajas activas de dos vías sin
 * subgraves, que es lo más común en una banda que se mueve. Es un punto de
 * partida conservador: si el sistema llega más abajo, el usuario lo corrige y
 * el asistente aprovecha la banda extra; si arranca declarando más de lo que
 * hay, el asistente propondría corregir donde el equipo no entrega nada.
 */
export const RANGO_UTIL_POR_DEFECTO: readonly [number, number] = [60, 16_000];

/**
 * Nivel de partida del fader del reproductor, en decibeles.
 *
 * −30 dB no es un valor cómodo: es deliberadamente bajo. Sube solo con acción
 * explícita del usuario y nunca automáticamente (INV-015). Un generador que
 * arranca fuerte en una sala llena es exactamente lo que esta aplicación no
 * puede hacer.
 */
export const FADER_GENERADOR_INICIAL_DB = -30;

export function crearPa(nombre: string, cajasPrincipales: string): PAProfile {
  return {
    id: makeId<'PAProfileId'>('pa') as PAProfileId,
    nombre: nombre.trim(),
    cajasPrincipales: cajasPrincipales.trim(),
    subgraves: null,
    rangoUtilHz: RANGO_UTIL_POR_DEFECTO,
    crossoverHz: null,
    // Un general estéreo con un solo silencio: no se puede medir por
    // componente hasta que el usuario describa buses separados (INV-028).
    componentes: [{
      nombre: 'General', bus: { tipo: 'MASTER' }, silenciable: false,
      clase: 'PRINCIPAL', modelo: null,
      // Sin lugar: un perfil recién creado no sabe dónde están las cajas, y
      // suponerlo sería inventar la entrada de una inferencia geométrica.
      emplazamiento: null,
    }],
    outputBuses: [{ tipo: 'MASTER' }],
    generatorFaderDb: FADER_GENERADOR_INICIAL_DB,
    procesadorExterno: null,
  };
}

export function crearLocal(
  nombre: string,
  tipo: VenueType,
  paProfileId: PAProfileId,
  interior = true,
): VenueProfile {
  return {
    id: makeId<'VenueProfileId'>('venue') as VenueProfileId,
    nombre: nombre.trim(),
    tipo,
    dimensionesM: null,
    interior,
    paProfileId,
    houseCurve: 'LIVE_MUSIC',
    houseCurveCustom: null,
    historicoRoomScore: [],
    // Sin sigma medido no hay tolerancia, y sin tolerancia el lazo cerrado
    // oscilaría sobre el ruido de su propia medición (INV-023). Arranca nulo
    // a propósito: se gana midiendo, no declarando.
    sigmaRoomScore: null,
    // Un local nuevo no tiene plano. Se carga con el editor, y hasta entonces
    // el análisis geométrico simplemente no está disponible para este local.
    escenario: null,
    notas: null,
  };
}

export function crearSesion(
  bandProfileId: BandProfileId,
  venueProfileId: VenueProfileId,
  ahora: string = new Date().toISOString(),
): SoundSession {
  return {
    id: makeId<'SessionId'>('ses') as SessionId,
    state: 'CREATED',
    bandProfileId,
    venueProfileId,
    iniciadaEl: ahora,
    cerradaEl: null,
    snapshotInicialId: null,
    snapshotFinalId: null,
    measurementIds: [],
    recommendationIds: [],
    transactionIds: [],
    takeIds: [],
    mixCandidateIds: [],
    // Los puntajes son nulos, no cero: cero sería un puntaje pésimo, y esta
    // sesión todavía no midió nada.
    roomScore: null,
    mixScore: null,
  };
}
