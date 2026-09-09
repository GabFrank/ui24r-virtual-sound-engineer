import { deepStrictEqual, strictEqual, notStrictEqual } from 'node:assert/strict';
import { test } from 'node:test';
import {
  editarIntegrante, instrumentosDesdeTexto, normalizarInstrumentos, textoDeInstrumentos,
} from '../src/entities/integrantes.ts';
import { crearIntegrante } from '../src/entities/factories.ts';
import type { BandMemberId } from '../src/ids.ts';

function banda() {
  return [
    crearIntegrante('Ana', ['voz']),
    crearIntegrante('Beto', ['bajo']),
    crearIntegrante('Cami', ['cajon']),
  ];
}

test('editar conserva el identificador: la asignacion de canal sigue apuntando al mismo', () => {
  // Es el motivo de que esto exista. Antes, corregir un nombre mal escrito solo
  // se podia hacer quitando al integrante y cargandolo de nuevo, y el alta
  // genera un identificador nuevo: todo lo que apuntaba al anterior
  // -- empezando por ChannelAssignment.bandMemberId -- quedaba huerfano.
  const lista = banda();
  const ana = lista[0]!;
  const editada = editarIntegrante(lista, ana.id, 'Ana Maria', ['voz']);
  strictEqual(editada[0]!.id, ana.id);
  strictEqual(editada[0]!.nombre, 'Ana Maria');
});

test('editar no mueve al integrante de lugar', () => {
  // Uno que salta al final cada vez que se le corrige una letra hace dudar de
  // si se edito al que se queria editar.
  const lista = banda();
  const beto = lista[1]!;
  const editada = editarIntegrante(lista, beto.id, 'Roberto', ['bajo']);
  deepStrictEqual(editada.map((m) => m.nombre), ['Ana', 'Roberto', 'Cami']);
});

test('editar no toca a los demas integrantes', () => {
  const lista = banda();
  const editada = editarIntegrante(lista, lista[1]!.id, 'Roberto', ['bajo']);
  strictEqual(editada[0], lista[0]);
  strictEqual(editada[2], lista[2]);
});

test('editar devuelve una lista nueva y no muta la que recibe', () => {
  const lista = banda();
  const editada = editarIntegrante(lista, lista[0]!.id, 'Ana Maria', ['voz']);
  notStrictEqual(editada, lista);
  strictEqual(lista[0]!.nombre, 'Ana');
});

test('editar normaliza igual que el alta', () => {
  // Corregir un integrante tiene que dejar exactamente lo mismo que haberlo
  // cargado bien la primera vez; si no, un nombre corregido queda con espacios
  // que el alta habria recortado, y un instrumento sin clasificar donde el alta
  // lo habria clasificado.
  const lista = banda();
  const editada = editarIntegrante(lista, lista[0]!.id, '  Ana Maria  ', ['guitarra', '', '  ']);
  strictEqual(editada[0]!.nombre, 'Ana Maria');
  deepStrictEqual(
    editada[0]!.instrumentos,
    crearIntegrante('Ana Maria', ['guitarra', '', '  ']).instrumentos,
  );
});

test('editar reclasifica lo que se escribe, como el alta', () => {
  const lista = banda();
  const editada = editarIntegrante(lista, lista[0]!.id, 'Ana', ['guitarra criolla']);
  strictEqual(editada[0]!.instrumentos.length, 1);
  // El texto que escribio el usuario no se pierde ni se reescribe.
  strictEqual(textoDeInstrumentos(editada[0]!.instrumentos), 'guitarra criolla');
});

test('editar un identificador que no esta deja la lista igual', () => {
  const lista = banda();
  const editada = editarIntegrante(lista, 'mbr_no_existe' as BandMemberId, 'Nadie', []);
  deepStrictEqual(editada.map((m) => m.nombre), ['Ana', 'Beto', 'Cami']);
  strictEqual(editada.length, lista.length);
});

test('editar deja sin instrumentos a quien se le borran todos', () => {
  // El caso del que se equivoco de instrumento y todavia no sabe con cual
  // reemplazarlo: tiene que poder dejarlo vacio, no quedarse con el anterior.
  const lista = banda();
  const editada = editarIntegrante(lista, lista[0]!.id, 'Ana', []);
  deepStrictEqual(editada[0]!.instrumentos, []);
});

test('los instrumentos se separan por comas, sin espacios ni vacios', () => {
  strictEqual(instrumentosDesdeTexto('voz, guitarra acustica').length, 2);
  strictEqual(textoDeInstrumentos(instrumentosDesdeTexto('voz,,  , bajo ')), 'voz, bajo');
  strictEqual(instrumentosDesdeTexto('').length, 0);
  strictEqual(instrumentosDesdeTexto('   ').length, 0);
});

test('unir y separar son la misma decision, en los dos sentidos', () => {
  // El dialogo muestra el texto unido y guarda el texto separado. Si los dos
  // criterios no coinciden, abrir un integrante y confirmar sin tocar nada le
  // cambiaria los instrumentos.
  const texto = 'voz, guitarra acustica';
  strictEqual(textoDeInstrumentos(instrumentosDesdeTexto(texto)), texto);
});

test('abrir y confirmar sin tocar nada no cambia al integrante', () => {
  // Es el recorrido completo del dialogo: se muestra el texto de lo guardado,
  // se vuelve a separar y se guarda. Si algo se pierde en el camino, se pierde
  // justo cuando el usuario creia no estar cambiando nada.
  const lista = [crearIntegrante('Ana', ['voz', 'guitarra criolla'])];
  const comoSeMuestra = textoDeInstrumentos(lista[0]!.instrumentos);
  const editada = editarIntegrante(
    lista, lista[0]!.id, lista[0]!.nombre, instrumentosDesdeTexto(comoSeMuestra));
  deepStrictEqual(editada[0], lista[0]);
});

test('normalizar no deja entradas vacias', () => {
  strictEqual(textoDeInstrumentos(normalizarInstrumentos(['  voz ', '', '   ', 'bajo'])), 'voz, bajo');
});
