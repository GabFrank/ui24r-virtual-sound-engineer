import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entrada, esEnvioAUnAuxiliar, esNivelDeEnvioAMonitor } from '@vse/mixer-adapter';
import {
  leerNivelDelEnvio, loQueLlegaALaCuna, rutaDelEnvio, NOMINAL_DB,
  type AsignacionParaLaCuna, type CanalParaLaCuna,
} from '../src/app/monitor/cuna-del-musico.ts';

/**
 * Lo que la pantalla por músico muestra de una cuña, atacado con entradas bien
 * formadas.
 *
 * **Por qué con la ley de verdad y no con una de mentira.** La pantalla no
 * decide nada sobre la consola, pero sí **afirma decibeles**, y este proyecto ya
 * documentó dos veces el límite de su instrumento como si fuera el del aparato.
 * Un número mal convertido en una tabla no revienta: se lee, se cree, y decide
 * si el usuario sube o no sube. Así que las conversiones se comprueban contra
 * `entrada()` del adaptador, que es la misma que el motor va a exigir después.
 *
 * **Y los ataques son de entradas bien formadas**, que es la lección del
 * 2026-09-18: mutar sólo prueba que los tests cazan lo que hay; lo que hace
 * falta es que una entrada plausible no consiga una respuesta que miente.
 */

const RUTA = 'i.0.aux.0.value';
const LEY = entrada(RUTA);
assert.ok(LEY !== undefined, 'la ley del envío a monitor tiene que estar en la tabla');

/**
 * Un volcado de mentira, **con las otras tres familias cerradas salvo que se
 * diga otra cosa**.
 *
 * A un auxiliar le entran 32 caminos: 24 canales, 2 entradas de línea, 2 del
 * reproductor y 4 retornos de efecto. Casi todos los tests de acá hablan de los
 * canales, y sin esta línea cada uno tendría que escribir ocho ceros para decir
 * «y de lo demás no le llega nada», o mediría sin querer el caso de la consola
 * a medias. Los tests de las otras familias los pisan nombrándolos.
 */
function volcado(
  pares: Readonly<Record<string, number>>,
  /** Claves que la consola **no publicó**, que no es lo mismo que en cero. */
  ausentes: readonly string[] = [],
): ReadonlyMap<string, { valor: number }> {
  const todo: Record<string, number> = {};
  if (Object.keys(pares).length > 0) {
    for (const [familia, cuantas] of [['i', 24], ['l', 2], ['p', 2], ['f', 4]] as const) {
      for (let n = 0; n < cuantas; n++) todo[`${familia}.${n}.aux.0.value`] = 0;
    }
  }
  const juntos = { ...todo, ...pares };
  for (const k of ausentes) delete juntos[k];
  return new Map(Object.entries(juntos).map(([k, v]) => [k, { valor: v }]));
}

/**
 * Un volcado con **sólo** lo que se le dice, sin completar nada.
 *
 * Para los tests donde lo que se prueba es la **ausencia** de una clave, que es
 * distinta del cero: la consola a medias. Con el volcado completo esos casos se
 * medirían al revés sin que nada avisara.
 */
function volcadoParcial(
  pares: Readonly<Record<string, number>>,
): ReadonlyMap<string, { valor: number }> {
  return new Map(Object.entries(pares).map(([k, v]) => [k, { valor: v }]));
}

// --- La ruta ---------------------------------------------------------------

test('la ruta se arma en base cero, que es como la publica la consola', () => {
  assert.equal(rutaDelEnvio(1, 1), 'i.0.aux.0.value');
  assert.equal(rutaDelEnvio(24, 10), 'i.23.aux.9.value');
  // Un desfase de uno acá no revienta: muestra el envío del vecino, con el
  // músico enfrente. Por eso se fija el par de los dos extremos y no uno solo.
  assert.equal(rutaDelEnvio(10, 5), 'i.9.aux.4.value');
});

test('un canal o un auxiliar que esta consola no tiene no da ruta', () => {
  for (const [canal, aux] of [[25, 1], [0, 1], [-1, 1], [1, 11], [1, 0]] as const) {
    assert.equal(rutaDelEnvio(canal, aux), undefined, `canal ${canal}, aux ${aux}`);
  }
});

