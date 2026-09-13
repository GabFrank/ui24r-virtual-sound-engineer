import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeBajarEnvioAMonitor, type EstadoParaBajarMonitor } from '../src/bajar-envio-a-monitor.ts';
import { entrada, faderADb } from '@vse/mixer-adapter';

const base: EstadoParaBajarMonitor = {
  ruta: 'i.3.aux.1.value',
  nivelActualDb: 0,
  bajarDb: 2,
  sessionState: 'FULL_BAND',
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};
const con = (x: Partial<EstadoParaBajarMonitor>): EstadoParaBajarMonitor => ({ ...base, ...x });
const motivo = (v: ReturnType<typeof puedeBajarEnvioAMonitor>): string =>
  (v.puede ? '' : v.motivo);

test('baja un envío durante el soundcheck con la banda tocando', () => {
  const v = puedeBajarEnvioAMonitor(base);
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && Math.abs(v.destinoDb - (-2)) < 1e-9);
});

/**
 * **`FULL_BAND` y `RINGOUT` abiertos es el caso principal, no una excepción.**
 * Son exactamente cuándo se ajusta un monitor y cuándo se caza un acople.
 * Cerrarlos dejaría la categoría abierta sólo cuando no hay nadie tocando.
 */
test('los estados en que el usuario realmente ajusta monitores están abiertos', () => {
  for (const s of ['FULL_BAND', 'RINGOUT', 'MIX', 'CHANNEL_SETUP'] as const) {
    const v = puedeBajarEnvioAMonitor(con({ sessionState: s }));
    assert.equal(v.puede, true, `${s}: ${motivo(v)}`);
  }
});

test('con público en la sala, no', () => {
  const v = puedeBajarEnvioAMonitor(con({ sessionState: 'SHOW' }));
  assert.equal(v.puede, false);
  assert.match(motivo(v), /público/);
});

test('el paro y la conexión mandan sobre todo lo demás', () => {
  assert.match(motivo(puedeBajarEnvioAMonitor(con({ paroDeEmergencia: true }))), /paro/);
  assert.match(motivo(puedeBajarEnvioAMonitor(con({ conexionPermiteEscribir: false }))), /conectada/);
});

/**
 * La forma canónica y el rango real, que es lo que una auditoría midió que la
 * lista blanca vieja dejaba pasar.
 */
test('una ruta que la consola no publica no se propone', () => {
  for (const ruta of ['i.24.aux.0.value', 'i.99.aux.99.value', 'i.03.aux.1.value',
    'i.3.aux.10.value', 'i.3.mix', 'a.4.mix']) {
    const v = puedeBajarEnvioAMonitor(con({ ruta }));
    assert.equal(v.puede, false, `${ruta} no debería proponerse`);
  }
});

test('sólo baja: subir es del usuario', () => {
  for (const bajarDb of [0, -2]) {
    const v = puedeBajarEnvioAMonitor(con({ bajarDb }));
    assert.equal(v.puede, false);
    assert.match(motivo(v), /sólo baja/);
  }
});

test('no se mueve más de lo que el límite del dominio permite por transacción', () => {
  const v = puedeBajarEnvioAMonitor(con({ bajarDb: 6 }));
  assert.equal(v.puede, false);
  assert.match(motivo(v), /por vez/);
});

/**
 * **La prueba que justifica la medición.** Hasta el ítem 104 la ley del envío no
 * estaba medida contra nada externo, y hasta el arreglo de `entrada()` la tabla
 * no resolvía ninguna ruta concreta. Con las dos cosas, esta función puede
 * negarse a proponer un nivel cuya ley nadie midió — en vez de escribir un
 * número que sale de extrapolar.
 */
test('no propone un nivel fuera del tramo que la medición cubrió', () => {
  const e = entrada('i.3.aux.1.value');
  assert.ok(e !== undefined && e.estado === 'PROBADO', 'la ley del envío tiene que estar medida');
  // El piso medido es −32,14 dB; pedir bajar desde ahí se sale del tramo.
  const v = puedeBajarEnvioAMonitor(con({ nivelActualDb: e!.fisicoMin + 1, bajarDb: 2 }));
  assert.equal(v.puede, false);
  assert.match(motivo(v), /rango|medida/);
});

test('el crudo que propone está atado a los dB que declara', () => {
  const v = puedeBajarEnvioAMonitor(con({ nivelActualDb: 0, bajarDb: 2 }));
  assert.ok(v.puede);
  if (!v.puede) return;
  // La vuelta por la ley tiene que dar los mismos dB: si no, el motor lo
  // rechazaría con MAGNITUD_NO_ATADA, y con razón.
  assert.ok(Math.abs(faderADb(v.crudo) - v.destinoDb) < 0.01,
    `el crudo ${v.crudo} vale ${faderADb(v.crudo)} dB y se declara ${v.destinoDb}`);
});

test('sin saber dónde está el envío, no hay desde dónde bajar', () => {
  const v = puedeBajarEnvioAMonitor(con({ nivelActualDb: NaN }));
  assert.equal(v.puede, false);
  assert.match(motivo(v), /no se sabe/);
});
