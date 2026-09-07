import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeTransicionar, TRANSICIONES, type SessionState } from '../src/entities/session.ts';
import type { MeasurementId } from '../src/ids.ts';

const sinContexto = { tieneTakeActivo: false, medicionesPosteriores: [] as MeasurementId[] };

test('el flujo nominal completo es transitable', () => {
  const flujo: SessionState[] = [
    'CREATED', 'SETUP', 'CALIBRATING', 'ROOM_OBSERVE', 'CHANNEL_SETUP',
    'SOUNDCHECK_REC', 'MIX', 'FULL_BAND', 'RINGOUT', 'SHOW', 'CLOSED',
  ];
  for (let i = 0; i < flujo.length - 1; i++) {
    const r = puedeTransicionar(flujo[i]!, flujo[i + 1]!, sinContexto);
    assert.equal(r.permitida, true, `${flujo[i]} a ${flujo[i + 1]} debería estar permitido`);
  }
});

test('INV-006: no se vuelve a configurar canales con una toma de soundcheck activa', () => {
  const r = puedeTransicionar('MIX', 'CHANNEL_SETUP', {
    tieneTakeActivo: true, medicionesPosteriores: [],
  });
  assert.equal(r.permitida, false);
  assert.match(
    r.permitida === false ? r.razon : '',
    /posterior al preamplificador/,
    'el motivo explica por qué, no solo que no se puede',
  );
});

test('el retroceso a configuración de canales invalida las mediciones posteriores', () => {
  const mediciones = ['m1', 'm2'] as unknown as MeasurementId[];
  const r = puedeTransicionar('MIX', 'CHANNEL_SETUP', {
    tieneTakeActivo: false, medicionesPosteriores: mediciones,
  });
  assert.equal(r.permitida, true);
  assert.deepEqual(r.permitida === true ? r.invalida : [], mediciones);
});

test('medir la sala de nuevo desde la mezcla es legítimo y no invalida nada hacia adelante', () => {
  const r = puedeTransicionar('MIX', 'ROOM_OBSERVE', {
    tieneTakeActivo: false, medicionesPosteriores: [],
  });
  assert.equal(r.permitida, true);
});

test('la comparación de mezclas alterna entre mezcla y reproducción', () => {
  assert.equal(puedeTransicionar('MIX', 'SOUNDCHECK_PLAY', sinContexto).permitida, true);
  assert.equal(puedeTransicionar('SOUNDCHECK_PLAY', 'MIX', sinContexto).permitida, true);
});

test('desde el show solo se cierra la sesión', () => {
  assert.deepEqual(TRANSICIONES.SHOW, ['CLOSED']);
  assert.equal(puedeTransicionar('SHOW', 'MIX', sinContexto).permitida, false);
});

test('una sesión cerrada no transita a ningún lado', () => {
  assert.deepEqual(TRANSICIONES.CLOSED, []);
});

test('toda transición declarada apunta a un estado que existe', () => {
  const estados = new Set(Object.keys(TRANSICIONES) as SessionState[]);
  for (const [desde, hacia] of Object.entries(TRANSICIONES)) {
    for (const h of hacia) {
      assert.ok(estados.has(h), `${desde} apunta a ${h}, que no existe`);
    }
  }
});

test('desde cualquier estado se puede cerrar la sesión', () => {
  for (const estado of Object.keys(TRANSICIONES) as SessionState[]) {
    if (estado === 'CLOSED') continue;
    assert.ok(
      TRANSICIONES[estado].includes('CLOSED'),
      `desde ${estado} no se puede cerrar: el usuario quedaría atrapado`,
    );
  }
});
