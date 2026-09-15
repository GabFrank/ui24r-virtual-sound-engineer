import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import {
  emplazar, NULO_DEL_PATRON_GRADOS,
  type ChannelAssignmentId, type ElementoCaptacion, type Emisor,
  type EscenarioElementoId, type PAComponentId, type PAComponentSpec, type PuntoM,
} from '@vse/domain';
import {
  COEFICIENTES, compararCaminos, exposicionDe, nombreDePareja, nuloExactoGrados,
  ordenDeExposicion, parejasExpuestas, respuestaDelPatron,
  ANCHO_ANGULAR_QUE_NO_INFORMA, DISTANCIA_MINIMA_M, type EnvioConocido, type ParejaExpuesta,
} from '../src/acoplamiento.ts';

/**
 * El segundo camino: qué pareja monitor↔micrófono está más expuesta.
 *
 * Los casos están elegidos para poder comprobarse **sin repetir la cuenta del
 * código**: los patrones polares se verifican en 0°, 90° y 180°, donde los
 * valores de libro son exactos, y el orden se comprueba con parejas cuya
 * diferencia es cualitativa —la mitad de distancia, o un micrófono dado vuelta—
 * en vez de con un número que habría que recalcular.
 */

const P = (x: number, y: number, z: number): PuntoM => ({ x, y, z });

function emisorEn(p: PuntoM, opciones: { aux?: number; nombre?: string } = {}): Emisor {
  const componente: PAComponentSpec = {
    id: (opciones.nombre ?? 'cuna') as PAComponentId,
    nombre: opciones.nombre ?? 'Cuña',
    bus: opciones.aux === undefined ? { tipo: 'MASTER' } : { tipo: 'AUX', indice: opciones.aux },
    silenciable: true, clase: 'MONITOR_CUNA', modelo: null,
  };
  return {
    nombre: componente.nombre, bus: componente.bus, componente,
    emplazamiento: emplazar(p, 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }),
  };
}

function micEn(
  p: PuntoM,
  opciones: { azimut?: number | null; patron?: ElementoCaptacion['patron']; id?: string; canal?: number } = {},
): ElementoCaptacion {
  const azimut = opciones.azimut === undefined ? 180 : opciones.azimut;
  return {
    tipo: 'CAPTACION', id: (opciones.id ?? 'mic') as EscenarioElementoId,
    nombre: opciones.id ?? 'Voz',
    emplazamiento: emplazar(
      p, 'FIJO',
      azimut === null ? null : { azimutGrados: azimut, inclinacionGrados: 0 },
      { posicionM: 0, orientacionGrados: 0 },
    ),
    captacion: 'MICROFONO', patron: opciones.patron ?? 'CARDIOIDE',
    asignacionId: 'ch' as ChannelAssignmentId, fuenteId: null,
  };
}

// --- Los patrones, en los ángulos donde el valor de libro es exacto --------

test('cada patrón rechaza donde tiene que rechazar, y el omni no rechaza nada', () => {
  // En el eje, los cinco captan de lleno.
  for (const p of ['OMNI', 'CARDIOIDE', 'SUPERCARDIOIDE', 'HIPERCARDIOIDE', 'BIDIRECCIONAL'] as const) {
    ok(Math.abs(respuestaDelPatron(p, 0) - 1) < 1e-12, `${p} en el eje`);
  }
  // El cardioide anula atrás; el bidireccional, de costado.
  ok(respuestaDelPatron('CARDIOIDE', 180) < 1e-12);
  ok(respuestaDelPatron('BIDIRECCIONAL', 90) < 1e-12);
  // Y el bidireccional capta ATRÁS igual que adelante: 180° es su peor caso,
  // no el mejor. Es lo que un orden por ángulo leería al revés sin esto.
  ok(Math.abs(respuestaDelPatron('BIDIRECCIONAL', 180) - 1) < 1e-12);
  // El omni no rechaza en ningún lado: es el más expuesto de todos.
  for (const g of [0, 45, 90, 135, 180]) strictEqual(respuestaDelPatron('OMNI', g), 1);
  // Un patrón sin cargar se trata como el caso más expuesto, no como el mejor.
  strictEqual(respuestaDelPatron('DESCONOCIDO', 180), 1);
});

