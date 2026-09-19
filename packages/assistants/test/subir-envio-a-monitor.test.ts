import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITES } from '@vse/domain';
import {
  puedeSubirEnvioAMonitor, type EstadoParaSubirMonitor,
} from '../src/subir-envio-a-monitor.ts';
import type { LeyDelEnvioAMonitor } from '../src/bajar-envio-a-monitor.ts';

/**
 * **La misma ley de mentira e invertida que usa la que baja, y por el mismo
 * motivo.** Este paquete no puede importar el adaptador —regla 3,
 * `validate-limites`— así que la ley real no entra acá; lo que se prueba es la
 * decisión. La ley acepta una ruta que ninguna consola tiene y rechaza una real
 * y canónica, para que un asistente que no le preguntara a la ley fallara por los
 * dos lados a la vez en vez de pasar contra una copia de la regla.
 *
 * Que el crudo que sale esté atado a los dB por la ley **medida** se prueba donde
 * esa ley se puede importar: `apps/mobile/test`.
 *
 * **Y acá se ataca, no se mutan.** Los casos que más importan no son los que
 * confirman que sube 2 dB: son los que intentan **pasarse** —del techo, del tope
 * por paso, del tramo medido— y el borde del silencio, que es donde el motor
 * tiene la única puerta abierta y donde proponer mal es proponer un rebote.
 */
const TRAMO = { fisicoMin: -32.14, fisicoMax: 10, spike: 'ítem 104 (de mentira)' };
const ACEPTADA = 'inventada.para.este.test';
const RECHAZADA_AUNQUE_REAL = 'i.3.aux.1.value';
const leyDeMentira: LeyDelEnvioAMonitor = {
  esNivelDeEnvioAMonitor: (ruta) => ruta === ACEPTADA,
  entrada: (ruta) => (ruta === ACEPTADA ? TRAMO : undefined),
  aRaw: (ruta, fisico) => {
    if (ruta !== ACEPTADA) return { ok: false, codigo: 'SIN_MAPEO', mensaje: `${ruta} no está en la tabla` };
    if (fisico < TRAMO.fisicoMin || fisico > TRAMO.fisicoMax) {
      return { ok: false, codigo: 'FUERA_DE_RANGO', mensaje: `${fisico} dB queda fuera del tramo medido` };
    }
    return { ok: true, raw: (fisico - TRAMO.fisicoMin) / (TRAMO.fisicoMax - TRAMO.fisicoMin) };
  },
};

const base: EstadoParaSubirMonitor = {
  ruta: ACEPTADA,
  nivelActualDb: -20,
  subirDb: 2,
  sessionState: 'FULL_BAND',
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};
const con = (x: Partial<EstadoParaSubirMonitor>): EstadoParaSubirMonitor => ({ ...base, ...x });
const decidir = (x: Partial<EstadoParaSubirMonitor> = {}) => puedeSubirEnvioAMonitor(con(x), leyDeMentira);
const motivo = (v: ReturnType<typeof puedeSubirEnvioAMonitor>): string => (v.puede ? '' : v.motivo);

test('sube un envío durante el soundcheck con la banda tocando', () => {
  const v = decidir();
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && Math.abs(v.destinoDb - (-18)) < 1e-9);
  assert.equal(v.puede && v.saleDelSilencio, false);
});

test('el primer paso desde el silencio va al mínimo escribible, no a 2 dB', () => {
  // Es la decisión del usuario en ADR-034 entre tres opciones. Desde el silencio
  // no hay desde dónde contar 2 dB, y el motor sólo concede hacia este punto.
  const v = decidir({ nivelActualDb: -Infinity });
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && v.destinoDb === TRAMO.fisicoMin);
  assert.equal(v.puede && v.saleDelSilencio, true, 'quien arme el cambio necesita saberlo');
});

test('desde el silencio, cuánto se pidió subir no cambia el destino', () => {
  // El destino no lo elige quien pide: lo elige la ley. Pedir 30 dB desde el
  // silencio no tiene que dar otra cosa que el mínimo, ni tiene que rebotar.
  const v = decidir({ nivelActualDb: -Infinity, subirDb: 30 });
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && v.destinoDb === TRAMO.fisicoMin);
});

