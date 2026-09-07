import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aRaw, entrada, rutasProbadas, RAW_MAP } from '../src/raw-map.ts';

test('ADR-006: una ruta sin mapeo no se escribe', () => {
  const r = aRaw('i.1.inventado', 5);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'SIN_MAPEO');
});

test('ADR-006: una conversión no verificada en hardware no se escribe', () => {
  // Todas las entradas arrancan sin verificar: llenarlas con conversiones
  // inventadas es exactamente el riesgo que esta tabla evita.
  const r = aRaw('i.N.eq.hpf.freq', 100);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'NO_PROBADO');
  assert.match(r.ok === false ? r.mensaje : '', /SPK-P0.2b/,
    'el mensaje dice qué spike lo desbloquea');
});

test('hoy no hay ninguna ruta cruda escribible, y eso es correcto', () => {
  assert.deepEqual(rutasProbadas(), [],
    'ninguna conversión está verificada todavía: los spikes no se ejecutaron');
});

test('toda entrada declara su spike y su rango físico', () => {
  for (const e of RAW_MAP) {
    assert.ok(e.spike.startsWith('SPK-'), `${e.path} no dice qué spike lo verifica`);
    assert.ok(e.fisicoMax > e.fisicoMin, `${e.path} tiene un rango físico inválido`);
    assert.ok(e.unidad.length > 0, `${e.path} no declara unidad`);
  }
});

test('las conversiones de ida y vuelta son consistentes', () => {
  // Aunque ninguna esté verificada, la mecánica de conversión tiene que ser
  // correcta: cuando el spike llene los números reales, esto ya está probado.
  for (const e of RAW_MAP) {
    for (const frac of [0, 0.1, 0.5, 0.9, 1]) {
      const fisico = e.fisicoMin + frac * (e.fisicoMax - e.fisicoMin);
      const ida = e.toRaw(fisico);
      const vuelta = e.fromRaw(ida);
      const error = Math.abs(vuelta - fisico) / (e.fisicoMax - e.fisicoMin);
      assert.ok(error <= 0.01, `${e.path} en ${fisico}: error de ida y vuelta ${(error * 100).toFixed(2)} %`);
    }
  }
});

test('las rutas declaradas se pueden consultar por nombre', () => {
  assert.ok(entrada('i.N.dyn.ratio'));
  assert.equal(entrada('no.existe'), undefined);
});
