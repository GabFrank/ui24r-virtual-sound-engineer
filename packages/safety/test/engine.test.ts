import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/engine.ts';
import type { CambioPropuesto } from '../src/types.ts';
import { contexto , crudoDeEnvio } from './helpers.ts';
import type { ContextoSeguridad } from '../src/types.ts';

const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };

const fader = (valor: number, esperado = -6): CambioPropuesto => ({
  kind: 'CHANNEL_FADER', path: 'i.3.mix', unidad: 'dB',
  valorPropuesto: valor, valorEsperado: esperado,
  magnitudPropuesta: valor, magnitudEsperada: esperado,
});

function motivos(v: ReturnType<SafetyEngine['evaluar']>): string[] {
  return v.permitido ? [] : v.rechazos.map((r) => r.invariante);
}

test('un cambio razonable pasa', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-4)], contexto(), ok);
  assert.equal(v.permitido, true);
});

// **Este test decía «un envío de monitor nunca se escribe» y lo abrió ADR-028.**
// El usuario lo autorizó eligiendo «Sí, y también para el ajuste normal de
// monitores», y se abrió recién cuando la ley del envío quedó medida: sin ella
// no se puede declarar un límite en decibeles, que es lo que INV-004 exige.
//
// Lo que queda protegido no es «nunca»: es el techo que puso el usuario y el
// show. Los tres tests de abajo fijan eso.
test('ADR-028: un envío de monitor se puede ajustar durante el soundcheck', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-6), valorEsperado: crudoDeEnvio(-7),
    magnitudPropuesta: -6, magnitudEsperada: -7,
  }], contexto(), ok);
  assert.equal(v.permitido, true, motivos(v).join(', '));
});

test('ADR-028: la lista blanca exige la forma canonica y el rango real', () => {
  const e = new SafetyEngine();
  const pedir = (path: string, ctx = contexto()) => e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path, unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-6), valorEsperado: crudoDeEnvio(-7),
    magnitudPropuesta: -6, magnitudEsperada: -7,
  }], ctx, ok);

  // **Los cuatro que pasaban.** La guarda era `/^i\.\d+\.aux\.\d+\.value$/`,
  // con `\d+` sin cota, y una auditoria midio lo que dejaba entrar. Escribir a
  // una ruta que la consola no publica es escribir a ciegas, que es la razon por
  // la que el motor rechaza una ruta desconocida.
  for (const path of [
    'i.24.aux.0.value',                 // esta consola tiene 24 canales: 0 a 23
    'i.99.aux.99.value',
    'i.03.aux.1.value',                 // cero a la izquierda
    'i.0003.aux.0000000001.value',
    'i.3.aux.10.value',                 // hay 10 auxiliares: 0 a 9
  ]) {
    assert.equal(pedir(path).permitido, false, `${path} no tendria que pasar`);
  }

  // Y los extremos canonicos sI pasan: si esto falla, la guarda cerro de mas.
  for (const path of ['i.0.aux.0.value', 'i.23.aux.9.value']) {
    const v = pedir(path);
    assert.equal(v.permitido, true, `${path}: ${motivos(v).join(', ')}`);
  }
});

test('ADR-028: un alias con ceros no esquiva el techo de la ruta real', () => {
  const e = new SafetyEngine();
  // **El hallazgo que justifica la forma canonica.** `techoPorRuta`,
  // `acumuladoPorRuta` y `rutasYaTocadas` se indexan por la cadena cruda. Con la
  // guarda vieja, un techo puesto en `i.3.aux.1.value` no protegia nada contra
  // `i.03.aux.1.value`: es la MISMA ruta que suena en la sala, alcanzada por una
  // clave que el estado por ruta no reconoce. Pasaba pidiendo 0 dB contra un
  // techo de -6.
  const ctx = contexto({ techoPorRuta: new Map([['i.3.aux.1.value', -6]]) });
  const porElAlias = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.03.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(0), valorEsperado: crudoDeEnvio(-6),
    magnitudPropuesta: 0, magnitudEsperada: -6,
  }], ctx, ok);
  assert.equal(porElAlias.permitido, false);
  assert.ok(motivos(porElAlias).includes('INV-010'));
});