test('ATAQUE: no se pasa del techo de nominal, y lo dice en vez de recortar', () => {
  const techo = LIMITES.MONITOR_AUX_SEND?.techoAbsoluto;
  assert.equal(techo, 0, 'si el techo cambia, este test tiene que enterarse');
  const v = decidir({ nivelActualDb: -1, subirDb: 2 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /techo/);
});

test('llegar justo a nominal se permite: el techo es un tope, no una zona', () => {
  const v = decidir({ nivelActualDb: -2, subirDb: 2 });
  assert.equal(v.puede, true, motivo(v));
  assert.ok(v.puede && Math.abs(v.destinoDb - 0) < 1e-9);
});

test('ATAQUE: más de 2 dB por vez se rechaza, y el número sale de la tabla', () => {
  const tope = LIMITES.MONITOR_AUX_SEND?.porTransaccion;
  assert.equal(tope, 2, 'si el tope cambia, este test tiene que enterarse');
  const v = decidir({ subirDb: 2.5 });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /de a poco/);
});

test('ATAQUE: pedir bajar por esta puerta se rechaza', () => {
  for (const subirDb of [0, -2, Number.NaN]) {
    const v = decidir({ subirDb });
    assert.equal(v.puede, false, `subirDb ${subirDb} no tendría que pasar`);
  }
});

test('ATAQUE: sin saber dónde está la cuña no se sube', () => {
  // `+Infinity` y `NaN` no son silencio: son no saber. Y el orden importa,
  // porque `Number.isFinite(-Infinity)` también es falso.
  for (const nivelActualDb of [Number.POSITIVE_INFINITY, Number.NaN]) {
    const v = decidir({ nivelActualDb });
    assert.equal(v.puede, false);
    assert.match(motivo(v), /no se sabe dónde está/);
  }
});

test('ATAQUE: una ruta que la ley no reconoce no se toca, aunque sea real', () => {
  const v = decidir({ ruta: RECHAZADA_AUNQUE_REAL });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /no es un nivel de envío a monitor/);
});

test('ATAQUE: en SHOW no se sube', () => {
  const v = decidir({ sessionState: 'SHOW' });
  assert.equal(v.puede, false);
  assert.match(motivo(v), /público/);
});

test('ATAQUE: con el paro de emergencia o sin conexión confirmada, no', () => {
  assert.equal(decidir({ paroDeEmergencia: true }).puede, false);
  assert.equal(decidir({ conexionPermiteEscribir: false }).puede, false);
});

test('ATAQUE: el silencio no esquiva el paro de emergencia ni el show', () => {
  // El borde del silencio se mira antes que los decibeles, así que conviene
  // comprobar que no se adelantó a las guardas que van primero.
  assert.equal(decidir({ nivelActualDb: -Infinity, paroDeEmergencia: true }).puede, false);
  assert.equal(decidir({ nivelActualDb: -Infinity, sessionState: 'SHOW' }).puede, false);
  assert.equal(decidir({ nivelActualDb: -Infinity, ruta: RECHAZADA_AUNQUE_REAL }).puede, false);
});

test('sin ley medida no se propone nada, ni siquiera desde el silencio', () => {
  const leySinTramo: LeyDelEnvioAMonitor = {
    ...leyDeMentira,
    entrada: () => undefined,
  };
  const v = puedeSubirEnvioAMonitor(con({ nivelActualDb: -Infinity }), leySinTramo);
  assert.equal(v.puede, false);
  assert.match(motivo(v), /no tiene ley medida/);
});

test('ATAQUE: desde el silencio, pedir BAJAR tampoco pasa', () => {
  // **Este agujero existió y lo cazó una auditoría.** La rama del silencio se
  // adelantaba a la comprobación de que lo pedido fuera subir, así que −5, 0,
  // `NaN` y −∞ contestaban que sí. Inocuo para el producto —el destino es fijo—
  // pero el nombre de la función mentía, y una función que miente sobre lo que
  // hace es la forma de error que este repositorio corrige.
  for (const subirDb of [-5, 0, Number.NaN, Number.NEGATIVE_INFINITY]) {
    const v = decidir({ nivelActualDb: -Infinity, subirDb });
    assert.equal(v.puede, false, `subirDb ${subirDb} desde el silencio no tendría que pasar`);
    assert.match(motivo(v), /sólo sube/);
  }
});

test('desde el silencio, un pedido de subir cualquiera sí pasa, y siempre al mismo sitio', () => {
  // La otra mitad: que cerrar el agujero no haya cerrado el caso real. Cuánto se
  // pide sigue sin importar; que se pida subir, sí.
  for (const subirDb of [0.5, 2, 30]) {
    const v = decidir({ nivelActualDb: -Infinity, subirDb });
    assert.equal(v.puede, true, motivo(v));
    assert.ok(v.puede && v.destinoDb === TRAMO.fisicoMin);
  }
});