test('el supercardioide y el hipercardioide rechazan menos atrás que el cardioide', () => {
  // Es su característica: cambian rechazo trasero por rechazo lateral. Si los
  // tres devolvieran lo mismo, el patrón volvería a ser un campo inerte.
  ok(respuestaDelPatron('SUPERCARDIOIDE', 180) > respuestaDelPatron('CARDIOIDE', 180));
  ok(respuestaDelPatron('HIPERCARDIOIDE', 180) > respuestaDelPatron('SUPERCARDIOIDE', 180));
  // Y a 120°, donde el supercardioide tiene su nulo, rechaza más que el cardioide.
  ok(respuestaDelPatron('SUPERCARDIOIDE', 126) < respuestaDelPatron('CARDIOIDE', 126));
});

// --- El índice: sólo sirve para ordenar ------------------------------------

test('más cerca expone más, y dado vuelta expone menos', () => {
  const exacto = (d: number) => ({ min: d, max: d });
  const enEje = exposicionDe(exacto(2), 'CARDIOIDE', { min: 0, max: 0 });
  const masCerca = exposicionDe(exacto(1), 'CARDIOIDE', { min: 0, max: 0 });
  const deEspaldas = exposicionDe(exacto(2), 'CARDIOIDE', { min: 180, max: 180 });
  ok(masCerca.rango.min > enEje.rango.min, 'la mitad de distancia expone más');
  ok(deEspaldas.rango.max < enEje.rango.min, 'el nulo del cardioide expone menos');
  // Sin duda en las entradas, el rango colapsa a un punto.
  strictEqual(enEje.rango.min, enEje.rango.max);
});

test('el rango del índice se evalúa también en el eje, no sólo en las esquinas', () => {
  // Un micrófono que puede estar entre −30° y +30° puede estar EN el eje, y el
  // eje no es ninguno de los dos extremos: mirando sólo las esquinas, la pareja
  // se informaba menos expuesta de lo que puede estar.
  const cruzaElEje = exposicionDe({ min: 1, max: 1 }, 'CARDIOIDE', { min: -30, max: 30 });
  const enElEje = exposicionDe({ min: 1, max: 1 }, 'CARDIOIDE', { min: 0, max: 0 });
  strictEqual(cruzaElEje.rango.max, enElEje.rango.max);
  // Control positivo: un rango que NO cruza el eje sí queda por debajo.
  const noCruza = exposicionDe({ min: 1, max: 1 }, 'CARDIOIDE', { min: 40, max: 80 });
  ok(noCruza.rango.max < enElEje.rango.max);
});

test('una distancia cero no se lleva la lista por delante', () => {
  const pegado = exposicionDe({ min: 0, max: 0 }, 'OMNI', null);
  ok(Number.isFinite(pegado.rango.max));
  // **Contra el número y no contra la constante.** Comparar contra
  // `DISTANCIA_MINIMA_M` hacía que el test siguiera al código: mover el piso a
  // 0,9 m --nueve veces más-- pasaba en verde. Lo encontró una auditoría.
  strictEqual(DISTANCIA_MINIMA_M, 0.1, 'diez centímetros, que es menos que cualquier separación real');
  strictEqual(pegado.rango.max, 10, 'un metro dividido diez centímetros');
});

// --- Las parejas -----------------------------------------------------------

test('una caja directa no forma pareja con nada: no capta aire', () => {
  const di: ElementoCaptacion = { ...micEn(P(1, 1, 1.5)), captacion: 'DIRECTA', patron: null };
  deepStrictEqual(parejasExpuestas([emisorEn(P(1, 0, 0.3))], [di]), []);
  // Control positivo: el mismo punto con un micrófono sí forma pareja.
  strictEqual(parejasExpuestas([emisorEn(P(1, 0, 0.3))], [micEn(P(1, 1, 1.5))]).length, 1);
});