test('ADR-028: el envío de monitor no sube más allá de donde estaba', () => {
  const e = new SafetyEngine();
  // El usuario: «Hasta donde estaba antes de que yo lo bajara, y ni un paso más».
  const ctx = contexto({ techoPorRuta: new Map([['i.3.aux.1.value', -6]]) });
  const subirDeMas = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-5), valorEsperado: crudoDeEnvio(-6),
    magnitudPropuesta: -5, magnitudEsperada: -6,
  }], ctx, ok);
  assert.equal(subirDeMas.permitido, false);
  assert.ok(motivos(subirDeMas).includes('INV-010'));

  // Hasta el techo exacto, sí: «hasta donde estaba» lo incluye.
  const justo = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-6), valorEsperado: crudoDeEnvio(-7),
    magnitudPropuesta: -6, magnitudEsperada: -7,
  }], ctx, ok);
  assert.equal(justo.permitido, true, motivos(justo).join(', '));

  // Y bajar no tiene techo: la asimetría es del usuario y es deliberada.
  const bajar = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-8), valorEsperado: crudoDeEnvio(-7),
    magnitudPropuesta: -8, magnitudEsperada: -7,
  }], ctx, ok);
  assert.equal(bajar.permitido, true, motivos(bajar).join(', '));
});

test('ADR-028: el envío de monitor no se toca durante el show', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-6), valorEsperado: crudoDeEnvio(-7),
    magnitudPropuesta: -6, magnitudEsperada: -7,
  }], contexto({ sessionState: 'SHOW' }), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-010'));
});

test('INV-008: el fader general tampoco', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MASTER_FADER', path: 'm.mix', unidad: 'dB',
    valorPropuesto: 0, valorEsperado: -1,
  magnitudPropuesta: 0, magnitudEsperada: -1,
  }], contexto(), ok);
  assert.equal(v.permitido, false);
});

test('INV-004: un salto grande se rechaza', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(2, -6)], contexto(), ok); // ocho decibeles
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-004'));
});

test('INV-004: el acumulado de la sesión también cuenta', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-3, -6)], contexto({
    acumuladoPorRuta: new Map([['i.3.mix', 5]]),
    rutasYaTocadas: new Set(['i.3.mix']),
    rutasConMedicionPosterior: new Set(['i.3.mix']),
  }), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-004'));
});

test('INV-004: sin medición intermedia no se vuelve a mover el mismo parámetro', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-5, -6)], contexto({
    rutasYaTocadas: new Set(['i.3.mix']),
    rutasConMedicionPosterior: new Set(),
  }), ok);
  assert.equal(v.permitido, false);
  assert.match(
    v.permitido === false ? v.rechazos[0]!.mensaje : '',
    /comprobar el efecto/,
  );
});

test('INV-006: la ganancia solo se toca en configuración de canales', () => {
  const e = new SafetyEngine();
  const gain: CambioPropuesto = {
    kind: 'PREAMP_GAIN', path: 'hw.3.gain', unidad: 'dB',
    valorPropuesto: 32, valorEsperado: 30,
  magnitudPropuesta: 32, magnitudEsperada: 30,
  };
  assert.equal(e.evaluar([gain], contexto({ sessionState: 'CHANNEL_SETUP' }), ok).permitido, true);
  assert.equal(e.evaluar([gain], contexto({ sessionState: 'SHOW' }), ok).permitido, false);
  assert.equal(e.evaluar([gain], contexto({ sessionState: 'MIX' }), ok).permitido, false);
});

test('INV-006: con una toma grabada, la ganancia queda congelada', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'PREAMP_GAIN', path: 'hw.3.gain', unidad: 'dB',
    valorPropuesto: 32, valorEsperado: 30,
  magnitudPropuesta: 32, magnitudEsperada: 30,
  }], contexto({ hayTakeDeSoundcheckActivo: true }), ok);
  assert.equal(v.permitido, false);
  assert.match(
    v.permitido === false ? v.rechazos.map((r) => r.mensaje).join(' ') : '',
    /posterior al preamplificador/,
  );
});

