import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarVu } from '../src/protocol.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Los dos flujos avisan por caminos distintos.
 *
 * No es una separación estética. `VU2` **se apaga cuando no hay señal** —una
 * trama en treinta segundos de silencio contra más de veinte por segundo con
 * música— así que quien mida la salud de la conexión sobre `VU2` mide el
 * silencio de la sala. `RTA` llega igual siempre, y es lo que el vigilante de
 * este mismo adaptador usa para declarar inestable la conexión. La prueba de
 * conexión de la aplicación medía `VU2` y por eso no podía contestar el
 * criterio 4 de SPK-P0.1.
 */
test('RTA avisa el latido y no la telemetría', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  let latidos = 0;
  let telemetrias = 0;
  a.alLatido(() => { latidos++; });
  a.alActualizarTelemetria(() => { telemetrias++; });

  await a.conectar('ws://prueba');
  t.entra('RTA^AAAA');
  t.entra('RTA^AAAA');

  assert.equal(latidos, 2, 'cada trama del analizador es un latido');
  assert.equal(telemetrias, 0, 'el analizador no trae niveles: no hay telemetría que anunciar');
  await a.desconectar();
});

test('VU2 avisa la telemetría y no el latido', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  let latidos = 0;
  let telemetrias = 0;
  a.alLatido(() => { latidos++; });
  a.alActualizarTelemetria(() => { telemetrias++; });

  await a.conectar('ws://prueba');
  t.entra(`VU2^${codificarVu([0.5, 0.5])}`);

  assert.equal(telemetrias, 1, 'los niveles nuevos se anuncian');
  assert.equal(
    latidos, 0,
    'un silencio no puede leerse como conexión caída: los medidores no son señal de vida',
  );
  await a.desconectar();
});

test('darse de baja del latido deja de recibirlo', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  let latidos = 0;
  const baja = a.alLatido(() => { latidos++; });

  await a.conectar('ws://prueba');
  t.entra('RTA^AAAA');
  baja();
  t.entra('RTA^AAAA');

  assert.equal(latidos, 1);
  await a.desconectar();
});
