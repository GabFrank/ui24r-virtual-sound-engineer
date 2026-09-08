import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/engine.ts';
import type { CambioPropuesto } from '../src/types.ts';
import { contexto } from './helpers.ts';

const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };

const fader = (valor: number, esperado = -6): CambioPropuesto => ({
  kind: 'CHANNEL_FADER', path: 'i.3.mix', unidad: 'dB',
  valorPropuesto: valor, valorEsperado: esperado,
});

function motivos(v: ReturnType<SafetyEngine['evaluar']>): string[] {
  return v.permitido ? [] : v.rechazos.map((r) => r.invariante);
}

test('un cambio razonable pasa', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([fader(-4)], contexto(), ok);
  assert.equal(v.permitido, true);
});

test('INV-008: un envío de monitor nunca se escribe', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
    valorPropuesto: -6, valorEsperado: -10,
  }], contexto(), ok);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('INV-008'));
  assert.match(
    v.permitido === false ? v.rechazos[0]!.mensaje : '',
    /monitores/,
    'el mensaje explica por qué, no solo que está prohibido',
  );
});

test('INV-008: el fader general tampoco', () => {
  const e = new SafetyEngine();
  const v = e.evaluar([{
    kind: 'MASTER_FADER', path: 'm.mix', unidad: 'dB',
    valorPropuesto: 0, valorEsperado: -1,
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
    kind: 'OUTPUT_EQ', path: 'm.eq.b1.gain', unidad: 'dB',
    valorPropuesto: -2, valorEsperado: 0,
  };
  assert.equal(e.evaluar([permitido], contexto(), ok).permitido, true);

  const otroBus = { ...permitido, path: 'a.5.eq.b1.gain' };
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

test('INV-004: un filtro estrecho en un bus de salida se rechaza', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.b1.gain', unidad: 'dB',
      valorPropuesto: -3, valorEsperado: 0, q: 0.4,
    }],
    contexto(),
    { conexionPermiteEscribir: true, snapshotVerificado: true },
  );
  assert.equal(v.permitido, false);
  if (!v.permitido) {
    assert.equal(v.rechazos.some((r) => r.codigo === 'Q_DEMASIADO_ESTRECHO'), true);
  }
});

test('INV-004: la correccion de sala atenua, no realza', () => {
  const motor = new SafetyEngine();
  const v = motor.evaluar(
    [{
      kind: 'OUTPUT_EQ', path: 'm.eq.b1.gain', unidad: 'dB',
      valorPropuesto: 3, valorEsperado: 0, q: 1.4,
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
      kind: 'OUTPUT_EQ', path: 'm.eq.b1.gain', unidad: 'dB',
      valorPropuesto: -2, valorEsperado: 0, q: 1.4,
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
