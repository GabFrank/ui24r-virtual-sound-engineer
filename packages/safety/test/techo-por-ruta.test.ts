import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registrarTecho, registrarTechos, olvidarTecho } from '../src/techo-por-ruta.ts';

/**
 * **El mapa que el motor consultaba y que nadie llenaba.**
 *
 * `techoPorRuta` existía en `ContextoSeguridad`, el motor lo leía en cada envío a
 * monitor, y en producción **siempre estaba vacío**: sólo los tests lo poblaban.
 * Un motor que consulta un mapa vacío no rechaza nada, así que la regla que
 * ADR-028 decidió vivía en el código y no en el comportamiento.
 *
 * La regla es del usuario, textual: *«Hasta donde estaba antes de que yo lo
 * bajara, y ni un paso más»*.
 */
const envio = (path: string, de: number, a: number) => ({
  kind: 'MONITOR_AUX_SEND' as const, path, magnitudEsperada: de, magnitudPropuesta: a,
});

test('bajar un envio a monitor ancla el techo donde estaba', () => {
  const t = registrarTecho(new Map(), envio('i.3.aux.1.value', -6, -12));
  assert.equal(t.get('i.3.aux.1.value'), -6, 'el techo es de DONDE venia, no adonde fue');
});

test('subir no ancla nada', () => {
  // **El techo existe para acotar la vuelta de algo que la aplicación bajó.**
  // Si sube sin haber bajado, no hay nada que acotar, y anclar ahí le pondría un
  // techo a una ruta que el usuario nunca vio bajar.
  const t = registrarTecho(new Map(), envio('i.3.aux.1.value', -12, -6));
  assert.equal(t.size, 0);
});

test('sin cambio tampoco', () => {
  assert.equal(registrarTecho(new Map(), envio('i.3.aux.1.value', -6, -6)).size, 0);
});

test('solo el envio a monitor, que es a lo unico que ADR-028 le puso techo', () => {
  const t = registrarTecho(new Map(), {
    kind: 'PREAMP_GAIN', path: 'hw.3.gain', magnitudEsperada: 20, magnitudPropuesta: 14,
  });
  assert.equal(t.size, 0);
});

test('el PRIMER descenso manda: el segundo no mueve el techo', () => {
  // **Después del primero, el valor que la ruta «tenía» ya no es el del usuario**
  // sino uno que la aplicación puso. Subir hasta ahí sería subir hasta donde la
  // aplicación la dejó, no hasta donde estaba.
  const t = registrarTechos(new Map(), [
    envio('i.3.aux.1.value', -6, -12),
    envio('i.3.aux.1.value', -12, -18),
  ]);
  assert.equal(t.get('i.3.aux.1.value'), -6, 'sigue siendo el valor original del usuario');
});

test('cada ruta tiene el suyo', () => {
  const t = registrarTechos(new Map(), [
    envio('i.3.aux.1.value', -6, -12),
    envio('i.7.aux.4.value', -20, -26),
  ]);
  assert.equal(t.size, 2);
  assert.equal(t.get('i.7.aux.4.value'), -20);
});

test('no muta el mapa que recibe', () => {
  // Un mapa compartido que alguien modifica mientras el motor lo lee es la clase
  // de error que no se reproduce.
  const antes = new Map<string, number>();
  const despues = registrarTecho(antes, envio('i.3.aux.1.value', -6, -12));
  assert.equal(antes.size, 0, 'el original queda intacto');
  assert.equal(despues.size, 1);
});

test('una magnitud que no es un numero no ancla nada', () => {
  // Anclar en NaN pondria un techo que ninguna comparacion satisface: el motor
  // rechazaria TODO en esa ruta y nadie sabria por que.
  assert.equal(registrarTecho(new Map(), envio('i.3.aux.1.value', NaN, -12)).size, 0);
});

