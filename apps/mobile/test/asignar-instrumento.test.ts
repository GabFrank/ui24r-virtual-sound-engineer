import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearIntegrante, fuentePorId, interpretarInstrumento, perfilPorTipo, ui24rInput,
  type BandMember, type BandMemberId, type ChannelAssignment, type ChannelProfileId,
  type ChannelAssignmentId, type Instrumento,
} from '@vse/domain';
import {
  avisoDePerfilDeAsignacion, instrumentoElegido, instrumentosDeIntegrante,
  opcionesDeIntegrantes, valorDelInstrumento,
} from '../src/app/channels/asignar-instrumento.ts';

/**
 * Elegir el instrumento entre los que toca el integrante, y traer de ahí el
 * perfil de canal.
 *
 * La lógica está toda en funciones puras para poder probarla acá, sin montar
 * Angular: el componente consulta lo que estas funciones devuelven y guarda lo
 * que le dan.
 *
 * La mitad de estos tests son los caminos que no son el feliz. Son los que
 * importan: la banda sin integrantes, el canal sin integrante, el integrante
 * sin instrumentos, el que ya no está y las dos fuentes que a propósito no
 * tienen perfil. Cualquiera de los cinco deja la pantalla inservible si se
 * supone que siempre hay un instrumento con su perfil.
 */

const ana = crearIntegrante('Ana', ['voz']);
const beto = crearIntegrante('Beto', ['djembe']);
const sinNada = crearIntegrante('Cami', []);

function asignacion(datos: Partial<ChannelAssignment> = {}): ChannelAssignment {
  return {
    id: 'ch_1' as ChannelAssignmentId,
    ui24rInputIndex: ui24rInput(3),
    bandMemberId: null,
    instrumento: 'VOZ PPAL',
    instrumentoDetalle: null,
    channelProfileId: 'perfil_lead_vocal' as ChannelProfileId,
    defaultRole: 'LEAD',
    micModelo: null,
    nombreEnConsola: 'VOZ PPAL',
    isLive: true,
    ...datos,
  };
}

// --- El camino que hace que el catálogo sirva para algo -----------------------

test('se ofrecen los instrumentos de esa persona, no el catálogo entero', () => {
  // Es lo que hace que esto sea más rápido que elegir el perfil a mano: si
  // ofreciéramos las trece fuentes habríamos cambiado una lista de trece por
  // otra de trece, y encima sin enlazar el canal con quien lo usa.
  const { opciones, porQueVacio } = instrumentosDeIntegrante([ana, beto], ana.id);
  assert.equal(porQueVacio, null);
  assert.deepEqual(opciones.map((o) => o.etiqueta), ['voz']);
});

test('elegir el instrumento trae el perfil de canal que le corresponde', () => {
  const cantante = crearIntegrante('Ana', ['voz']);
  const elegido = instrumentoElegido([cantante], cantante.id, '0');
  assert.ok(elegido !== null);
  assert.equal(elegido.tipo, 'LEAD_VOCAL');
  assert.equal(elegido.sinPerfilPorque, null);
  assert.equal(elegido.etiqueta, 'voz');
});

test('el perfil sale de las facetas, no solo de la fuente', () => {
  // Dos micrófonos idénticos con perfiles distintos: el rol de coro cambia lo
  // que la consola tiene que hacer con el canal.
  const coreuta = crearIntegrante('Ana', [
    { fuente: 'VOZ', variante: null, rol: 'CORO', textoOriginal: null },
  ]);
  assert.equal(instrumentoElegido([coreuta], coreuta.id, '0')?.tipo, 'BACKING_VOCAL');
});

test('el instrumento que se guarda es el del integrante, con su clasificación', () => {
  const guitarrista = crearIntegrante('Ana', [
    { fuente: 'GUITARRA', variante: 'ELECTRICO', rol: 'SOLISTA', textoOriginal: null },
  ]);
  const elegido = instrumentoElegido([guitarrista], guitarrista.id, '0');
  assert.ok(elegido !== null);
  assert.equal(elegido.tipo, 'ELECTRIC_GUITAR');
  assert.equal(elegido.etiqueta, 'guitarra eléctrica, solista');
  assert.deepEqual(elegido.instrumento, guitarrista.instrumentos[0]);
});

test('un integrante migrado de texto libre también trae perfil', () => {
  // Depende de que el repositorio clasifique al leer. Antes, un perfil migrado
  // llegaba con la fuente en nulo y esto no habría traído nada justo en las
  // bandas que ya existían.
  const viejo = crearIntegrante('Ana', ['GUITARRA CRIOLLA']);
  const elegido = instrumentoElegido([viejo], viejo.id, '0');
  assert.ok(elegido !== null);
  assert.equal(elegido.tipo, 'ACOUSTIC_GUITAR');
  // Y se guarda con el texto que escribió su dueño, no con el nuestro.
  assert.equal(elegido.etiqueta, 'GUITARRA CRIOLLA');
});

