import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { SafetyEngine } from '../src/engine.ts';
import { verificarAtaduraDelOrigen } from '../src/magnitud-atada.ts';
import { entrada } from '@vse/mixer-adapter';
import type { CambioPropuesto, ContextoSeguridad } from '../src/types.ts';

/**
 * El primer paso desde el silencio: el pedazo de ADR-034 que faltaba.
 *
 * **Lo que estaba roto.** Desde el crudo del silencio la ley medida da −∞, así
 * que `verificarAtaduraDelOrigen` no aceptaba **ningún** punto de partida: un
 * número finito no coincide con −∞, y −∞ no es un número finito. Una cuña
 * apagada no se podía levantar por ninguna vía.
 *
 * **Y esto se prueba atacando, no mutando.** La lección del 2026-09-18 en este
 * mismo repositorio fue que once mutantes cazados y la suite en verde no
 * impidieron que un arreglo no arreglara nada: lo que lo destapó fue correr
 * entradas **bien formadas** contra el motor real. Así que acá no se prueban las
 * funciones sueltas sino `SafetyEngine.evaluar`, y los casos que más importan son
 * los que intentan **abusar** de la puerta nueva: otro destino, otra clase de
 * parámetro, el silencio como destino, y salir del silencio dos veces.
 */

/** El mínimo escribible sale de la ley medida, no de un número escrito acá. */
const LEY = entrada('i.3.aux.1.value');
const MINIMO = LEY!.fisicoMin;
const RUTA = 'i.3.aux.1.value';
/** El crudo del silencio: `faderADb` da −∞ sólo para `valor <= 0`. */
const CRUDO_SILENCIO = 0;

function contexto(extra: Partial<ContextoSeguridad> = {}): ContextoSeguridad {
  return {
    sessionState: 'SOUNDCHECK',
    nivelAutonomia: 'ASSISTED',
    // El modo asistido exige una acción explícita del usuario por cambio
    // (INV-025). Acá se da por dada: lo que estos tests ejercen es el borde del
    // silencio, no el consentimiento, que tiene sus propios tests.
    aprobacionExplicita: true,
    acumuladoPorRuta: new Map(),
    rutasYaTocadas: new Set(),
    rutasConMedicionPosterior: new Set(),
    rutasConNivelEstablecido: new Set(),
    techoPorRuta: new Map(),
    hayTakeDeSoundcheckActivo: false,
    busesDePa: new Set(),
    ...extra,
  } as unknown as ContextoSeguridad;
}

function salirDelSilencio(over: Partial<CambioPropuesto> = {}): CambioPropuesto {
  return {
    path: RUTA,
    kind: 'MONITOR_AUX_SEND',
    unidad: 'dB',
    valorEsperado: CRUDO_SILENCIO,
    magnitudEsperada: -Infinity,
    valorPropuesto: LEY!.toRaw(MINIMO),
    magnitudPropuesta: MINIMO,
    ...over,
  } as CambioPropuesto;
}

function evaluar(cambios: readonly CambioPropuesto[], ctx = contexto()) {
  return new SafetyEngine().evaluar(cambios, ctx, {
    conexionPermiteEscribir: true, snapshotVerificado: true,
  });
}

test('la atadura del origen nombra el silencio en vez de rechazarlo a secas', () => {
  const r = verificarAtaduraDelOrigen(RUTA, CRUDO_SILENCIO, -Infinity, 'dB');
  strictEqual(r.atada, false);
  strictEqual(r.codigo, 'ORIGEN_EN_SILENCIO');
  ok('minimoEscribible' in r && r.minimoEscribible === MINIMO,
    'el mínimo viaja desde la ley para que el motor no lo escriba a mano');
});

test('levantar la cuña desde el silencio hasta el mínimo escribible: PERMITIDO', () => {
  const v = evaluar([salirDelSilencio()]);
  strictEqual(v.permitido, true, JSON.stringify((v as {rechazos?: unknown}).rechazos ?? []));
});