test('un micrófono que no se manda a ese monitor se va de la lista, no baja de puesto', () => {
  const cuna = emisorEn(P(2, 1, 0.3), { aux: 1, nombre: 'cuna1' });
  const mic = micEn(P(2, 2, 1.5), { canal: 3 });
  const canalDe = () => 3;
  const cerrado: EnvioConocido[] = [{ canal: 3, aux: 1, abierto: false }];
  deepStrictEqual(parejasExpuestas([cuna], [mic], cerrado, canalDe), [],
    'sin envío no hay lazo por ahí, por más cerca que esté');
  const abierto: EnvioConocido[] = [{ canal: 3, aux: 1, abierto: true }];
  strictEqual(parejasExpuestas([cuna], [mic], abierto, canalDe).length, 1);
});

test('no saber si llega NO es lo mismo que saber que no llega', () => {
  const cuna = emisorEn(P(2, 1, 0.3), { aux: 1 });
  const mic = micEn(P(2, 2, 1.5));
  // Sin resolver el canal, la pareja se informa igual y con su reserva escrita.
  const r = parejasExpuestas([cuna], [mic], [], () => null);
  strictEqual(r.length, 1);
  strictEqual(r[0]?.llegaPorElEnvio, null);
  ok(r[0]?.reservas.some((x) => x.includes('no se sabe')), r[0]?.reservas.join(' | '));
});

test('el general no sale de un auxiliar: no hay envío que consultar', () => {
  const general = emisorEn(P(4, 6, 2), { nombre: 'general' });
  const r = parejasExpuestas([general], [micEn(P(2, 2, 1.5))], [], () => null);
  strictEqual(r[0]?.llegaPorElEnvio, true);
  // No lleva la reserva del canal sin resolver --no hace falta resolverlo--,
  // pero sí la de cuánto le llega, que es otra cosa y no se sabe.
  ok(!r[0]!.reservas.some((x) => x.includes('falta el canal')), r[0]?.reservas.join(' | '));
});

test('lo que le falta a una pareja se dice, y cada hueco tiene su frase', () => {
  const cuna = emisorEn(P(2, 1, 0.3), { aux: 1 });
  const sinPatron = parejasExpuestas([cuna], [micEn(P(2, 2, 1.5), { patron: 'DESCONOCIDO' })], [], () => 3);
  ok(sinPatron[0]?.reservas.some((x) => x.includes('patrón polar')));
  const sinEje = parejasExpuestas([cuna], [micEn(P(2, 2, 1.5), { azimut: null })], [], () => 3);
  ok(sinEje[0]?.reservas.some((x) => x.includes('orientación')));
  // Un omnidireccional sin eje NO es un hueco: no necesita eje.
  const omni = parejasExpuestas([cuna], [micEn(P(2, 2, 1.5), { azimut: null, patron: 'OMNI' })], [], () => 3);
  ok(!omni[0]!.reservas.some((x) => x.includes('orientación')));
});

// --- Los escalones: lo que no se puede ordenar, no se ordena ---------------

function exposicionFalsa(min: number, max: number, nombre: string): ParejaExpuesta {
  return {
    emisor: emisorEn(P(0, 0, 0), { nombre }), captacion: micEn(P(1, 1, 1), { id: nombre }),
    distanciaM: { min: 1, max: 1 }, anguloEnElMicrofono: null, nuloDelPatronGrados: 180,
    exposicion: { rango: { min, max } }, llegaPorElEnvio: true, reservas: [],
  };
}