test('INV-005: el modo automático admite un solo parámetro', () => {
  const e = new SafetyEngine();
  const dos = [fader(-5), { ...fader(-5), path: 'i.4.mix' }];
  assert.equal(e.evaluar(dos, contexto({ nivelAutonomia: 'ASSISTED' }), ok).permitido, true);
  const v = e.evaluar(dos, contexto({ nivelAutonomia: 'AUTO' }), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-005'));
});

test('INV-024: el modo automático exige confianza alta', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-5)], contexto({
    nivelAutonomia: 'AUTO', confianza: 'MEDIUM',
  }), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-024'));
});

test('INV-025: el modo asistido exige aprobación explícita', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-5)], contexto({ aprobacionExplicita: false }), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-025'));
});

test('INV-001: sin instantánea verificada no se escribe', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-5)], contexto(), {
    conexionPermiteEscribir: true, snapshotVerificado: false,
  });
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-001'));
});

test('INV-017: con la conexión caída no se escribe', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-5)], contexto(), {
    conexionPermiteEscribir: false, snapshotVerificado: true,
  });
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-017'));
});

test('INV-019: con el paro activo no pasa ninguna escritura normal', () => {
  const e = new SafetyEngine();
  e.bloquear();
  const v = e.evaluar([fader(-5)], contexto(), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-019'));
  e.desbloquear();
  assert.equal(e.evaluar([fader(-5)], contexto(), ok).permitido, true);
});

test('INV-019: las escrituras de seguridad se reconocen aparte', () => {
  const e = new SafetyEngine();
  assert.equal(e.esDeSeguridad('MEDIA_STOP'), true);
  assert.equal(e.esDeSeguridad('ROLLBACK'), true);
  assert.equal(e.esDeSeguridad('CHANNEL_FADER'), false);
});

test('INV-008: la ecualización de salida solo va a los buses declarados', () => {
  const e = new SafetyEngine();
  const permitido: CambioPropuesto = {
    kind: 'OUTPUT_EQ', path: 'm.eq.peak.l.12', unidad: 'dB',
    valorPropuesto: -2, valorEsperado: 0,
  magnitudPropuesta: -2, magnitudEsperada: 0,
  };
  assert.equal(e.evaluar([permitido], contexto(), ok).permitido, true);

  const otroBus = { ...permitido, path: 'a.5.eq.peak.12' };
  const v = e.evaluar([otroBus], contexto(), ok);
  assert.equal(v.permitido, false);
  assert.match(
    v.permitido === false ? v.rechazos.map((r) => r.mensaje).join(' ') : '',
    /no está entre los buses de salida declarados/,
  );
});

test('se devuelven todos los motivos, no solo el primero', () => {
  // Quien propuso el cambio necesita ver los tres problemas de una vez:
  // arreglar uno y volver a chocar con el siguiente es lento y frustrante.
  const e = new SafetyEngine();
  const v = e.evaluar([fader(4, -6)], contexto({
    nivelAutonomia: 'AUTO', confianza: 'LOW',
  }), { conexionPermiteEscribir: false, snapshotVerificado: false });
  assert.equal(v.permitido, false);
  const invs = motivos(v);
  assert.ok(invs.includes('INV-017'));
  assert.ok(invs.includes('INV-001'));
  assert.ok(invs.includes('INV-024'));
  assert.ok(invs.includes('INV-004'));
});

test('cada rechazo cita la invariante que lo motiva', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(4, -6)], contexto(), ok);
  assert.equal(v.permitido, false);
  for (const r of v.permitido === false ? v.rechazos : []) {
    assert.match(r.invariante, /^INV-\d{3}$/, 'para poder buscarlo en la documentación');
    assert.ok(r.mensaje.length > 20, 'el mensaje explica, no solo nombra');
  }
});

// --- Coherencia entre la ruta y la clase declarada ---

