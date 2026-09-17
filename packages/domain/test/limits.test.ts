import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PARAMETROS_POR_TRANSACCION, PACING_MS, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
  correspondeExencionDeSistema, esOperacionDeSistema, maximoDeParametros, pacingMs,
  verificarLimite,
} from '../src/rules/limits.ts';

test('INV-004: un cambio dentro del límite se permite', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 2, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, true);
});

test('INV-004: un cambio que supera el límite por transacción se rechaza', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 4, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});

test('INV-004: tres cambios de tres decibeles no suman nueve', () => {
  // Cada uno cumple el límite por transacción. El tope acumulado es lo que
  // impide moverse nueve decibeles cumpliendo la regla tres veces.
  const primero = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(primero.permitido, true);

  const segundo = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 3,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false, unidad: 'dB',
  });
  assert.equal(segundo.permitido, true);

  const tercero = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 3, acumuladoEnSesion: 6,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false, unidad: 'dB',
  });
  assert.equal(tercero.permitido, false);
  assert.equal(tercero.permitido === false && tercero.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: sin medición intermedia no se vuelve a mover el mismo parámetro', () => {
  const r = verificarLimite({
    kind: 'CHANNEL_FADER', deltaSolicitado: 1, acumuladoEnSesion: 1,
    hayMedicionPosterior: false, esPrimerCambioDelParametro: false, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_MEDICION_INTERMEDIA');
});

test('un parámetro sin límite declarado no se escribe', () => {
  const r = verificarLimite({
    kind: 'FX', deltaSolicitado: 0.1, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_LIMITE_DECLARADO');
});

test('INV-004: el fader general tiene el límite más estrecho', () => {
  const r = verificarLimite({
    kind: 'MASTER_FADER', deltaSolicitado: 2, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
});

test('INV-005: el modo automático permite un solo parámetro por transacción', () => {
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.AUTO, 1);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.ASSISTED, 4);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.SUGGEST, 0);
  assert.equal(MAX_PARAMETROS_POR_TRANSACCION.OBSERVE, 0);
});

test('INV-005: las transacciones de sistema tienen un ritmo más rápido', () => {
  // Seleccionar un canal en el bus exige 24 escrituras: a 100 ms cada una no
  // entra en el tiempo de conmutación exigido.
  assert.equal(pacingMs('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']), 20);
  assert.equal(pacingMs('ASSISTED'), 100);
  assert.equal(pacingMs('AUTO'), 100);
  assert.ok(24 * pacingMs('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']) < 1000,
    'veinticuatro envíos entran en un segundo');
});

test('INV-005: una operación que no es de sistema no se lleva la exención', () => {
  // La exención se deriva del tipo de operación y no de una bandera que quien
  // propone pueda encender: pedirla no puede ser tan fácil como merecerla.
  assert.equal(pacingMs('ASSISTED', 'BALANCE_DE_COROS'), 100);
  assert.equal(maximoDeParametros('ASSISTED', 'BALANCE_DE_COROS'), 4);
  assert.equal(esOperacionDeSistema('BALANCE_DE_COROS'), false);
  assert.equal(esOperacionDeSistema(undefined), false);
});

test('INV-005: las de sistema quedan exentas del límite de cuatro', () => {
  // Es la cláusula que no se podía ni expresar: el máximo se resolvía solo por
  // nivel de autonomía, así que una transacción de sistema de veinticuatro
  // envíos se rechazaba entera.
  assert.equal(maximoDeParametros('ASSISTED'), 4);
  assert.equal(maximoDeParametros('AUTO'), 1);
  assert.equal(
    maximoDeParametros('ASSISTED', 'ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']),
    Number.POSITIVE_INFINITY);
  assert.equal(
    maximoDeParametros('AUTO', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']),
    Number.POSITIVE_INFINITY);
});

test('los límites de ecualización de sala favorecen atenuar sobre realzar', () => {
  assert.equal(REALCE_MAXIMO_SALA_DB, 2);
  assert.equal(Q_MINIMO_SALIDA, 0.7);
});

