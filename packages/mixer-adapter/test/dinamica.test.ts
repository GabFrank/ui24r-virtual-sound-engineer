import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerDinamica } from '../src/dinamica.ts';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd } from '../src/protocol.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Las banderas de proceso dinámico no tienen todas la misma polaridad.
 *
 * `bypass = 1` significa **puenteado**, o sea que el proceso NO está actuando.
 * `enabled = 1` significa que **sí** está actuando. Los dos son un 1 y
 * significan lo contrario, así que leerlos con la misma regla no da un error
 * chico: invierte el sentido de cada canal que tenga la bandera que se leyó mal,
 * y lo hace en silencio.
 */

/** Un almacén de mentira: el `leer` que espera `leerDinamica`. */
function almacen(pares: Readonly<Record<string, number>>) {
  return (path: string) => {
    const valor = pares[path];
    return valor === undefined ? undefined : { valor };
  };
}

test('bypass = 1 es puenteado, o sea que el compresor NO está actuando', () => {
  const d = leerDinamica(almacen({ 'i.0.dyn.bypass': 1 }), 0);
  assert.equal(d.compresor, 'INACTIVO');
});

test('bypass = 0 es el compresor en el camino', () => {
  const d = leerDinamica(almacen({ 'i.0.dyn.bypass': 0 }), 0);
  assert.equal(
    d.compresor, 'ACTIVO',
    'leer `bypass` como si fuera `enabled` deja pasar como limpio justo el canal comprimido',
  );
});

test('enabled = 1 es la puerta actuando, que es la polaridad contraria a bypass', () => {
  const habilitada = leerDinamica(almacen({ 'i.0.gate.enabled': 1 }), 0);
  const puenteado = leerDinamica(almacen({ 'i.0.dyn.bypass': 1 }), 0);
  assert.equal(habilitada.puerta, 'ACTIVO');
  assert.equal(puenteado.compresor, 'INACTIVO');
  // El mismo 1 en las dos claves, y el resultado opuesto. Es la afirmación
  // entera de este archivo.
});

test('enabled = 0 es la puerta apagada', () => {
  const d = leerDinamica(almacen({ 'i.0.gate.enabled': 0 }), 0);
  assert.equal(d.puerta, 'INACTIVO');
});

test('deesser.enabled sigue la polaridad directa', () => {
  assert.equal(leerDinamica(almacen({ 'i.0.deesser.enabled': 1 }), 0).deesser, 'ACTIVO');
  assert.equal(leerDinamica(almacen({ 'i.0.deesser.enabled': 0 }), 0).deesser, 'INACTIVO');
});

test('una puerta encendida pero puenteada no está actuando', () => {
  // La puerta tiene las dos banderas y pueden decir cosas distintas. Un
  // negativo es concluyente: alcanza con que una diga que no.
  const d = leerDinamica(almacen({ 'i.0.gate.enabled': 1, 'i.0.gate.bypass': 1 }), 0);
  assert.equal(d.puerta, 'INACTIVO');
});

test('una puerta encendida y sin puentear sí está actuando', () => {
  const d = leerDinamica(almacen({ 'i.0.gate.enabled': 1, 'i.0.gate.bypass': 0 }), 0);
  assert.equal(d.puerta, 'ACTIVO');
});

test('una puerta apagada está inactiva aunque no esté puenteada', () => {
  const d = leerDinamica(almacen({ 'i.0.gate.enabled': 0, 'i.0.gate.bypass': 0 }), 0);
  assert.equal(d.puerta, 'INACTIVO');
});

test('lo que la consola no dijo es DESCONOCIDO, no INACTIVO', () => {
  // Es la distinción que evita el error entero: dar por apagado lo que nadie
  // leyó es exactamente cómo un nivel comprimido pasa por limpio.
  const d = leerDinamica(almacen({}), 0);
  assert.equal(d.compresor, 'DESCONOCIDO');
  assert.equal(d.puerta, 'DESCONOCIDO');
  assert.equal(d.deesser, 'DESCONOCIDO');
});

test('con una sola de las dos banderas de la puerta se contesta igual', () => {
  // Si un firmware publica `enabled` y no `bypass`, se responde con lo que hay
  // en vez de declarar toda la puerta desconocida.
  assert.equal(leerDinamica(almacen({ 'i.0.gate.enabled': 1 }), 0).puerta, 'ACTIVO');
  assert.equal(leerDinamica(almacen({ 'i.0.gate.bypass': 1 }), 0).puerta, 'INACTIVO');
});

test('las rutas son de base cero: el canal 1 lee `i.0`, no `i.1`', async () => {
  // La misma trampa que corrió toda la tabla del adaptador una vez. Se
  // comprueba de punta a punta, con las líneas que manda la consola.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');

  t.entra(codificarSetd('i.0.dyn.bypass', 0));   // canal 1: compresor puesto
  t.entra(codificarSetd('i.1.dyn.bypass', 1));   // canal 2: puenteado
  t.entra(codificarSetd('i.1.gate.enabled', 1)); // canal 2: puerta activa

  const [uno, dos] = a.canales(2);

  assert.equal(uno?.dinamica.compresor, 'ACTIVO', 'el canal 1 es `i.0`');
  assert.equal(dos?.dinamica.compresor, 'INACTIVO');
  assert.equal(uno?.dinamica.puerta, 'DESCONOCIDO', 'el canal 1 no dijo nada de su puerta');
  assert.equal(dos?.dinamica.puerta, 'ACTIVO');
  await a.desconectar();
});

/**
 * Una puerta habilitada con el umbral en el fondo NO esta activa.
 *
 * Encontrado en la tablet: la insignia PUERTA salia en los 24 canales. Los 24
 * tienen gate.enabled=1, pero 23 tienen gate.thresh=0, que son -90 dB con
 * VtoTHRESH = 96a - 90. Ninguna senal baja de ahi, asi que esa puerta no se
 * cierra nunca. Una insignia que aparece siempre no informa nada.
 */
test('la puerta con el umbral en el fondo no cuenta como activa', () => {
  const estado = new Map<string, number>([
    ['i.0.gate.enabled', 1],
    ['i.0.gate.bypass', 0],
    ['i.0.gate.thresh', 0],
  ]);
  const leer = (p: string): { valor: number } | undefined => {
    const v = estado.get(p);
    return v === undefined ? undefined : { valor: v };
  };
  assert.equal(leerDinamica(leer, 0).puerta, 'INACTIVO',
    'habilitada pero con el umbral en -90 dB: no puede cerrarse nunca');

  estado.set('i.0.gate.thresh', 0.41);
  assert.equal(leerDinamica(leer, 0).puerta, 'ACTIVO',
    'con un umbral real si esta actuando');
});
