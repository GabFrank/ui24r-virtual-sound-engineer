import { strictEqual, deepStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  reunirErrores, validarNombre, validarNumero, validarRangoUtil, validarUnico,
  RANGO_DIMENSION,
} from '../src/rules/validacion.ts';

test('un nombre vacio o de espacios no pasa', () => {
  strictEqual(validarNombre('') !== null, true);
  strictEqual(validarNombre('   ') !== null, true);
});

test('un nombre normal pasa', () => {
  strictEqual(validarNombre('Los del Fondo'), null);
});

test('el mensaje dice que se esperaba, no solo que esta mal', () => {
  const m = validarNombre('a');
  strictEqual(typeof m, 'string');
  strictEqual((m as string).includes('2'), true);
});

test('el nombre unico ignora mayusculas y acentos', () => {
  // Dos locales llamados "Bar Central" y "bar central" son el mismo lugar, y
  // tenerlos separados parte el historial por un descuido de tipeo.
  strictEqual(validarUnico('bar central', ['Bar Central']) !== null, true);
  strictEqual(validarUnico('Cafe Uno', ['Café Uno']) !== null, true);
  strictEqual(validarUnico('Otro', ['Bar Central']), null);
});

test('acepta la coma decimal', () => {
  // El teclado de la tablet en espanol da coma, no punto.
  strictEqual(validarNumero('12,5', RANGO_DIMENSION), null);
});

test('rechaza lo que no es numero y lo que se sale del rango', () => {
  strictEqual(validarNumero('ancho', RANGO_DIMENSION) !== null, true);
  strictEqual(validarNumero(0, RANGO_DIMENSION) !== null, true);
  strictEqual(validarNumero(500, RANGO_DIMENSION) !== null, true);
});

test('el rango util exige orden y al menos una octava', () => {
  strictEqual(validarRangoUtil(60, 16000), null);
  strictEqual(validarRangoUtil(16000, 60) !== null, true);
  // Menos de una octava no describe un sistema de refuerzo: casi seguro es un
  // error de tipeo.
  strictEqual(validarRangoUtil(1000, 1500) !== null, true);
  strictEqual(validarRangoUtil(5, 16000) !== null, true);
});

test('reunirErrores deja fuera los campos correctos', () => {
  deepStrictEqual(
    reunirErrores({ nombre: null, ancho: 'mal' }),
    { ancho: 'mal' },
  );
  deepStrictEqual(reunirErrores({ a: null, b: null }), {});
});
