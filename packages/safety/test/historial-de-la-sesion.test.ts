import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historialDeLaSesion } from '../src/historial-de-la-sesion.ts';
import type { CambioRegistrado, EntradaDiario } from '../src/journal.ts';

function cambio(p: Partial<CambioRegistrado> & { path: string }): CambioRegistrado {
  return {
    unidad: 'dB',
    valorPrevio: 0.5, valorEsperado: 0.5, valorEnviado: 0.6,
    magnitudEsperada: -12, magnitudEnviada: -10,
    enviadoEl: '2026-09-17T10:00:00.000Z',
    confirmadoPor: 'WITNESS', verificado: true,
    ...p,
  };
}

function entrada(
  cambios: readonly CambioRegistrado[],
  medicionPosteriorId: string | null = null,
  nivelEstablecidoEn: readonly string[] = [],
): EntradaDiario {
  return {
    id: 't1', sessionId: 's1', estado: 'APLICADA', snapshotRef: null,
    razon: 'prueba', nivelAutonomia: 'ASSISTED',
    creadoEl: '2026-09-17T10:00:00.000Z', cerradoEl: null,
    medicionPosteriorId, nivelEstablecidoEn, cambios,
  };
}

const RUTA = 'i.9.aux.4.value';

test('suma el desplazamiento de cada ruta en su unidad, no en crudo', () => {
  // Dos pasos de 2 dB de una rampa. En crudo estos dos pasos son 0,1 cada uno;
  // si el historial sumara crudo daria 0,2 y el motor lo comparara contra un
  // tope en decibeles, que es el error que este modulo existe para no repetir.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4);
  assert.ok(h.rutasYaTocadas.has(RUTA));
});

test('volver hacia donde estaba DESCUENTA: es una suma con signo', () => {
  // El motor lo pide asi: «un movimiento que acerca el parametro a su valor
  // inicial siempre es admisible». Con magnitudes absolutas, subir 2 y bajar 2
  // gastaria 4 dB de presupuesto habiendo quedado donde empezo.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -12 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
  assert.ok(h.rutasYaTocadas.has(RUTA), 'quedo en cero y la ruta SI se toco');
});

test('un cambio que no se confirmo no gasta presupuesto: no sono', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false, confirmadoPor: 'TIMEOUT' })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), undefined);
  assert.equal(h.rutasYaTocadas.has(RUTA), false);
});

test('aplicar y revertir doce veces cuesta lo que sono, no cero', () => {
  // La reversion es otro par de escrituras que tambien sonaron. Lo que las
  // cancela es el signo. Aca se revierte a un valor distinto del de partida.
  const entradas = [];
  for (let i = 0; i < 12; i++) {
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })]));
    entradas.push(entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -11 })]));
  }
  assert.equal(historialDeLaSesion(entradas).acumuladoPorRuta.get(RUTA), 12);
});

test('salir del silencio no envenena el acumulado de la ruta', () => {
  // ADR-034: desde el silencio cualquier nivel finito es un salto infinito. Si
  // ese infinito entrara al acumulado, la ruta quedaria inutilizable el resto
  // de la sesion --cualquier tope la rechazaria-- justo despues del primer paso.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -Infinity, magnitudEnviada: -32.14 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -32.14, magnitudEnviada: -30.14 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2, 'cuenta desde que dejo el silencio');
  assert.ok(h.rutasYaTocadas.has(RUTA), 'y la ruta quedo tocada igual');
});

test('cada ruta lleva su propia cuenta', () => {
  const otra = 'i.3.aux.1.value';
  const h = historialDeLaSesion([
    entrada([
      cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 }),
      cambio({ path: otra, magnitudEsperada: -20, magnitudEnviada: -21 }),
    ]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2);
  assert.equal(h.acumuladoPorRuta.get(otra), -1);
});

test('sin entradas, el historial esta vacio y no finge', () => {
  const h = historialDeLaSesion([]);
  assert.equal(h.acumuladoPorRuta.size, 0);
  assert.equal(h.rutasYaTocadas.size, 0);
});