// --- Djembe y bombo: sin perfil a propósito ----------------------------------

test('una fuente sin perfil se avisa en la propia opción, antes de elegirla', () => {
  // Quien arma la asignación tres minutos antes de empezar merece saberlo
  // antes de tocar, no descubrirlo cuando el margen objetivo salga de
  // «Personalizado».
  const { opciones } = instrumentosDeIntegrante([beto], beto.id);
  assert.equal(opciones[0]!.conPerfil, false);
  assert.equal(opciones[0]!.texto, 'djembe — sin perfil de canal');
});

test('elegir un djembe deja «Personalizado» y explica por qué, con el texto del catálogo', () => {
  // No es rellenar: el usuario acaba de elegir djembe y la fila dice por qué no
  // hay perfil. Lo que sería rellenar es presentar el de conga con la misma
  // cara que los que sí se pensaron.
  const elegido = instrumentoElegido([beto], beto.id, '0');
  assert.ok(elegido !== null);
  assert.equal(elegido.tipo, 'CUSTOM');
  assert.equal(elegido.sinPerfilPorque, fuentePorId('DJEMBE').sinPerfilPorque);
});

test('elegir un djembe no deja puesto el perfil que describía otro instrumento', () => {
  // Conservar el anterior sería peor que «Personalizado»: el canal quedaría con
  // el pasa altos y el margen de una conga, y nada lo diría.
  assert.notEqual(instrumentoElegido([beto], beto.id, '0')?.tipo, 'CONGA');
});

test('el aviso de «sin perfil» desaparece cuando el usuario lo resuelve a mano', () => {
  const djembe: Instrumento = {
    fuente: 'DJEMBE', variante: null, rol: 'BASE', textoOriginal: null,
  };
  const a = asignacion({ instrumentoDetalle: djembe });
  assert.ok(avisoDePerfilDeAsignacion(a, 'CUSTOM') !== null);
  // Elegir un perfil a mano es exactamente lo que el aviso pedía. Seguir
  // mostrándolo convertiría la explicación en ruido sobre un canal ya resuelto.
  assert.equal(avisoDePerfilDeAsignacion(a, 'CONGA'), null);
});

test('una asignación vieja, sin clasificar, no dice «sin perfil»', () => {
  // Su etiqueta es texto sincronizado de la consola. «No hay perfil» ahí no
  // diría nada del instrumento: diría que nadie lo eligió todavía.
  assert.equal(avisoDePerfilDeAsignacion(asignacion(), 'CUSTOM'), null);
});

// --- Los caminos en los que no hay nada que ofrecer ---------------------------

test('sin integrantes cargados la pantalla lo dice y manda a cargarlos', () => {
  const { opciones, porQueVacio } = instrumentosDeIntegrante([], null);
  assert.deepEqual(opciones, []);
  assert.match(porQueVacio ?? '', /Perfiles/);
  // Y sigue diciendo lo mismo aunque la asignación traiga un integrante que ya
  // no existe en ninguna parte.
  assert.equal(
    instrumentosDeIntegrante([], 'mbr_fantasma' as BandMemberId).porQueVacio,
    porQueVacio,
  );
});

test('sin integrante elegido se pide elegirlo, no se muestra una lista vacía', () => {
  const { opciones, porQueVacio } = instrumentosDeIntegrante([ana], null);
  assert.deepEqual(opciones, []);
  assert.match(porQueVacio ?? '', /quién toca/);
});

test('un integrante sin instrumentos lo dice con su nombre y ofrece las dos salidas', () => {
  const { opciones, porQueVacio } = instrumentosDeIntegrante([sinNada], sinNada.id);
  assert.deepEqual(opciones, []);
  assert.match(porQueVacio ?? '', /^Cami/);
  assert.match(porQueVacio ?? '', /a mano/);
});

test('un integrante que ya no está en la banda se explica, y no rompe nada', () => {
  // Pasa de verdad: quitar a alguien de la banda deja sus canales apuntando a
  // un identificador que ya no existe. Que la pantalla lo diga conserva más
  // información que limpiarlo en silencio.
  const { opciones, porQueVacio } = instrumentosDeIntegrante([ana], beto.id);
  assert.deepEqual(opciones, []);
  assert.match(porQueVacio ?? '', /ya no está/);
});

test('cada motivo dice qué hacer, no solo que no hay', () => {
  const motivos = [
    instrumentosDeIntegrante([], null).porQueVacio,
    instrumentosDeIntegrante([ana], null).porQueVacio,
    instrumentosDeIntegrante([sinNada], sinNada.id).porQueVacio,
    instrumentosDeIntegrante([ana], beto.id).porQueVacio,
  ];
  for (const m of motivos) assert.ok((m ?? '').length > 40, `motivo demasiado corto: ${m}`);
  // Y los cuatro son distintos: se arreglan en sitios distintos.
  assert.equal(new Set(motivos).size, motivos.length);
});

