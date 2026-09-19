import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verificarAtadura, verificarAtaduraDelOrigen } from '../src/magnitud-atada.ts';
import { entrada } from '@vse/mixer-adapter';

/**
 * **El escenario que una auditoría de seguridad demostró midiendo.**
 *
 * `limits.ts` lo dejó escrito: *«una escritura de recorrido completo, crudo 0 a 1,
 * aprobada bajo un techo de −6 dB declarando magnitudes −31 a −30»*. El motor
 * juzgaba los decibeles declarados, los encontraba razonables, y dejaba pasar el
 * recorrido entero del parámetro.
 *
 * Hasta el 2026-09-13 no se podía cerrar porque no había ninguna ley medida:
 * `rutasProbadas()` devolvía la lista vacía. La medición 101 midió dos.
 */
test('un crudo de recorrido completo con una magnitud inventada se detecta', () => {
  // El ecualizador de la banda 1 está medido entre los crudos 0,25 y 0,90. Un
  // llamador que escriba el extremo declarando cualquier otra cosa queda visible.
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const crudoAlto = e.rawMax;
  const r = verificarAtadura('i.N.eq.b1.freq', crudoAlto, 200, 'Hz');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_COINCIDE');
  // Y dice cuál era el número de verdad, que es lo que permite arreglarlo.
  assert.ok(r.atada === false && 'magnitudDelCrudo' in r
    && Math.abs(r.magnitudDelCrudo - e.fromRaw(crudoAlto)) < 1e-9);
});

test('la magnitud que el crudo produce de verdad, pasa', () => {
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const crudo = e.toRaw(1000);
  const r = verificarAtadura('i.N.eq.b1.freq', crudo, 1000, 'Hz');
  assert.equal(r.atada, true, r.atada === false ? r.motivo : '');
});

test('la holgura escala con el recorrido, no es un numero fijo', () => {
  // **Por que importa.** Un absoluto no sirve para las dos entradas medidas: 0,5
  // seria enorme para un Q que va de 0,37 a 2,71 y ridiculo para una frecuencia
  // que va de 115 a 10 900 Hz. La tolerancia tiene que escalar con lo que se mide.
  const q = entrada('i.N.eq.b1.q');
  const f = entrada('i.N.eq.b1.freq');
  assert.ok(q && f);

  // En el Q, apartarse 0,5 es muchisimo y tiene que fallar.
  const crudoQ = q.toRaw(1.0);
  assert.equal(verificarAtadura('i.N.eq.b1.q', crudoQ, 1.5, 'Q').atada, false);
  // En la frecuencia, apartarse 0,5 Hz sobre 1000 es redondeo y tiene que pasar.
  const crudoF = f.toRaw(1000);
  assert.equal(verificarAtadura('i.N.eq.b1.freq', crudoF, 1000.5, 'Hz').atada, true);
});

test('declarar otra unidad se detecta', () => {
  const e = entrada('i.N.eq.b1.freq');
  assert.ok(e);
  const r = verificarAtadura('i.N.eq.b1.freq', e.toRaw(1000), 1000, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'UNIDAD_NO_COINCIDE');
});

/**
 * **Que una ruta no se pueda atar NO es un rechazo, y esa diferencia es el punto.**
 *
 * Para las rutas sin ley medida el motor sigue juzgando lo que el llamador
 * declara, igual que antes. Lo que cambia es que ahora eso es **visible** en vez
 * de silencioso. Devolver un rechazo aquí sería peor: bloquearía todo lo que
 * todavía no se midió, que es casi todo.
 */
test('sin ley verificada se dice, y no se rechaza', () => {
  // **Una entrada que existe pero no está medida.** Hasta el 2026-09-13 este
  // ejemplo era `i.N.eq.hpf.freq`; la medición 103 lo midió y lo promovió, así que
  // el ejemplo pasa a la ganancia del ecualizador, que sigue sin medirse. Que el
  // ejemplo tenga que cambiar es la señal de que el trabajo avanza.
  //
  // **Cambio otra vez el 2026-09-16.** El item 108 midio la ganancia del
  // ecualizador --±20 dB, `40·V - 20`-- y con eso NO queda ninguna entrada en
  // DESCONOCIDO. El ejemplo pasa a una INFERIDO: `i.N.gate.thresh`, cuya formula
  // esta leida del cliente de la consola y no comprobada contra el hardware. El
  // motor tampoco la ata, que es lo que este test protege.
  const r = verificarAtadura('i.N.gate.thresh', 0.5, 5, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'SIN_LEY_VERIFICADA');
  assert.match(r.atada === false ? r.motivo : '', /INFERIDO/);

  // Y una que no está en la tabla.
  const s = verificarAtadura('i.3.mix', 0.5, -10, 'dB');
  assert.equal(s.atada === false && s.codigo, 'SIN_LEY_VERIFICADA');
});