test('INV-008: una ruta de auxiliar de monitor no pasa aunque se declare como fader', () => {
  // El agujero que motiva el clasificador: una auditoria ejecuto el motor con
  // exactamente estos datos y obtuvo permitido true.
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'CHANNEL_FADER', path: 'i.3.aux.1.value', unidad: 'dB',
      valorPropuesto: -6, valorEsperado: -9,
  magnitudPropuesta: -6, magnitudEsperada: -9,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos[0]?.codigo, 'RUTA_INCONSISTENTE');
    assert.equal(v.rechazos[0]?.invariante, 'INV-008');
  }
});

test('INV-008: una ruta que el dominio no sabe clasificar se rechaza', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'CHANNEL_FADER', path: 'i.1.inventado', unidad: 'dB',
      valorPropuesto: -6, valorEsperado: -9,
  magnitudPropuesta: -6, magnitudEsperada: -9,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) assert.equal(v.rechazos[0]?.codigo, 'RUTA_DESCONOCIDA');
});

test('una ruta coherente con su clase sigue pasando', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'CHANNEL_FADER', path: 'i.3.mix', unidad: 'dB',
      valorPropuesto: -6, valorEsperado: -9,
  magnitudPropuesta: -6, magnitudEsperada: -9,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, true);
});

// --- Lista blanca del paro de emergencia ---

test('INV-019: con el paro activo, un retroceso pasa y un cambio normal no', () => {
  // La lista blanca estaba escrita y no la consultaba nadie: el motor
  // rechazaba todo, incluido el retroceso. Funcionaba durante el paro solo
  // porque el retroceso no pasaba por el motor, que no es lo mismo.
  const motor = new SafetyEngine();
  motor.bloquear();
  const cambio = [{
    kind: 'CHANNEL_FADER' as const, path: 'i.3.mix', unidad: 'dB',
    valorPropuesto: -6, valorEsperado: -9,
  magnitudPropuesta: -6, magnitudEsperada: -9,
  }];
  const opciones = { conexionPermiteEscribir: true, snapshotVerificado: true };

  const normal = motor.evaluar(cambio, contexto(), opciones);
  assert.equal(normal.permitido, false);
  if (!normal.permitido) {
    assert.equal(normal.rechazos.some((r) => r.codigo === 'BLOQUEADO'), true);
  }

  const retroceso = motor.evaluar(cambio, contexto(), {
    ...opciones, tipoDeOperacion: 'ROLLBACK',
  });
  assert.equal(retroceso.permitido, true);
});

// --- Q mínimo y realce máximo en buses de salida ---

test('INV-004: un filtro estrecho en un bus PARAMETRICO se rechaza', () => {
  // La ruta es paramétrica a propósito. Sobre esta consola no existe un
  // ecualizador de salida así, pero la cláusula de INV-004 sigue teniendo
  // sentido para uno que lo tenga, y el test dice cuál es la forma que la
  // dispara.
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.b3.gain', unidad: 'dB',
      valorPropuesto: -3, valorEsperado: 0,
  magnitudPropuesta: -3, magnitudEsperada: 0, q: 0.4,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos.some((r) => r.codigo === 'Q_DEMASIADO_ESTRECHO'), true);
  }
});

test('INV-004: sobre el grafico de la Ui24R la clausula de Q no puede disparar', () => {
  // **El hallazgo, fijado para que no se olvide.** El ecualizador de salida de
  // esta consola es un grafico de 31 bandas: no tiene factor de calidad, asi que
  // `q` es `undefined` siempre y la regla no se ejecuta nunca. Es la forma nueva
  // de «la constante que nadie consulta»: acá es «la condicion que nunca se
  // cumple».
  //
  // Lo que SI protege contra el mismo peligro en un grafico es el realce
  // maximo, y eso lo cubre el test de al lado. Este test existe para que quien
  // lea INV-004 no crea que esta cubierta en este aparato.
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.peak.l.12', unidad: 'dB',
      valorPropuesto: -3, valorEsperado: 0,
  magnitudPropuesta: -3, magnitudEsperada: 0, q: 0.4,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, true, 'una atenuacion en una banda del grafico pasa');
});

