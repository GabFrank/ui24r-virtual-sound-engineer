import { deepStrictEqual, strictEqual, notStrictEqual, match, ok } from 'node:assert/strict';
import { test } from 'node:test';
import {
  editarIntegrante, instrumentosDesdeTexto, nombresDeOtrosIntegrantes, normalizarBanda,
  normalizarIntegrante, normalizarInstrumentos, textoDeInstrumentos,
  validarNombreDeIntegrante,
} from '../src/entities/integrantes.ts';
import { crearBanda, crearIntegrante } from '../src/entities/factories.ts';
import { etiquetaDeInstrumento } from '../src/data/instrumentos.ts';
import type { BandMember, BandProfile } from '../src/entities/musical.ts';
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

// --- Nombres repetidos -------------------------------------------------------

test('dos integrantes no se pueden llamar igual', () => {
  // La premisa de la pantalla de canales es poder decir «el microfono de Ana»
  // en vez de «el canal 3». Con dos Anas el desplegable de «quien» muestra dos
  // veces lo mismo y esa frase deja de senalar a nadie.
  const otros = ['Ana', 'Beto'];
  strictEqual(validarNombreDeIntegrante('Cami', otros), null);
  ok(validarNombreDeIntegrante('Ana', otros) !== null);
});

test('el mensaje del nombre repetido dice que hacer, no solo que esta mal', () => {
  const error = validarNombreDeIntegrante('Ana', ['Ana']);
  ok(error !== null);
  match(error, /Ana/);
  match(error, /apellido|inicial/);
});

test('la comparacion de nombres ignora mayusculas y acentos, como la de bandas', () => {
  // «Ana» y «ana» son la misma persona; tenerlas separadas parte por un
  // descuido de tipeo justo el dato que sirve para nombrar canales.
  ok(validarNombreDeIntegrante('  ana  ', ['Ana']) !== null);
  ok(validarNombreDeIntegrante('Ramon', ['Ramón']) !== null);
});

test('un nombre repetido no tapa al que falta o al que es muy corto', () => {
  // Primero lo que impide guardar por si mismo: decirle «ya esta en uso» a
  // alguien que dejo el campo vacio no explica nada.
  match(validarNombreDeIntegrante('', ['Ana']) ?? '', /vacío/);
  match(validarNombreDeIntegrante('A', ['Ana']) ?? '', /2 caracteres/);
});

test('corregir a alguien no choca consigo mismo', () => {
  // Sin excluir al que se corrige, abrir a Ana y confirmar sin tocar nada
  // diria que «Ana» ya esta en uso --por ella misma-- y el boton de confirmar
  // quedaria apagado sin ninguna salida.
  const lista = banda();
  const ana = lista[0]!;
  const otros = nombresDeOtrosIntegrantes(lista, ana.id);
  deepStrictEqual([...otros], ['Beto', 'Cami']);
  strictEqual(validarNombreDeIntegrante('Ana', otros), null);
});

test('en un alta no hay a quien excluir, asi que estan todos', () => {
  const lista = banda();
  deepStrictEqual([...nombresDeOtrosIntegrantes(lista, null)], ['Ana', 'Beto', 'Cami']);
  ok(validarNombreDeIntegrante('Ana', nombresDeOtrosIntegrantes(lista, null)) !== null);
});

// --- Clasificar al leer ------------------------------------------------------

/** Un integrante como lo deja la migracion 4: con forma, sin clasificar. */
function migrado(nombre: string, textos: readonly string[]): BandMember {
  return {
    id: `mbr_${nombre}` as BandMemberId,
    nombre,
    instrumentos: textos.map((t) => ({
      fuente: null, variante: null, rol: null, textoOriginal: t,
    })),
  };
}

function bandaCon(integrantes: readonly BandMember[]): BandProfile {
  return { ...crearBanda('Los del fondo'), integrantes };
}

test('leer una banda migrada la deja clasificada', () => {
  // La migracion le da forma al documento y no clasifica --SQL no sabe que es
  // un djembe--. Si eso solo se completara al guardar, la eleccion de
  // instrumento en la asignacion de canal no traeria ningun perfil justo en
  // los perfiles que ya existian.
  const leida = normalizarBanda(bandaCon([migrado('Ana', ['guitarra criolla', 'voz'])]));
  const instrumentos = leida.integrantes[0]!.instrumentos;
  deepStrictEqual(instrumentos.map((i) => i.fuente), ['GUITARRA', 'VOZ']);
  strictEqual(instrumentos[0]!.variante, 'NYLON');
});

test('clasificar al leer nunca pierde el texto original', () => {
  const leida = normalizarBanda(bandaCon([migrado('Ana', ['GUITARRA CRIOLLA', 'serrucho'])]));
  const instrumentos = leida.integrantes[0]!.instrumentos;
  strictEqual(etiquetaDeInstrumento(instrumentos[0]!), 'GUITARRA CRIOLLA');
  // Lo que el catalogo no reconoce se queda sin fuente, con su texto intacto.
  strictEqual(instrumentos[1]!.fuente, null);
  strictEqual(etiquetaDeInstrumento(instrumentos[1]!), 'serrucho');
});

test('clasificar al leer es idempotente', () => {
  const una = normalizarBanda(bandaCon([migrado('Ana', ['guitarra criolla'])]));
  deepStrictEqual(normalizarBanda(una), una);
});

test('leer una banda que ya estaba bien devuelve exactamente el mismo objeto', () => {
  // No es una optimizacion: la pantalla de edicion compara lo que tiene contra
  // lo que leyo para saber si hay cambios sin guardar, y una copia identica
  // pero nueva se leeria como un cambio que nadie hizo.
  const b = bandaCon([crearIntegrante('Ana', ['voz'])]);
  strictEqual(normalizarBanda(b), b);
  strictEqual(normalizarIntegrante(b.integrantes[0]!), b.integrantes[0]);
});

test('leer aguanta una banda con cadenas crudas, sin migracion de por medio', () => {
  // El almacen del navegador no ejecuta las migraciones del esquema, asi que
  // ahi los instrumentos pueden seguir siendo texto suelto.
  const crudo = {
    id: 'mbr_x' as BandMemberId, nombre: 'Ana',
    instrumentos: ['voz', 'cajon'] as unknown as BandMember['instrumentos'],
  };
  const leida = normalizarBanda(bandaCon([crudo]));
  deepStrictEqual(leida.integrantes[0]!.instrumentos.map((i) => i.fuente), ['VOZ', 'CAJON']);
});

test('leer no toca a los integrantes que no hacia falta clasificar', () => {
  const ana = crearIntegrante('Ana', ['voz']);
  const leida = normalizarBanda(bandaCon([ana, migrado('Beto', ['bajo'])]));
  strictEqual(leida.integrantes[0], ana);
  strictEqual(leida.integrantes[1]!.instrumentos[0]!.fuente, 'BAJO');
});
