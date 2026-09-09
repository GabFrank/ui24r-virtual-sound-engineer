import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  byteDeReduccion, codificarVu, dbDeReduccion, decodificarVuCanales,
  fraccionDeReduccion, REDUCCION_RANGO_DB,
} from '../src/protocol.ts';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * La reducción de ganancia viajaba en cada trama y no la leía nadie.
 *
 * Es el sexto byte de cada canal. Con ella se puede decir «este nivel ya viene
 * 9 dB comprimido» en vez de «hay un compresor, cuidado», y sobre todo se puede
 * distinguir un compresor **puesto** de uno **actuando**: sin esa distinción,
 * casi todos los canales de un show llevarían aviso y el aviso dejaría de
 * significar algo.
 */

test('el recorrido del medidor de reducción es la mitad del de nivel', () => {
  // COMP_ZOOM = 2: la consola dibuja este medidor al doble de escala.
  assert.equal(REDUCCION_RANGO_DB, 40);
});

test('el byte 247 es reducción nula, y es el que mandan los canales quietos', () => {
  // Medido: con el compresor sin actuar el byte vale 247 en todos los canales.
  // Sin la zona muerta de la consola daría 0,32 dB de reducción permanente en
  // los veinticuatro.
  assert.equal(fraccionDeReduccion(247), 0);
  assert.equal(dbDeReduccion(247), 0);
});

test('el bit 7 no interviene en la cuenta: es el indicador de puerta', () => {
  // 247 y 119 son el mismo valor con y sin el bit 7. Leer ese bit como parte
  // del número da una reducción inventada.
  assert.equal(dbDeReduccion(247), dbDeReduccion(119));
});

test('los tres puntos medidos contra la consola caen donde deben', () => {
  // Medidos el 2026-09-09 con tono fijo y el umbral del compresor bajando.
  // La fracción es la que informa la consola; los decibeles, los medidos.
  const puntos: readonly { fraccion: number; medidoDb: number }[] = [
    { fraccion: 0.108, medidoDb: 4.66 },
    { fraccion: 0.225, medidoDb: 9.00 },
    { fraccion: 0.275, medidoDb: 10.80 },
  ];
  for (const p of puntos) {
    const calculado = p.fraccion * REDUCCION_RANGO_DB;
    assert.ok(
      Math.abs(calculado - p.medidoDb) <= 0.35,
      `fracción ${p.fraccion}: calculado ${calculado.toFixed(2)} contra ${p.medidoDb} medidos`,
    );
  }
});

test('la reducción crece cuando el byte baja, y nunca pasa del recorrido', () => {
  assert.ok(dbDeReduccion(200) > dbDeReduccion(240));
  for (let b = 0; b <= 255; b++) {
    const db = dbDeReduccion(b);
    assert.ok(db >= 0 && db <= REDUCCION_RANGO_DB, `byte ${b} dio ${db}`);
  }
});

test('el byte y los decibeles son ida y vuelta dentro de un escalón', () => {
  // El escalón del medidor de reducción es de 2/3 de decibel: el byte avanza de
  // a uno y `a` de a dos.
  for (const db of [0, 1, 3, 4.66, 9, 10.8, 20, 39]) {
    const vuelta = dbDeReduccion(byteDeReduccion(db));
    assert.ok(Math.abs(vuelta - db) <= 0.7, `${db} dB volvió como ${vuelta.toFixed(2)}`);
  }
});

test('la trama trae la reducción por canal, en su sexto byte', () => {
  const trama = codificarVu([0.5, 0.5, 0.5], [0, 9, 4.66]);
  const canales = decodificarVuCanales(trama);

  assert.equal(canales[0]?.reduccionDb, 0);
  assert.ok(Math.abs((canales[1]?.reduccionDb ?? 0) - 9) <= 0.7);
  assert.ok(Math.abs((canales[2]?.reduccionDb ?? 0) - 4.66) <= 0.7);
});

test('el nivel anterior al proceso NO lo mueve el compresor, y el de entrada sí', async () => {
  // Las dos mitades de lo que se midió el 2026-09-09, de punta a punta. Es la
  // afirmación sobre la que se apoya todo el asistente de ganancia: si estos
  // dos números fueran el mismo, no habría dónde medir limpio.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  // Mismo nivel antes del dinámico, 5 dB menos después: el compresor apretando.
  t.entra(`VU2^${codificarVu([0.55], [5], [0.6125])}`);
  const [canal] = a.canales(1);

  assert.ok(canal !== undefined);
  assert.ok(
    canal.nivelPreProcesoDb > canal.nivelDb + 3,
    `pre ${canal.nivelPreProcesoDb.toFixed(2)} contra entrada ${canal.nivelDb.toFixed(2)}: ` +
    'el compresor tiene que verse en uno y no en el otro',
  );
  assert.ok(canal.reduccionDb > 4);

  await a.desconectar();
});

test('el pico anterior al proceso se sostiene y se reinicia con los demás', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(`VU2^${codificarVu([0.4], [0], [0.7])}`);
  t.entra(`VU2^${codificarVu([0.2], [0], [0.3])}`);
  const [canal] = a.canales(1);
  assert.ok((canal?.picoPreProcesoDb ?? -Infinity) > (canal?.nivelPreProcesoDb ?? 0));

  a.reiniciarPicos();
  assert.equal(a.canales(1)[0]?.picoPreProcesoDb, -Infinity);

  await a.desconectar();
});

test('el adaptador expone la reducción y su pico por canal', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(`VU2^${codificarVu([0.6, 0.6], [9, 0])}`);
  const [conCompresor, limpio] = a.canales(2);
  assert.ok((conCompresor?.reduccionDb ?? 0) > 8);
  assert.equal(limpio?.reduccionDb, 0);

  // El compresor suelta: el instantáneo cae, el pico se sostiene. Es lo que
  // hace que la insignia no parpadee entre frase y frase.
  t.entra(`VU2^${codificarVu([0.6, 0.6], [0, 0])}`);
  const [despues] = a.canales(2);
  assert.equal(despues?.reduccionDb, 0);
  assert.ok((despues?.reduccionPicoDb ?? 0) > 8);

  // Y se reinicia con los demás picos: si no, un canal ya puenteado seguiría
  // acusado para siempre.
  a.reiniciarPicos();
  assert.equal(a.canales(2)[0]?.reduccionPicoDb, 0);

  await a.desconectar();
});
