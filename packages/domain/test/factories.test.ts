import { strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  crearBanda, crearIntegrante, crearLocal, crearPa, crearSesion,
  FADER_GENERADOR_INICIAL_DB, RANGO_UTIL_POR_DEFECTO,
} from '../src/entities/factories.ts';

test('la banda nueva no trae firma de mezcla', () => {
  // Nula y no un objeto vacio: un objeto lleno de ceros se leeria como
  // "ya aprendida, y todo plano".
  strictEqual(crearBanda('Los del Fondo').mixSignature, null);
});

test('recorta los espacios y descarta instrumentos vacios', () => {
  const m = crearIntegrante('  Ana  ', ['guitarra', '', '  ']);
  strictEqual(m.nombre, 'Ana');
  strictEqual(m.instrumentos.length, 1);
});

test('el sistema de amplificacion arranca con un rango util conservador', () => {
  const pa = crearPa('Cajas propias', 'Par de 12 pulgadas');
  strictEqual(pa.rangoUtilHz[0], RANGO_UTIL_POR_DEFECTO[0]);
  strictEqual(pa.rangoUtilHz[1], RANGO_UTIL_POR_DEFECTO[1]);
});

test('INV-015: el fader del generador arranca bajo', () => {
  strictEqual(crearPa('x', 'y').generatorFaderDb, FADER_GENERADOR_INICIAL_DB);
  strictEqual(FADER_GENERADOR_INICIAL_DB <= -30, true);
});

test('INV-028: el general estereo arranca declarado como no silenciable', () => {
  // Sin buses separados no se puede medir por componente, y decir lo
  // contrario haria que la aplicacion ofreciera una medicion imposible.
  const pa = crearPa('x', 'y');
  strictEqual(pa.componentes.length, 1);
  strictEqual(pa.componentes[0]?.silenciable, false);
});

test('INV-023: el local nuevo no tiene sigma y por lo tanto no habilita lazo cerrado', () => {
  const pa = crearPa('x', 'y');
  strictEqual(crearLocal('Bar', 'INDOOR_SMALL', pa.id).sigmaRoomScore, null);
});

test('la sesion nueva arranca en CREATED y sin puntajes', () => {
  const pa = crearPa('x', 'y');
  const s = crearSesion(crearBanda('B').id, crearLocal('L', 'INDOOR_SMALL', pa.id).id);
  strictEqual(s.state, 'CREATED');
  // Nulos y no cero: cero seria un puntaje pesimo, y todavia no midio nada.
  strictEqual(s.roomScore, null);
  strictEqual(s.mixScore, null);
  strictEqual(s.cerradaEl, null);
});

test('cada entidad nueva tiene identificador propio', () => {
  strictEqual(crearBanda('A').id === crearBanda('A').id, false);
});
