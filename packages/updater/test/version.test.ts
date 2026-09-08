import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { compararVersiones, esEstable, formatearVersion, parsearVersion } from '../src/version.ts';

function v(texto: string) {
  const parsed = parsearVersion(texto);
  if (parsed === null) throw new Error(`version invalida en el test: ${texto}`);
  return parsed;
}

test('acepta la etiqueta con y sin la v inicial', () => {
  deepStrictEqual(parsearVersion('v1.2.3'), parsearVersion('1.2.3'));
});

test('rechaza lo que no es una version semantica sin lanzar', () => {
  for (const texto of ['', 'ultima', '1.2', '1.2.3.4', 'v1.2.x', 'null']) {
    strictEqual(parsearVersion(texto), null, texto);
  }
});

test('ordena por mayor, menor y parche', () => {
  strictEqual(compararVersiones(v('1.0.0'), v('2.0.0')) < 0, true);
  strictEqual(compararVersiones(v('1.3.0'), v('1.2.9')) > 0, true);
  strictEqual(compararVersiones(v('1.2.10'), v('1.2.9')) > 0, true);
  strictEqual(compararVersiones(v('1.2.3'), v('1.2.3')), 0);
});

test('el numero de parche compara como numero, no como texto', () => {
  // Como texto, "10" es menor que "9". Este es el error clasico y aparece
  // recien en la decima version, cuando ya nadie mira este codigo.
  strictEqual(compararVersiones(v('0.0.10'), v('0.0.9')) > 0, true);
});

test('una version con pre-lanzamiento es anterior a la estable del mismo numero', () => {
  strictEqual(compararVersiones(v('1.2.0-alpha.1'), v('1.2.0')) < 0, true);
  strictEqual(compararVersiones(v('1.2.0'), v('1.2.0-rc.5')) > 0, true);
});

test('ordena entre pre-lanzamientos', () => {
  strictEqual(compararVersiones(v('1.0.0-alpha.1'), v('1.0.0-alpha.2')) < 0, true);
  strictEqual(compararVersiones(v('1.0.0-alpha'), v('1.0.0-beta')) < 0, true);
  // Los identificadores numericos ordenan antes que los alfanumericos.
  strictEqual(compararVersiones(v('1.0.0-1'), v('1.0.0-alpha')) < 0, true);
  // Mas identificadores gana cuando el prefijo es igual.
  strictEqual(compararVersiones(v('1.0.0-alpha'), v('1.0.0-alpha.1')) < 0, true);
});

test('esEstable distingue el sufijo', () => {
  strictEqual(esEstable(v('1.0.0')), true);
  strictEqual(esEstable(v('1.0.0-rc.1')), false);
});

test('ignora los metadatos de compilacion', () => {
  strictEqual(compararVersiones(v('1.0.0+abc123'), v('1.0.0+def456')), 0);
});

test('formatear devuelve la version sin la v', () => {
  strictEqual(formatearVersion(v('v1.2.3')), '1.2.3');
  strictEqual(formatearVersion(v('1.2.3-rc.1')), '1.2.3-rc.1');
});