// --- Elegir lo que no se ofrece ----------------------------------------------

test('un valor que no corresponde a ningún instrumento no devuelve nada', () => {
  // La pantalla no ofrece esos valores, pero la regla no puede depender de que
  // la pantalla no se equivoque.
  assert.equal(instrumentoElegido([ana], ana.id, '7'), null);
  assert.equal(instrumentoElegido([ana], ana.id, ''), null);
  assert.equal(instrumentoElegido([ana], ana.id, 'voz'), null);
  assert.equal(instrumentoElegido([ana], null, '0'), null);
  assert.equal(instrumentoElegido([ana], beto.id, '0'), null);
});

// --- Qué opción queda marcada ------------------------------------------------

test('lo ya asignado queda marcado en el desplegable', () => {
  const a = asignacion({ bandMemberId: ana.id, instrumento: 'voz' });
  assert.equal(valorDelInstrumento([ana], a, ana.id), '0');
});

test('se busca por etiqueta y no por posición: la lista se puede reordenar', () => {
  // Una posición guardada empezaría a señalar a otro instrumento en cuanto
  // alguien reordenara los de esa persona en Perfiles → Banda, sin que nadie
  // tocara la asignación.
  const dos = crearIntegrante('Ana', ['cajon', 'voz']);
  const a = asignacion({ bandMemberId: dos.id, instrumento: 'voz' });
  assert.equal(valorDelInstrumento([dos], a, dos.id), '1');
});

test('sin asignación, sin integrante o con un instrumento que ya no está, no hay marca', () => {
  assert.equal(valorDelInstrumento([ana], undefined, ana.id), '');
  assert.equal(valorDelInstrumento([ana], asignacion(), null), '');
  // El instrumento que tenía el canal ya no está entre los de esa persona.
  assert.equal(valorDelInstrumento([ana], asignacion({ instrumento: 'bajo' }), ana.id), '');
});

test('una asignación clasificada se busca por su clasificación, no por su etiqueta vieja', () => {
  const detalle: Instrumento = {
    fuente: 'VOZ', variante: null, rol: null, textoOriginal: null,
  };
  const a = asignacion({ instrumento: 'VOZ PPAL', instrumentoDetalle: detalle });
  assert.equal(valorDelInstrumento([ana], a, ana.id), '0');
});

test('dos instrumentos indistinguibles marcan el primero', () => {
  // Dos congas sin tamaño elegido son iguales por definición: mientras lo sean,
  // cuál de las dos se marque no cambia nada, y al elegirles el tamaño dejan de
  // serlo.
  const dosCongas = crearIntegrante('Ana', ['conga', 'conga']);
  const a = asignacion({ instrumento: 'conga' });
  assert.equal(valorDelInstrumento([dosCongas], a, dosCongas.id), '0');
});

// --- Quién --------------------------------------------------------------------

test('los integrantes se ofrecen en el orden en que están cargados', () => {
  const lista: readonly BandMember[] = [ana, beto, sinNada];
  assert.deepEqual(opcionesDeIntegrantes(lista).map((o) => o.nombre), ['Ana', 'Beto', 'Cami']);
  assert.deepEqual(opcionesDeIntegrantes(lista).map((o) => o.id), lista.map((m) => m.id));
});

test('el que no tiene instrumentos se sigue ofreciendo', () => {
  // Esconderlo sería impedir asignarle un canal a quien todavía no cargó con
  // qué toca, que es justo el caso que la pantalla tiene que sobrevivir.
  assert.ok(opcionesDeIntegrantes([sinNada]).some((o) => o.nombre === 'Cami'));
});

// --- Que el perfil traído sea uno de verdad ----------------------------------

test('todo perfil que el instrumento trae existe en la tabla de perfiles', () => {
  const todos = crearIntegrante('Ana', [
    'voz', 'guitarra electrica', 'bajo', 'teclado', 'flauta',
    'djembe', 'bombo', 'cajon', 'conga', 'maraca', 'shaker', 'playback', 'charla',
  ]);
  for (let i = 0; i < todos.instrumentos.length; i++) {
    const elegido = instrumentoElegido([todos], todos.id, String(i));
    assert.ok(elegido !== null);
    // Lanza si el tipo no existe: es lo que se guarda en la asignación.
    assert.ok(perfilPorTipo(elegido.tipo).id.length > 0);
  }
});

test('lo que el catálogo no reconoce se puede elegir igual, y explica el perfil', () => {
  const raro = crearIntegrante('Ana', ['serrucho']);
  const elegido = instrumentoElegido([raro], raro.id, '0');
  assert.ok(elegido !== null);
  assert.equal(elegido.tipo, 'CUSTOM');
  assert.equal(elegido.etiqueta, 'serrucho');
  assert.match(elegido.sinPerfilPorque ?? '', /serrucho/);
  assert.deepEqual(elegido.instrumento, interpretarInstrumento('serrucho'));
});