test('dos parejas que se solapan se declaran empatadas entre sí', () => {
  const r = ordenDeExposicion([
    exposicionFalsa(10, 20, 'a'), exposicionFalsa(15, 25, 'b'), exposicionFalsa(1, 2, 'c'),
  ]);
  deepStrictEqual(r.map((x) => x.pareja.emisor.nombre), ['b', 'a', 'c'], 'ordenadas por su techo');
  deepStrictEqual(r[0]?.empatadaCon, ['a → a']);
  deepStrictEqual(r[1]?.empatadaCon, ['b → b']);
  deepStrictEqual(r[2]?.empatadaCon, [], 'c está separada de las dos');
});

test('una pareja ancha NO se traga a las que están por debajo', () => {
  // Era el defecto que una auditoría midió en un escenario real: un cantante
  // con el micrófono de mano encima de su cuña produce una pareja de rango
  // enorme, y el agrupamiento encadenado metía en su mismo grupo a todas las
  // demás --que entre sí eran perfectamente separables--. La pantalla pasaba a
  // decir que la geometría no podía separar ocho parejas cuando siete lo
  // estaban.
  const r = ordenDeExposicion([
    exposicionFalsa(1, 100, 'ancha'), exposicionFalsa(50, 60, 'b'), exposicionFalsa(30, 35, 'c'),
  ]);
  const porNombre = new Map(r.map((x) => [x.pareja.emisor.nombre, x.empatadaCon]));
  deepStrictEqual(porNombre.get('ancha')?.length, 2, 'la ancha sí se solapa con las dos');
  deepStrictEqual(porNombre.get('b'), ['ancha → ancha'], 'b sólo con la ancha');
  deepStrictEqual(porNombre.get('c'), ['ancha → ancha'], 'c sólo con la ancha');
  // Y lo que importa: b y c NO están empatadas entre sí.
  ok(!porNombre.get('b')!.includes('c → c'));
});

test('un plano cargado a ojo deja todo empatado con todo', () => {
  // No es un defecto del método: es la respuesta correcta cuando las entradas
  // no alcanzan para separar nada.
  const r = ordenDeExposicion([
    exposicionFalsa(1, 100, 'a'), exposicionFalsa(2, 90, 'b'), exposicionFalsa(3, 80, 'c'),
  ]);
  for (const x of r) strictEqual(x.empatadaCon.length, 2);
});

test('el orden es por el techo del rango, no por el piso', () => {
  // Son dos preguntas distintas: el techo responde «cuál puede ser la peor»,
  // que es la que importa. Ordenar por el piso responde otra cosa.
  const r = ordenDeExposicion([exposicionFalsa(1, 100, 'ancha'), exposicionFalsa(50, 60, 'alta')]);
  deepStrictEqual(r.map((x) => x.pareja.emisor.nombre), ['ancha', 'alta']);
});

test('dos rangos que se tocan en un punto están empatados', () => {
  const r = ordenDeExposicion([exposicionFalsa(10, 20, 'a'), exposicionFalsa(5, 10, 'b')]);
  strictEqual(r[0]?.empatadaCon.length, 1, 'tocarse en 10 ya es no poder separarlas');
  // Control positivo: un pelo más abajo y sí se separan.
  const s2 = ordenDeExposicion([exposicionFalsa(10, 20, 'a'), exposicionFalsa(5, 9.9, 'b')]);
  strictEqual(s2[0]?.empatadaCon.length, 0);
});

test('el orden no depende de cómo llegaron las parejas a la lista', () => {
  const partes = [exposicionFalsa(10, 20, 'a'), exposicionFalsa(20, 20, 'b'), exposicionFalsa(1, 2, 'c')];
  const nombres = (l: readonly ParejaExpuesta[]) =>
    ordenDeExposicion(l).map((x) => nombreDePareja(x.pareja));
  // Con techos empatados, el desempate por piso y por nombre tiene que dar el
  // mismo resultado en las dos direcciones. Comparar sólo la cantidad --que es
  // lo que hacía el test anterior-- no ve este caso.
  deepStrictEqual(nombres(partes), nombres([...partes].reverse()));
  deepStrictEqual(nombres(partes), ['b → b', 'a → a', 'c → c']);
});