test('un índice que no es entero no se redondea en silencio', () => {
  // `i.0.5.aux…` no existe, pero la cuenta `canal - 1` con 1,5 da 0,5 y la
  // plantilla de la ruta la aceptaría como texto. Falla cerrado.
  assert.equal(rutaDelEnvio(1.5, 1), undefined);
  assert.equal(rutaDelEnvio(1, 2.5), undefined);
  assert.equal(rutaDelEnvio(Number.NaN, 1), undefined);
});

// --- El nivel --------------------------------------------------------------

test('el nivel sale de la ley medida del adaptador, no de una copia', () => {
  const n = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: 1.0 }));
  assert.equal(n.tipo, 'EN_DB');
  assert.ok(n.tipo === 'EN_DB');
  assert.equal(n.db, LEY.fromRaw(1.0));
  assert.equal(n.db, LEY.fisicoMax);

  const bajo = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: LEY.rawMin }));
  assert.ok(bajo.tipo === 'EN_DB');
  assert.equal(bajo.db, LEY.fisicoMin);
  assert.ok(Math.abs(bajo.db - -32.1377) < 0.001, `dio ${bajo.db}`);
});

test('lo que falta para el techo se cuenta contra nominal, y puede ser negativo', () => {
  const nominal = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: LEY.toRaw(NOMINAL_DB) }));
  assert.ok(nominal.tipo === 'EN_DB');
  assert.ok(Math.abs(nominal.aNominalDb) < 0.001, `dio ${nominal.aNominalDb}`);

  // El aparato llega a +10 dB y el techo lo pone ADR-034, no la consola: un
  // envío que alguien dejó arriba a mano tiene que verse como lo que es.
  const arriba = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: 1.0 }));
  assert.ok(arriba.tipo === 'EN_DB');
  assert.ok(arriba.aNominalDb < 0, `dio ${arriba.aNominalDb}`);
});

test('por debajo del tramo medido NO se traduce a decibeles', () => {
  const crudo = 0.1;
  // **La guarda tiene que hacer algo**: la ley contesta un número para este
  // crudo --y es el número que se estaría mostrando sin ella--. Sin esta
  // comprobación el test pasaría con y sin la guarda, que es lo mismo que no
  // tenerlo.
  assert.ok(Number.isFinite(LEY.fromRaw(crudo)), 'la ley extrapola: la guarda hace falta');
  assert.ok(LEY.fromRaw(crudo) < LEY.fisicoMin);

  const n = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: crudo }));
  assert.equal(n.tipo, 'FUERA_DEL_TRAMO_MEDIDO');
  assert.ok(n.tipo === 'FUERA_DEL_TRAMO_MEDIDO');
  assert.equal(n.crudo, crudo);
  assert.ok(!('db' in n), 'no puede volver con decibeles');
});

test('el crudo cero es silencio, y no es lo mismo que no haberlo leído', () => {
  assert.equal(leerNivelDelEnvio(RUTA, volcado({ [RUTA]: 0 })).tipo, 'EN_SILENCIO');
  // La clave ausente: la consola no publicó nada de esa ruta. Decir «cerrado»
  // acá mostraría una cuña lista para subir que en realidad no se leyó.
  assert.equal(leerNivelDelEnvio(RUTA, volcado({})).tipo, 'SIN_LEER');
});

test('un crudo que no es un número no vuelve como decibeles', () => {
  // La familia que este motor ya tapó tres veces: `NaN` sobrevive a toda
  // comparación y sale por el lado permisivo.
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const n = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: v }));
    assert.equal(n.tipo, 'SIN_LEER', `con ${v}`);
  }
});

