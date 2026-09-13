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
  // **El ejemplo cambia cuando el hecho cambia.** Hasta el 2026-09-13 este test
  // usaba `i.N.eq.hpf.freq`, que entonces era un numero puesto a ojo en
  // DESCONOCIDO. La medicion 103 lo midio y lo promovio, asi que el ejemplo pasa a
  // la ganancia del ecualizador, que sigue sin medirse.
  const r = aRaw('i.N.eq.b1.gain', 5);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'NO_PROBADO');
  assert.match(r.ok === false ? r.mensaje : '', /SPK-P0.2b/,
    'el mensaje dice qué spike lo desbloquea');
});

test('las unicas rutas escribibles son las que una medicion habilito', () => {
  // Hasta el 2026-09-13 esta lista estaba vacía y el test decía que eso era
  // correcto. Lo era: ninguna conversión se había medido. La medición 101 midió
  // dos contra el filtro real, así que ahora la lista tiene exactamente esas dos.
  //
  // **El test sigue siendo un trinquete**: si aparece una tercera sin que alguien
  // agregue acá su medición y su evidencia, esto falla.
  assert.deepEqual([...rutasProbadas()].sort(),
    ['i.N.eq.b1.freq', 'i.N.eq.b1.q', 'i.N.eq.hpf.freq', 'i.N.eq.lpf.freq'],
    'sólo se escribe lo que se midió, y cada una con su spike en la tabla');
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

    // 2. **El rango declarado es el MEDIDO, no el del recorrido entero.**
    // Los extremos del parámetro --crudo 0 y crudo 1-- caen fuera de la ventana
    // del estímulo de la 101: ahí el pico de la campana da contra el borde y lo
    // que se mediría sería el borde. Declararlos sería afirmar lo que nadie vio.
    assert.ok(e.rawMin > 0 && e.rawMax < 1,
      `${c.path} declara el recorrido entero (${e.rawMin}..${e.rawMax}) y la 101 `
      + 'no midió los extremos');
    assert.ok(Math.abs(e.fisicoMin - c.f(e.rawMin)) / e.fisicoMin < 1e-9,
      `${c.path}: fisicoMin tiene que ser la función evaluada en rawMin`);
    assert.ok(Math.abs(e.fisicoMax - c.f(e.rawMax)) / e.fisicoMax < 1e-9,
      `${c.path}: fisicoMax tiene que ser la función evaluada en rawMax`);
    // Y el recorrido entero sigue siendo el que las dos fuentes declaran, aunque
    // no esté medido: la función es la misma; lo acotado es hasta dónde se vio.
    assert.ok(Math.abs(e.fromRaw(0) - c.rango[0]) / c.rango[0] < 1e-9);
    assert.ok(Math.abs(e.fromRaw(1) - c.rango[1]) / c.rango[1] < 1e-9);

    // 3. **Y NO es una recta**, con el umbral DERIVADO del tramo y no puesto a ojo.
    //
    // Los dos puntos de arriba los cumpliría cualquier curva que comparta los
    // extremos, así que hace falta mirar el medio. Pero cuánto se separan una
    // exponencial y la recta que une sus extremos **depende de cuánto abarque el
    // tramo**: si el tramo cubre un factor `r`, la separación en el medio es
    // exactamente `(1+r)/(2·√r)`.
    //
    // Eso importó el 2026-09-13: cuando el rango pasó del recorrido entero al
    // medido, la separación del Q bajó de ×16,6 a ×1,54 y un umbral fijo de 5
    // empezó a fallar **sin que la curva hubiera cambiado**. Un umbral constante
    // acá no mide la forma: mide el ancho del tramo.
    //
    // Una recta da ×1,00 por definición, así que el umbral se pone en la
    // predicción con una tolerancia, y con eso sigue atrapando el revert.
    const factorDelTramo = e.fisicoMax / e.fisicoMin;
    const separacionEsperada = (1 + factorDelTramo) / (2 * Math.sqrt(factorDelTramo));
    const medio = (e.rawMin + e.rawMax) / 2;
    const recta = e.fisicoMin + 0.5 * (e.fisicoMax - e.fisicoMin);
    const curva = e.fromRaw(medio);
    assert.ok(Math.abs(recta / curva - separacionEsperada) / separacionEsperada < 0.02,
      `${c.path}: la separacion en el medio da ${(recta / curva).toFixed(3)} y una `
      + `exponencial sobre este tramo tiene que dar ${separacionEsperada.toFixed(3)}. `
      + 'Si esto falla, alguien cambio la forma de la curva.');
    assert.ok(separacionEsperada > 1.2,
      `${c.path}: sobre un tramo de factor ${factorDelTramo.toFixed(1)} una recta y `
      + 'una exponencial casi no se distinguen, asi que este test dejo de discriminar');
  }
});

test('el ecualizador quedo PROBADO, y sólo dentro de lo que se midió', () => {
  for (const c of CURVAS_DE_LA_CONSOLA) {
    const e = entrada(c.path);
    assert.equal(e?.estado, 'PROBADO',
      `${c.path} se midió contra el filtro en la 101`);
    assert.equal(e?.spike, 'SPK-P0.2b', 'y la entrada dice qué spike la habilitó');
  }
});