// --- Los dos caminos -------------------------------------------------------

const canalPorNombre = (p: ParejaExpuesta): number | null =>
  ({ a: 1, b: 2, c: 3 } as Record<string, number>)[p.emisor.nombre] ?? null;

test('cuando los dos caminos señalan el mismo canal, se confirman', () => {
  const e = ordenDeExposicion([exposicionFalsa(10, 20, 'a'), exposicionFalsa(1, 2, 'c')]);
  deepStrictEqual(compararCaminos(e, 1, canalPorNombre), { tipo: 'SE_CONFIRMAN', canal: 1 });
});

test('cuando señalan canales distintos, se dice que un dato registrado está mal', () => {
  // Es el motivo entero de tener dos caminos: que puedan discrepar. No dice
  // cuál tiene razón, dice que hay algo mal cargado.
  const e = ordenDeExposicion([exposicionFalsa(10, 20, 'a'), exposicionFalsa(1, 2, 'c')]);
  deepStrictEqual(compararCaminos(e, 3, canalPorNombre),
    { tipo: 'SE_CONTRADICEN', segunElAnalizador: 3, segunLaGeometria: 1 });
});

test('si la geometría no separa, no puede ni confirmar ni contradecir', () => {
  const e = ordenDeExposicion([exposicionFalsa(10, 20, 'a'), exposicionFalsa(15, 25, 'b')]);
  deepStrictEqual(compararCaminos(e, 1, canalPorNombre), { tipo: 'EMPATE', cuantas: 2 });
});

test('sin sospechoso o sin geometría, se dice cuál de las dos falta', () => {
  const e = ordenDeExposicion([exposicionFalsa(10, 20, 'a')]);
  deepStrictEqual(compararCaminos(e, null, canalPorNombre), { tipo: 'SIN_SOSPECHOSO' });
  deepStrictEqual(compararCaminos([], 1, canalPorNombre), { tipo: 'SIN_GEOMETRIA' });
  // Y con escalones cuyo canal no se puede resolver, tampoco hay geometría con
  // qué comparar: no es lo mismo que un empate.
  deepStrictEqual(compararCaminos(e, 1, () => null), { tipo: 'SIN_GEOMETRIA' });
});

test('la tabla de nulos del dominio y la respuesta polar de acá dicen lo mismo', () => {
  // **Son dos archivos distintos que pueden separarse en silencio.** El dominio
  // declara dónde tiene su nulo cada patrón; este módulo calcula la respuesta.
  // Si alguien cambia uno, el otro queda mintiendo, y ningún test de un solo
  // archivo lo vería.
  //
  // El redondeo a medio grado es porque la tabla está en grados enteros: el
  // supercardioide se anula en 125,97 y el hipercardioide en 109,47.
  for (const patron of ['CARDIOIDE', 'SUPERCARDIOIDE', 'HIPERCARDIOIDE', 'BIDIRECCIONAL'] as const) {
    const nulo = NULO_DEL_PATRON_GRADOS[patron];
    ok(nulo !== null, `${patron} tiene que tener nulo declarado`);
    // **La tabla y el cálculo son dos cosas distintas, y por eso la tolerancia
    // es de un grado y no de medio.** La tabla del dominio lleva la cifra de
    // catálogo, la que viene impresa en el micrófono: para el hipercardioide,
    // 110°. El cálculo da el nulo exacto del patrón ideal de primer orden:
    // 109,47°, que redondearía a 109. Ninguna de las dos está mal; lo que
    // estaría mal es que se separaran de verdad.
    const exacto = nuloExactoGrados(patron);
    ok(exacto !== null, `${patron} tiene que anularse en algún lado`);
    ok(Math.abs(exacto! - nulo!) <= 1,
      `${patron}: la tabla dice ${nulo}° y el cálculo da ${exacto!.toFixed(2)}°`);
    ok(respuestaDelPatron(patron, exacto!) < 1e-12, `${patron} tiene que anularse en su nulo exacto`);
    // Control positivo: a la mitad del ángulo del nulo, todos captan de sobra.
    // Sin esto, una función que devolviera siempre cero pasaría.
    //
    // A la mitad y no a treinta grados: el cardioide a 150° ya da 0,067, así
    // que el primer control que escribí acusaba al código de un defecto que
    // era del control.
    ok(respuestaDelPatron(patron, nulo! / 2) > 0.4,
      `${patron} a ${nulo! / 2}° tiene que captar de sobra y da ${respuestaDelPatron(patron, nulo! / 2)}`);
  }
  // Y los que no tienen nulo declarado no rechazan en ninguna dirección.
  strictEqual(NULO_DEL_PATRON_GRADOS.OMNI, null);
  strictEqual(NULO_DEL_PATRON_GRADOS.DESCONOCIDO, null);
  strictEqual(nuloExactoGrados('OMNI'), null);
  strictEqual(nuloExactoGrados('DESCONOCIDO'), null);
});