test('una ruta que no es un envío a monitor no se convierte, aunque tenga ley', () => {
  // **Este test encontró un defecto real.** La primera versión sólo miraba que
  // la ruta estuviera en la tabla de conversión, y la profundidad de la puerta
  // está medida desde el 2026-09-17: contestaba un número correcto para la
  // pregunta equivocada. Se comprueba que la ley existe, para que el test no
  // pase por el motivo trivial.
  const otraConLey = 'i.0.gate.depth';
  assert.ok(entrada(otraConLey) !== undefined, 'esta ruta SÍ tiene ley: por eso el ataque sirve');
  assert.equal(leerNivelDelEnvio(otraConLey, volcado({ [otraConLey]: 0.7 })).tipo, 'SIN_LEER');

  const sinLey = 'i.0.mix';
  assert.equal(entrada(sinLey), undefined);
  assert.equal(leerNivelDelEnvio(sinLey, volcado({ [sinLey]: 0.5 })).tipo, 'SIN_LEER');
});

// --- El orden de lo que le llega -------------------------------------------

const CANALES: readonly CanalParaLaCuna[] = [
  { indice: 1, nombre: 'CH1' }, { indice: 2, nombre: 'CH2' },
  { indice: 3, nombre: 'CH3' }, { indice: 4, nombre: 'CH4' },
];

const ASIGNACIONES: readonly AsignacionParaLaCuna[] = [
  { entrada: 1, instrumento: 'Voz de Ana', integranteId: 'ana' },
  { entrada: 2, instrumento: 'Guitarra de Ana', integranteId: 'ana' },
  { entrada: 3, instrumento: 'Bajo de Beto', integranteId: 'beto' },
];

/** Sólo las filas: el recuento se prueba aparte, más abajo. */
function filasDe(...args: Parameters<typeof loQueLlegaALaCuna>) {
  return loQueLlegaALaCuna(...args).caminos;
}

/** El envío del canal `c` al auxiliar 1, en crudo. */
function envio(c: number): string {
  const r = rutaDelEnvio(c, 1);
  assert.ok(r !== undefined);
  return r;
}

test('su propio instrumento va primero aunque esté cerrado y otro mande más', () => {
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado({
    [envio(1)]: 0,      // su voz, cerrada: es justo la que va a subir
    [envio(2)]: 0.3,    // su guitarra, bajita
    [envio(3)]: 1.0,    // el bajo de otro, a tope
    [envio(4)]: 0,      // ajeno y cerrado: no es parte de esta cuña
  }));
  assert.deepEqual(filas.map((f) => f.canal), [1, 2, 3]);
  assert.deepEqual(filas.map((f) => f.esSuyo), [true, true, false]);
  // Y su voz cerrada NO se esconde, aunque de los ajenos lo cerrado sí se
  // esconde: es la fila que el usuario viene a mirar.
  assert.equal(filas[0]?.nivel.tipo, 'EN_SILENCIO');
});

test('de los ajenos se esconde lo cerrado, pero nunca lo que no se pudo leer', () => {
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado(
    {
      [envio(1)]: 0.5,
      [envio(2)]: 0.5,
      [envio(3)]: 0,      // ajeno y cerrado: no le llega, no se muestra
    },
    // El canal 4 no está en el volcado: ajeno y sin leer, se muestra igual.
    [envio(4)],
  ));
  assert.deepEqual(filas.map((f) => f.canal), [1, 2, 4]);
  assert.equal(filas[2]?.nivel.tipo, 'SIN_LEER');
});

test('si de la cuña no se leyó NADA, los ajenos desconocidos no hacen ruido', () => {
  // **Salió de mirar la pantalla.** Con el simulador conectado --publica canales
  // y no modela los envíos a auxiliar-- la tabla salía con las veinticuatro
  // filas diciendo «la consola no lo publicó», debajo de un cartel que decía
  // «conectado». Lo que hay que decir ahí es una sola cosa, arriba: esta cuña no
  // se leyó.
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado({}));
  assert.deepEqual(filas.map((f) => f.canal), [1, 2], 'sólo los suyos, y sin nivel');
  assert.ok(filas.every((f) => f.nivel.tipo === 'SIN_LEER'));
});