test('media ley tampoco ata: el umbral tiene la pendiente medida y el cero no', () => {
  // **Este test decía «una ley REFUTADA tampoco ata», y el 2026-09-16 dejó de
  // aplicar.** El umbral del compresor había caído con la medición 97, pero
  // aquella refutó la CONJUNCIÓN --umbral + relación + rodilla dura--: el ítem
  // 117 midió que el error estaba en la relación y el 118 midió el umbral solo,
  // dando 96,4 dB por unidad contra los 96 del cliente.
  //
  // **Lo que el test protege no cambió, y por eso sigue existiendo**: con la
  // pendiente medida y el cero sin anclar hay MEDIA ley, y con media ley no se
  // ata una magnitud a un crudo. Cambia el motivo que se informa, no el veredicto.
  const r = verificarAtadura('i.N.dyn.threshold', 0.5, -42, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'SIN_LEY_VERIFICADA');
  assert.match(r.atada === false ? r.motivo : '', /INFERIDO/);
});

/**
 * La otra punta del mismo agujero, comprobada el 2026-09-17.
 *
 * `Math.abs(NaN - x) > holgura` da `false`, asi que el `return` del rechazo no
 * se ejecutaba y esta funcion --cuyo unico trabajo es comprobar que el motor
 * juzgue el mismo numero que va al cable-- devolvia `atada: true` para
 * **cualquier crudo**, con tal de que la magnitud declarada no fuera un numero.
 */
test('una magnitud que no es un numero NO esta atada a ningun crudo', () => {
  const r = verificarAtadura('i.3.aux.1.value', 0.5, NaN, 'dB');
  assert.equal(r.atada, false, 'decia que si, y con cualquier crudo');
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_NUMERICA');

  // Y el caso que si esta atado sigue estandolo: la guarda no rompe lo que andaba.
  const bien = verificarAtadura('i.3.aux.1.value', 0.5, -11.616, 'dB');
  assert.equal(bien.atada, true);
});

/**
 * **El otro extremo del movimiento, atado el 2026-09-17.**
 *
 * Los topes de INV-004 acotan `magnitudPropuesta - magnitudEsperada`. Atar sólo
 * el destino deja la resta apoyada en un número libre, y una auditoría lo midió:
 * *«un salto de 31 dB en la cuña de un músico, declarando que venía de un decibel
 * más abajo, pasa»*. Estos tests son de la guarda que cierra esa mitad.
 */
test('el punto de partida declarado tiene que ser donde la consola lo tiene', () => {
  // El envío está de verdad en el crudo 0,25, que por la ley medida es −32,14 dB.
  // Declarar que venía de −2 convierte un salto de 32 dB en uno de 2.
  const r = verificarAtaduraDelOrigen('i.3.aux.1.value', 0.25, -2, 'dB');
  assert.equal(r.atada, false, 'el origen inventado tiene que verse');
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_COINCIDE');
  // Y el mensaje dice de qué se trata, que no es lo mismo que el destino.
  assert.match(r.atada === false ? r.motivo : '', /venía de/);
  assert.match(r.atada === false ? r.motivo : '', /movimiento/);
});

test('el punto de partida de verdad pasa, y con la misma holgura', () => {
  const e = entrada('i.3.aux.1.value');
  assert.ok(e);
  const r = verificarAtaduraDelOrigen('i.3.aux.1.value', 0.25, e.fromRaw(0.25), 'dB');
  assert.equal(r.atada, true, r.atada === false ? r.motivo : '');

  // La holgura es la misma que la del destino --el 1 % del recorrido-- porque es
  // la misma ley y el mismo redondeo. Un décimo de dB tiene que seguir pasando.
  const casi = verificarAtaduraDelOrigen('i.3.aux.1.value', 0.25, e.fromRaw(0.25) + 0.1, 'dB');
  assert.equal(casi.atada, true, casi.atada === false ? casi.motivo : '');
});