test('olvidar el techo existe para cuando el usuario mueve el envio a mano', () => {
  // Es el caso que el anclaje automatico NO puede ver: el usuario dijo «antes de
  // que YO lo bajara» y esto se ancla en lo que bajo la APLICACION.
  const t = registrarTecho(new Map(), envio('i.3.aux.1.value', -6, -12));
  assert.equal(olvidarTecho(t, 'i.3.aux.1.value').size, 0);
  assert.equal(olvidarTecho(t, 'i.9.aux.1.value'), t, 'sin cambios, devuelve el mismo');
});

/**
 * **El lazo entero, que es lo único que prueba que la pieza existe de verdad.**
 *
 * Un productor que nadie conecta al motor deja el mapa igual de vacío que antes.
 * Esto recorre el camino completo: la aplicación baja un envío, el techo queda
 * anclado, y un intento posterior de subir por encima **lo rechaza el motor**,
 * con el código y la invariante que ADR-028 especifica.
 */
test('el lazo completo: bajar ancla, y el motor rechaza la vuelta de mas', async () => {
  const { SafetyEngine } = await import('../src/engine.ts');
  const { contexto } = await import('./helpers.ts');
  const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };

  const ruta = 'i.3.aux.1.value';
  const e = new SafetyEngine();

  // 1. La aplicación baja el envío de −6 a −12 dB, y eso ancla el techo.
  const techos = registrarTecho(new Map(), envio(ruta, -6, -12));
  assert.equal(techos.get(ruta), -6);

  // 2. Después intenta subirlo por encima de donde estaba.
  //
  // **El salto tiene que caber dentro del tope de INV-004**, o el rechazo no
  // probaría nada: los dos usan el mismo código `DELTA_EXCEDIDO`, así que un
  // salto grande dispararía el tope de magnitud y el test celebraría el techo sin
  // haberlo ejercitado. De −8 a −5,5 son 2,5 dB, dentro del ±3 — y −5,5 está por
  // encima del techo de −6.
  const subirDeMas = {
    kind: 'MONITOR_AUX_SEND' as const,
    path: ruta,
    unidad: 'dB',
    valorPropuesto: 0.8,
    valorEsperado: 0.7,
    magnitudPropuesta: -5.5,
    magnitudEsperada: -8,
  };
  const v = e.evaluar([subirDeMas], { ...contexto(), techoPorRuta: techos }, ok);
  assert.equal(v.permitido, false, 'subir por encima del techo no se escribe');
  const porTecho = !v.permitido && v.rechazos.filter((r) => r.codigo === 'DELTA_EXCEDIDO'
    && r.invariante === 'INV-010');
  assert.ok(porTecho && porTecho.length === 1,
    `tiene que rechazarlo el techo (INV-010) y no otra cosa: ${
      !v.permitido ? v.rechazos.map((r) => `${r.codigo}/${r.invariante}`).join(' ') : ''}`);

  // 3. Y volver justo hasta el techo se permite: es un techo, no una prohibición
  //    de volver.
  const volver = { ...subirDeMas, magnitudPropuesta: -6 };
  const w = e.evaluar([volver], { ...contexto(), techoPorRuta: techos }, ok);
  assert.ok(w.permitido || !w.rechazos.some((r) => r.invariante === 'INV-010'),
    `volver hasta el techo exacto no lo excede: ${
      !w.permitido ? w.rechazos.map((r) => `${r.codigo}/${r.invariante}`).join(' ') : ''}`);

  // 4. **Y con el mapa vacío, la misma subida de más pasa el techo sin más.** Es
  //    lo que ocurría en producción hasta hoy: la regla vivía en el motor y no en
  //    el comportamiento, porque nadie llenaba el mapa.
  const sinTecho = e.evaluar([subirDeMas], contexto(), ok);
  assert.ok(sinTecho.permitido
    || !sinTecho.rechazos.some((r) => r.invariante === 'INV-010'),
    'con el mapa vacío el techo no rechaza nada: ése era el agujero');
});