test('si de la cuña se leyó algo, el ajeno que falta SÍ se muestra: es una anomalía', () => {
  // La otra mitad de la misma regla, y la que se rompería con un `if` de menos.
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado(
    { [envio(1)]: 0.5 },
    // El 2, el 3 y el 4 no están: el 2 es suyo y se muestra siempre; el 3 y el 4
    // son ajenos y faltan con la cuña publicándose, así que hay algo raro y se ven.
    [envio(2), envio(3), envio(4)],
  ));
  assert.deepEqual(filas.map((f) => f.canal), [1, 2, 3, 4]);
  assert.equal(filas[2]?.nivel.tipo, 'SIN_LEER');
});

test('entre los ajenos manda el que más manda, y lo que no se sabe va al final', () => {
  const ajenos: readonly AsignacionParaLaCuna[] = [
    { entrada: 1, instrumento: 'Bombo', integranteId: 'beto' },
    { entrada: 2, instrumento: 'Bajo', integranteId: 'beto' },
    { entrada: 3, instrumento: 'Teclado', integranteId: 'beto' },
  ];
  const filas = filasDe(1, 'ana', CANALES, ajenos, volcado({
    [envio(1)]: 0.4,
    [envio(2)]: 0.9,
    [envio(3)]: 0.1,    // fuera del tramo medido: no se sabe cuántos dB
    [envio(4)]: 0.6,
  }));
  assert.deepEqual(filas.map((f) => f.canal), [2, 4, 1, 3]);
  // El que no se puede poner en decibeles queda último **sin que se le invente
  // un número**: se ordena al final, no se le asigna un nivel.
  assert.equal(filas[3]?.nivel.tipo, 'FUERA_DEL_TRAMO_MEDIDO');
});

test('un músico sin identificador no se queda con los canales sin asignar', () => {
  const sinDuenio: readonly AsignacionParaLaCuna[] = [
    { entrada: 1, instrumento: 'Ambiente', integranteId: null },
  ];
  const filas = filasDe(1, null, CANALES, sinDuenio, volcado({
    [envio(1)]: 0.5, [envio(2)]: 0, [envio(3)]: 0, [envio(4)]: 0,
  }));
  assert.equal(filas.length, 1);
  assert.equal(filas[0]?.esSuyo, false, 'null no es dueño de null');
});

test('un canal sin asignar se nombra con lo que dice la consola', () => {
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado({
    [envio(1)]: 0.5,
    [envio(4)]: 0.5,
  }));
  assert.equal(filas.find((f) => f.canal === 1)?.que, 'Voz de Ana');
  assert.equal(filas.find((f) => f.canal === 4)?.que, 'CH4');
});

test('sin consola conectada se ve igual el instrumento del músico', () => {
  // **Este test viene de un defecto real, encontrado probando la cadena y no la
  // función.** La lista salía sólo de los canales que publica la consola, así
  // que con la consola caída la pantalla quedaba sin una sola fila --mientras el
  // aviso de arriba prometía mostrar «quién manda a esta cuña, no cuánto»--.
  const filas = filasDe(1, 'ana', [], ASIGNACIONES, volcado({}));
  assert.deepEqual(filas.map((f) => [f.canal, f.que, f.esSuyo]), [
    [1, 'Voz de Ana', true],
    [2, 'Guitarra de Ana', true],
  ]);
  // El bajo de Beto no aparece, y no por estar cerrado: **de esta cuña no se
  // leyó nada**, así que de los ajenos no se puede decir nada útil. Lo que hay
  // que decir va arriba y una sola vez.
  assert.ok(filas.every((f) => f.nivel.tipo === 'SIN_LEER'));
});

test('un canal asignado que la consola no publica se nombra con su instrumento', () => {
  const soloUno: readonly CanalParaLaCuna[] = [{ indice: 1, nombre: 'CH1' }];
  const filas = filasDe(1, 'ana', soloUno, ASIGNACIONES, volcado({
    [envio(1)]: 0.5, [envio(2)]: 0.5, [envio(3)]: 0,
  }));
  // El canal 2 no está en `canales` y sí en las asignaciones: aparece igual.
  assert.deepEqual(filas.map((f) => f.canal), [1, 2]);
  assert.equal(filas[1]?.que, 'Guitarra de Ana');
});

