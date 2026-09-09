import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FUENTES, crearInstrumento, etiquetaDeInstrumento, interpretarInstrumento,
  normalizarInstrumentos, textoDeInstrumentos,
  type Instrumento,
} from '@vse/domain';
import {
  FUENTES_ELEGIBLES, agregarFuente, alternarRol, alternarVariante, filasDeInstrumentos,
  quitarInstrumento,
} from '../src/app/perfiles/elegir-instrumentos.ts';

/**
 * La lógica de la elección guiada de instrumentos, sin montar Angular.
 *
 * Está toda en funciones puras justamente para poder probarla acá: el
 * componente solo consulta lo que estas funciones devuelven y emite la lista
 * que le dan.
 */

test('la grilla ofrece las trece fuentes del catálogo, en su orden', () => {
  // El orden no se decide en la pantalla: el catálogo ya las tiene agrupadas
  // por familia. Si se reordenaran acá, el orden dependería de dos sitios.
  assert.deepEqual(
    FUENTES_ELEGIBLES.map((f) => f.id),
    FUENTES.map((f) => f.id),
  );
  assert.deepEqual(
    FUENTES_ELEGIBLES.map((f) => f.nombre),
    FUENTES.map((f) => f.nombre),
  );
});

test('un toque en la grilla deja el instrumento elegido, sin pedir nada más', () => {
  // La fuente es lo único que el usuario trae decidido de antemano. Pedirle
  // variante y rol para poder guardar «voz» convertiría un toque en tres.
  const lista = agregarFuente([], 'VOZ');
  assert.equal(lista.length, 1);
  assert.deepEqual(lista[0], { fuente: 'VOZ', variante: null, rol: null, textoOriginal: null });
  assert.equal(etiquetaDeInstrumento(lista[0]!), 'voz');
});

test('se pueden sumar varios: alguien canta y toca la guitarra', () => {
  const lista = agregarFuente(agregarFuente([], 'VOZ'), 'GUITARRA');
  assert.deepEqual(lista.map((i) => i.fuente), ['VOZ', 'GUITARRA']);
});

test('dos veces la misma fuente son dos instrumentos, no uno', () => {
  // Dos congas arrancan idénticas y se separan al elegirles el tamaño.
  // Descartar repetidos haría imposible cargar la tumbadora y el quinto.
  const dos = agregarFuente(agregarFuente([], 'CONGA'), 'CONGA');
  assert.equal(dos.length, 2);
  const separadas = alternarVariante(
    alternarVariante(dos, 0, 'TAMANO_GRANDE'), 1, 'TAMANO_PEQUENO');
  assert.deepEqual(separadas.map((i) => i.variante), ['TAMANO_GRANDE', 'TAMANO_PEQUENO']);
});

test('solo se ofrecen las facetas que la fuente declara', () => {
  // Es la mitad del valor del catálogo: la opción imposible no se descarta,
  // no llega a verse. Un djembe no tiene tesitura y una voz no es de nylon.
  const [voz] = filasDeInstrumentos([crearInstrumento('VOZ')]);
  assert.deepEqual(voz!.variantes.map((v) => v.id),
    ['TESITURA_GRAVE', 'TESITURA_MEDIA', 'TESITURA_AGUDA']);
  assert.deepEqual(voz!.roles.map((r) => r.id), ['PRINCIPAL', 'SEGUNDA_VOZ', 'CORO']);

  const [djembe] = filasDeInstrumentos([crearInstrumento('DJEMBE')]);
  assert.deepEqual(djembe!.variantes.map((v) => v.id),
    ['TAMANO_GRANDE', 'TAMANO_MEDIANO', 'TAMANO_PEQUENO']);
  assert.deepEqual(djembe!.roles.map((r) => r.id), ['BASE', 'REPIQUE', 'SOLISTA']);
});