test('fuera del rango medido, la conversion se niega', () => {
  // **Es la mitad que hace honesto el PROBADO.** La función vale en todo el
  // recorrido, pero sólo se comprobó en un tramo; `aRaw` tiene que rechazar lo de
  // afuera en vez de extrapolar con cara de medido.
  const bajo = aRaw('i.N.eq.b1.freq', 30);
  assert.equal(bajo.ok, false);
  assert.equal(bajo.ok === false && bajo.codigo, 'FUERA_DE_RANGO',
    '30 Hz está por debajo de los 115 que la 101 midió');
  const alto = aRaw('i.N.eq.b1.freq', 18000);
  assert.equal(alto.ok, false);
  assert.equal(alto.ok === false && alto.codigo, 'FUERA_DE_RANGO',
    '18 kHz está por encima de los 10,9 que la 101 midió');

  // Y adentro sí convierte, con la ida y la vuelta coherentes.
  const dentro = aRaw('i.N.eq.b1.freq', 1000);
  assert.equal(dentro.ok, true);
  if (dentro.ok) {
    assert.ok(Math.abs(entrada('i.N.eq.b1.freq')!.fromRaw(dentro.raw) - 1000) < 1e-6,
      'pedir 1 kHz tiene que escribir el crudo que la consola lee como 1 kHz');
    // El crudo de fábrica de la banda 2 es exactamente ése: 1 kHz.
    assert.ok(Math.abs(dentro.raw - 0.5584347738) < 1e-6,
      'y ese crudo es el que el aparato trae de fábrica para 1 kHz');
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

/**
 * El pasa-altos y el pasa-bajos comparten la ley del ecualizador, **recortada**.
 *
 * La medición 103 midió once puntos y los once caen dentro del 1,1 % de
 * `20·1102,5^V` con un tope en 1 kHz: el pasa-altos recorta por arriba y el
 * pasa-bajos por abajo. Es la tercera y la cuarta confirmación independiente de
 * esa exponencial, que este archivo declaraba como recta hasta el 2026-09-13.
 */
test('el pasa-altos y el pasa-bajos usan la ley del ecualizador con tope en 1 kHz', () => {
  const hpf = entrada('i.N.eq.hpf.freq');
  const lpf = entrada('i.N.eq.lpf.freq');
  assert.ok(hpf && lpf);

  const ley = (v: number) => 20 * Math.pow(1102.5, v);
  // Donde la ley está por debajo del tope, los dos la siguen sin recortar.
  for (const v of [0.25, 0.40, 0.55]) {
    assert.ok(Math.abs(hpf.fromRaw(v) - ley(v)) / ley(v) < 1e-9,
      `el pasa-altos en ${v} da ${hpf.fromRaw(v)} y la ley ${ley(v)}`);
  }
  // Y donde la pasa, recortan: el pasa-altos por arriba, el pasa-bajos por abajo.
  for (const v of [0.70, 0.85, 1.0]) {
    assert.ok(Math.abs(hpf.fromRaw(v) - 1000) < 1e-9,
      `el pasa-altos en ${v} tiene que estar recortado en 1000 y da ${hpf.fromRaw(v)}`);
  }
  for (const v of [0, 0.15, 0.45]) {
    assert.ok(Math.abs(lpf.fromRaw(v) - 1000) < 1e-9,
      `el pasa-bajos en ${v} tiene que estar recortado en 1000 y da ${lpf.fromRaw(v)}`);
  }
  assert.ok(Math.abs(lpf.fromRaw(0.60) - ley(0.60)) / ley(0.60) < 1e-9);

  // **Y el recorte es lo que el manual declara**: «20 Hz a 1 kHz» para el
  // pasa-altos, «22 kHz a 1 kHz» para el pasa-bajos.
  assert.ok(Math.abs(hpf.fisicoMax - 1000) < 1e-9, 'el pasa-altos llega hasta 1 kHz');
  assert.ok(Math.abs(lpf.fisicoMin - 1000) < 1e-9, 'el pasa-bajos empieza en 1 kHz');
});

test('fuera del tramo medido, los dos filtros se niegan', () => {
  // Del pasa-bajos se barrió hasta el crudo 0,60 (1339 Hz): los 22 kHz del manual
  // quedan sin medir y `aRaw` tiene que rechazarlos en vez de extrapolar.
  const alto = aRaw('i.N.eq.lpf.freq', 18000);
  assert.equal(alto.ok === false && alto.codigo, 'FUERA_DE_RANGO');
  // Y del pasa-altos, por debajo de 115 Hz: el crudo 0 es la línea base de la
  // medición, así que su codo es irrecuperable con ese método.
  const bajo = aRaw('i.N.eq.hpf.freq', 30);
  assert.equal(bajo.ok === false && bajo.codigo, 'FUERA_DE_RANGO');
});
