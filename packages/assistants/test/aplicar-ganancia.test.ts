import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeAplicarGanancia, type EstadoParaAplicar } from '../src/aplicar-ganancia.ts';

/** Todo en orden: confianza alta, en configuracion de canales, conectado. */
const LISTO: EstadoParaAplicar = {
  confianza: 'HIGH',
  sessionState: 'CHANNEL_SETUP',
  hayTakeDeSoundcheckActivo: false,
  paroDeEmergencia: false,
  conexionPermiteEscribir: true,
  tomaPistaGrabada: false,
};

test('con todo en orden se aplica', () => {
  assert.equal(puedeAplicarGanancia(LISTO).puede, true);
});

test('MEDIA tambien aplica, y es el caso normal', () => {
  // La mayoria de las propuestas reales caen en MEDIA: basta un de-esser
  // activo. Exigir ALTA dejaria el boton apagado casi siempre.
  assert.equal(puedeAplicarGanancia({ ...LISTO, confianza: 'MEDIUM' }).puede, true);
});

test('BAJA y SIN DATOS no aplican, y dicen algo distinto', () => {
  const baja = puedeAplicarGanancia({ ...LISTO, confianza: 'LOW' });
  const sinDatos = puedeAplicarGanancia({ ...LISTO, confianza: 'INSUFFICIENT_DATA' });
  assert.equal(baja.puede, false);
  assert.equal(sinDatos.puede, false);
  if (!baja.puede && !sinDatos.puede) {
    assert.notEqual(baja.motivo, sinDatos.motivo,
      'sin datos se arregla midiendo de nuevo; confianza baja es otra cosa');
    assert.match(sinDatos.motivo, /volvé a medir/);
  }
});

test('INV-006: fuera de configuracion de canales no se toca la ganancia', () => {
  for (const estado of ['SHOW', 'FULL_BAND', 'SETUP'] as const) {
    const v = puedeAplicarGanancia({ ...LISTO, sessionState: estado });
    assert.equal(v.puede, false, `no deberia aplicar en ${estado}`);
    if (!v.puede) assert.match(v.motivo, /configuración de canales/);
  }
});

test('INV-006: con una toma de soundcheck activa tampoco', () => {
  const v = puedeAplicarGanancia({ ...LISTO, hayTakeDeSoundcheckActivo: true });
  assert.equal(v.puede, false);
  if (!v.puede) assert.match(v.motivo, /soundcheck/);
});

test('el paro de emergencia manda sobre todo lo demas', () => {
  // Incluso con la medicion perfecta y la sesion en el estado correcto.
  const v = puedeAplicarGanancia({ ...LISTO, paroDeEmergencia: true });
  assert.equal(v.puede, false);
  if (!v.puede) assert.match(v.motivo, /paro de emergencia/);
});

test('sin conexion confirmada no se escribe', () => {
  const v = puedeAplicarGanancia({ ...LISTO, conexionPermiteEscribir: false });
  assert.equal(v.puede, false);
});

test('siempre hay un motivo, y nunca esta vacio', () => {
  // Una pantalla que apaga un boton sin decir por que obliga a adivinar.
  const casos: EstadoParaAplicar[] = [
    { ...LISTO, confianza: 'LOW' },
    { ...LISTO, sessionState: 'SHOW' },
    { ...LISTO, hayTakeDeSoundcheckActivo: true },
    { ...LISTO, paroDeEmergencia: true },
    { ...LISTO, conexionPermiteEscribir: false },
    { ...LISTO, sessionState: null },
  ];
  for (const c of casos) {
    const v = puedeAplicarGanancia(c);
    assert.equal(v.puede, false);
    if (!v.puede) assert.ok(v.motivo.trim().length > 10, `motivo pobre: ${v.motivo}`);
  }
});

test('con una pista grabada sonando NO se aplica, y el motivo lo explica', () => {
  // Con el soundcheck virtual encendido, la perilla del previo esta
  // desconectada de lo que se escucha. Dejar aplicar y que no se oiga ningun
  // cambio es peor que no dejar: le ensena al usuario a desconfiar.
  const v = puedeAplicarGanancia({ ...LISTO, tomaPistaGrabada: true });
  assert.equal(v.puede, false);
  if (!v.puede) assert.match(v.motivo, /pista grabada/);
});

test('la pista grabada manda incluso sobre la confianza alta', () => {
  const v = puedeAplicarGanancia({ ...LISTO, confianza: 'HIGH', tomaPistaGrabada: true });
  assert.equal(v.puede, false);
});
