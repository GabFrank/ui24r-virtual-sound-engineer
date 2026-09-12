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
  //
  // **Y esto NO fija ninguna ley.** Una auditoría de coherencia marcó que este
  // test recorre `RAW_MAP` entero y con eso convierte en contrato la ida y
  // vuelta de `i.N.dyn.threshold`, cuya ley --`-90 + 96a`, leída del
  // `mixer.html`-- quedó **refutada** por la medición 97 del 2026-09-12. El
  // reparo es justo: lo que este test prueba es que `toRaw` y `fromRaw` sean
  // inversas **entre sí**, que es aritmética y valdría con cualquier ley. Lo
  // que no prueba, y no puede, es que la ley describa el aparato. Queda dicho
  // acá para que nadie lea un verde y crea que la ley está respaldada.
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
  // El umbral del compresor se usa acá **como ejemplo de una ruta declarada**,
  // no como afirmación sobre su ley: la 97 la refutó y la entrada se conserva
  // porque `INFERIDO` ya impide escribirla y sacarla dejaría el parámetro sin
  // unidad declarada, que es lo que INV-004 usa para rechazar.
  assert.ok(entrada('i.N.dyn.threshold'));
  assert.equal(entrada('no.existe'), undefined);
});

test('el ratio del compresor no esta en la tabla, y es a proposito', () => {
  // Estuvo con un rango inventado de 1 a 20 en un archivo cuya cabecera
  // promete que las entradas salen de mediciones. Dos razones para que no
  // vuelva, y la segunda es nueva:
  //
  // 1. En 0 la razon seria infinita: no hay rango fisico que declarar sin
  //    adivinarlo.
  // 2. **La funcion NO se conoce.** Este comentario decia «la funcion se
  //    conoce --VtoRATIO(a) = 1/a--», leida del `mixer.html`, y la medicion 97
  //    del 2026-09-12 refuto el modelo: con `R = 1/a` el exceso despejado va de
  //    10,0 a 25,6 en la misma corrida con fuente y umbral quietos, y los
  //    cocientes dan 1,58 a 2,42 donde el modelo pide 3,00.
  assert.equal(entrada('i.N.dyn.ratio'), undefined);
});