test('INV-004: la correccion de sala atenua, no realza', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.peak.l.12', unidad: 'dB',
      valorPropuesto: 3, valorEsperado: 0,
  magnitudPropuesta: 3, magnitudEsperada: 0, q: 1.4,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos.some((r) => r.codigo === 'REALCE_EXCESIVO'), true);
  }
});

test('una atenuacion con Q ancho en un bus declarado pasa', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.peak.l.12', unidad: 'dB',
      valorPropuesto: -2, valorEsperado: 0,
  magnitudPropuesta: -2, magnitudEsperada: 0, q: 1.4,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, true);
});

test('una transaccion sin cambios no se aprueba', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar([], contexto(), {
    conexionPermiteEscribir: true, snapshotVerificado: true,
  });
  assert.equal(v.permitido, false);
});

test('sin perfil de sala el rechazo lo DICE, no culpa al bus', () => {
  // **«No hay perfil» y «el bus está mal» decían lo mismo.** Hoy la aplicación
  // construye el conjunto vacío siempre --el puente desde PAProfile.outputBuses
  // no existe-- así que toda ecualización de sala se rechaza. Correcto, pero el
  // mensaje mandaba a revisar el bus cuando falta el perfil entero.
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{ kind: 'OUTPUT_EQ', path: 'm.eq.peak.l.12', unidad: 'dB', valorPropuesto: -2, valorEsperado: 0,
  magnitudPropuesta: -2, magnitudEsperada: 0 }],
    contexto({ busesDeSalidaPermitidos: new Set() }),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos.some((r) => r.codigo === 'SIN_PERFIL_DE_SALA'), true);
    assert.equal(v.rechazos.some((r) => r.codigo === 'BUS_NO_PERMITIDO'), false,
      'no se culpa al bus cuando no hay perfil');
  }
});

test('con perfil, un bus ajeno SI se rechaza por el bus', () => {
  // La contraprueba: el mensaje viejo tiene que seguir apareciendo cuando de
  // verdad corresponde.
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{ kind: 'OUTPUT_EQ', path: 'a.5.eq.peak.12', unidad: 'dB', valorPropuesto: -2, valorEsperado: 0,
  magnitudPropuesta: -2, magnitudEsperada: 0 }],
    contexto({ busesDeSalidaPermitidos: new Set(['m']) }),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos.some((r) => r.codigo === 'BUS_NO_PERMITIDO'), true);
    assert.equal(v.rechazos.some((r) => r.codigo === 'SIN_PERFIL_DE_SALA'), false);
  }
});

// --- ADR-027: silenciar un canal para diagnosticar -------------------------

/**
 * El silencio de canal se abrió el 2026-09-11 para el diagnóstico de
 * realimentación, y con condiciones.
 *
 * El argumento del usuario: el bloqueo existía pensando en un modo de show que
 * hoy no existe, y en un soundcheck silenciar un canal para probar algo es lo
 * más normal del oficio. Es la única forma de pasar de indicios —el analizador
 * dice la frecuencia, la geometría dice la pareja— a un experimento.
 */

const mute = (canal: number): CambioPropuesto => ({
  kind: 'CHANNEL_MUTE', path: `i.${canal}.mute`, unidad: 'canales',
  valorPropuesto: 1, valorEsperado: 0, magnitudPropuesta: 1, magnitudEsperada: 0,
});

