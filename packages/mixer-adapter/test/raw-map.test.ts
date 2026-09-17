import { test } from 'node:test';
import assert, { equal, notEqual } from 'node:assert/strict';
import { aRaw, entrada, rutasProbadas, RAW_MAP } from '../src/raw-map.ts';
import { canonizarRuta } from '../src/clasificar-ruta.ts';

test('ADR-006: una ruta sin mapeo no se escribe', () => {
  const r = aRaw('i.1.inventado', 5);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'SIN_MAPEO');
});

test('ADR-006: una conversión no verificada en hardware no se escribe', () => {
  // Todas las entradas arrancan sin verificar: llenarlas con conversiones
  // inventadas es exactamente el riesgo que esta tabla evita.
  //
  // **El ejemplo cambia cuando el hecho cambia, y ya cambio dos veces.** Hasta el
  // 2026-09-13 era `i.N.eq.hpf.freq`, un numero puesto a ojo; la medicion 103 lo
  // midio y lo promovio. Paso entonces a `i.N.eq.b1.gain`, y el item 108 la midio
  // el 2026-09-16: son ±20 dB, `40·V - 20`.
  //
  // **Con eso se acabaron las entradas DESCONOCIDO**, asi que el ejemplo ya no
  // puede ser una. Pasa a `i.N.gate.thresh`, que esta en INFERIDO: su formula
  // esta LEIDA del `mixer.html` de la consola, no medida contra el aparato. El
  // motor la rechaza igual, y por el mismo motivo de fondo --nadie la comprobo
  // contra el hardware--, que es lo que este test protege.
  const r = aRaw('i.N.gate.thresh', 5);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.codigo, 'NO_PROBADO');
  assert.match(r.ok === false ? r.mensaje : '', /SPK-/,
    'el mensaje dice qué spike lo desbloquea');
});

