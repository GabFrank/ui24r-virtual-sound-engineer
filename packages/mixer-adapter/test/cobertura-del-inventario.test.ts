import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clasificarRuta } from '../src/clasificar-ruta.ts';

/**
 * **La guarda que faltaba: cuánto del aparato sabe nombrar la aplicación.**
 *
 * `tools/inventario/cobertura.ts` mide esto, pero es un script que se corre a
 * mano y no entra en `npm run verificar`. La cifra del 79,2 % era una foto de
 * una corrida suelta: el clasificador podía volver al 50 % y todo seguía en
 * verde. Lo señaló una auditoría.
 *
 * Se mide contra el **inventario capturado de la consola real** --6732 claves,
 * 2026-09-11-- y no contra una lista escrita a mano: una lista a mano mide lo
 * que uno recuerda, no lo que el aparato manda. Eso es lo que dejó vivir a
 * `m.eq.b1.gain` durante meses.
 */

const INVENTARIO = join(
  import.meta.dirname, '..', '..', '..',
  'docs', 'inventario', '3.4.8318-ui24-2026-09-11', 'keys-observed.txt',
);

function claves(): readonly string[] {
  return readFileSync(INVENTARIO, 'utf8').trim().split('\n');
}

test('el inventario está donde se lo espera y tiene las 6732 claves', () => {
  // Si esto falla, los dos tests de abajo estarían midiendo el vacío y
  // pasarían por eso. Un test que se apoya en un archivo tiene que comprobar
  // que el archivo está.
  strictEqual(claves().length, 6732);
});

test('la cobertura del clasificador no retrocede', () => {
  const todas = claves();
  const sinClasificar = todas.filter((k) => clasificarRuta(k) === null).length;
  const cubiertas = todas.length - sinClasificar;
  const porciento = (100 * cubiertas) / todas.length;

  // **Un piso, no una igualdad.** Subir la cobertura es bienvenido y no tiene
  // que romper nada; bajarla es una regresión y tiene que doler.
  //
  // **Este número nació viejo y lo encontró una auditoría.** Se escribió 5334,
  // que era la cobertura de **dos commits antes** del que lo escribió, y para
  // cuando se midió ya iba en 5406: setenta y dos claves de colchón. Con eso,
  // la categoría `SAFE` entera --o `PHANTOM`, o `VCA`-- podía dejar de
  // reconocerse sin que nada se pusiera rojo, y ninguna de esas es escribible,
  // así que el test de lo permitido tampoco las ve.
  //
  // **Un piso con colchón no es un piso.** Si se sube la cobertura, este número
  // se sube en el mismo commit.
  strictEqual(
    cubiertas >= 5406, true,
    `el clasificador nombra ${cubiertas} de ${todas.length} (${porciento.toFixed(1)} %) `
    + 'y el piso es 5406. Si bajó, algo dejó de reconocerse.',
  );
});

test('las familias que la aplicación tiene que poder nombrar están cubiertas', () => {
  // **Un porcentaje puede subir dejando afuera lo que importa.** Estas son las
  // puertas por donde entra audio al general, y una de ellas --las entradas de
  // línea-- costó dos días de mediciones contaminadas por no poder nombrarla.
  const obligatorias = [
    'i.0.mix', 'i.0.mute',           // canal
    'l.0.mix', 'l.1.mute',           // entrada de línea: la puerta del Bluetooth
    'p.0.mix', 'p.0.mute',           // reproductor
    's.0.mix',                       // subgrupo
    'f.0.mix',                       // efecto
    'm.mix', 'm.dim',                // general
    'hw.0.gain', 'hw.0.phantom',     // previo
  ];
  const sinNombre = obligatorias.filter((k) => clasificarRuta(k) === null);
  strictEqual(sinNombre.length, 0, `sin clasificar: ${sinNombre.join(', ')}`);

  // Y todas existen de verdad en el aparato, no son inventadas.
  const reales = new Set(claves());
  const inventadas = obligatorias.filter((k) => !reales.has(k));
  strictEqual(inventadas.length, 0, `no existen en la consola: ${inventadas.join(', ')}`);
});