test('una fuente sin facetas no dibuja ninguna fila de opciones', () => {
  // Un shaker no tiene tamaño declarado; una entrada de línea no cumple una
  // función musical propia. En los dos casos la plantilla no pinta nada.
  const [shaker] = filasDeInstrumentos([crearInstrumento('SHAKER')]);
  assert.deepEqual(shaker!.variantes, []);
  assert.deepEqual(shaker!.roles.map((r) => r.id), ['BASE', 'REFUERZO']);

  const [linea] = filasDeInstrumentos([crearInstrumento('LINEA')]);
  assert.deepEqual(linea!.variantes, []);
  assert.deepEqual(linea!.roles, []);
});

test('la ficha elegida es la que está puesta en el instrumento', () => {
  const lista = alternarRol(alternarVariante([crearInstrumento('GUITARRA')], 0, 'NYLON'), 0, 'BASE');
  const [fila] = filasDeInstrumentos(lista);
  assert.deepEqual(fila!.variantes.filter((v) => v.elegida).map((v) => v.id), ['NYLON']);
  assert.deepEqual(fila!.roles.filter((r) => r.elegida).map((r) => r.id), ['BASE']);
  assert.equal(fila!.etiqueta, 'guitarra de nylon, base');
});

test('tocar la ficha que ya estaba puesta la quita', () => {
  // Sin alternar, una faceta elegida por error solo se corrige quitando el
  // instrumento entero, que es desproporcionado para arreglar un tamaño.
  const conVariante = alternarVariante([crearInstrumento('CONGA')], 0, 'TAMANO_GRANDE');
  const sinVariante = alternarVariante(conVariante, 0, 'TAMANO_GRANDE');
  assert.equal(sinVariante[0]!.variante, null);

  const conRol = alternarRol([crearInstrumento('CONGA')], 0, 'REPIQUE');
  assert.equal(alternarRol(conRol, 0, 'REPIQUE')[0]!.rol, null);
});

test('la variante y el rol son independientes: elegir uno no borra el otro', () => {
  const lista = alternarRol(alternarVariante([crearInstrumento('VOZ')], 0, 'TESITURA_AGUDA'), 0, 'CORO');
  assert.deepEqual(lista[0], {
    fuente: 'VOZ', variante: 'TESITURA_AGUDA', rol: 'CORO', textoOriginal: null,
  });
  // Y cambiar de variante no toca el rol.
  const otra = alternarVariante(lista, 0, 'TESITURA_GRAVE');
  assert.equal(otra[0]!.variante, 'TESITURA_GRAVE');
  assert.equal(otra[0]!.rol, 'CORO');
});

test('una faceta que la fuente no admite deja la lista igual', () => {
  // La pantalla no la ofrece, pero la regla no puede depender de que la
  // pantalla no se equivoque: «crearInstrumento» lanzaría si la dejáramos pasar.
  const lista = [crearInstrumento('DJEMBE')];
  assert.equal(alternarVariante(lista, 0, 'NYLON'), lista);
  assert.equal(alternarRol(lista, 0, 'CORO'), lista);
});

test('quitar saca la fila que se tocó y renumera las que quedan', () => {
  const lista = agregarFuente(agregarFuente(agregarFuente([], 'VOZ'), 'BAJO'), 'CAJON');
  const menos = quitarInstrumento(lista, 1);
  assert.deepEqual(menos.map((i) => i.fuente), ['VOZ', 'CAJON']);
  assert.deepEqual(filasDeInstrumentos(menos).map((f) => f.indice), [0, 1]);
});

test('un índice fuera de rango no cambia nada', () => {
  const lista = [crearInstrumento('VOZ')];
  assert.equal(quitarInstrumento(lista, 5), lista);
  assert.equal(quitarInstrumento(lista, -1), lista);
  assert.equal(alternarVariante(lista, 5, 'TESITURA_AGUDA'), lista);
  assert.equal(alternarRol(lista, 5, 'CORO'), lista);
});