test('INV-004: el tope acumulado no bloquea el movimiento que deshace', () => {
  // Antes sumaba magnitudes, asi que con +6 dB acumulados rechazaba un -3 dB
  // que dejaria el parametro en +3, dentro del tope. La regla prohibia
  // justamente la unica direccion segura: la que devuelve el parametro hacia
  // donde estaba.
  const base = {
    kind: 'CHANNEL_FADER' as const,
    hayMedicionPosterior: true,
    esPrimerCambioDelParametro: false,
    unidad: 'dB',
  };
  const volver = verificarLimite({ ...base, deltaSolicitado: -3, acumuladoEnSesion: 6 });
  assert.equal(volver.permitido, true);

  // Y sigue bloqueando el que se aleja mas alla del tope.
  const alejarse = verificarLimite({ ...base, deltaSolicitado: 3, acumuladoEnSesion: 6 });
  assert.equal(alejarse.permitido, false);
  if (!alejarse.permitido) assert.equal(alejarse.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: el tope es simetrico', () => {
  const base = {
    kind: 'CHANNEL_FADER' as const,
    hayMedicionPosterior: true,
    esPrimerCambioDelParametro: false,
    unidad: 'dB',
  };
  // -6 acumulado, -3 mas: quedaria en -9, fuera del tope de 6.
  assert.equal(
    verificarLimite({ ...base, deltaSolicitado: -3, acumuladoEnSesion: -6 }).permitido,
    false,
  );
  // -6 acumulado, +3: vuelve hacia el inicio.
  assert.equal(
    verificarLimite({ ...base, deltaSolicitado: 3, acumuladoEnSesion: -6 }).permitido,
    true,
  );
});

test('INV-005: la exencion se decide por lo que se toca, no por como se llama', () => {
  // `tipoDeOperacion` es una cadena libre que provee quien propone la
  // transaccion. Sin cruzarla con las clases reales -- las que salen de la
  // ruta -- pedir la exencion era tan facil como escribir su nombre.
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', ['PA_BUS_MUTE']), true);
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', ['CHANNEL_FADER']), false);
  assert.equal(correspondeExencionDeSistema('ANALYSIS_BUS_SELECT', ['ANALYSIS_BUS_SEND']), true);
  assert.equal(correspondeExencionDeSistema('ANALYSIS_BUS_SELECT', ['CHANNEL_FADER']), false);
  // Mezclar uno permitido con uno que no: no alcanza con que haya alguno.
  assert.equal(
    correspondeExencionDeSistema('MUTE_COMPONENTE', ['PA_BUS_MUTE', 'CHANNEL_FADER']), false);
});

test('INV-005: sin cambios no hay exencion, y una etiqueta inventada tampoco', () => {
  assert.equal(correspondeExencionDeSistema('MUTE_COMPONENTE', []), false);
  assert.equal(correspondeExencionDeSistema('NO_EXISTE', ['PA_BUS_MUTE']), false);
  assert.equal(correspondeExencionDeSistema(undefined, ['PA_BUS_MUTE']), false);
  // La calibracion no declara todavia que parametro de consola toca, asi que
  // su etiqueta no concede nada.
  assert.equal(correspondeExencionDeSistema('CALIBRACION', ['PA_BUS_MUTE']), false);
});

test('INV-005: el ritmo y el maximo siguen a la exencion', () => {
  assert.equal(pacingMs('ASSISTED', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']), 20);
  assert.equal(pacingMs('ASSISTED', 'MUTE_COMPONENTE', ['CHANNEL_FADER']), 100);
  assert.equal(
    maximoDeParametros('ASSISTED', 'MUTE_COMPONENTE', ['PA_BUS_MUTE']),
    Number.POSITIVE_INFINITY);
  assert.equal(maximoDeParametros('ASSISTED', 'MUTE_COMPONENTE', ['CHANNEL_FADER']), 4);
});

test('INV-004: un tope no se compara contra un numero de otra especie', () => {
  // **La mitad que faltaba del episodio de INV-004.** La otra --comparar
  // decibeles contra crudo-- se cerro el 2026-09-11 haciendo obligatorias las
  // magnitudes. Esta la encontro una auditoria de seguridad el 2026-09-12: el
  // campo `unidad` existia, se copiaba al diario, y lo unico que hacia era
  // aparecer en los mensajes de error. Nadie lo comparaba contra el tope.
  //
  // El filtro pasa-altos tiene su tope en OCTAVAS y vale 1. Un llamador que
  // declare decibeles esta diciendo otra cosa, y 0,5 dB pasaba el tope de una
  // octava porque 0,5 < 1.
  const enOctavas = verificarLimite({
    kind: 'HPF', deltaSolicitado: 0.5, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'octavas',
  });
  assert.equal(enOctavas.permitido, true);

  const enDecibeles = verificarLimite({
    kind: 'HPF', deltaSolicitado: 0.5, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(enDecibeles.permitido, false);
  assert.equal(enDecibeles.permitido === false && enDecibeles.codigo, 'UNIDAD_NO_DECLARADA');

  // Y el silencio de canal, cuyo tope esta en CANALES: declarar dB ahi diria
  // que se silencian dos decibeles.
  const canales = verificarLimite({
    kind: 'CHANNEL_MUTE', deltaSolicitado: 1, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(canales.permitido, false);
  assert.equal(canales.permitido === false && canales.codigo, 'UNIDAD_NO_DECLARADA');

  // **Lo que esto NO cierra**, y hay que decirlo: nada ata `magnitudPropuesta`
  // al `valorPropuesto` que va al cable. El motor juzga lo que el llamador
  // declara. Comparar la unidad hace que declarar mal sea un error visible en
  // vez de uno silencioso; atar la magnitud al crudo necesita las leyes de
  // conversion verificadas, y para el compresor la que habia quedo refutada.
});

/**
 * El techo absoluto y la suspension del presupuesto, que son las dos mitades de
 * ADR-034 que viven en el dominio.
 *
 * **Las dos van juntas y por eso se prueban juntas.** ADR-034 no saco un freno:
 * cambio uno por otro. Probar la suspension sin probar el techo dejaria verde un
 * envio a monitor sin ningun tope sobre el total.
 */
test('INV-010: el envio a monitor no pasa de nominal, tenga nivel o no', () => {
  // Sin nivel establecido --poniendo el nivel-- y con nivel --retocando--: el
  // techo es del parametro y no de la operacion. Es la decision del usuario del
  // 2026-09-17, elegida entre tres opciones.
  for (const nivelEstablecido of [false, true]) {
    const enNominal = verificarLimite({
      kind: 'MONITOR_AUX_SEND', deltaSolicitado: 2, acumuladoEnSesion: 0,
      hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
      magnitudResultante: 0, nivelEstablecido,
    });
    assert.equal(enNominal.permitido, true, `llegar a nominal entra (nivel: ${nivelEstablecido})`);

    const pasandose = verificarLimite({
      kind: 'MONITOR_AUX_SEND', deltaSolicitado: 2, acumuladoEnSesion: 0,
      hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
      magnitudResultante: 0.5, nivelEstablecido,
    });
    assert.equal(pasandose.permitido, false, `pasar de nominal no (nivel: ${nivelEstablecido})`);
    assert.equal(pasandose.permitido === false && pasandose.codigo, 'TECHO_ABSOLUTO');
  }
});

test('INV-010: sin nivel establecido el presupuesto acumulado se suspende', () => {
  const rampa = verificarLimite({
    kind: 'MONITOR_AUX_SEND', deltaSolicitado: 2, acumuladoEnSesion: 20,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false, unidad: 'dB',
    magnitudResultante: -10, nivelEstablecido: false,
  });
  assert.equal(rampa.permitido, true,
    'veintidos decibeles movidos y el tope es cuatro: poner el nivel no lo tiene');

  const retoque = verificarLimite({
    kind: 'MONITOR_AUX_SEND', deltaSolicitado: 2, acumuladoEnSesion: 20,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false, unidad: 'dB',
    magnitudResultante: -10, nivelEstablecido: true,
  });
  assert.equal(retoque.permitido, false, 'retocar si lo tiene');
  assert.equal(retoque.permitido === false && retoque.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: la suspension del presupuesto no se concede sin un techo que la reemplace', () => {
  // La ganancia del previo no declara techo. Aunque alguien diga que su nivel no
  // esta establecido, el presupuesto sigue rigiendo: cambiar un freno por otro
  // exige que el otro exista.
  const r = verificarLimite({
    kind: 'PREAMP_GAIN', deltaSolicitado: 3, acumuladoEnSesion: 6,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: false, unidad: 'dB',
    magnitudResultante: -10, nivelEstablecido: false,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: sin declarar a cuanto quedaria, un parametro con techo se rechaza', () => {
  // Un techo no se comprueba contra un numero ausente. Dejarlo pasar seria tener
  // el tope escrito y no corriendo, que es el defecto de `techoPorRuta` antes de
  // tener productor y el de INV-034.
  const r = verificarLimite({
    kind: 'MONITOR_AUX_SEND', deltaSolicitado: 2, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_MAGNITUD_RESULTANTE');
});

test('INV-004: sin nivel establecido, el tope POR TRANSACCION sigue corriendo', () => {
  // Lo que ADR-034 suspende es el acumulado, no el salto. Los 2 dB por paso son
  // lo que protege al musico de un susto, y son la razon por la que poner el
  // nivel es necesariamente una rampa y no un salto.
  const r = verificarLimite({
    kind: 'MONITOR_AUX_SEND', deltaSolicitado: 6, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
    magnitudResultante: -10, nivelEstablecido: false,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});

/**
 * El agujero del numero que no es un numero, comprobado el 2026-09-17.
 *
 * Toda comparacion con `NaN` da `false`, asi que `Math.abs(NaN) > tope` es
 * `false` y lo mismo el acumulado y el techo: **un cambio que declarara `NaN` en
 * su magnitud pasaba INV-004 entera**. No estaba expuesto --los dos servicios de
 * produccion calculan magnitudes finitas-- y el motor es justamente la pieza que
 * no puede depender de que quien lo llama haga las cosas bien.
 */
test('INV-004: una magnitud que no es un numero no pasa ningun tope', () => {
  const base = {
    kind: 'PREAMP_GAIN', hayMedicionPosterior: true,
    esPrimerCambioDelParametro: true, unidad: 'dB',
  } as const;

  const porElMovimiento = verificarLimite({ ...base, deltaSolicitado: NaN, acumuladoEnSesion: 0 });
  assert.equal(porElMovimiento.permitido, false, 'un movimiento NaN pasaba el tope por transaccion');
  assert.equal(porElMovimiento.permitido === false && porElMovimiento.codigo, 'MAGNITUD_NO_NUMERICA');

  const porElAcumulado = verificarLimite({ ...base, deltaSolicitado: 1, acumuladoEnSesion: NaN });
  assert.equal(porElAcumulado.permitido, false, 'un acumulado NaN pasaba el presupuesto');

  const porElTecho = verificarLimite({
    kind: 'MONITOR_AUX_SEND', hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
    unidad: 'dB', deltaSolicitado: 1, acumuladoEnSesion: 0, magnitudResultante: NaN,
  });
  assert.equal(porElTecho.permitido, false, 'un destino NaN pasaba el techo de nominal');
});

test('INV-004: un movimiento infinito lo sigue frenando el tope, como antes', () => {
  // Solo se tapo `NaN`. Un delta infinito ya lo rechazaba el tope por
  // transaccion, y eso es lo correcto mientras nadie sepa proponer un salto
  // desde el silencio: cuando ADR-034 lo construya, la excepcion va a ser
  // deliberada y con su nombre, no un agujero heredado.
  const r = verificarLimite({
    kind: 'PREAMP_GAIN', deltaSolicitado: Infinity, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true, unidad: 'dB',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});