test('una cuña en silencio no tiene punto de partida en decibeles', () => {
  // El crudo 0 es el piso absoluto y por la ley medida son −∞ dB. No hay número
  // de partida que declarar, así que no hay movimiento que medir.
  //
  // **Mentir sobre el punto de partida sigue cayendo igual que antes.** Decir
  // que se venía de −90 dB estando en silencio es exactamente la declaración
  // falsa que la atadura del origen existe para cazar, y el borde que se abrió
  // el 2026-09-19 no la exime: el caso con nombre propio pide que el llamador
  // **diga la verdad**, o sea −∞.
  const r = verificarAtaduraDelOrigen('i.3.aux.1.value', 0, -90, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_COINCIDE');
});

test('declarar el silencio con su nombre ya no es un rechazo ciego', () => {
  // **Esta afirmación cambió el 2026-09-19 y hay que decirlo donde estaba.**
  // Hasta entonces este caso daba `MAGNITUD_NO_NUMERICA` --«−∞ no es un
  // número»-- y ése era el motivo por el que una cuña apagada no se podía
  // levantar por ninguna vía: ni un número finito, que no coincide, ni −∞, que
  // no era un número. Era el borde que ADR-034 dejó anotado y sin construir.
  //
  // Ahora tiene nombre propio. **Sigue siendo `atada: false`**, porque de verdad
  // no hay nada que atar; lo que cambia es que el motor recibe el motivo y el
  // mínimo escribible, y decide él. Quién concede y con qué condiciones está en
  // `salir-del-silencio.test.ts`, que lo ataca por nueve lados.
  const menosInfinito = verificarAtaduraDelOrigen('i.3.aux.1.value', 0, -Infinity, 'dB');
  assert.equal(menosInfinito.atada, false);
  assert.equal(menosInfinito.atada === false && menosInfinito.codigo, 'ORIGEN_EN_SILENCIO');

  // El destino admisible viaja con el resultado, leído de la ley medida, para
  // que el motor no lo escriba a mano. Es lo que ADR-034 pidió expresamente.
  const e = entrada('i.3.aux.1.value');
  assert.ok(e);
  assert.equal(
    menosInfinito.atada === false && menosInfinito.codigo === 'ORIGEN_EN_SILENCIO'
      && menosInfinito.minimoEscribible,
    e.fisicoMin,
  );
});

test('en el DESTINO, −∞ sigue sin ser un número: la puerta es de salida', () => {
  // Apagarle la cuña a un músico por la puerta de salir del silencio sería lo
  // contrario de lo que esa puerta existe para hacer.
  const r = verificarAtadura('i.3.aux.1.value', 0, -Infinity, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'MAGNITUD_NO_NUMERICA');
});

test('sin ley medida el origen tampoco se ata, y se dice', () => {
  // Misma advertencia que el destino: esto no es un rechazo, es la declaración
  // honesta de que para esa ruta el motor sigue juzgando lo que le dicen. La
  // ganancia del previo --el único parámetro que la app mueve hoy de punta a
  // punta-- cae justo acá, y por eso hay que decirlo con todas las letras.
  const r = verificarAtaduraDelOrigen('i.N.dyn.threshold', 0.5, -42, 'dB');
  assert.equal(r.atada, false);
  assert.equal(r.atada === false && r.codigo, 'SIN_LEY_VERIFICADA');
});

/**
 * **El agujero que una auditoría adversarial midió el 2026-09-17, en el mismo
 * commit que ató el origen.**
 *
 * `atar` exigía que la MAGNITUD fuera un número finito y nunca miraba el CRUDO.
 * Con el crudo en `NaN`, `fromRaw` da `NaN`, `Math.abs(NaN - x) > holgura` es
 * `false` y la función contestaba `atada: true`. O sea el mismo `NaN` que este
 * repositorio ya había tapado dos veces, dejado abierto **en el otro operando
 * del mismo `if`**, dentro de la guarda escrita para cerrar ese agujero.
 *
 * Medido de punta a punta con el ejecutor real: declarando `valorEsperado: NaN`
 * y un movimiento de 1 dB, la cuña se movió **31 dB** y la transacción quedó
 * `APLICADA`.
 */
test('un crudo que no es un numero no ata nada, en los dos extremos', () => {
  for (const basura of [NaN, Infinity, -Infinity, undefined, null, 'ocho', {}]) {
    const o = verificarAtaduraDelOrigen('i.3.aux.1.value', basura as never, -1, 'dB');
    assert.equal(o.atada, false, `el origen con ${String(basura)} decia que si`);
    assert.equal(o.atada === false && o.codigo, 'CRUDO_NO_NUMERICO', String(basura));

    const d = verificarAtadura('i.3.aux.1.value', basura as never, -1, 'dB');
    assert.equal(d.atada, false, `el destino con ${String(basura)} decia que si`);
    assert.equal(d.atada === false && d.codigo, 'CRUDO_NO_NUMERICO', String(basura));
  }

  // Y el crudo de verdad sigue atando: la guarda no rompe lo que andaba.
  const bien = verificarAtaduraDelOrigen('i.3.aux.1.value', 0.5, -11.616, 'dB');
  assert.equal(bien.atada, true, bien.atada === false ? bien.motivo : '');
});
