import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ui24rInput, makeId } from '../src/ids.ts';
import { rolEfectivo, type ChannelAssignment, type MixScene } from '../src/entities/musical.ts';
import { esSnapshotDeLaApp, puedeAplicarse, PREFIJO_SNAPSHOT_AUTOMATICA, type Snapshot,
  type ChangeTransaction } from '../src/entities/transaction.ts';
import { esAutoElegible, type Recommendation } from '../src/entities/recommendation.ts';
import { sonComparables, type MixCandidate } from '../src/entities/soundcheck.ts';
import type { ChannelAssignmentId, ChannelProfileId, SnapshotId, TakeId,
  SessionId, MixCandidateId } from '../src/ids.ts';

test('el índice de entrada rechaza valores fuera del rango de la consola', () => {
  assert.equal(ui24rInput(1), 1);
  assert.equal(ui24rInput(24), 24);
  assert.throws(() => ui24rInput(0), RangeError);
  assert.throws(() => ui24rInput(25), RangeError);
  assert.throws(() => ui24rInput(3.5), RangeError);
});

test('los identificadores llevan prefijo para que el registro se pueda leer', () => {
  const id = makeId<'MeasurementId'>('meas');
  assert.match(id, /^meas_/);
  assert.notEqual(makeId<'MeasurementId'>('meas'), id);
});

const asignacion: ChannelAssignment = {
  id: 'ch_1' as ChannelAssignmentId,
  ui24rInputIndex: ui24rInput(3),
  bandMemberId: null,
  instrumento: 'flauta',
  instrumentoDetalle: null,
  channelProfileId: 'prof_flute' as ChannelProfileId,
  defaultRole: 'SUPPORT',
  micModelo: null,
  nombreEnConsola: 'FLAUTA',
  isLive: true,
};

test('el rol de la escena manda sobre el rol por defecto del perfil', () => {
  const escena: MixScene = {
    id: 'sc_1' as never,
    cancion: 'Medicina',
    seccion: 'Solo de flauta',
    roles: { ch_1: 'LEAD' },
    fuentesInactivas: [],
    intensidad: 'ALTA',
  };
  assert.equal(rolEfectivo(asignacion, escena), 'LEAD');
});

test('sin escena, vale el rol por defecto', () => {
  assert.equal(rolEfectivo(asignacion, null), 'SUPPORT');
});

test('una escena que no menciona el canal no cambia su rol', () => {
  const escena: MixScene = {
    id: 'sc_2' as never, cancion: 'x', seccion: 'y',
    roles: { ch_9: 'LEAD' }, fuentesInactivas: [], intensidad: 'MEDIA',
  };
  assert.equal(rolEfectivo(asignacion, escena), 'SUPPORT');
});

test('INV-003: solo las instantáneas con el prefijo propio son de la aplicación', () => {
  assert.equal(esSnapshotDeLaApp(`${PREFIJO_SNAPSHOT_AUTOMATICA}20260907_211403`), true);
  assert.equal(esSnapshotDeLaApp('VSE_MANUAL_backup'), true);
  assert.equal(esSnapshotDeLaApp('SHOW FINAL'), false);
  assert.equal(esSnapshotDeLaApp('mi mezcla'), false);
});

const base: ChangeTransaction = {
  id: 'tx_1' as never,
  assistant: 'CHANNEL',
  razon: 'ajuste de ganancia',
  nivelAutonomia: 'ASSISTED',
  state: 'SNAPSHOTTED',
  recommendationIds: [],
  snapshotRef: 'snap_1' as SnapshotId,
  measurementBeforeId: null,
  measurementAfterId: null,
  changes: [],
  resultado: null,
  creadoEl: new Date().toISOString(),
  cerradoEl: null,
};

const instantanea: Snapshot = {
  id: 'snap_1' as SnapshotId,
  nombreEnConsola: 'snap_1',
  show: 'VSE',
  esAutomatica: true,
  creadaEl: new Date().toISOString(),
  transactionId: null,
  existenciaVerificada: true,
};

test('INV-001: con la instantánea releída de la consola, se aplica', () => {
  assert.equal(puedeAplicarse(base, instantanea), true);
  assert.equal(puedeAplicarse({ ...base, snapshotRef: null }, instantanea), false);
});

test('INV-001: una referencia no nula no alcanza', () => {
  // Es el defecto que la invariante describe: alguien pudo borrar la
  // instantanea desde el navegador de la consola entre que se guardo y ahora.
  // La comprobacion vieja daba `true` en los tres casos de abajo.
  assert.equal(puedeAplicarse(base, null), false);
  assert.equal(puedeAplicarse(base, { ...instantanea, existenciaVerificada: false }), false);
  assert.equal(puedeAplicarse(base, { ...instantanea, nombreEnConsola: 'otra' }), false);
});

test('INV-001: una transacción que no pasó por la instantánea no se aplica', () => {
  assert.equal(puedeAplicarse({ ...base, state: 'APPROVED' }, instantanea), false);
  assert.equal(puedeAplicarse({ ...base, state: 'DRAFT' }, instantanea), false);
});

const recomendacion: Recommendation = {
  id: 'rec_1' as never, assistant: 'ROOM', findingId: null,
  target: 'master', parameter: 'eq.b2.gain', unidad: 'dB',
  current: 0, currentUnknown: false, proposed: -2.5, delta: -2.5,
  razon: 'exceso consistente entre 100 y 160 Hz en todas las posiciones',
  confidence: 'HIGH', risk: 'LOW', evidenceMeasurementIds: [],
  impactoEsperado: 'reduce la desviación al objetivo en 1,8 dB',
  status: 'PROPOSED', transactionId: null, verificationMeasurementId: null,
  sinCorreccionDeSala: false,
};

test('INV-024: solo la confianza alta habilita automatización', () => {
  assert.equal(esAutoElegible(recomendacion), true);
  assert.equal(esAutoElegible({ ...recomendacion, confidence: 'MEDIUM' }), false);
  assert.equal(esAutoElegible({ ...recomendacion, confidence: 'LOW' }), false);
  assert.equal(esAutoElegible({ ...recomendacion, confidence: 'INSUFFICIENT_DATA' }), false);
});

test('una recomendación sin valor actual conocido se propone en absoluto', () => {
  const sinMapeo = { ...recomendacion, current: null, currentUnknown: true, delta: null };
  assert.equal(sinMapeo.currentUnknown, true);
  assert.equal(sinMapeo.delta, null);
});

test('dos mezclas candidatas solo se comparan si vienen de la misma toma', () => {
  const a: MixCandidate = {
    id: 'mc_a' as MixCandidateId, sessionId: 's1' as SessionId, takeId: 't1' as TakeId,
    etiqueta: 'A', parametros: {}, snapshotRef: null, measurementIds: [], mixScore: 82,
  };
  const b: MixCandidate = { ...a, id: 'mc_b' as MixCandidateId, etiqueta: 'B', mixScore: 86 };
  const otraToma: MixCandidate = { ...b, takeId: 't2' as TakeId };
  assert.equal(sonComparables(a, b), true);
  assert.equal(sonComparables(a, otraToma), false);
});
