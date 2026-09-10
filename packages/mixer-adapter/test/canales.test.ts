import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd, codificarVu } from '../src/protocol.ts';
import { CORRECCION_PREVIO_DB } from '../src/conversiones.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Las rutas del protocolo son de base cero y los canales de la consola empiezan
 * en uno.
 *
 * Medido contra el aparato el 2026-09-08 y escrito en `docs/protocol-spec.md`:
 * el canal 1 es `i.0.mix`, `hw.0.gain` e `i.0.name`. El adaptador componía
 * `i.1` para el canal 1, y como la trama `VU2` **sí** trae el canal 1 en la
 * posición 0, la interfaz mostraba en la misma fila el medidor de un canal con
 * el nombre y la ganancia del siguiente. Con la guitarra en el canal 1 de una
 * Ui24R real, la aplicación decía «BAJO OKU · Ganancia 14» —los datos del canal
 * 2— junto al nivel de la guitarra.
 */

/** El volcado mínimo de dos canales, con valores crudos como los de la consola. */
function volcadoDeDosCanales(t: TransporteFalso): void {
  t.entra('SETS^i.0.name^PRUEBA');
  t.entra('SETS^i.1.name^BAJO OKU');
  // De que previo viene cada canal. Con el enrutamiento de fabrica es la
  // identidad, y **por eso hay que mandarlo igual**: el adaptador ya no lo
  // supone, y un volcado sin `src` es un canal cuya ganancia no se conoce.
  t.entra('SETS^i.0.src^hw.0');
  t.entra('SETS^i.1.src^hw.1');
  // La consola dice 34 dB para ese valor crudo; el previo entrega 1,15 menos.
  // Ver `CORRECCION_PREVIO_DB`: la correccion arranca en 26 dB, asi que el
  // segundo canal --14 dB-- no la lleva.
  t.entra(codificarSetd('hw.0.gain', 0.64));
  t.entra(codificarSetd('hw.1.gain', 0.322));
  t.entra(codificarSetd('i.0.mute', 0));
  t.entra(codificarSetd('i.1.mute', 1));
}

test('el canal 1 toma su nombre y su ganancia de `i.0` y `hw.0`', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');
  volcadoDeDosCanales(t);

  const [uno, dos] = a.canales(2);

  assert.equal(uno?.nombre, 'PRUEBA', 'el canal 1 es `i.0`, no `i.1`');
  assert.equal(uno?.gainDb, 34 + CORRECCION_PREVIO_DB);
  assert.equal(dos?.nombre, 'BAJO OKU');
  assert.equal(dos?.gainDb, 14);
  await a.desconectar();
});

test('el silencio también sale de la ruta del canal, no de la siguiente', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');
  volcadoDeDosCanales(t);

  const [uno, dos] = a.canales(2);

  assert.equal(uno?.silenciado, false, 'i.0.mute = 0');
  assert.equal(dos?.silenciado, true, 'i.1.mute = 1');
  await a.desconectar();
});

test('el medidor y el nombre de una fila son del mismo canal', async () => {
  // Es la afirmación que la interfaz hace con solo poner las dos cosas juntas,
  // y la que estaba rota: el medidor venía del canal 1 y el nombre del 2.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');
  volcadoDeDosCanales(t);
  // Señal solo en la posición 0 de la trama, que es el canal 1.
  t.entra(`VU2^${codificarVu([0.9, 0])}`);

  const [uno, dos] = a.canales(2);

  assert.equal(uno?.nombre, 'PRUEBA');
  assert.ok(uno !== undefined && uno.nivelDb > -90, 'el canal con señal es el 1');
  assert.equal(dos?.nivelDb, -Infinity, 'el canal 2 está en silencio');
  await a.desconectar();
});

test('un canal sin nombre en el volcado se llama por su número de consola', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  const [uno] = a.canales(1);

  assert.equal(uno?.nombre, 'CANAL 1', 'el número que se muestra es el de la serigrafía, no el de la ruta');
  await a.desconectar();
});

test('la cantidad de canales la dice la consola, no el adaptador', async () => {
  // Estaba fija en doce. Una Ui24R tiene veinticuatro entradas y sus dos RCA
  // son los canales 21 y 22, asi que con doce no se veia justamente la fuente
  // con la que se prueba.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  assert.equal(a.canales().length, 12, 'antes de saber, lo que entra en una pantalla');

  t.entra('SETS^i.23.name^CH 24');
  assert.equal(a.canales().length, 24, 'el volcado dice cuantas entradas hay');

  await a.desconectar();
});

test('la cabecera de la trama de medidores tambien cuenta canales', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(`VU2^${codificarVu(new Array(24).fill(0.2))}`);

  assert.equal(a.canales().length, 24);
  await a.desconectar();
});

/**
 * Enrutamiento que NO es la identidad, que es donde la suposicion vieja rompia.
 *
 * El adaptador armaba `hw.${canal-1}.gain`. Con el enrutamiento de fabrica eso
 * coincide, asi que ningun test lo distinguia de leer `i.N.src`: pasaban los
 * dos por casualidad. Es la misma trampa que el error de base cero, que
 * coincidia consigo mismo hasta que dejo de hacerlo.
 */
test('la ganancia sale del previo que el canal declara, no del que su numero sugiere', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  try {
    await a.conectar('ws://prueba');
    // El canal 1 esta repatcheado al previo 6, y el previo 1 tiene otra ganancia.
    t.entra('SETS^i.0.name^REPATCHEADO');
    t.entra('SETS^i.0.src^hw.5');
    t.entra(codificarSetd('hw.5.gain', 0.322));
    t.entra(codificarSetd('hw.0.gain', 0.64));

    const [uno] = a.canales(1);
    assert.equal(uno?.gainDb, 14, 'lee hw.5, que es lo que el canal declara');
  } finally {
    await a.desconectar();
  }
});

test('sin saber la fuente, la ganancia es desconocida y no se adivina', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  try {
    await a.conectar('ws://prueba');
    t.entra('SETS^i.0.name^SIN FUENTE');
    t.entra(codificarSetd('hw.0.gain', 0.64));

    const [uno] = a.canales(1);
    // Volver a `hw.${canal-1}` como respaldo seria reintroducir la suposicion
    // justo donde no se puede comprobar, y en silencio.
    assert.equal(uno?.gainDb, null);
  } finally {
    await a.desconectar();
  }
});

test('un canal sin previo no tiene ganancia que ajustar', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  try {
    await a.conectar('ws://prueba');
    // Medido: los canales 21 a 24 declaran `none`. Son las entradas de linea y
    // de medios, y no hay perilla de previo detras.
    t.entra('SETS^i.20.name^RCA L');
    t.entra('SETS^i.20.src^none');
    t.entra(codificarSetd('hw.20.gain', 0.64));

    const canales = a.canales(21);
    assert.equal(canales[20]?.gainDb, null);
  } finally {
    await a.desconectar();
  }
});
