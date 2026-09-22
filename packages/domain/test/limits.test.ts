import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PARAMETROS_POR_TRANSACCION, PACING_MS, Q_MINIMO_SALIDA, REALCE_MAXIMO_SALA_DB,
  correspondeExencionDeSistema, esOperacionDeSistema, maximoDeParametros, pacingMs,
  verificarLimite,
} from '../src/rules/limits.ts';

/**
 * Cada cambio lleva su ruta desde ADR-039, porque el tope es de la hoja y no
 * de la familia. Para estas familias sin hojas propias la ruta sólo tiene que
 * ser una de la familia; se usa una fija por familia para que el test diga lo
 * que mide y no una cadena inventada distinta en cada línea.
 */
const RUTA = {
  CHANNEL_FADER: 'i.3.mix', PREAMP_GAIN: 'hw.3.gain', MASTER_FADER: 'm.mix',
  FX: 'f.0.mix', HPF: 'i.3.eq.hpf.freq', CHANNEL_MUTE: 'i.3.mute',
  MONITOR_AUX_SEND: 'i.3.aux.1.value',
} as const;

/** Un movimiento en una familia que se cuenta en su propia unidad: desde 0. */
function mover(kind: keyof typeof RUTA, delta: number, resto: {
  acumuladoEnSesion?: number; hayMedicionPosterior?: boolean;
  esPrimerCambioDelParametro?: boolean; unidad?: string; nivelEstablecido?: boolean;
} = {}) {
  return verificarLimite({
    kind, path: RUTA[kind], magnitudEsperada: 0, magnitudPropuesta: delta,
    acumuladoEnSesion: resto.acumuladoEnSesion ?? 0,
    hayMedicionPosterior: resto.hayMedicionPosterior ?? true,
    esPrimerCambioDelParametro: resto.esPrimerCambioDelParametro ?? true,
    unidad: resto.unidad ?? 'dB',
    ...(resto.nivelEstablecido === undefined ? {} : { nivelEstablecido: resto.nivelEstablecido }),
  });
}

test('INV-004: un cambio dentro del límite se permite', () => {
  assert.equal(mover('CHANNEL_FADER', 2).permitido, true);
});

test('INV-004: un cambio que supera el límite por transacción se rechaza', () => {
  const r = mover('CHANNEL_FADER', 4);
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});

