import { test } from 'node:test';
import { strictEqual, match } from 'node:assert/strict';
import { canalDeLaCaptacion, porQueNoHayCanal, emplazar, ui24rInput } from '../src/index.ts';
import type {
  ChannelAssignment, ChannelAssignmentId, BandMemberId, ChannelProfileId,
  ElementoCaptacion, ElementoFuente, Escenario, EscenarioElementoId,
  PuntoM, VenueProfileId,
} from '../src/index.ts';

/**
 * **De un micrófono al canal de la consola, siguiendo la cadena.**
 *
 * El backlog decía que `compararCaminos` estaba bloqueado «porque
 * `ElementoCaptacion.asignacionId` nunca se escribe». El campo nunca se escribe
 * y **ése no era el bloqueo**: `compararCaminos` no lo lee, recibe un
 * resolvedor. Lo único que faltaba era escribirlo.
 *
 * Estos tests están escritos para que las cuatro ambigüedades se puedan
 * distinguir, porque devolver `null` para las cuatro sin poder decir cuál deja
 * al usuario sin nada que hacer.
 */

const P = (x: number, y: number, z: number): PuntoM => ({ x, y, z });
const VENUE = 'venue_1' as VenueProfileId;

function fuente(id: string, nombre: string, integrante: string | null): ElementoFuente {
  return {
    tipo: 'FUENTE', id: id as EscenarioElementoId, nombre,
    emplazamiento: emplazar(P(2, 1, 1.5), 'EN_PIE'),
    bandMemberId: integrante === null ? null : (integrante as BandMemberId),
  };
}

function micro(id: string, nombre: string, fuenteId: string | null): ElementoCaptacion {
  return {
    tipo: 'CAPTACION', id: id as EscenarioElementoId, nombre,
    emplazamiento: emplazar(P(2, 1.2, 1.5), 'EN_PIE', { azimutGrados: 0, inclinacionGrados: 0 }),
    captacion: 'MICROFONO', patron: 'CARDIOIDE',
    // **Se pone en `null` a propósito en todos los casos de este archivo.** Es
    // el campo que el backlog creía que hacía falta, y la cadena resuelve sin
    // él: si algún test pasara por tenerlo puesto, no probaría nada.
    asignacionId: null,
    fuenteId: fuenteId === null ? null : (fuenteId as EscenarioElementoId),
  };
}

function asignacion(id: string, canal: number, integrante: string | null): ChannelAssignment {
  return {
    id: id as ChannelAssignmentId,
    ui24rInputIndex: ui24rInput(canal),
    bandMemberId: integrante === null ? null : (integrante as BandMemberId),
    instrumento: `instrumento del canal ${canal}`,
    instrumentoDetalle: null,
    channelProfileId: 'cp_1' as ChannelProfileId,
    defaultRole: 'SUPPORT',
    micModelo: null,
    nombreEnConsola: `CH${canal}`,
    isLive: true,
  };
}

function escenarioCon(elementos: readonly (ElementoFuente | ElementoCaptacion)[]): Escenario {
  return {
    venueProfileId: VENUE, elementos, emisores: [],
    actualizado: '2026-09-12T00:00:00.000Z', notas: null,
  };
}

test('la cadena completa da el canal: microfono -> fuente -> integrante -> asignacion', () => {
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), micro('c1', 'SM58', 'f1')]);
  const canal = canalDeLaCaptacion(e, [asignacion('a1', 7, 'm1')]);
  strictEqual(canal(micro('c1', 'SM58', 'f1')), 7);
  strictEqual(porQueNoHayCanal(e, [asignacion('a1', 7, 'm1')], micro('c1', 'SM58', 'f1')), null);
});

test('sin emparejar con un instrumento, no hay canal y se dice por que', () => {
  const m = micro('c1', 'SM58', null);
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), m]);
  const as = [asignacion('a1', 7, 'm1')];
  strictEqual(canalDeLaCaptacion(e, as)(m), null);
  match(porQueNoHayCanal(e, as, m)!, /no dice qué instrumento viene a tomar/);
});

test('apuntando a una fuente que no esta en el escenario, no hay canal', () => {
  const m = micro('c1', 'SM58', 'f-que-no-existe');
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), m]);
  const as = [asignacion('a1', 7, 'm1')];
  strictEqual(canalDeLaCaptacion(e, as)(m), null);
  match(porQueNoHayCanal(e, as, m)!, /no está en el escenario/);
});

test('una fuente sin dueño no lleva a ningun canal', () => {
  // Un amplificador de guitarra que nadie declaró quién toca.
  const m = micro('c1', 'SM57', 'f1');
  const e = escenarioCon([fuente('f1', 'Ampli', null), m]);
  const as = [asignacion('a1', 7, 'm1')];
  strictEqual(canalDeLaCaptacion(e, as)(m), null);
  match(porQueNoHayCanal(e, as, m)!, /no dice quién lo toca/);
});

test('un integrante sin canal asignado no lleva a ningun canal', () => {
  const m = micro('c1', 'SM58', 'f1');
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), m]);
  // La asignación existe pero es de otro integrante.
  const as = [asignacion('a1', 7, 'm2')];
  strictEqual(canalDeLaCaptacion(e, as)(m), null);
  match(porQueNoHayCanal(e, as, m)!, /no tiene ningún canal asignado/);
});

test('**el caso interesante**: dos canales del mismo integrante NO se adivinan', () => {
  // Quien canta también toca la guitarra, así que tiene dos canales. El
  // micrófono dice que viene a tomar «Voz», pero la cadena llega al integrante
  // y ahí se bifurca: la voz y la guitarra son del mismo. Devolver el primero
  // sería inventar, y el asistente que usa esto contesta «la geometría no puede
  // decidir» en vez de señalar un canal al azar.
  const m = micro('c1', 'SM58', 'f1');
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), m]);
  const as = [asignacion('a1', 7, 'm1'), asignacion('a2', 12, 'm1')];
  strictEqual(canalDeLaCaptacion(e, as)(m), null);
  const porQue = porQueNoHayCanal(e, as, m)!;
  match(porQue, /2 canales/);
  // **Y dice cuáles**, que es lo que permite preguntarle al usuario.
  match(porQue, /7, 12/);
});

test('una asignacion sin integrante no contamina a otra', () => {
  // Un canal cargado sin decir de quién es --pasa en la pantalla de canales--
  // no tiene que hacer ambiguo el de al lado.
  const m = micro('c1', 'SM58', 'f1');
  const e = escenarioCon([fuente('f1', 'Voz', 'm1'), m]);
  const as = [asignacion('a1', 7, 'm1'), asignacion('a2', 12, null)];
  strictEqual(canalDeLaCaptacion(e, as)(m), 7);
});

test('el resolvedor se arma una vez y sirve para muchas captaciones', () => {
  // El asistente lo llama por cada pareja expuesta, que son n x m: si armara
  // los indices en cada llamada, el costo sería cuadrático sobre el escenario.
  const e = escenarioCon([
    fuente('f1', 'Voz', 'm1'), fuente('f2', 'Bombo', 'm2'),
    micro('c1', 'SM58', 'f1'), micro('c2', 'D112', 'f2'),
  ]);
  const canal = canalDeLaCaptacion(e, [asignacion('a1', 3, 'm1'), asignacion('a2', 9, 'm2')]);
  strictEqual(canal(micro('c1', 'SM58', 'f1')), 3);
  strictEqual(canal(micro('c2', 'D112', 'f2')), 9);
});