test('el mínimo del rango puede caer ADENTRO del intervalo, no en sus esquinas', () => {
  // La respuesta polar no es monótona: baja hasta anularse en el nulo y vuelve
  // a subir por el lóbulo trasero. Mirando sólo las esquinas, un bidireccional
  // con el ángulo entre 80° y 100° --que contiene su nulo en 90°-- salía con el
  // rango COLAPSADO A UN PUNTO: inventando la precisión que este módulo entero
  // jura no inventar. Lo midió una auditoría.
  const bi = exposicionDe({ min: 2, max: 2 }, 'BIDIRECCIONAL', { min: 80, max: 100 });
  ok(bi.rango.min < 1e-9, `el nulo está adentro: el mínimo tiene que ser cero y dio ${bi.rango.min}`);
  ok(bi.rango.max > bi.rango.min, 'y el rango no puede quedar colapsado');

  // Los otros dos patrones con lóbulo trasero, en intervalos que contienen su
  // nulo. Sin el arreglo, los tres informaban un piso inflado --y un piso
  // inflado no se solapa con nadie, así que separaba escalones que no se
  // separan--.
  ok(exposicionDe({ min: 2, max: 2 }, 'HIPERCARDIOIDE', { min: 100, max: 180 }).rango.min < 1e-9);
  ok(exposicionDe({ min: 2, max: 2 }, 'SUPERCARDIOIDE', { min: 110, max: 180 }).rango.min < 1e-9);

  // Control positivo: un intervalo que NO contiene el nulo conserva su piso.
  ok(exposicionDe({ min: 2, max: 2 }, 'BIDIRECCIONAL', { min: 0, max: 40 }).rango.min > 0.1);
});

test('el lóbulo trasero vuelve a subir, y el máximo lo tiene en cuenta', () => {
  // Un bidireccional entre 100° y 180° tiene su máximo en 180°, que es una
  // esquina; pero un hipercardioide entre 100° y 200° --si el ángulo pudiera
  // pasarse-- lo tendría adentro. El caso realista es el rango que llega a 180.
  const hasta180 = exposicionDe({ min: 2, max: 2 }, 'BIDIRECCIONAL', { min: 100, max: 180 });
  const enElEje = exposicionDe({ min: 2, max: 2 }, 'BIDIRECCIONAL', { min: 0, max: 0 });
  ok(Math.abs(hasta180.rango.max - enElEje.rango.max) < 1e-12,
    'el lóbulo trasero del bidireccional capta tanto como el frente');
});