function silenciar(canal: number, estado: ContextoSeguridad['sessionState']) {
  return new SafetyEngine().evaluar(
    [mute(canal)], contexto({ sessionState: estado, aprobacionExplicita: true }),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
}

test('ADR-027: se puede silenciar un canal en configuración de canales', () => {
  const v = silenciar(3, 'CHANNEL_SETUP');
  assert.strictEqual(v.permitido, true, `rechazado: ${JSON.stringify(v)}`);
});

test('ADR-027: NO se puede silenciar durante el show, y sí en todo el soundcheck', () => {
  // **La primera versión cerraba también `FULL_BAND` y `RINGOUT`, y estaba
  // mal.** Los dos son etapas del soundcheck --prueba de banda completa y caza
  // de realimentación--, no del modo live, y el usuario autorizó el soundcheck
  // entero. `RINGOUT` es literalmente el estado de cazar acoples: el
  // diagnóstico quedaba rechazado justo donde más aplica. Lo encontró una
  // auditoría comparando la regla contra lo que el usuario había dicho.
  const v = silenciar(3, 'SHOW');
  assert.strictEqual(v.permitido, false, 'durante el show no');
  if (!v.permitido) {
    assert.ok(v.rechazos.some((r) => r.codigo === 'ESTADO_DE_SESION'),
      JSON.stringify(v.rechazos));
  }
  // Y los dos que antes estaban cerrados por error, sobre todo el de cazar
  // acoples, que es para lo que esto existe.
  for (const estado of ['FULL_BAND', 'RINGOUT', 'MIX', 'ROOM_OBSERVE'] as const) {
    assert.strictEqual(silenciar(3, estado).permitido, true,
      `${estado} es soundcheck y tendría que permitir`);
  }
});

test('ADR-027: de a un canal por vez', () => {
  // Silenciar dos a la vez rompe el experimento: si la banda sostenida cae, no
  // se sabe cuál de los dos la sostenía.
  const dos = new SafetyEngine().evaluar(
    [mute(3), mute(5)], contexto({ aprobacionExplicita: true }),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.strictEqual(dos.permitido, false, 'dos canales a la vez tiene que rechazarse');
});

test('ADR-028: con todo abajo al empezar, la app puede levantar', () => {
  // **El caso que encontró el usuario el 2026-09-12**, preguntando: «¿qué pasa
  // si al iniciar el soundcheck están todos abajo? ¿La app podrá levantar?».
  //
  // No podía. El techo se anotaba en la primera escritura fuera cual fuera, así
  // que con el envío en el piso el techo quedaba en el piso y no se podía subir
  // ni un decibel — justo el ajuste normal de monitores que el usuario había
  // autorizado. El techo era del bloque de diagnóstico de acoples y se aplicó a
  // todo.
  //
  // Ahora `techoPorRuta` sólo lleva las rutas que la aplicación bajó. Un envío
  // que nadie bajó no tiene techo.
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: crudoDeEnvio(-88), valorEsperado: crudoDeEnvio(-90),
    magnitudPropuesta: -88, magnitudEsperada: -90,
  }], contexto(), ok);
  assert.equal(v.permitido, true, motivos(v).join(', '));
});

test('INV-004: el motor traduce TODO codigo de limite, sin estallar', () => {
  // **Este test existe por un TypeError que la suite dejo pasar.** Al agregar
  // `UNIDAD_NO_DECLARADA` a `verificarLimite`, el motor lo recibio y no lo supo
  // traducir: su tabla era `Record<string, …>` con un `!` al final, asi que
  // `mapa[codigo]` daba `undefined` y la linea siguiente estallaba leyendo
  // `.codigo` de undefined.
  //
  // **Y la suite quedo en verde**, porque ningun test proponia un cambio con la
  // unidad mal declarada POR EL MOTOR: el del dominio llama a `verificarLimite`
  // directo, sin pasar por la traduccion. Lo encontro
  // `tools/inventario/permisos.ts` al correrlo, o sea una herramienta y no un
  // test.
  //
  // El tipo de la tabla ahora es exhaustivo, asi que un codigo nuevo sin
  // traduccion es un error de compilacion. Esto cubre la otra mitad: que el
  // camino se recorra de verdad.
  const e = new SafetyEngine();
  const v = e.evaluar([{
    // El pasa-altos tiene su tope en octavas; declarar decibeles es proponer un
    // cambio que el motor no puede juzgar.
    kind: 'HPF', path: 'i.3.eq.hpf.freq', unidad: 'dB',
    valorPropuesto: 0.5, valorEsperado: 0,
    magnitudPropuesta: 0.5, magnitudEsperada: 0,
  }], contexto(), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-004'), motivos(v).join(', '));
});
