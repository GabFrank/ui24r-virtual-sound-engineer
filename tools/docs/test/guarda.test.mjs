/**
 * El camino de error de los validadores, ejercido.
 *
 * **Por qué existe.** Un auditor midió que `tools/docs/` no tenía suite y que
 * `lint:tools` mira sólo archivos `.ts`, así que todo el manejo de errores de
 * `validate-numeros.mjs` era código que nunca se corría por su propio camino. Le
 * sembró dos defectos adentro y los dos pasaron: un contador olvidado dejaba la
 * guarda **en verde** con tres comprobaciones menos, y un error de programación
 * adentro de un `catch` reproducía **exactamente el stack de `node:fs`** que todo
 * esto vino a sacar.
 *
 * Lo que se prueba acá no es que la guarda cuente bien: es que **cuando algo se
 * rompe, lo dice en vez de morirse**.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProblemaDeLaGuarda, lectorDe, intentar } from '../guarda.mjs';

const raizDePrueba = mkdtempSync(join(tmpdir(), 'guarda-'));
const { leer, listar, contarEjecutando } = lectorDe(raizDePrueba);

test('un archivo que no está da una frase, no el ENOENT de node:fs', () => {
  assert.throws(() => leer('no-existe.md'), (e) => {
    assert.ok(e instanceof ProblemaDeLaGuarda);
    assert.match(e.message, /no-existe\.md no existe/);
    // Lo que se está evitando: que el mensaje sea el de Node.
    assert.doesNotMatch(e.message, /ENOENT|node:fs/);
    return true;
  });
});

test('una carpeta que no está, igual', () => {
  assert.throws(() => listar('ni-esta-carpeta'), (e) => {
    assert.ok(e instanceof ProblemaDeLaGuarda);
    assert.match(e.message, /la carpeta ni-esta-carpeta no existe/);
    assert.doesNotMatch(e.message, /ENOENT|node:fs/);
    return true;
  });
});

test('un archivo que sí está se lee', () => {
  writeFileSync(join(raizDePrueba, 'hay.md'), 'contenido\n');
  assert.equal(leer('hay.md'), 'contenido\n');
});

/**
 * **El detalle tiene que traer el error, no el preámbulo.** Quedándose con las
 * tres primeras líneas del hijo se veían la ruta, el código y el caret, y el
 * `TypeError` --lo único que dice qué pasó-- caía afuera por una línea.
 */
test('un módulo que dejó de exportar la función dice cuál fue el error', () => {
  writeFileSync(join(raizDePrueba, 'sin-funcion.ts'), 'export const otra = 1;\n');
  assert.throws(() => contarEjecutando('sin-funcion.ts', 'm.contar().length'), (e) => {
    assert.ok(e instanceof ProblemaDeLaGuarda);
    assert.match(e.message, /no se pudo contar/);
    assert.match(e.message, /is not a function|TypeError/);
    return true;
  });
});

test('un módulo que no existe también da la frase', () => {
  assert.throws(() => contarEjecutando('no-esta.ts', 'm.contar()'),
    (e) => e instanceof ProblemaDeLaGuarda);
});

test('un módulo que no compila también da la frase', () => {
  writeFileSync(join(raizDePrueba, 'roto.ts'), 'export const x = (((;\n');
  assert.throws(() => contarEjecutando('roto.ts', 'm.x'),
    (e) => e instanceof ProblemaDeLaGuarda);
});

test('contar algo que no es un entero se rechaza en vez de contaminar la cuenta', () => {
  writeFileSync(join(raizDePrueba, 'texto.ts'), "export const x = 'hola';\n");
  assert.throws(() => contarEjecutando('texto.ts', 'm.x'), (e) => {
    assert.ok(e instanceof ProblemaDeLaGuarda);
    assert.match(e.message, /no es un entero/);
    return true;
  });
});

test('lo que sí se puede contar, se cuenta', () => {
  writeFileSync(join(raizDePrueba, 'bien.ts'), 'export const lista = [1, 2, 3];\n');
  assert.equal(contarEjecutando('bien.ts', 'm.lista.length'), 3);
});

test('intentar avisa del problema y sigue, en vez de cortar la corrida', () => {
  const vistos = [];
  assert.equal(intentar(() => leer('no-existe.md'), (e) => vistos.push(e.message)), false);
  assert.equal(vistos.length, 1);
  assert.equal(intentar(() => leer('hay.md'), () => vistos.push('no debería')), true);
  assert.equal(vistos.length, 1);
});

/**
 * **El defecto que el auditor sembró adentro del `catch`.** Si un error de
 * programación de la guarda se tragara acá, volveríamos al stack de `node:fs` en
 * la salida de un validador --y peor, disfrazado de cifra que no cuadra--. Tiene
 * que subir.
 */
test('un defecto de la propia guarda sube, no se cuenta como comprobación fallida', () => {
  let llamado = false;
  assert.throws(
    () => intentar(() => { noDefinida(); }, () => { llamado = true; }), // eslint-disable-line no-undef
    ReferenceError,
  );
  assert.equal(llamado, false, 'no se lo puede confundir con un problema explicable');
});

test.after(() => rmSync(raizDePrueba, { recursive: true, force: true }));