test('ATAQUE: desde el silencio hacia cualquier otro destino se rechaza', () => {
  // Bien formado en todo lo demás: el crudo y la magnitud del destino se
  // corresponden de verdad. Lo único distinto es a dónde va.
  const masArriba = MINIMO + 12;
  const v = evaluar([salirDelSilencio({
    magnitudPropuesta: masArriba, valorPropuesto: LEY!.toRaw(masArriba),
  })]);
  strictEqual(v.permitido, false, 'la puerta del silencio no puede llevar a cualquier sitio');
  ok(v.rechazos.some((x) => x.codigo === 'SALIDA_DEL_SILENCIO_NO_PERMITIDA'));
});

test('ATAQUE: desde el silencio hasta el tope de la ley se rechaza', () => {
  const v = evaluar([salirDelSilencio({
    magnitudPropuesta: LEY!.fisicoMax, valorPropuesto: LEY!.toRaw(LEY!.fisicoMax),
  })]);
  strictEqual(v.permitido, false, 'es el salto más grande posible: tiene que caer');
});

test('ATAQUE: otra clase de parámetro no cruza esta puerta', () => {
  const v = evaluar([salirDelSilencio({ kind: 'CHANNEL_FADER' } as Partial<CambioPropuesto>)]);
  strictEqual(v.permitido, false, 'el usuario autorizó levantar cuñas, no salir del silencio en general');
});

test('ATAQUE: declarar un origen finito estando en silencio sigue cayendo', () => {
  // Es la declaración falsa que la atadura del origen existe para cazar: el
  // crudo 0 no son −32 dB. No puede convertirse en un pasito legal.
  const v = evaluar([salirDelSilencio({ magnitudEsperada: MINIMO })]);
  strictEqual(v.permitido, false);
  ok(v.rechazos.some((x) => x.codigo === 'ORIGEN_NO_ATADO'),
    'cae por donde caía antes, no por la puerta nueva');
});

test('ATAQUE: −∞ como DESTINO no cruza: apagarle la cuña a alguien no es salir del silencio', () => {
  const v = evaluar([salirDelSilencio({
    valorEsperado: LEY!.toRaw(MINIMO), magnitudEsperada: MINIMO,
    valorPropuesto: CRUDO_SILENCIO, magnitudPropuesta: -Infinity,
  })]);
  strictEqual(v.permitido, false, 'la puerta es de salida, no de entrada');
});

test('ATAQUE: la puerta se cierra sola, no se puede cruzar dos veces seguidas', () => {
  // Después del primer paso la consola ya no está en el crudo del silencio, así
  // que la segunda propuesta tiene que volver por el camino normal --y sin
  // escucha comprobada, el camino normal la rechaza--.
  const segundo = salirDelSilencio({
    valorEsperado: LEY!.toRaw(MINIMO), magnitudEsperada: MINIMO,
    magnitudPropuesta: MINIMO + 2, valorPropuesto: LEY!.toRaw(MINIMO + 2),
  });
  const v = evaluar([segundo], contexto({
    rutasYaTocadas: new Set([RUTA]),
    acumuladoPorRuta: new Map([[RUTA, 0]]),
  } as Partial<ContextoSeguridad>));
  strictEqual(v.permitido, false, 'el segundo paso necesita escucha, como cualquier otro');
});

test('ATAQUE: dos salidas del silencio en la misma transacción se rechazan', () => {
  // Es la ruta repetida de siempre: dentro de una transacción no hay dónde
  // escuchar. Que el primer paso sea especial no la exime.
  const v = evaluar([salirDelSilencio(), salirDelSilencio()]);
  strictEqual(v.permitido, false);
});

test('en SHOW no se sale del silencio', () => {
  const v = evaluar([salirDelSilencio()], contexto({ sessionState: 'SHOW' } as Partial<ContextoSeguridad>));
  strictEqual(v.permitido, false, 'nada de monitores durante el show, tampoco esto');
});