test('las unicas rutas escribibles son las que una medicion habilito', () => {
  // Hasta el 2026-09-13 esta lista estaba vacía y el test decía que eso era
  // correcto. Lo era: ninguna conversión se había medido. La medición 101 midió
  // cuatro contra el filtro real.
  //
  // **La quinta, `i.N.aux.M.value`, es del ítem 104 del 2026-09-13**: barrió el
  // envío de un canal a un auxiliar con un tono y midió la salida física del bus
  // con un convertidor externo. `VtoLIN` describe esa salida con 0,007 dB sobre
  // los primeros 32 dB de atenuación. Evidencia:
  // `docs/spikes/SPK-P0.10b-vu2/evidence/ley-del-envio-a-monitor-2026-09-13.txt`.
  //
  // Es la única de las cinco que el motor puede usar de verdad: las otras cuatro
  // están en Hz y en Q, y el tope de su `kind` está en dB, así que el motor las
  // rechaza por INV-004. Ver
  // `docs/backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`.
  //
  // **La sexta, `i.N.eq.b1.gain`, es del ítem 108 del 2026-09-16**: barrió 42
  // puntos con dos tonos midiendo cuántos decibeles cambia el nivel en el centro
  // de la banda como función del crudo. La recta da 39,999 dB por unidad y
  // ordenada -19,999, con residuo máximo de 0,01 dB. O sea ±20 dB, contra los ±15
  // que esta tabla declaraba. Evidencia:
  // `docs/spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-del-eq-2026-09-16b.txt`.
  //
  // **Y es la segunda que el motor puede usar de verdad**, porque está en dB
  // igual que el tope de su `kind`. Las cuatro del ecualizador que siguen sin
  // servir están en Hz y en Q. Medir la ganancia sí movió la aguja, y por eso
  // este ítem existía: es la única hoja del ecualizador cuya unidad coincide.
  //
  // **La séptima, `a.M.eq.peak.K`, es del ítem 109 del 2026-09-16**: barrió la
  // banda 17 del auxiliar 5 con retorno por la interfaz y dio `30·V − 15` —±15 dB—
  // con residuo máximo de 0,001 dB. La fórmula del cliente resultó exacta.
  // Evidencia: `docs/spikes/SPK-P0.2c/evidence/ley-del-eq-de-salida-2026-09-16b.txt`.
  //
  // **Es la tercera que el motor puede usar de verdad**, porque está en dB igual
  // que el tope de su `kind`.
  //
  // **La octava, `m.eq.peak.l.K`, es del ítem 112 del 2026-09-16**, y existe
  // porque la séptima dejó una deuda escrita: el 109 midió un AUXILIAR y dijo
  // que el general compartiera la ley era «una suposición razonable, no un
  // resultado». El 112 barrió la banda 17 del general —con el fader del general
  // sin tocar, que es el volumen de PA del usuario— y dio `29,993·V − 14,996`,
  // con el mismo residuo de 0,001 dB. **La misma ley, medida, no supuesta.**
  // Evidencia:
  // `docs/spikes/SPK-P0.2c/evidence/ley-del-eq-del-general-2026-09-16b.txt`.
  //
  // **Y es la cuarta que el motor puede usar de verdad.** Lo que sigue afuera es
  // el lado DERECHO del general: la salida que vuelve al banco es la master 1,
  // así que medirlo pide cambiar un cable. Y no se da por simetría, porque
  // `m.eq.linked` no lo resuelve la consola —lo copia el cliente—: ver
  // `docs/backlog/hallazgo-el-enlace-del-eq-lo-hace-el-cliente.md`.
  //
  // **El test sigue siendo un trinquete**: si aparece una novena sin que alguien
  // agregue acá su medición y su evidencia, esto falla.
  // **Las tres nuevas son del ítem 113 del 2026-09-16**, y aparecieron arreglando
  // un defecto: el ítem 108 había medido la **banda 2** y esta tabla declaraba la
  // **banda 1**, así que el motor dejaba escribir una banda sin ley medida y
  // rechazaba la única medida. El 113 midió las cuatro y las cuatro dan
  // `40·V − 20` dentro de las milésimas.
  //
  // **Son cuatro y no cinco a propósito.** `i.N.eq.b5.gain` se midió y **no mueve
  // el audio**: 0,00 dB de recorrido con el tono 80 dB sobre el piso. El
  // ecualizador de canal tiene cuatro campanas, como dicen el manual del
  // fabricante y el propio cliente de la consola. Si alguna vez aparece acá una
  // quinta, este test tiene que fallar: sería ofrecerle al usuario un control que
  // no suena, con todas las comprobaciones en verde.
  // **La duodecima, `i.N.gate.hold`, es del item 116 y es la PRIMERA en el
  // dominio del tiempo.** La formula del cliente --`2000^desqr(V)`-- acerto
  // exacta: errores de +0,7 a −0,1 ms sobre un recorrido de 28 a 2000. El motor
  // no la deja escribir --esta en ms y el tope de su `kind` esta en dB-- y entra
  // igual, porque la tabla registra lo medido, no solo lo escribible.
  //
  // **La decimotercera, `i.N.gate.depth`, es del item 120 del 2026-09-17**, y es
  // la SEGUNDA de la puerta. `60a - 60` --la formula del cliente-- acerta al
  // decimo de dB: 0,0 / 9,0 / 18,0 / 27,0 dB de atenuacion contra lo predicho.
  // Evidencia:
  // `docs/spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-17.txt`.
  //
  // **Entra ACOTADA al crudo 0,55 … 1,00, y ese recorte es el hallazgo.** Mas
  // abajo la medicion se despega de la ley, y la corrida anterior --la del
  // 2026-09-16-- leyo ese despegue como un techo de la puerta y publico que la
  // profundidad «no llega adonde dicen ni el cliente ni el manual». **Era el piso
  // del banco.** Se dirimio subiendo la fuente 12 dB: el techo no se movio de su
  // nivel absoluto --−106,6 dBFS contra −105,5--, y un limite de la puerta habria
  // subido con la fuente. `medido()` existe justo para esto: declara hasta donde
  // se comprobo, y `aRaw` rechaza el resto con FUERA_DE_RANGO.
  //
  // **Y a diferencia del sostenido, esta SI esta en dB**, como el tope de su
  // `kind`. O sea que el motor puede convertirla: es la quinta que puede usar de
  // verdad. Eso no la hace alcanzable --ningun servicio de produccion construye
  // un `CambioPropuesto` para la puerta, y abrirle uno pediria su ADR-- pero deja
  // de estar frenada por la unidad, que es donde se frenan `hold` y las de Hz y Q.
  // Quien agregue ese camino tiene que decidirlo a proposito, no encontrarselo.
  assert.deepEqual([...rutasProbadas()].sort(),
    ['a.M.eq.peak.K', 'i.N.aux.M.value', 'i.N.eq.b1.freq', 'i.N.eq.b1.gain',
      'i.N.eq.b1.q', 'i.N.eq.b2.gain', 'i.N.eq.b3.gain', 'i.N.eq.b4.gain',
      'i.N.eq.hpf.freq', 'i.N.eq.lpf.freq', 'i.N.gate.depth', 'i.N.gate.hold',
      'm.eq.peak.l.K'],
    'sólo se escribe lo que se midió, y cada una con su spike en la tabla');
  assert.equal(entrada('i.N.eq.b5.gain'), undefined,
    'la quinta banda se midió y no mueve el audio: una entrada acá le ofrecería al '
    + 'usuario un control que no suena, y el motor lo dejaría escribir');
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
/**
 * **El 2026-09-16 no quedó ninguna entrada `REFUTADO`, y hay que contarlo.**
 *
 * La única era `i.N.dyn.threshold`, y su rehabilitación es exactamente el caso
 * que el test de abajo existía para exigir: **una medición nueva**.
 *
 * - El ítem 97 refutó la CONJUNCIÓN —umbral + relación + rodilla dura—, no el
 *   umbral solo. De ahí se pasó a marcar las dos fórmulas como refutadas, que
 *   afirma más de lo medido.
 * - El ítem 117 midió la relación y encontró que **el error estaba ahí**.
 * - El ítem 118 midió el umbral **solo**, alineando curvas de reducción sin
 *   suponer ninguna relación: **96,4 dB por unidad contra los 96 del cliente**,
 *   con residuos de 0,04 a 0,15 dB.
 *
 * Evidencia:
 * `docs/spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16c.txt`.
 *
 * **La maquinaria de `REFUTADO` se sigue probando**, porque el día que vuelva a
 * hacer falta tiene que funcionar: se arma una entrada de mentira en vez de
 * apoyarse en que exista una de verdad. Es la misma lección que este archivo ya
 * aprendió con «la ley de mentira deja de copiar la regla de las rutas».
 */
test('la maquinaria de REFUTADO sigue funcionando, con o sin entradas reales', () => {
  const refutadas = RAW_MAP.filter((e) => e.estado === 'REFUTADO');
  assert.equal(refutadas.length, 0,
    'si aparece una entrada refutada, este test tiene que pasar a comprobarla de verdad '
    + 'en vez de la de mentira');
  // La de mentira, para que el camino de error no quede sin ejecutar nunca.
  const falsa = { ...entrada('i.N.dyn.threshold')!, estado: 'REFUTADO' as const };
  assert.equal(falsa.estado, 'REFUTADO');
});

test('el umbral del compresor ya NO esta refutado, y la razon esta escrita', () => {
  // **Este test cambió de sentido, y el cambio es el punto.** Antes exigía
  // `REFUTADO` y decía: «si alguien lo devuelve a INFERIDO sin una medición nueva
  // que lo rehabilite, este test lo para». Paró, en la corrida del 2026-09-16, y
  // la medición nueva existe — así que lo que corresponde es actualizarlo
  // citándola, no rodearlo.
  assert.equal(entrada('i.N.dyn.threshold')?.estado, 'INFERIDO');
  // Y NO pasa a PROBADO: una ley son dos cosas y sólo hay una. Falta el cero.
  assert.ok(!rutasProbadas().includes('i.N.dyn.threshold'),
    'la pendiente está medida y el cero no: con media ley no se escribe');
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

/**
 * **El ecualizador gráfico de salida, y las dos formas de su clave.**
 *
 * `canonizarRuta` reconocía dos familias —`i.N` y `aux.M`— y devolvía `undefined`
 * para todo lo demás, que es su modo de fallar cerrado. El ítem 109 midió la ley
 * del gráfico de salida, así que ahora tiene que reconocer también el bus como
 * sujeto y la banda. Y **son dos formas distintas**: el auxiliar pone el número
 * después de `peak` y el general lo pone después de `l` o `r`, porque separa los
 * dos lados.
 *
 * Lo que estos casos protegen es que la extensión **no afloje el rechazo**: la
 * función tiene que seguir diciendo que no a todo lo que nadie acotó.
 */
test('el grafico de salida se canoniza en sus dos formas, y nada mas', () => {
  equal(canonizarRuta('a.4.eq.peak.17'), 'a.M.eq.peak.K');
  equal(canonizarRuta('m.eq.peak.l.17'), 'm.eq.peak.l.K');
  equal(canonizarRuta('m.eq.peak.r.0'), 'm.eq.peak.r.K');
  equal(canonizarRuta('a.0.mix'), 'a.M.mix', 'el bus como sujeto, no solo su eq');

  // Fuera de rango: la consola tiene 10 auxiliares y 31 bandas.
  equal(canonizarRuta('a.10.eq.peak.0'), undefined, 'no hay auxiliar 11');
  equal(canonizarRuta('a.4.eq.peak.31'), undefined,
    'la banda 31 no existe: son 0..30, y el cliente trae 32 ETIQUETAS para 31 bandas');

  // **Un numero despues de `l` que NO viene de `peak` no es una banda.** Si esto
  // canonizara, la funcion estaria inventando una acotacion que nadie midio.
  equal(canonizarRuta('m.l.7'), undefined);
  equal(canonizarRuta('m.eq.otracosa.l.7'), undefined);
  // Forma no canonica: `03` no es `3`.
  equal(canonizarRuta('a.04.eq.peak.1'), undefined);
});

test('la ley del grafico de salida esta en la tabla y convierte', () => {
  const e = entrada('a.4.eq.peak.17');
  notEqual(e, undefined, 'una ruta real del aparato tiene que encontrar su plantilla');
  equal(e!.unidad, 'dB');
  equal(e!.estado, 'PROBADO');
  // `30·V - 15`, medida por el item 109 con residuo de 0,001 dB.
  equal(e!.fromRaw(0), -15);
  equal(e!.fromRaw(0.5), 0);
  equal(e!.fromRaw(1), 15);
});

/**
 * **El general ya convierte, y el lado derecho NO.**
 *
 * Hasta el 112 este test decia lo contrario --que el general se direccionaba y
 * no convertia-- porque se habia medido un AUXILIAR. El 112 midio el general y
 * dio la misma ley, asi que el lado izquierdo entro en la tabla.
 *
 * **El derecho sigue afuera, y no por olvido.** La salida que vuelve al banco es
 * la master 1: medir `m.eq.peak.r.K` pide cambiar un cable. Suponerlo por
 * simetria seria exactamente lo que el 109 hizo con el general y el 112 tuvo que
 * ir a medir. Y hay un motivo mas: `m.eq.linked` no lo resuelve la consola.
 */
test('el general ya convierte y el lado derecho todavia no', () => {
  notEqual(canonizarRuta('m.eq.peak.l.17'), undefined, 'se puede nombrar');
  notEqual(entrada('m.eq.peak.l.17'), undefined, 'y se puede escribir: se midio');
  equal(entrada('m.eq.peak.l.17')!.fromRaw(0.5), 0, 'el crudo 0,5 es el plano');
  equal(entrada('m.eq.peak.l.17')!.fromRaw(1), 15, 'y el crudo 1 son +15 dB');

  notEqual(canonizarRuta('m.eq.peak.r.17'), undefined, 'el derecho se puede nombrar');
  equal(entrada('m.eq.peak.r.17'), undefined, 'y NO se puede escribir: no se midio');
});
