import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificarVu, dbDeMedidor } from '../src/protocol.ts';
import { decodificarVuBuses } from '../src/vu-buses.ts';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * El medidor de la cuña de un músico, desde la trama hasta la aplicación.
 *
 * **Por qué hace falta que llegue, que es lo que estos tests protegen.** El
 * motor exige una escucha entre un paso y el siguiente sobre el mismo mando. Para
 * la ganancia esa escucha se comprueba sobre el medidor del canal y alcanza,
 * porque la ganancia está antes de ese medidor. **Para la cuña no**: el envío a
 * un auxiliar sale del canal hacia otro lado, así que subirlo no mueve el medidor
 * del canal ni un escalón. Sin este bloque, una escucha de monitor probaría que
 * el músico tocó y no diría nada de si su cuña sonó.
 *
 * La cola de `VU2` traía estos bytes desde siempre y el decodificador los lee
 * desde el 2026-09-09; lo único que faltaba era el tramo hasta la aplicación en
 * marcha, que hasta hoy los tiraba.
 */

/** Una trama con un canal y las cuñas que se le pidan. */
function trama(
  canal: number,
  cunas: readonly number[],
  antesDelFader?: readonly number[],
): string {
  const campos = antesDelFader === undefined
    ? { auxiliares: { posiciones: cunas } }
    : { auxiliares: { posiciones: cunas, posicionesAntesDelFader: antesDelFader } };
  return `VU2^${codificarVu([canal], [], [], campos)}`;
}

test('el constructor de tramas sabe armar la cola, que antes no podía', () => {
  // **Este test es la guarda del propio banco de pruebas.** Mientras `codificarVu`
  // declaraba cero auxiliares en la cabecera, cualquier lector de la cola pasaba
  // en verde sin leer un solo byte de cuña: no había cola que leer. Es el mismo
  // punto ciego que tuvieron los seis bytes iguales del canal.
  const sinCunas = decodificarVuBuses(codificarVu([0.5]));
  assert.deepEqual(sinCunas.auxiliares, [], 'sin pedirlas, la cola sigue vacía como antes');

  const conCunas = decodificarVuBuses(codificarVu([0.5], [], [], {
    auxiliares: { posiciones: [0.25, 0.75] },
  }));
  assert.equal(conCunas.auxiliares.length, 2);
});

test('el nivel de la cuña llega a la aplicación, y antes se tiraba', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  assert.deepEqual(
    a.auxiliares(), [],
    'antes de la primera trama no hay cuñas: la cantidad sale de la cabecera, no de una constante',
  );

  t.entra(trama(0.5, [0.25, 0.75]));
  const cunas = a.auxiliares();

  assert.equal(cunas.length, 2);
  assert.ok(Math.abs(cunas[0]!.nivelDb - dbDeMedidor(0.25)) < 0.5);
  assert.ok(Math.abs(cunas[1]!.nivelDb - dbDeMedidor(0.75)) < 0.5);
  assert.equal(cunas[0]!.indice, 1, 'base uno, igual que los canales');

  await a.desconectar();
});

test('subir el envío mueve la cuña y NO mueve el canal: es el motivo de todo esto', async () => {
  // **La asimetría con la ganancia, de punta a punta.** El envío a un auxiliar es
  // pre-fader —`i.N.aux.M.post = 0`, leído del aparato— y deriva del canal hacia
  // el bus, así que moverlo cambia el medidor del auxiliar y deja el del canal
  // exactamente donde estaba. Escuchar sólo el canal, como hace la ganancia,
  // sería escuchar un número que el cambio no puede tocar.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(trama(0.5, [0.20]));
  const canalAntes = a.canales(1)[0]!.nivelPreProcesoDb;
  const cunaAntes = a.auxiliares()[0]!.nivelDb;

  // El músico toca igual y la aplicación le sube la cuña.
  t.entra(trama(0.5, [0.40]));
  const canalDespues = a.canales(1)[0]!.nivelPreProcesoDb;
  const cunaDespues = a.auxiliares()[0]!.nivelDb;

  assert.equal(canalDespues, canalAntes, 'el medidor del canal no se entera del envío');
  assert.ok(
    cunaDespues > cunaAntes + 10,
    `la cuña sí: ${cunaAntes.toFixed(1)} → ${cunaDespues.toFixed(1)} dB`,
  );

  await a.desconectar();
});

test('una cuña que recibe señal y no suena se distingue de una que suena', async () => {
  // **El caso que decide qué byte se mira.** El fader del auxiliar está entre los
  // dos: el de adelante responde al envío, el de atrás a lo que sale hacia el
  // parlante. Medido el 2026-09-13 —con ese fader en la unidad de ganancia los
  // dos dieron −47,33 dB— y usado en 0,45 como atenuador fijo en el barrido de
  // la 94, justamente porque mueve uno y deja el otro quieto.
  //
  // Sin esta distinción, una cuña con su propio fader abajo pasaría por sonando
  // paso tras paso y la aplicación la subiría hasta el tope sin que nadie oiga
  // nada, hasta que alguien la abra de golpe.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  // Llega señal al auxiliar y su fader está en el piso: nada sale hacia la cuña.
  t.entra(trama(0.5, [0], [0.6]));
  const muda = a.auxiliares()[0]!;

  assert.equal(muda.nivelDb, -Infinity, 'no sale nada hacia el parlante');
  assert.ok(muda.nivelAntesDelFaderDb > -60, 'pero sí le está llegando señal');

  await a.desconectar();
});

test('el pico de la cuña se sostiene y se reinicia con los demás', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(trama(0.5, [0.8]));
  t.entra(trama(0.5, [0.2]));
  const cuna = a.auxiliares()[0]!;
  assert.ok(
    cuna.picoDb > cuna.nivelDb,
    'el pico recuerda lo más alto que hubo en la ventana',
  );

  a.reiniciarPicos();
  t.entra(trama(0.5, [0.2]));
  const despues = a.auxiliares()[0]!;
  assert.ok(
    Math.abs(despues.picoDb - despues.nivelDb) < 0.5,
    'reiniciado, el pico vuelve a contar desde esta captura',
  );

  await a.desconectar();
});

test('el nivel de la cuña NO se borra al reiniciar picos', async () => {
  // Reiniciar un pico es olvidar lo más alto que hubo; poner el nivel en −∞ sería
  // afirmar que ahora no entra nada. Es la misma decisión que toman los canales.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(trama(0.5, [0.7]));
  const antes = a.auxiliares()[0]!.nivelDb;
  a.reiniciarPicos();

  assert.equal(a.auxiliares()[0]!.nivelDb, antes);

  await a.desconectar();
});