// --- La tercera: si se escucho entre paso y paso ---------------------------

test('una ruta movida sin medicion despues NO esta en el conjunto', () => {
  const h = historialDeLaSesion([entrada([cambio({ path: RUTA })])]);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false,
    'nadie anoto haber escuchado: el motor tiene que frenar el proximo paso');
});

test('con la medicion anotada, la ruta queda habilitada para el proximo paso', () => {
  const h = historialDeLaSesion([entrada([cambio({ path: RUTA })], 'm-1')]);
  assert.ok(h.rutasConMedicionPosterior.has(RUTA));
});

test('haber escuchado hace tres pasos no autoriza el cuarto', () => {
  // Es el caso que hace que una rampa sea una rampa y no una corrida: gana la
  // ULTIMA transaccion que toco la ruta, no que alguna vez haya habido una.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -12, magnitudEnviada: -10 })], 'm-1'),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], 'm-2'),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })], null),
  ]);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 6);
});

test('un cambio que no sono no cuenta como escucha de esa ruta', () => {
  // La transaccion tiene medicion anotada, pero su cambio no se confirmo. La
  // ruta no se movio, asi que tampoco hay nada que haya sonado para escuchar.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false })], 'm-1'),
  ]);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
  assert.equal(h.rutasYaTocadas.has(RUTA), false);
});

test('cada ruta lleva su propia escucha dentro de la misma transaccion', () => {
  const otra = 'i.3.aux.1.value';
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA })], 'm-1'),
    entrada([cambio({ path: otra })], null),
  ]);
  assert.ok(h.rutasConMedicionPosterior.has(RUTA));
  assert.equal(h.rutasConMedicionPosterior.has(otra), false);
});

test('establecer el nivel mueve la referencia: el acumulado arranca de cero', () => {
  // La rampa de ADR-034: veinticinco decibeles desde el piso. Si el acumulado
  // siguiera contando desde donde estaba al empezar la sesion, el primer retoque
  // llegaria con el presupuesto de 4 dB agotado seis veces.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -32, magnitudEnviada: -30 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -30, magnitudEnviada: -28 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -28, magnitudEnviada: -26 })], null, [RUTA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0, 'seis movidos y la cuenta vuelve a cero');
  assert.ok(h.rutasConNivelEstablecido.has(RUTA));
  assert.ok(h.rutasYaTocadas.has(RUTA), 'establecer el nivel no borra que se toco');
});

test('los decibeles de la transaccion que establece el nivel son de la rampa', () => {
  // El reset va DESPUES de contar los cambios de esa transaccion: el ultimo paso
  // es el que alcanzo el nivel, y cobrarselo al retoque le comeria la mitad del
  // presupuesto antes de empezar.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -4, magnitudEnviada: -2 })], null, [RUTA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
});

test('despues del ancla el acumulado vuelve a contar', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [RUTA]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -6, magnitudEnviada: -4 })]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4, 'cuatro decibeles desde el nivel establecido');
});

test('una entrada vieja sin el campo no rompe ni establece nada', () => {
  // El diario se serializa entero como JSON: las transacciones anteriores a esta
  // pieza vuelven de la base sin `nivelEstablecidoEn`. La ausencia es «ninguna».
  const vieja = entrada([cambio({ path: RUTA })]);
  const sinCampo = { ...vieja } as Record<string, unknown>;
  delete sinCampo['nivelEstablecidoEn'];
  const h = historialDeLaSesion([sinCampo as unknown as EntradaDiario]);
  assert.equal(h.rutasConNivelEstablecido.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 2, 'y el acumulado se cuenta igual');
});

