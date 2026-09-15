import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITES } from '@vse/domain';
import {
  puedeBajarEnvioAMonitor, type EstadoParaBajarMonitor, type LeyDelEnvioAMonitor,
} from '../src/bajar-envio-a-monitor.ts';

/**
 * **Una ley de mentira, con el tramo escrito a mano.** Este paquete no puede
 * importar el adaptador —regla 3, `validate-limites`— así que la ley real no
 * entra acá. Lo que se prueba en este archivo es la decisión: cuándo el
 * asistente se niega y qué dice. Que el crudo que sale esté atado a los dB por
 * la ley **medida** se prueba donde esa ley se puede importar:
 * `apps/mobile/test/ley-del-envio-a-monitor.test.ts`.
 *
 * El tramo copia el del ítem 104 a propósito —de −32,14 a +10 dB— para que un
 * caso de borde acá se parezca a uno real, pero no es evidencia de nada.
 *
 * **Qué rutas acepta, y por qué está invertido.** La primera versión de esta ley
 * decidía con `/^i\.(?:[0-9]|1[0-9]|2[0-3])\.aux\.[0-9]\.value$/`, o sea
 * **reimplementaba acá la regla de `esNivelDeEnvioAMonitor`**: los 24 canales,
 * los 10 auxiliares y la forma canónica. Un auditor midió el precio: el día que
 * `CANALES_DE_ENTRADA` o `AUXILIARES` cambien —otro firmware, otra consola— la
 * copia se queda con la regla vieja **sin que nada lo diga**, y los tests de este
 * paquete siguen en verde afirmando contra una regla que ya no existe.
 *
 * Y había algo peor, que la copia escondía: si alguien volviera a meter la regla
 * de las rutas **dentro del asistente** —una expresión regular, una lista
 * blanca— todo este archivo seguiría pasando, porque la copia decía exactamente
 * lo mismo que diría esa regla.
 *
 * Así que la ley acepta una ruta que **ninguna consola tiene** y rechaza
 * `i.3.aux.1.value`, que es real y canónica. Con el par invertido no queda nada
 * que se pueda desincronizar, y un asistente que no le preguntara a la ley
 * fallaría por los dos lados a la vez.
 *
 * Los casos de la regla de verdad —`i.24.aux.0.value`, el alias `i.03.…`, el
 * auxiliar 10— se prueban contra la regla de verdad, donde vive:
 * `packages/mixer-adapter/test/rutas-de-los-tests.test.ts` los declara y
 * `packages/safety/test/engine.test.ts` comprueba que el motor los rechaza.
 */
const TRAMO = { fisicoMin: -32.14, fisicoMax: 10, spike: 'ítem 104 (de mentira)' };
/** La única que esta ley acepta. No existe en ninguna consola: ése es el punto. */
const ACEPTADA = 'inventada.para.este.test';
/** Real, canónica, y esta ley la rechaza. El asistente tiene que obedecer eso. */
const RECHAZADA_AUNQUE_REAL = 'i.3.aux.1.value';
const leyDeMentira: LeyDelEnvioAMonitor = {
  esNivelDeEnvioAMonitor: (ruta) => ruta === ACEPTADA,
  entrada: (ruta) => (ruta === ACEPTADA ? TRAMO : undefined),
  aRaw: (ruta, fisico) => {
    if (ruta !== ACEPTADA) return { ok: false, codigo: 'SIN_MAPEO', mensaje: `${ruta} no está en la tabla` };
    if (fisico < TRAMO.fisicoMin || fisico > TRAMO.fisicoMax) {
      return { ok: false, codigo: 'FUERA_DE_RANGO', mensaje: `${fisico} dB queda fuera del tramo medido` };
    }
    // Lineal a propósito: es un crudo cualquiera, reconocible en los tests.
    return { ok: true, raw: (fisico - TRAMO.fisicoMin) / (TRAMO.fisicoMax - TRAMO.fisicoMin) };
  },
};

const base: EstadoParaBajarMonitor = {
  ruta: ACEPTADA,
  nivelActualDb: 0,
  bajarDb: 2,
  sessionState: 'FULL_BAND',
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};
const con = (x: Partial<EstadoParaBajarMonitor>): EstadoParaBajarMonitor => ({ ...base, ...x });
const decidir = (x: Partial<EstadoParaBajarMonitor> = {}) => puedeBajarEnvioAMonitor(con(x), leyDeMentira);
const motivo = (v: ReturnType<typeof puedeBajarEnvioAMonitor>): string =>
  (v.puede ? '' : v.motivo);

test('baja un envío durante el soundcheck con la banda tocando', () => {
  const v = decidir();
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && Math.abs(v.destinoDb - (-2)) < 1e-9);
});

/**
 * **`FULL_BAND` y `RINGOUT` abiertos es el caso principal, no una excepción.**
 * Son exactamente cuándo se ajusta un monitor y cuándo se caza un acople.
 * Cerrarlos dejaría la categoría abierta sólo cuando no hay nadie tocando.
 */
test('los estados en que el usuario realmente ajusta monitores están abiertos', () => {
  for (const s of ['FULL_BAND', 'RINGOUT', 'MIX', 'CHANNEL_SETUP'] as const) {
    const v = decidir({ sessionState: s });
    assert.equal(v.puede, true, `${s}: ${motivo(v)}`);
  }
});

test('con público en la sala, no', () => {
  const v = decidir({ sessionState: 'SHOW' });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /público/);
});

test('el paro y la conexión mandan sobre todo lo demás', () => {
  assert.match(motivo(decidir({ paroDeEmergencia: true })), /paro/);
  assert.match(motivo(decidir({ conexionPermiteEscribir: false })), /conectada/);
});

