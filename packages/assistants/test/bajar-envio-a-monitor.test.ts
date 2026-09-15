import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeBajarEnvioAMonitor, type EstadoParaBajarMonitor, type LeyDelEnvioAMonitor,
} from '../src/bajar-envio-a-monitor.ts';

/**
 * **Una ley de mentira, con el tramo escrito a mano.** Este paquete no puede
 * importar el adaptador —regla 3, `validate-limites`— así que la ley real no
 * entra acá. Lo que se prueba en este archivo es la decisión: cuándo el
 * asistente se niega y qué dice. Que el crudo que sale esté atado a los dB por
 * la ley **medida** se prueba donde esa ley se puede importar:
 * `apps/mobile/test/ley-del-envio-a-monitor.test.ts`.
 *
 * El tramo copia el del ítem 104 a propósito —de −32,14 a +10 dB— para que un
 * caso de borde acá se parezca a uno real, pero no es evidencia de nada.
 */
const TRAMO = { fisicoMin: -32.14, fisicoMax: 10, spike: 'ítem 104 (de mentira)' };
const RUTAS_REALES = /^i\.(?:[0-9]|1[0-9]|2[0-3])\.aux\.[0-9]\.value$/;
const leyDeMentira: LeyDelEnvioAMonitor = {
  esNivelDeEnvioAMonitor: (ruta) => RUTAS_REALES.test(ruta),
  entrada: (ruta) => (RUTAS_REALES.test(ruta) ? TRAMO : undefined),
  aRaw: (ruta, fisico) => {
    if (!RUTAS_REALES.test(ruta)) return { ok: false, codigo: 'SIN_MAPEO', mensaje: `${ruta} no está en la tabla` };
    if (fisico < TRAMO.fisicoMin || fisico > TRAMO.fisicoMax) {
      return { ok: false, codigo: 'FUERA_DE_RANGO', mensaje: `${fisico} dB queda fuera del tramo medido` };
    }
    // Lineal a propósito: es un crudo cualquiera, reconocible en los tests.
    return { ok: true, raw: (fisico - TRAMO.fisicoMin) / (TRAMO.fisicoMax - TRAMO.fisicoMin) };
  },
};

const base: EstadoParaBajarMonitor = {
  ruta: 'i.3.aux.1.value',
  nivelActualDb: 0,
  bajarDb: 2,
  sessionState: 'FULL_BAND',
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};
const con = (x: Partial<EstadoParaBajarMonitor>): EstadoParaBajarMonitor => ({ ...base, ...x });
const decidir = (x: Partial<EstadoParaBajarMonitor> = {}) => puedeBajarEnvioAMonitor(con(x), leyDeMentira);
const motivo = (v: ReturnType<typeof puedeBajarEnvioAMonitor>): string =>
  (v.puede ? '' : v.motivo);

test('baja un envío durante el soundcheck con la banda tocando', () => {
  const v = decidir();
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
    const v = decidir({ sessionState: s });
    assert.equal(v.puede, true, `${s}: ${motivo(v)}`);
  }
});

test('con público en la sala, no', () => {
  const v = decidir({ sessionState: 'SHOW' });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /público/);
});

test('el paro y la conexión mandan sobre todo lo demás', () => {
  assert.match(motivo(decidir({ paroDeEmergencia: true })), /paro/);
  assert.match(motivo(decidir({ conexionPermiteEscribir: false })), /conectada/);
});

/**
 * La forma canónica y el rango real, que es lo que una auditoría midió que la
 * lista blanca vieja dejaba pasar. Acá lo decide la ley que se pasa; lo que se
 * prueba es que el asistente le pregunta y obedece.
 */
test('una ruta que la ley no reconoce no se propone', () => {
  for (const ruta of ['i.24.aux.0.value', 'i.99.aux.99.value', 'i.03.aux.1.value',
    'i.3.aux.10.value', 'i.3.mix', 'a.4.mix']) {
    const v = decidir({ ruta });
    assert.equal(v.puede, false, `${ruta} no debería proponerse`);
    assert.match(motivo(v), /no es un nivel de envío/);
  }
});

test('sólo baja: subir es del usuario', () => {
  for (const bajarDb of [0, -2]) {
    const v = decidir({ bajarDb });
    assert.equal(v.puede, false);
    assert.match(motivo(v), /sólo baja/);
  }
});

test('no se mueve más de lo que el límite del dominio permite por transacción', () => {
  const v = decidir({ bajarDb: 6 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /por vez/);
});

/**
 * **La decisión que justifica la medición.** El asistente se niega a proponer
 * un nivel cuya ley nadie midió, en vez de escribir un número que sale de
 * extrapolar. Y dice hasta dónde está medida, con el nombre de la medición.
 */
test('no propone un nivel fuera del tramo que la ley declara medido', () => {
  const v = decidir({ nivelActualDb: TRAMO.fisicoMin + 1, bajarDb: 2 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /fuera del tramo/);
  assert.match(motivo(v), /−32\.1|-32\.1/);
  assert.match(motivo(v), /ítem 104/);
});

test('el crudo que propone es el que la ley devuelve para los dB que declara', () => {
  const v = decidir({ nivelActualDb: 0, bajarDb: 2 });
  assert.ok(v.puede);
  if (!v.puede) return;
  const esperado = leyDeMentira.aRaw(base.ruta, -2);
  assert.ok(esperado.ok && Math.abs(v.crudo - esperado.raw) < 1e-12);
});

test('sin saber dónde está el envío, no hay desde dónde bajar', () => {
  const v = decidir({ nivelActualDb: NaN });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /no se sabe/);
});