test('varias parejas empatadas que apuntan al MISMO canal sí confirman', () => {
  // El docblock de EMPATE decía «más de una pareja» y el código comprueba «más
  // de un canal». Tres parejas empatadas que resuelven al mismo canal
  // confirman, porque el canal es lo que se está comparando.
  const e = ordenDeExposicion([
    exposicionFalsa(10, 20, 'a'), exposicionFalsa(12, 22, 'b'), exposicionFalsa(11, 21, 'c'),
  ]);
  strictEqual(e[0]?.empatadaCon.length, 2, 'las tres están empatadas entre sí');
  deepStrictEqual(compararCaminos(e, 7, () => 7), { tipo: 'SE_CONFIRMAN', canal: 7 });
  // Control positivo: si apuntan a canales distintos, sí es empate.
  deepStrictEqual(compararCaminos(e, 7, canalPorNombre), { tipo: 'EMPATE', cuantas: 3 });
});

test('el veredicto sólo mira a las empatadas con la primera, no a una cadena', () => {
  // Con el agrupamiento encadenado, una pareja que no se solapa con la primera
  // entraba igual al grupo de arriba por culpa de una intermedia, y su canal
  // ensuciaba el veredicto.
  const e = ordenDeExposicion([
    exposicionFalsa(90, 100, 'a'), exposicionFalsa(50, 95, 'b'), exposicionFalsa(1, 55, 'c'),
  ]);
  deepStrictEqual(e[0]?.empatadaCon, ['b → b'], 'la primera sólo se solapa con b');
  // a y b apuntan a los canales 1 y 2; c al 3, y c no tiene que entrar.
  deepStrictEqual(compararCaminos(e, 1, canalPorNombre), { tipo: 'EMPATE', cuantas: 2 });
});

test('ningún patrón de la tabla pide el arcocoseno de un imposible', () => {
  // Un patrón de lóbulo ancho --un subcardioide, `0,7 + 0,3·cos`-- no se anula
  // en ninguna dirección, y calcular su nulo daría NaN. Hoy no hay ninguno en
  // la tabla; esta comprobación existe para que agregar uno haga fallar el test
  // en vez de dejarlo devolver NaN en silencio.
  // **Sobre la tabla y no a través de una función.** Había una función que
  // devolvía este booleano y era inerte: hacerle devolver `true` a secas no
  // rompía ningún test, o sea el mismo defecto que venía a arreglar un nivel
  // más arriba. Ahora la invariante se comprueba sobre los coeficientes.
  for (const [patron, { a, b }] of Object.entries(COEFICIENTES)) {
    ok(b === 0 || a <= b, `${patron} es de lóbulo ancho: a=${a} b=${b}, y su nulo daría NaN`);
  }
  // Y ningún nulo calculado puede ser NaN, que es la consecuencia que importa.
  for (const p of ['OMNI', 'CARDIOIDE', 'SUPERCARDIOIDE', 'HIPERCARDIOIDE',
    'BIDIRECCIONAL', 'DESCONOCIDO'] as const) {
    const n = nuloExactoGrados(p);
    ok(n === null || Number.isFinite(n), `${p} da ${n}`);
  }
});

test('la incertidumbre de la distancia se propaga al rango', () => {
  // Una mutación que evaluaba sólo la distancia mínima sobrevivía en verde: el
  // rango salía colapsado a un punto, que es lo que este módulo jura no hacer.
  const conDuda = exposicionDe({ min: 1, max: 3 }, 'CARDIOIDE', { min: 0, max: 0 });
  ok(conDuda.rango.max > conDuda.rango.min, 'dos distancias distintas dan dos exposiciones distintas');
  strictEqual(conDuda.rango.max, 1, 'a un metro, un cardioide en el eje');
  ok(Math.abs(conDuda.rango.min - 1 / 3) < 1e-12, 'a tres metros, un tercio');
});