test('INV-004: tres cambios de tres decibeles no suman nueve', () => {
  // Cada uno cumple el límite por transacción. El tope acumulado es lo que
  // impide moverse nueve decibeles cumpliendo la regla tres veces.
  assert.equal(mover('CHANNEL_FADER', 3).permitido, true);
  assert.equal(
    mover('CHANNEL_FADER', 3, { acumuladoEnSesion: 3, esPrimerCambioDelParametro: false }).permitido,
    true,
  );
  const tercero = mover('CHANNEL_FADER', 3, { acumuladoEnSesion: 6, esPrimerCambioDelParametro: false });
  assert.equal(tercero.permitido, false);
  assert.equal(tercero.permitido === false && tercero.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: sin medición intermedia no se vuelve a mover el mismo parámetro', () => {
  const r = mover('CHANNEL_FADER', 1, {
    acumuladoEnSesion: 1, hayMedicionPosterior: false, esPrimerCambioDelParametro: false,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_MEDICION_INTERMEDIA');
});

test('un parámetro sin límite declarado no se escribe', () => {
  const r = mover('FX', 0.1);
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'SIN_LIMITE_DECLARADO');
});

test('INV-004: el fader general tiene el límite más estrecho', () => {
  assert.equal(mover('MASTER_FADER', 2).permitido, false);
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
  const retoque = { esPrimerCambioDelParametro: false };
  const volver = mover('CHANNEL_FADER', -3, { ...retoque, acumuladoEnSesion: 6 });
  assert.equal(volver.permitido, true);

  // Y sigue bloqueando el que se aleja mas alla del tope.
  const alejarse = mover('CHANNEL_FADER', 3, { ...retoque, acumuladoEnSesion: 6 });
  assert.equal(alejarse.permitido, false);
  if (!alejarse.permitido) assert.equal(alejarse.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: el tope es simetrico', () => {
  const retoque = { esPrimerCambioDelParametro: false };
  // -6 acumulado, -3 mas: quedaria en -9, fuera del tope de 6.
  assert.equal(mover('CHANNEL_FADER', -3, { ...retoque, acumuladoEnSesion: -6 }).permitido, false);
  // -6 acumulado, +3: vuelve hacia el inicio.
  assert.equal(mover('CHANNEL_FADER', 3, { ...retoque, acumuladoEnSesion: -6 }).permitido, true);
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
  // **Y desde ADR-039 la unidad que se compara es la de la MAGNITUD de la hoja,
  // no la del tope.** El pasa-altos se mide en hercios --su ley medida-- y se
  // acota en octavas; hasta ese dia la familia declaraba `octavas` como unidad
  // y con eso el tope no pudo correr nunca, porque una frecuencia honesta en
  // hercios no pasaba la puerta.
  const base = {
    kind: 'HPF' as const, path: RUTA.HPF, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  };
  // 100 -> 150 Hz son 0,585 octavas, dentro del tope de una.
  const enHercios = verificarLimite({
    ...base, magnitudEsperada: 100, magnitudPropuesta: 150, unidad: 'Hz',
  });
  assert.equal(enHercios.permitido, true);

  // Declarar octavas como unidad de la magnitud es decir otra cosa: la ley del
  // pasa-altos produce hercios.
  const enOctavas = verificarLimite({
    ...base, magnitudEsperada: 0, magnitudPropuesta: 0.5, unidad: 'octavas',
  });
  assert.equal(enOctavas.permitido, false);
  assert.equal(enOctavas.permitido === false && enOctavas.codigo, 'UNIDAD_NO_DECLARADA');

  const enDecibeles = verificarLimite({
    ...base, magnitudEsperada: 0, magnitudPropuesta: 0.5, unidad: 'dB',
  });
  assert.equal(enDecibeles.permitido, false);
  assert.equal(enDecibeles.permitido === false && enDecibeles.codigo, 'UNIDAD_NO_DECLARADA');

  // Y el silencio de canal, cuyo tope esta en CANALES: declarar dB ahi diria
  // que se silencian dos decibeles.
  const canales = mover('CHANNEL_MUTE', 1, { unidad: 'dB' });
  assert.equal(canales.permitido, false);
  assert.equal(canales.permitido === false && canales.codigo, 'UNIDAD_NO_DECLARADA');

  // **Lo que esto NO cierra**, y hay que decirlo: nada ata `magnitudPropuesta`
  // al `valorPropuesto` que va al cable. El motor juzga lo que el llamador
  // declara. Comparar la unidad hace que declarar mal sea un error visible en
  // vez de uno silencioso; atar la magnitud al crudo necesita las leyes de
  // conversion verificadas, y para el compresor la que habia quedo refutada.
});

test('INV-004: el pasa-altos se acota en octavas, no en hercios (ADR-039)', () => {
  // El tope de una octava del anexo B (2026-09-07) corre por primera vez. Y
  // corre en la moneda correcta: 100 -> 250 Hz son 1,32 octavas y se rechaza;
  // 4000 -> 7000 Hz son 3000 Hz de diferencia y 0,81 octavas, y pasa. Un tope
  // en hercios habria dicho lo contrario en los dos casos.
  const base = {
    kind: 'HPF' as const, path: RUTA.HPF, acumuladoEnSesion: 0, unidad: 'Hz',
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  };
  const grave = verificarLimite({ ...base, magnitudEsperada: 100, magnitudPropuesta: 250 });
  assert.equal(grave.permitido, false);
  assert.equal(grave.permitido === false && grave.codigo, 'DELTA_CAP');
  assert.ok(grave.permitido === false && grave.mensaje.includes('octavas'), grave.permitido === false ? grave.mensaje : '');

  const agudo = verificarLimite({ ...base, magnitudEsperada: 4000, magnitudPropuesta: 7000 });
  assert.equal(agudo.permitido, true, 'tres mil hercios arriba son menos de una octava');

  // El acumulado tambien en octavas: con 1,5 acumuladas, 0,6 mas se pasa de 2.
  const acumulado = verificarLimite({
    ...base, magnitudEsperada: 200, magnitudPropuesta: 303, acumuladoEnSesion: 1.5,
    esPrimerCambioDelParametro: false,
  });
  assert.equal(acumulado.permitido, false);
  assert.equal(acumulado.permitido === false && acumulado.codigo, 'CUMULATIVE_CAP');
  // Y volver hacia el origen --acumulado positivo, movimiento negativo-- pasa.
  const volver = verificarLimite({
    ...base, magnitudEsperada: 303, magnitudPropuesta: 200, acumuladoEnSesion: 1.5,
    esPrimerCambioDelParametro: false,
  });
  assert.equal(volver.permitido, true);
});

/**
 * El techo absoluto y la suspension del presupuesto, que son las dos mitades de
 * ADR-034 que viven en el dominio.
 *
 * **Las dos van juntas y por eso se prueban juntas.** ADR-034 no saco un freno:
 * cambio uno por otro. Probar la suspension sin probar el techo dejaria verde un
 * envio a monitor sin ningun tope sobre el total.
 */
const ENVIO = {
  kind: 'MONITOR_AUX_SEND' as const, path: RUTA.MONITOR_AUX_SEND, unidad: 'dB',
  hayMedicionPosterior: true,
};

test('INV-010: el envio a monitor no pasa de nominal, tenga nivel o no', () => {
  // Sin nivel establecido --poniendo el nivel-- y con nivel --retocando--: el
  // techo es del parametro y no de la operacion. Es la decision del usuario del
  // 2026-09-17, elegida entre tres opciones.
  for (const nivelEstablecido of [false, true]) {
    const enNominal = verificarLimite({
      ...ENVIO, magnitudEsperada: -2, magnitudPropuesta: 0, acumuladoEnSesion: 0,
      esPrimerCambioDelParametro: true, nivelEstablecido,
    });
    assert.equal(enNominal.permitido, true, `llegar a nominal entra (nivel: ${nivelEstablecido})`);

    const pasandose = verificarLimite({
      ...ENVIO, magnitudEsperada: -1.5, magnitudPropuesta: 0.5, acumuladoEnSesion: 0,
      esPrimerCambioDelParametro: true, nivelEstablecido,
    });
    assert.equal(pasandose.permitido, false, `pasar de nominal no (nivel: ${nivelEstablecido})`);
    assert.equal(pasandose.permitido === false && pasandose.codigo, 'TECHO_ABSOLUTO');
  }
});

test('INV-010: sin nivel establecido el presupuesto acumulado se suspende', () => {
  const rampa = verificarLimite({
    ...ENVIO, magnitudEsperada: -12, magnitudPropuesta: -10, acumuladoEnSesion: 20,
    esPrimerCambioDelParametro: false, nivelEstablecido: false,
  });
  assert.equal(rampa.permitido, true,
    'veintidos decibeles movidos y el tope es cuatro: poner el nivel no lo tiene');

  const retoque = verificarLimite({
    ...ENVIO, magnitudEsperada: -12, magnitudPropuesta: -10, acumuladoEnSesion: 20,
    esPrimerCambioDelParametro: false, nivelEstablecido: true,
  });
  assert.equal(retoque.permitido, false, 'retocar si lo tiene');
  assert.equal(retoque.permitido === false && retoque.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: la suspension del presupuesto no se concede sin un techo que la reemplace', () => {
  // La ganancia del previo no declara techo. Aunque alguien diga que su nivel no
  // esta establecido, el presupuesto sigue rigiendo: cambiar un freno por otro
  // exige que el otro exista.
  const r = verificarLimite({
    kind: 'PREAMP_GAIN', path: RUTA.PREAMP_GAIN, magnitudEsperada: -13, magnitudPropuesta: -10,
    acumuladoEnSesion: 6, hayMedicionPosterior: true, esPrimerCambioDelParametro: false,
    unidad: 'dB', nivelEstablecido: false,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'CUMULATIVE_CAP');
});

test('INV-004: sin declarar a cuanto quedaria, un parametro con techo se rechaza', () => {
  // Un techo no se comprueba contra un numero ausente. Dejarlo pasar seria tener
  // el tope escrito y no corriendo, que es el defecto de `techoPorRuta` antes de
  // tener productor y el de INV-034.
  //
  // Desde ADR-039 la magnitud propuesta es obligatoria y la ausencia llega como
  // `undefined`, que no es un numero: cae por `MAGNITUD_NO_NUMERICA` en vez de
  // por un codigo propio. El veredicto es el mismo.
  const r = verificarLimite({
    ...ENVIO, magnitudEsperada: -2, magnitudPropuesta: undefined as unknown as number,
    acumuladoEnSesion: 0, esPrimerCambioDelParametro: true,
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'MAGNITUD_NO_NUMERICA');
});

test('INV-004: sin nivel establecido, el tope POR TRANSACCION sigue corriendo', () => {
  // Lo que ADR-034 suspende es el acumulado, no el salto. Los 2 dB por paso son
  // lo que protege al musico de un susto, y son la razon por la que poner el
  // nivel es necesariamente una rampa y no un salto.
  const r = verificarLimite({
    ...ENVIO, magnitudEsperada: -16, magnitudPropuesta: -10, acumuladoEnSesion: 0,
    esPrimerCambioDelParametro: true, nivelEstablecido: false,
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
    kind: 'PREAMP_GAIN', path: RUTA.PREAMP_GAIN, hayMedicionPosterior: true,
    esPrimerCambioDelParametro: true, unidad: 'dB',
  } as const;

  const porElDestino = verificarLimite({
    ...base, magnitudEsperada: 0, magnitudPropuesta: NaN, acumuladoEnSesion: 0,
  });
  assert.equal(porElDestino.permitido, false, 'un destino NaN pasaba el tope por transaccion');
  assert.equal(porElDestino.permitido === false && porElDestino.codigo, 'MAGNITUD_NO_NUMERICA');

  const porElOrigen = verificarLimite({
    ...base, magnitudEsperada: NaN, magnitudPropuesta: 1, acumuladoEnSesion: 0,
  });
  assert.equal(porElOrigen.permitido, false, 'un origen NaN hace NaN al movimiento');
  assert.equal(porElOrigen.permitido === false && porElOrigen.codigo, 'MAGNITUD_NO_NUMERICA');

  const porElAcumulado = verificarLimite({
    ...base, magnitudEsperada: 0, magnitudPropuesta: 1, acumuladoEnSesion: NaN,
  });
  assert.equal(porElAcumulado.permitido, false, 'un acumulado NaN pasaba el presupuesto');

  const porElTecho = verificarLimite({
    ...ENVIO, magnitudEsperada: 0, magnitudPropuesta: NaN, acumuladoEnSesion: 0,
    esPrimerCambioDelParametro: true,
  });
  assert.equal(porElTecho.permitido, false, 'un destino NaN pasaba el techo de nominal');
});

test('INV-004: un movimiento infinito lo sigue frenando el tope, como antes', () => {
  // Solo se tapo `NaN`. Un delta infinito ya lo rechazaba el tope por
  // transaccion, y eso es lo correcto mientras nadie sepa proponer un salto
  // desde el silencio: cuando ADR-034 lo construya, la excepcion va a ser
  // deliberada y con su nombre, no un agujero heredado.
  const r = mover('PREAMP_GAIN', Infinity);
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'DELTA_CAP');
});

test('INV-004: lo que no es un numero tampoco pasa, no solo NaN', () => {
  // La primera version de esta guarda miraba solo `NaN`, y una auditoria del
  // mismo dia midio que `null`, `[]` y `{}` pasaban el techo igual --`null > 0`
  // es false-- y que una cadena hacia estallar el mensaje del rechazo con un
  // `TypeError` desde `.toFixed`. Se tapo NaN y quedo abierto el vecino.
  for (const raro of [null, [], {}, '5', true]) {
    const r = verificarLimite({
      ...ENVIO, magnitudEsperada: 0, magnitudPropuesta: raro as unknown as number,
      acumuladoEnSesion: 0, esPrimerCambioDelParametro: true,
    });
    assert.equal(r.permitido, false, `${JSON.stringify(raro)} tiene que rechazarse`);
    assert.equal(r.permitido === false && r.codigo, 'MAGNITUD_NO_NUMERICA');
  }
});

test('INV-004: una escala que no puede contar el movimiento rechaza', () => {
  // Dos numeros que si lo son y una conversion que no: log2 de un cociente
  // negativo. Una frecuencia negativa no existe, pero un llamador roto puede
  // declararla, y `NaN` en el movimiento pasaria todos los topes igual que en
  // la magnitud.
  const r = verificarLimite({
    kind: 'HPF', path: RUTA.HPF, magnitudEsperada: 100, magnitudPropuesta: -100,
    acumuladoEnSesion: 0, hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
    unidad: 'Hz',
  });
  assert.equal(r.permitido, false);
  assert.equal(r.permitido === false && r.codigo, 'MAGNITUD_NO_NUMERICA');
});