test('nada muta la lista que recibe', () => {
  // El componente emite la lista entera y quien lo usa la guarda en una señal:
  // si mutáramos en el sitio, la referencia no cambiaría y la pantalla no se
  // repintaría.
  const original: readonly Instrumento[] = [crearInstrumento('VOZ')];
  const copia = [...original];
  agregarFuente(original, 'BAJO');
  alternarVariante(original, 0, 'TESITURA_AGUDA');
  alternarRol(original, 0, 'CORO');
  quitarInstrumento(original, 0);
  assert.deepEqual(original, copia);
});

test('un instrumento escrito a mano se ve como se escribió y no se afina', () => {
  // Es la compatibilidad hacia atrás. «GUITARRA CRIOLLA» sigue diciendo
  // «GUITARRA CRIOLLA»: reescribirle al usuario lo que él escribió, para
  // mostrarle nuestro nombre, es cambiarle los datos sin pedirle permiso. Y por
  // eso tampoco se le ofrecen fichas: cambiarle una faceta obligaría a elegir
  // entre mostrar un texto que ya no describe lo guardado o tirar ese texto.
  const viejo = interpretarInstrumento('GUITARRA CRIOLLA');
  const [fila] = filasDeInstrumentos([viejo]);
  assert.equal(fila!.etiqueta, 'GUITARRA CRIOLLA');
  assert.deepEqual(fila!.variantes, []);
  assert.deepEqual(fila!.roles, []);
  assert.equal(fila!.nota, 'Escrito a mano; se lee como «guitarra de nylon».');
});

test('la nota dice cuando el catálogo no reconoció el texto', () => {
  const raro = interpretarInstrumento('serrucho');
  assert.equal(raro.fuente, null);
  const [fila] = filasDeInstrumentos([raro]);
  assert.equal(fila!.etiqueta, 'serrucho');
  assert.equal(fila!.nota, 'Escrito a mano. El catálogo no lo reconoce, así que se guarda tal cual.');
});

test('cuando el texto coincide con el nombre del catálogo la nota no lo repite', () => {
  const [fila] = filasDeInstrumentos([interpretarInstrumento('Voz')]);
  assert.equal(fila!.nota, 'Escrito a mano.');
});

test('lo elegido de la lista no lleva nota: no hubo texto que conservar', () => {
  const [fila] = filasDeInstrumentos([crearInstrumento('VOZ', null, 'PRINCIPAL')]);
  assert.equal(fila!.nota, null);
  assert.equal(fila!.etiqueta, 'voz, principal');
});

test('abrir un integrante migrado, verlo y volver a guardarlo no le cambia nada', () => {
  // El viaje completo que hace el diálogo: lo guardado entra tal cual, se
  // dibuja, y sale por la misma normalización del dominio que usa el alta.
  // La versión anterior lo convertía a una línea de texto y la volvía a
  // interpretar; ese ida y vuelta es donde se perdía el texto original.
  const guardado = normalizarInstrumentos(['GUITARRA CRIOLLA', 'voz', 'serrucho']);
  filasDeInstrumentos(guardado);
  assert.deepEqual(normalizarInstrumentos(guardado), guardado);
  assert.equal(textoDeInstrumentos(guardado), 'GUITARRA CRIOLLA, voz, serrucho');
});

test('quitar uno de un integrante migrado no toca a los demás', () => {
  const guardado = normalizarInstrumentos(['GUITARRA CRIOLLA', 'serrucho']);
  const menos = quitarInstrumento(guardado, 0);
  assert.deepEqual(normalizarInstrumentos(menos), menos);
  assert.equal(textoDeInstrumentos(menos), 'serrucho');
});

test('a un integrante migrado se le puede sumar uno del catálogo', () => {
  const guardado = normalizarInstrumentos(['GUITARRA CRIOLLA']);
  const mas = alternarRol(agregarFuente(guardado, 'VOZ'), 1, 'PRINCIPAL');
  assert.equal(textoDeInstrumentos(mas), 'GUITARRA CRIOLLA, voz, principal');
  // Y lo que ya estaba sigue intacto.
  assert.deepEqual(mas[0], guardado[0]);
});
