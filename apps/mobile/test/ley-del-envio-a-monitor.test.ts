import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeBajarEnvioAMonitor } from '@vse/assistants';
import { entrada, faderADb } from '@vse/mixer-adapter';
import { LEY_DEL_ENVIO } from '../src/app/monitor/ley-del-envio.ts';

/**
 * **El asistente con la ley de verdad.** `packages/assistants` no puede
 * importar el adaptador, así que sus tests usan una ley de mentira. Estas dos
 * pruebas venían de ahí y son las que justifican la medición: que el crudo que
 * el asistente propone esté atado a los dB que declara **por la ley medida**
 * —si no, el motor lo rechazaría con `MAGNITUD_NO_ATADA`— y que se niegue
 * fuera del tramo que el ítem 104 cubrió. Viven acá porque acá se puede
 * enchufar la ley real, igual que hace el servicio en producción.
 */
/**
 * **La ley que usa producción, no una copia.** Reconstruir acá
 * `{ aRaw, entrada, esNivelDeEnvioAMonitor }` probaría la ley y no probaría
 * que el servicio la enchufa: una auditoría cambió las tres funciones que
 * usa la aplicación por otras inventadas y la suite siguió en verde. Importando la
 * constante, ese defecto falla acá.
 */
const LEY = LEY_DEL_ENVIO;
const base = {
  ruta: 'i.3.aux.1.value',
  nivelActualDb: 0,
  bajarDb: 2,
  sessionState: 'FULL_BAND' as const,
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};

test('la ley del envío a monitor está medida, no supuesta', () => {
  const e = entrada(base.ruta);
  assert.ok(e !== undefined && e.estado === 'PROBADO', 'la ley del envío tiene que estar medida');
});

test('el crudo que propone el asistente vuelve a los mismos dB por la ley medida', () => {
  const v = puedeBajarEnvioAMonitor(base, LEY);
  assert.ok(v.puede, v.puede ? '' : v.motivo);
  if (!v.puede) return;
  assert.ok(Math.abs(faderADb(v.crudo) - v.destinoDb) < 0.01,
    `el crudo ${v.crudo} vale ${faderADb(v.crudo)} dB y se declara ${v.destinoDb}`);
});

test('no propone un nivel fuera del tramo que la medición cubrió', () => {
  const e = entrada(base.ruta)!;
  // El piso medido es −32,14 dB; pedir bajar desde un decibel arriba se sale.
  const v = puedeBajarEnvioAMonitor({ ...base, nivelActualDb: e.fisicoMin + 1, bajarDb: 2 }, LEY);
  assert.equal(v.puede, false);
  if (v.puede) return;
  assert.match(v.motivo, /rango|medida/);
  assert.match(v.motivo, new RegExp(e.spike.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