test('el instrumento gana sobre el nombre que publica la consola', () => {
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado({
    [envio(1)]: 0.5, [envio(2)]: 0, [envio(3)]: 0, [envio(4)]: 0,
  }));
  // «Voz de Ana» dice más que «CH1», que es lo que la consola publica.
  assert.equal(filas[0]?.que, 'Voz de Ana');
});

test('un auxiliar que no existe no arma ninguna fila, en vez de armarlas mal', () => {
  assert.deepEqual(filasDe(11, 'ana', CANALES, ASIGNACIONES, volcado({})), []);
});

test('la cadena entera: una cuña de verdad, leída del volcado', () => {
  // Ana canta y toca la guitarra; en su cuña quiere su voz fuerte, su guitarra
  // media y algo del bajo de Beto. El teclado del canal 4 no le llega.
  const filas = filasDe(1, 'ana', CANALES, ASIGNACIONES, volcado({
    [envio(1)]: 0.7647,   // nominal
    [envio(2)]: 0.5,
    [envio(3)]: 0.4,
    [envio(4)]: 0,
  }));
  assert.deepEqual(filas.map((f) => [f.canal, f.que, f.esSuyo]), [
    [1, 'Voz de Ana', true],
    [2, 'Guitarra de Ana', true],
    [3, 'Bajo de Beto', false],
  ]);
  const voz = filas[0]?.nivel;
  assert.ok(voz?.tipo === 'EN_DB');
  assert.ok(Math.abs(voz.db - NOMINAL_DB) < 0.01, `la voz dio ${voz.db}`);
  assert.ok(Math.abs(voz.aNominalDb) < 0.01, 'en nominal no queda margen hasta el techo');
});

// --- Las otras tres familias, que la primera versión no miraba ---------------

test('la reverb del cantante aparece: a la cuña le entran 32 caminos, no 24', () => {
  // **El caso que rompía la promesa de la pantalla.** Un retorno de efecto
  // abierto en la cuña de alguien es lo más común que hay, y con los canales
  // cerrados la pantalla llegaba a decir «a esta cuña no le llega nada».
  const { caminos, cuenta } = loQueLlegaALaCuna(1, 'ana', CANALES, ASIGNACIONES, volcado({
    'f.0.aux.0.value': 0.9,
  }));
  const reverb = caminos.find((c) => c.que === 'Efecto 1');
  assert.ok(reverb !== undefined, 'el retorno de efecto no aparece');
  assert.equal(reverb.nivel.tipo, 'MANDA_SIN_LEY');
  assert.equal(reverb.laMueveLaAplicacion, false, 'la aplicación no puede mover un efecto');
  assert.equal(cuenta.total, 32);
});

test('a las otras familias NO se les inventan decibeles', () => {
  // La 104 midió `i.9.aux.4.value` y nada más. Suponerle la misma curva a un
  // retorno de efecto es lo que la regla 1 del repositorio prohíbe.
  for (const clave of ['l.0.aux.0.value', 'p.1.aux.0.value', 'f.3.aux.0.value']) {
    const n = leerNivelDelEnvio(clave, volcado({ [clave]: 0.5 }));
    assert.equal(n.tipo, 'MANDA_SIN_LEY', clave);
    assert.ok(!('db' in n), `${clave} volvió con decibeles`);
  }
  // Y el cero sí se puede afirmar sin ley: es el extremo del control.
  assert.equal(leerNivelDelEnvio('f.0.aux.0.value', volcado({ 'f.0.aux.0.value': 0 })).tipo,
    'EN_SILENCIO');
});