test('establecer el nivel de una ruta no toca el de otra', () => {
  const OTRA = 'i.4.aux.1.value';
  const h = historialDeLaSesion([
    entrada([
      cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 }),
      cambio({ path: OTRA, magnitudEsperada: -10, magnitudEnviada: -8 }),
    ], null, [RUTA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 0);
  assert.equal(h.acumuladoPorRuta.get(OTRA), 2, 'la otra cuña sigue sin nivel y sigue contando');
  assert.equal(h.rutasConNivelEstablecido.has(OTRA), false);
});

// --- El ancla no se cree lo que le dicen -----------------------------------
//
// Los cinco casos de abajo salen de una auditoria adversarial del 2026-09-17.
// La primera version aceptaba `nivelEstablecidoEn` tal cual, y con eso el ancla
// --que es de monitores-- le sacaba el presupuesto a cualquier parametro.

test('el ancla no rebasa una ruta que esta transaccion no movio', () => {
  // La marca nombra la ganancia del previo; la transaccion movio un monitor.
  const GANANCIA = 'i.3.gain';
  const h = historialDeLaSesion([
    entrada([cambio({ path: GANANCIA, magnitudEsperada: 0, magnitudEnviada: 3 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [GANANCIA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(GANANCIA), 3, 'el presupuesto de la ganancia sigue gastado');
  assert.equal(h.rutasConNivelEstablecido.has(GANANCIA), false);
});

test('el ancla no rebasa un parametro que no tiene techo declarado', () => {
  // Aunque la transaccion SI la haya movido: suspender el presupuesto sin un
  // techo que lo reemplace deja al parametro sin ningun tope sobre el total.
  const GANANCIA = 'i.3.gain';
  const h = historialDeLaSesion([
    entrada([cambio({ path: GANANCIA, magnitudEsperada: 0, magnitudEnviada: 3 })], null, [GANANCIA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(GANANCIA), 3, 'la ganancia no declara techo');
  assert.equal(h.rutasConNivelEstablecido.has(GANANCIA), false);
});

test('el ancla no cuenta si el cambio no llego a la consola', () => {
  // Una transaccion que dio conflicto, se revirtio o nunca salio no establece
  // nada: es el mismo criterio que el acumulado, y antes no se le aplicaba.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, verificado: false, confirmadoPor: 'TIMEOUT' })], null, [RUTA]),
  ]);
  assert.equal(h.rutasConNivelEstablecido.has(RUTA), false);
  assert.equal(h.acumuladoPorRuta.get(RUTA), undefined);
});

test('volver a establecer el nivel NO devuelve el presupuesto', () => {
  // `journal.ts` razona que desestablecer seria peligroso porque devolveria la
  // rampa entera. Volver a establecer hacia lo mismo y nadie lo impedia: marcar
  // la ruta en cada transaccion devolvia los 4 dB enteros, sin limite.
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null, [RUTA]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -8, magnitudEnviada: -6 })]),
    entrada([cambio({ path: RUTA, magnitudEsperada: -6, magnitudEnviada: -4 })], null, [RUTA]),
  ]);
  assert.equal(h.acumuladoPorRuta.get(RUTA), 4, 'los cuatro decibeles del retoque siguen gastados');
});

test('una ruta inventada en la marca no entra al conjunto', () => {
  const h = historialDeLaSesion([
    entrada([cambio({ path: RUTA, magnitudEsperada: -10, magnitudEnviada: -8 })], null,
      [RUTA, 'no.existe', '', 'i.03.aux.1.value']),
  ]);
  assert.equal(h.rutasConNivelEstablecido.size, 1, 'solo la que se movio de verdad');
  assert.ok(h.rutasConNivelEstablecido.has(RUTA));
});

test('sin medicion anotada la ruta NO queda escuchada, ni con el campo ausente', () => {
  // `undefined !== null` es `true`, asi que una entrada vieja del diario --que
  // no trae el campo-- marcaba la ruta como escuchada y el paso siguiente
  // pasaba sin que nadie hubiera escuchado. Fallaba ABIERTA.
  const vieja = entrada([cambio({ path: RUTA })]);
  const sinCampo = { ...vieja } as Record<string, unknown>;
  delete sinCampo['medicionPosteriorId'];
  const h = historialDeLaSesion([sinCampo as unknown as EntradaDiario]);
  assert.equal(h.rutasConMedicionPosterior.has(RUTA), false);
});
