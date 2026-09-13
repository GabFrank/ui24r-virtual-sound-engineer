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

/**
 * Las curvas del ecualizador, contra el `mixer.html` de la consola.
 *
 * **Por qué este test existe.** Hasta el 2026-09-13 la frecuencia y el Q estaban
 * en la tabla como **rectas**, con rangos puestos a ojo, mientras el cliente de
 * la propia consola usa exponenciales. Pedir 1 kHz aterrizaba en 28 Hz.
 *
 * `aRaw` lo frenaba —esas entradas no están en `PROBADO`— así que nunca llegó a
 * la consola. El daño era latente: **el día que alguien mida el ecualizador y
 * ponga la entrada en `PROBADO`, iba a estar mirando una recta.**
 *
 * Y comprobar los extremos no alcanza: una recta y una exponencial que comparten
 * los dos extremos se separan en todo el medio. Por eso este test mira **el
 * medio**.
 */
const CURVAS_DE_LA_CONSOLA = [
  {
    path: 'i.N.eq.b1.freq',
    // `protocol-spec` §6.3, leído del `mixer.html`: 20·1102,5^V.
    f: (v: number) => 20 * Math.pow(1102.5, v),
    rango: [20, 22050] as const,
  },
  {
    path: 'i.N.eq.b1.q',
    // `protocol-spec` §6.3: 0,05·300^V. El manual del fabricante coincide.
    f: (v: number) => 0.05 * Math.pow(300, v),
    rango: [0.05, 15] as const,
  },
];

test('el ecualizador usa la curva de la consola, no una recta', () => {
  for (const c of CURVAS_DE_LA_CONSOLA) {
    const e = entrada(c.path);
    assert.ok(e, `${c.path} no está en la tabla`);

    // 1. La función coincide con la del `mixer.html` en todo el recorrido.
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const esperado = c.f(v);
      assert.ok(Math.abs(e.fromRaw(v) - esperado) / esperado < 1e-9,
        `${c.path} en el crudo ${v}: da ${e.fromRaw(v)} y la consola ${esperado}`);
    }

    // 2. Los extremos son los que declaran las dos fuentes.
    assert.ok(Math.abs(e.fisicoMin - c.rango[0]) / c.rango[0] < 1e-9,
      `${c.path} arranca en ${e.fisicoMin} y no en ${c.rango[0]}`);
    assert.ok(Math.abs(e.fisicoMax - c.rango[1]) / c.rango[1] < 1e-9,
      `${c.path} termina en ${e.fisicoMax} y no en ${c.rango[1]}`);

    // 3. **Y NO es una recta.** Ésta es la guarda que atrapa una vuelta atrás:
    // los dos puntos de arriba los cumpliría cualquier curva que comparta los
    // extremos. En el medio, una exponencial y la recta que une sus extremos se
    // separan por un factor grande, y acá se exige que se separen.
    const recta = e.fisicoMin + 0.5 * (e.fisicoMax - e.fisicoMin);
    const curva = e.fromRaw(0.5);
    assert.ok(recta / curva > 5,
      `${c.path} se parece demasiado a una recta en el medio: la recta da ${recta} `
      + `y la curva ${curva}. Si esto falla, alguien la volvió a poner lineal.`);
  }
});

test('el ecualizador queda INFERIDO: leído del cliente, no medido', () => {
  for (const c of CURVAS_DE_LA_CONSOLA) {
    // Que la curva sea la correcta no la hace medida. `protocol-spec` §6.3 las
    // da como «sin probar», y subirlas a PROBADO sin medir sería cambiar una
    // invención por una lectura y llamarla evidencia.
    assert.equal(entrada(c.path)?.estado, 'INFERIDO',
      `${c.path} no está medido contra el aparato: no puede estar en PROBADO`);
  }
});

/**
 * Lo refutado no se confunde con lo no probado.
 *
 * `DESCONOCIDO` e `INFERIDO` dicen «nadie lo comprobó». `REFUTADO` dice **se
 * comprobó y no dio**, y llevan consejos opuestos: con el primero se propone el
 * valor absoluto para aplicarlo a mano; con el segundo no se propone nada,
 * porque el número que saldría tiene cara de medido y se sabe incorrecto.
 *
 * El umbral del compresor cayó con la medición 97 del 2026-09-12. El
 * `protocol-spec` §6.3 lo marcó ese día y **esta tabla siguió diciendo
 * INFERIDO** hasta el 2026-09-13.
 */
test('una conversión refutada no propone ningún valor', () => {
  const r = aRaw('i.N.dyn.threshold', -20);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'REFUTADO',
    'una fórmula que se midió y falló no es lo mismo que una sin probar');
  assert.match(r.ok === false ? r.mensaje : '', /REFUTADA/);
  assert.doesNotMatch(r.ok === false ? r.mensaje : '', /aplicar a mano/,
    'no se invita a aplicar a mano un número que sale de una fórmula refutada');
});

test('el umbral del compresor sigue marcado como refutado', () => {
  // Si alguien lo devuelve a INFERIDO sin una medición nueva que lo rehabilite,
  // este test lo para. La 97 está en
  // docs/spikes/SPK-P0.10b-vu2/evidence/leyes-del-compresor-2026-09-12.txt
  assert.equal(entrada('i.N.dyn.threshold')?.estado, 'REFUTADO');
});

test('nada refutado es escribible, nunca', () => {
  for (const e of RAW_MAP) {
    if (e.estado !== 'REFUTADO') continue;
    assert.ok(!rutasProbadas().includes(e.path),
      `${e.path} está refutado y aparece como escribible`);
  }
});