test('las otras familias no abren ninguna escritura', () => {
  // La distinción que sostiene todo esto: se leen, no se escriben.
  for (const clave of ['l.0.aux.0.value', 'p.0.aux.0.value', 'f.0.aux.0.value']) {
    assert.equal(esNivelDeEnvioAMonitor(clave), false, `${clave} no puede ser escribible`);
    assert.equal(esEnvioAUnAuxiliar(clave), true, `${clave} sí es un camino a la cuña`);
  }
  assert.equal(esNivelDeEnvioAMonitor('i.0.aux.0.value'), true);
  // Y los índices se acotan por familia: hay 2 de línea, 2 del reproductor y 4
  // de efectos en esta consola, censados el 2026-09-11.
  assert.equal(esEnvioAUnAuxiliar('l.2.aux.0.value'), false);
  assert.equal(esEnvioAUnAuxiliar('p.2.aux.0.value'), false);
  assert.equal(esEnvioAUnAuxiliar('f.4.aux.0.value'), false);
  assert.equal(esEnvioAUnAuxiliar('f.3.aux.9.value'), true);
});

test('el recuento cubre los 32, incluidos los que no se muestran', () => {
  // **Es lo que permite que la pantalla rinda cuentas en vez de prometer.** La
  // tabla esconde lo cerrado de los demás a propósito; el recuento lo dice.
  const { caminos, cuenta } = loQueLlegaALaCuna(1, 'ana', CANALES, ASIGNACIONES, volcado({
    [envio(1)]: 0.5,
    [envio(2)]: 0,
    [envio(3)]: 0,
    [envio(4)]: 0,
    'f.0.aux.0.value': 0.8,
  }));
  assert.equal(cuenta.total, 32);
  assert.equal(cuenta.mandan, 2, 'la voz y la reverb');
  assert.equal(cuenta.cerrados + cuenta.sinLeer, 30);
  // Se ven menos filas que caminos, y eso es justamente por qué el recuento existe.
  assert.ok(caminos.length < cuenta.total);
});

test('primero lo que se sabe en decibeles, después lo que manda sin ley', () => {
  const ajenas: readonly AsignacionParaLaCuna[] = [
    { entrada: 1, instrumento: 'Bombo', integranteId: 'beto' },
  ];
  const { caminos } = loQueLlegaALaCuna(1, 'ana', CANALES, ajenas, volcado({
    [envio(1)]: 0.5,
    'f.0.aux.0.value': 0.99,
  }));
  // **No se colapsan en un número.** Un efecto a 0,99 y un canal a −11,6 dB no
  // se pueden comparar sin la ley del efecto: inventarle un valor mentiría en un
  // sentido o en el otro. Se ordena por certeza y la columna de detalle explica.
  assert.deepEqual(caminos.map((c) => c.nivel.tipo), ['EN_DB', 'MANDA_SIN_LEY']);
});

// --- Los dos bordes del techo -----------------------------------------------

test('el envío puesto justo en nominal no se anuncia como por encima del techo', () => {
  // El crudo del 0 dB de la consola. Sin tolerancia daba 3,1e-14 dB y la
  // pantalla decía «0.0 dB POR ENCIMA del techo», en ámbar, justo en el caso
  // central de ADR-034.
  const enCero = LEY.toRaw(NOMINAL_DB);
  const n = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: enCero }));
  assert.ok(n.tipo === 'EN_DB');
  assert.ok(Math.abs(n.aNominalDb) < 0.05, `dio ${n.aNominalDb}`);
  // El signo del cero no puede decidir el mensaje: los dos lados están adentro
  // de la tolerancia que usa la pantalla.
  const apenasDebajo = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: enCero - 1e-9 }));
  assert.ok(apenasDebajo.tipo === 'EN_DB');
  assert.ok(Math.abs(apenasDebajo.aNominalDb) < 0.05);
});

test('un crudo por encima del tope no se anuncia como «muy abajo»', () => {
  // Los dos bordes estaban colapsados en un solo estado, así que el camino que
  // más fuerte estaba mandando se anunciaba como el más bajo.
  for (const crudo of [1.0000000001, 1.05, 2]) {
    const n = leerNivelDelEnvio(RUTA, volcado({ [RUTA]: crudo }));
    assert.equal(n.tipo, 'MANDA_SIN_LEY', `con crudo ${crudo}`);
  }
  // Y el borde de abajo sigue donde estaba.
  assert.equal(leerNivelDelEnvio(RUTA, volcado({ [RUTA]: 0.1 })).tipo, 'FUERA_DEL_TRAMO_MEDIDO');
});