/**
 * La forma canónica y el rango real, que es lo que una auditoría midió que la
 * lista blanca vieja dejaba pasar. Acá lo decide la ley que se pasa; lo que se
 * prueba es que el asistente le pregunta y obedece.
 */
test('una ruta que la ley no reconoce no se propone, aunque sea real', () => {
  for (const ruta of [RECHAZADA_AUNQUE_REAL, 'i.3.mix', 'a.4.mix']) {
    const v = decidir({ ruta });
    assert.equal(v.puede, false, `${ruta} no debería proponerse`);
    assert.match(motivo(v), /no es un nivel de envío/);
  }
});

/**
 * **El par invertido, dicho como aserción y no sólo como montaje.** Si alguien
 * volviera a meter la regla de las rutas dentro del asistente, éste caería por
 * los dos lados a la vez: la inventada dejaría de aceptarse y la real dejaría
 * de rechazarse.
 */
test('manda la ley que se le pasa, y no lo que el asistente crea saber de las rutas', () => {
  assert.equal(decidir({ ruta: ACEPTADA }).puede, true);
  assert.equal(decidir({ ruta: RECHAZADA_AUNQUE_REAL }).puede, false);
});

test('sólo baja: subir es del usuario', () => {
  for (const bajarDb of [0, -2]) {
    const v = decidir({ bajarDb });
    assert.equal(v.puede, false);
    assert.match(motivo(v), /sólo baja/);
  }
});

test('no se mueve más de lo que el límite del dominio permite por transacción', () => {
  const v = decidir({ bajarDb: 6 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /por vez/);
});

/**
 * **El borde del tope, que es donde un tope se rompe.** La suite probaba 2 --que
 * pasa-- y 6 --que se rechaza--, y entre los dos hay lugar para que el tope se
 * corra sin que nada caiga: un auditor sembró `> tope + 1` y no murió ningún
 * test. El límite se lee del dominio, así que subirlo allá no deja este test
 * mintiendo.
 */
test('el borde del tope: justo el tope pasa, y un decibel más no', () => {
  const tope = LIMITES.MONITOR_AUX_SEND!.porTransaccion;
  assert.equal(decidir({ bajarDb: tope }).puede, true);
  const v = decidir({ bajarDb: tope + 1 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /por vez/);
});

/**
 * **Cuál de las guardas manda cuando fallan varias a la vez.** Todos los demás
 * tests ponen un defecto por vez, así que la precedencia no la observaba
 * ninguno: un auditor cambió el orden de las siete guardas de cinco maneras y no
 * cayó un solo test, mientras uno de ellos se llama «el paro y la conexión mandan
 * sobre todo lo demás». El nombre prometía un contrato que la suite no
 * comprobaba. El veredicto es `false` por cualquier camino; lo que cambia es el
 * motivo que el usuario lee, y leer «la ruta no es un nivel de envío» cuando lo
 * que pasa es que el paro está activo manda a arreglar lo que no está roto.
 */
test('con varias razones a la vez, manda la que el usuario tiene que atender primero', () => {
  const todoMal = {
    ruta: RECHAZADA_AUNQUE_REAL, sessionState: 'SHOW' as const, bajarDb: 99,
    nivelActualDb: NaN, conexionPermiteEscribir: false, paroDeEmergencia: true,
  };
  assert.match(motivo(decidir(todoMal)), /paro/);
  assert.match(motivo(decidir({ ...todoMal, paroDeEmergencia: false })), /conectada/);
  assert.match(motivo(decidir({ ...todoMal, paroDeEmergencia: false, conexionPermiteEscribir: true })),
    /no es un nivel de envío/);
  assert.match(motivo(decidir({
    ...todoMal, paroDeEmergencia: false, conexionPermiteEscribir: true, ruta: ACEPTADA,
  })), /público/);
});

/**
 * **La decisión que justifica la medición.** El asistente se niega a proponer
 * un nivel cuya ley nadie midió, en vez de escribir un número que sale de
 * extrapolar. Y dice hasta dónde está medida, con el nombre de la medición.
 */
test('no propone un nivel fuera del tramo que la ley declara medido', () => {
  const v = decidir({ nivelActualDb: TRAMO.fisicoMin + 1, bajarDb: 2 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /fuera del tramo/);
  assert.match(motivo(v), /ítem 104/);
  // **El tramo, en el orden en que se lee.** Exigiendo sólo que aparezca el piso,
  // intercambiar mínimo y máximo no rompía nada y el usuario leía «medida de 10.0
  // a −32.1 dB».
  assert.match(motivo(v), /medida de -?−?32\.1 a 10\.0 dB/);
});

test('el crudo que propone es el que la ley devuelve para los dB que declara', () => {
  const v = decidir({ nivelActualDb: 0, bajarDb: 2 });
  assert.ok(v.puede);
  if (!v.puede) return;
  const esperado = leyDeMentira.aRaw(base.ruta, -2);
  assert.ok(esperado.ok && Math.abs(v.crudo - esperado.raw) < 1e-12);
});

/**
 * **No sólo `NaN`.** La guarda pregunta por `Number.isFinite`, y con razón: un
 * infinito tampoco es un nivel del que se pueda bajar. Probando sólo `NaN`,
 * cambiarla por `Number.isNaN` no hacía caer nada --el infinito seguía fallando
 * más adelante, pero con otro motivo, que es lo que el usuario lee--.
 */
test('sin saber dónde está el envío, no hay desde dónde bajar', () => {
  for (const nivelActualDb of [NaN, Infinity, -Infinity]) {
    const v = decidir({ nivelActualDb });
    assert.equal(v.puede, false, `${nivelActualDb}`);
    assert.match(motivo(v), /no se sabe/, `${nivelActualDb}`);
  }
});