test('el índice es coherente: presión con presión, no presión con intensidad', () => {
  // **Mezclar las dos leyes cambia el ORDEN, no sólo la escala.** Con el
  // producto mezclado --respuesta de presión sobre distancia al cuadrado--, una
  // pareja a 1,00 m y 75° fuera de eje daba 0,6294 y otra a 1,55 m en el eje
  // daba 0,4162: ganaba la de costado. Las dos leyes coherentes dan lo
  // contrario. Lo midió una auditoría.
  const deCostado = exposicionDe({ min: 1, max: 1 }, 'CARDIOIDE', { min: 75, max: 75 });
  const enEje = exposicionDe({ min: 1.55, max: 1.55 }, 'CARDIOIDE', { min: 0, max: 0 });
  ok(enEje.rango.max > deCostado.rango.max,
    `la de eje tiene que ganar: ${enEje.rango.max} contra ${deCostado.rango.max}`);
  // Y la ley es la de presión: a dos metros, la mitad que a uno.
  const unMetro = exposicionDe({ min: 1, max: 1 }, 'OMNI', null);
  const dosMetros = exposicionDe({ min: 2, max: 2 }, 'OMNI', null);
  ok(Math.abs(unMetro.rango.max / dosMetros.rango.max - 2) < 1e-12,
    'al doblar la distancia, la mitad; con la ley de intensidad sería la cuarta parte');
});

test('un ángulo muy incierto lleva reserva aunque no sea el centinela exacto', () => {
  const cuna = emisorEn(P(2, 1, 0.3), { aux: 1 });
  // Un micrófono de mano cerca de la cuña da un rango anchísimo pero recortado,
  // que no es exactamente {0, 180}: antes se escapaba sin reserva.
  const mano: ElementoCaptacion = {
    ...micEn(P(2, 1.6, 1.2)),
    emplazamiento: emplazar(P(2, 1.6, 1.2), 'EN_MANO', { azimutGrados: 180, inclinacionGrados: 0 }),
  };
  const r = parejasExpuestas([cuna], [mano], [], () => 3);
  const a = r[0]?.anguloEnElMicrofono;
  ok(a !== null && a !== undefined && (a.max - a.min) > ANCHO_ANGULAR_QUE_NO_INFORMA,
    `el rango tiene que ser anchísimo: ${JSON.stringify(a)}`);
  ok(r[0]?.reservas.some((x) => x.includes('no dice nada')), r[0]?.reservas.join(' | '));

  // Control positivo: un micrófono en un pie a la misma distancia SÍ informa.
  const pie = parejasExpuestas([cuna], [micEn(P(2, 1.6, 1.2))], [], () => 3);
  ok(!pie[0]!.reservas.some((x) => x.includes('no dice nada')), pie[0]?.reservas.join(' | '));
});

test('el que sale por el general también lleva su reserva', () => {
  // Sin esto, una caja de sala salía como la pareja más limpia del informe
  // --sin una sola advertencia-- mientras la cuña llevaba la suya escrita: la
  // falta de dato se mostraba al revés.
  const general = emisorEn(P(4, 6, 2), { nombre: 'general' });
  const r = parejasExpuestas([general], [micEn(P(2, 2, 1.5))], [], () => 3);
  strictEqual(r[0]?.llegaPorElEnvio, true);
  ok(r[0]?.reservas.some((x) => x.includes('cuánto le llega no se sabe')), r[0]?.reservas.join(' | '));
});

test('un micrófono sin patrón declarado no recibe rechazo inventado', () => {
  // El tipo permite `patron: null`. Una mutación que lo interpretaba como
  // cardioide sobrevivía, porque ningún test pasaba `null`.
  const cuna = emisorEn(P(2, 1, 0.3), { aux: 1 });
  const detras: ElementoCaptacion = { ...micEn(P(2, 2, 1.5), { azimut: 0 }), patron: null };
  const r = parejasExpuestas([cuna], [detras], [], () => 3);
  // Con el monitor a espaldas de un cardioide la exposición caería casi a cero;
  // sin patrón declarado se lo trata como el caso más expuesto.
  ok(r[0]!.exposicion.rango.max > 0.5, `sin patrón no se rechaza nada: ${r[0]!.exposicion.rango.max}`);
  ok(r[0]?.reservas.some((x) => x.includes('patrón polar')));
});
