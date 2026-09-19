import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeSubirEnvioAMonitor } from '@vse/assistants';
import { entrada, faderADb } from '@vse/mixer-adapter';
import { LEY_DEL_ENVIO } from '../src/app/monitor/ley-del-envio.ts';

/**
 * **El asistente que sube, con la ley de verdad.**
 *
 * `packages/assistants` no puede importar el adaptador —regla 3— así que allá la
 * ley es de mentira y lo que se prueba es la decisión. Acá se prueba lo otro, que
 * es lo que justifica haber medido: que **el crudo que el asistente propone esté
 * atado a los dB que declara por la ley medida**. Si no lo estuviera, el motor lo
 * rechazaría con `MAGNITUD_NO_ATADA` y la subida no llegaría nunca al cable.
 *
 * Y se importa `LEY_DEL_ENVIO`, la constante que usa producción, **no una copia**:
 * una auditoría midió que reconstruir el objeto acá dejaba pasar que la
 * aplicación enchufara otras funciones sin que nada fallara.
 */
const LEY = LEY_DEL_ENVIO;
const RUTA = 'i.3.aux.1.value';
const base = {
  ruta: RUTA,
  nivelActualDb: -20,
  subirDb: 2,
  sessionState: 'FULL_BAND' as const,
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
};

test('el crudo propuesto y los dB declarados dicen lo mismo, por la ley medida', () => {
  const v = puedeSubirEnvioAMonitor(base, LEY);
  assert.equal(v.puede, true, v.puede ? '' : v.motivo);
  assert.ok(v.puede);
  // Ida y vuelta por la ley real: el crudo que va al cable tiene que producir
  // los decibeles que el motor va a juzgar. Es exactamente lo que
  // `verificarAtadura` comprueba después, con el 1 % del recorrido de holgura.
  const e = entrada(RUTA);
  assert.ok(e);
  const recorrido = Math.abs(e.fisicoMax - e.fisicoMin);
  assert.ok(
    Math.abs(faderADb(v.crudo) - v.destinoDb) <= recorrido * 0.01,
    `el crudo ${v.crudo} da ${faderADb(v.crudo)} dB y se declaran ${v.destinoDb}`,
  );
});

test('desde el silencio, el destino es el mínimo de la ley REAL y el crudo lo confirma', () => {
  const v = puedeSubirEnvioAMonitor({ ...base, nivelActualDb: -Infinity }, LEY);
  assert.equal(v.puede, true, v.puede ? '' : v.motivo);
  assert.ok(v.puede && v.saleDelSilencio);

  const e = entrada(RUTA);
  assert.ok(e);
  // **El destino sale de la ley, no de un número escrito a mano.** Es lo que
  // ADR-034 pidió expresamente, y es el único destino que el motor concede desde
  // el silencio: cualquier otro rebota con `SALIDA_DEL_SILENCIO_NO_PERMITIDA`.
  assert.equal(v.destinoDb, e.fisicoMin);
  const recorrido = Math.abs(e.fisicoMax - e.fisicoMin);
  assert.ok(Math.abs(faderADb(v.crudo) - v.destinoDb) <= recorrido * 0.01);
  // Y es de verdad el piso del tramo medido: por debajo no hay ley.
  assert.ok(v.destinoDb < -32 && v.destinoDb > -33, `${v.destinoDb} dB`);
});

test('con la ley real, pasarse de nominal se rechaza', () => {
  const v = puedeSubirEnvioAMonitor({ ...base, nivelActualDb: -1 }, LEY);
  assert.equal(v.puede, false);
});

test('con la ley real, una ruta que no es envío a monitor se rechaza', () => {
  // El alias con ceros es la ruta que suena igual en la sala y que el techo por
  // ruta no cuenta. La regla de verdad vive en el adaptador y acá se comprueba
  // que el asistente la obedece en vez de tener su propia copia.
  for (const ruta of ['i.03.aux.1.value', 'i.24.aux.0.value', 'i.3.aux.10.value']) {
    const v = puedeSubirEnvioAMonitor({ ...base, ruta }, LEY);
    assert.equal(v.puede, false, `${ruta} no tendría que pasar`);
  }
});

/**
 * **De punta a punta: lo que el asistente propone, ¿lo acepta el motor?**
 *
 * Es la prueba que más importa de este archivo, y la que esta sesión aprendió a
 * hacer por las malas. El 2026-09-18 se midieron dos funciones sueltas, se
 * concluyó sobre el sistema, y la conclusión era falsa: la cadena real se
 * rompía en un eslabón que ninguna de las dos mediciones tocaba.
 *
 * Así que acá se arma el `CambioPropuesto` **exactamente como lo arma el
 * servicio** —incluido el `magnitudEsperada: -Infinity` del caso del silencio— y
 * se lo pasa a `SafetyEngine.evaluar`. Si el asistente y el motor se
 * desincronizaran, esto falla.
 */
const contextoDeSoundcheck = () => ({
  sessionState: 'SOUNDCHECK',
  nivelAutonomia: 'ASSISTED',
  aprobacionExplicita: true,
  acumuladoPorRuta: new Map(),
  rutasYaTocadas: new Set(),
  rutasConMedicionPosterior: new Set(),
  rutasConNivelEstablecido: new Set(),
  techoPorRuta: new Map(),
  hayTakeDeSoundcheckActivo: false,
  busesDePa: new Set(),
}) as never;

/** El mismo objeto que construye `EnvioAMonitorService.subir`. */
function cambioComoLoArmaElServicio(
  v: { destinoDb: number; crudo: number; saleDelSilencio: boolean },
  crudoActual: number, nivelActualDb: number,
) {
  return {
    kind: 'MONITOR_AUX_SEND' as const,
    path: RUTA,
    unidad: 'dB',
    valorPropuesto: v.crudo,
    valorEsperado: crudoActual,
    magnitudPropuesta: v.destinoDb,
    magnitudEsperada: v.saleDelSilencio ? -Infinity : nivelActualDb,
  };
}

test('DE PUNTA A PUNTA: encender desde el silencio pasa el motor', async () => {
  const { SafetyEngine } = await import('@vse/safety');
  const v = puedeSubirEnvioAMonitor({ ...base, nivelActualDb: -Infinity }, LEY);
  assert.ok(v.puede);
  // El crudo del silencio es 0: es donde `faderADb` da −∞.
  const cambio = cambioComoLoArmaElServicio(v, 0, -Infinity);
  const veredicto = new SafetyEngine().evaluar([cambio] as never, contextoDeSoundcheck(), {
    conexionPermiteEscribir: true, snapshotVerificado: true,
  });
  assert.equal(
    veredicto.permitido, true,
    JSON.stringify((veredicto as { rechazos?: unknown }).rechazos ?? []),
  );
});

test('DE PUNTA A PUNTA: un paso normal de 2 dB pasa el motor', async () => {
  const { SafetyEngine } = await import('@vse/safety');
  const e = entrada(RUTA);
  assert.ok(e);
  const desde = -20;
  const v = puedeSubirEnvioAMonitor({ ...base, nivelActualDb: desde }, LEY);
  assert.ok(v.puede);
  const cambio = cambioComoLoArmaElServicio(v, e.toRaw(desde), desde);
  const veredicto = new SafetyEngine().evaluar([cambio] as never, contextoDeSoundcheck(), {
    conexionPermiteEscribir: true, snapshotVerificado: true,
  });
  assert.equal(
    veredicto.permitido, true,
    JSON.stringify((veredicto as { rechazos?: unknown }).rechazos ?? []),
  );
});
