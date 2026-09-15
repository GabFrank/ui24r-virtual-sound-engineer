import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aplicarOrdenGuardado, ordenPropuesto, ui24rInput,
  ETAPAS_EN_ORDEN, LEY_MEDIDA, PUESTO_DESCONOCIDO, PUESTO_POR_FUENTE,
  type ChannelAssignment, type ChannelAssignmentId, type ChannelProfileId,
  type EtapaDeInstrumento, type Instrumento,
} from '../src/index.ts';

/**
 * El orden del recorrido guiado.
 *
 * **Lo que estos tests fijan no es una preferencia: es la tabla publicada en
 * `docs/orden-del-soundcheck.md`**, que cita tres fuentes de oficio. Si alguien
 * cambia el orden del código sin cambiar el documento, o al revés, hay un test
 * que los compara.
 */

function canal(n: number, etiqueta: string): ChannelAssignment {
  return {
    id: `ch_${n}` as ChannelAssignmentId,
    ui24rInputIndex: ui24rInput(n),
    bandMemberId: null,
    instrumento: etiqueta,
    instrumentoDetalle: null,
    channelProfileId: 'perfil' as ChannelProfileId,
    defaultRole: 'SUPPORT',
    micModelo: null,
    nombreEnConsola: etiqueta,
    isLive: true,
  };
}

const como = (fuente: Instrumento['fuente']): Instrumento =>
  ({ fuente, variante: null, rol: null, textoOriginal: null });

test('el cimiento va primero y las voces al final', () => {
  // Es el motivo que dan las tres fuentes: todo lo que viene después se
  // equilibra contra lo que ya está puesto.
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Guitarra'), canal(3, 'Bombo'), canal(4, 'Bajo')];
  const fuentes: Record<string, Instrumento> = {
    'Voz': como('VOZ'), 'Guitarra': como('GUITARRA'), 'Bombo': como('BOMBO'), 'Bajo': como('BAJO'),
  };
  const r = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento] ?? null);
  deepStrictEqual(r.map((p) => p.etiqueta), ['Bombo', 'Bajo', 'Guitarra', 'Voz']);
  // Y el orden propuesto NO es el de los canales, que era 1,2,3,4.
  deepStrictEqual(r.map((p) => p.canal), [3, 4, 2, 1]);
});

test('dentro de una misma familia manda el número de canal', () => {
  // No es la convención de oficio --que es de derecha a izquierda del
  // escenario-- porque eso necesita el escenario cargado. El canal es el único
  // orden que existe siempre.
  const asignaciones = [canal(7, 'Guitarra 2'), canal(3, 'Guitarra 1'), canal(5, 'Guitarra 3')];
  const r = ordenPropuesto(asignaciones, () => como('GUITARRA'));
  deepStrictEqual(r.map((p) => p.canal), [3, 5, 7]);
});

test('lo que el catálogo no clasificó va al final, no al principio', () => {
  // Una fuente sin clasificar es una de la que no se sabe nada, y lo que no se
  // sabe no puede meterse en el medio del cimiento.
  const asignaciones = [canal(1, 'Algo raro'), canal(2, 'Voz'), canal(3, 'Bombo')];
  const fuentes: Record<string, Instrumento | null> = {
    'Algo raro': null, 'Voz': como('VOZ'), 'Bombo': como('BOMBO'),
  };
  const r = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento] ?? null);
  deepStrictEqual(r.map((p) => p.etiqueta), ['Bombo', 'Voz', 'Algo raro']);
  strictEqual(r[2]?.puestoPropuesto, PUESTO_DESCONOCIDO);
  // Control positivo: un instrumento con fuente pero sin variante SÍ se ubica.
  const conFuente = ordenPropuesto([canal(1, 'x')], () => como('BOMBO'));
  ok(conFuente[0]!.puestoPropuesto < PUESTO_DESCONOCIDO);
});

test('el orden guardado por el usuario manda sobre el propuesto', () => {
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo')];
  const fuentes: Record<string, Instrumento> = { 'Voz': como('VOZ'), 'Bombo': como('BOMBO') };
  const propuesto = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento]!);
  deepStrictEqual(propuesto.map((p) => p.etiqueta), ['Bombo', 'Voz']);
  // El usuario lo dio vuelta: la banda arranca por la voz.
  const guardado = aplicarOrdenGuardado(propuesto, ['ch_1', 'ch_2'] as ChannelAssignmentId[]);
  deepStrictEqual(guardado.map((p) => p.etiqueta), ['Voz', 'Bombo']);
});

test('un canal agregado después no desaparece del recorrido', () => {
  // Sumar un micrófono a mitad del soundcheck es lo normal. Si el orden
  // guardado no lo menciona y se lo deja afuera, sale del recorrido sin que
  // nadie se entere.
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo'), canal(3, 'Nuevo')];
  const fuentes: Record<string, Instrumento> = {
    'Voz': como('VOZ'), 'Bombo': como('BOMBO'), 'Nuevo': como('CONGA'),
  };
  const propuesto = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento]!);
  const guardado = aplicarOrdenGuardado(propuesto, ['ch_1', 'ch_2'] as ChannelAssignmentId[]);
  strictEqual(guardado.length, 3, 'no se pierde ninguno');
  strictEqual(guardado[2]?.etiqueta, 'Nuevo', 'el que no estaba en el orden va al final');
});

test('un identificador repetido en el orden guardado gana en su PRIMERA aparición', () => {
  // `new Map` con duplicados se queda con el último índice, así que un orden
  // guardado con un identificador repetido movía ese canal al final en vez de
  // dejarlo donde el usuario lo puso. Lo encontró una auditoría probando
  // `[ch_1, ch_2, ch_1]`: la voz, guardada en el puesto 0, salía en el 2.
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo')];
  const fuentes: Record<string, Instrumento> = { 'Voz': como('VOZ'), 'Bombo': como('BOMBO') };
  const propuesto = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento]!);
  const conDuplicado = aplicarOrdenGuardado(
    propuesto, ['ch_1', 'ch_2', 'ch_1'] as ChannelAssignmentId[]);
  deepStrictEqual(conDuplicado.map((p) => p.etiqueta), ['Voz', 'Bombo'],
    'la voz se queda en el puesto 0, que es donde el usuario la puso');
});

test('dos canales fuera del orden guardado conservan el orden propuesto entre sí', () => {
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo'), canal(3, 'Bajo')];
  const fuentes: Record<string, Instrumento> = {
    'Voz': como('VOZ'), 'Bombo': como('BOMBO'), 'Bajo': como('BAJO'),
  };
  const propuesto = ordenPropuesto(asignaciones, (a) => fuentes[a.instrumento]!);
  // Sólo la voz está en el orden guardado; bombo y bajo tienen que quedar en el
  // orden de oficio, no al azar.
  const guardado = aplicarOrdenGuardado(propuesto, ['ch_1'] as ChannelAssignmentId[]);
  deepStrictEqual(guardado.map((p) => p.etiqueta), ['Voz', 'Bombo', 'Bajo']);
});

// --- El código y el documento tienen que decir lo mismo ---------------------

test('el documento declara cuáles de sus ocho filas el catálogo NO puede expresar', () => {
  // **El primer test que escribí acá fingía atar los dos archivos y no ataba
  // nada.** Afirmaba que el documento tiene ocho filas y después comprobaba
  // sólo las cinco en las que el código coincide; las tres donde el código
  // contradice al documento --redoblante, toms y aéreos, que son el cimiento de
  // una batería-- estaban nombradas en el mismo test y sin comprobar. Lo
  // encontró una auditoría corriendo las ocho filas.
  //
  // Ahora la tabla del documento lleva una columna que dice qué puede expresar
  // el catálogo, y esto comprueba esa columna contra el catálogo de verdad.
  const doc = readFileSync(new URL('../../../docs/orden-del-soundcheck.md', import.meta.url), 'utf8');
  const filas = [...doc.matchAll(/^\| (\d+) \| ([^|]+?) +\|[^|]*\| ([^|]+?) +\|/gm)]
    .map((m) => ({ n: Number(m[1]), familia: m[2]!.trim(), catalogo: m[3]!.trim() }));
  strictEqual(filas.length, 8, 'la tabla del documento tiene ocho filas');

  const sinExpresar = filas.filter((f) => f.catalogo.startsWith('**no**')).map((f) => f.familia);
  deepStrictEqual(sinExpresar, ['Redoblante', 'Toms', 'Aéreos y platos'],
    'si el catálogo gana o pierde familias, esta lista tiene que cambiar con él');

  // Y las que el documento dice que sí se expresan, se expresan: cada nombre de
  // fuente que la columna menciona tiene que existir en la tabla de puestos.
  for (const f of filas) {
    for (const fuente of [...f.catalogo.matchAll(/`([A-Z]+)`/g)].map((m) => m[1]!)) {
      ok(fuente in PUESTO_POR_FUENTE, `${f.familia}: el documento nombra ${fuente} y la tabla no lo tiene`);
    }
  }
});

test('una batería acústica completa sale mal ordenada, y está declarado', () => {
  // No es un test que celebre un defecto: es el que impide que el defecto se
  // arregle a medias sin que nadie se entere. El día que el catálogo tenga
  // redoblante, toms y aéreos, esto falla y obliga a actualizar el documento.
  const kit = ['Bombo', 'Redoblante', 'Tom', 'Aéreo', 'Bajo', 'Voz'];
  const clasificado: Record<string, Instrumento | null> = {
    Bombo: como('BOMBO'), Redoblante: null, Tom: null, 'Aéreo': null,
    Bajo: como('BAJO'), Voz: como('VOZ'),
  };
  const r = ordenPropuesto(kit.map((e, i) => canal(i + 1, e)), (a) => clasificado[a.instrumento] ?? null);
  deepStrictEqual(r.map((p) => p.etiqueta),
    ['Bombo', 'Bajo', 'Voz', 'Redoblante', 'Tom', 'Aéreo'],
    'medio kit detrás de las voces: es lo que hay hoy y el documento lo dice');
});

test('el orden relativo de TODAS las familias del catálogo está fijado', () => {
  // **Ocho de las trece constantes no estaban fijadas por ningún test**, y eran
  // justo las de percusión afrolatina, línea y palabra: el repertorio que el
  // propio catálogo declara como el del usuario. Se podía poner el djembe
  // después de la voz y la suite quedaba verde. Lo midió una auditoría con un
  // barrido de treinta mutaciones.
  const todas: Instrumento['fuente'][] = [
    'BOMBO', 'CAJON', 'DJEMBE', 'CONGA', 'MARACA', 'SHAKER',
    'BAJO', 'GUITARRA', 'TECLADO', 'FLAUTA', 'LINEA', 'VOZ', 'PALABRA',
  ];
  strictEqual(todas.length, Object.keys(PUESTO_POR_FUENTE).length,
    'si el catálogo gana una familia, este test tiene que nombrarla');

  // Se cargan al revés a propósito: si el orden saliera del orden de entrada en
  // vez de la tabla, esto lo vería.
  const alReves = [...todas].reverse();
  const r = ordenPropuesto(
    alReves.map((f, i) => canal(i + 1, String(f))),
    (a) => como(a.instrumento as Instrumento['fuente']),
  );
  deepStrictEqual(r.map((p) => p.etiqueta), [
    'BOMBO', 'CAJON', 'DJEMBE', 'CONGA',
    // Maraca y shaker comparten puesto: desempata el canal, y cargadas al revés
    // el shaker quedó en un canal más bajo.
    'SHAKER', 'MARACA',
    'BAJO', 'GUITARRA',
    // Teclado y flauta también comparten puesto.
    'FLAUTA', 'TECLADO',
    'LINEA',
    'PALABRA', 'VOZ',
  ]);
});

test('la percusión afrolatina va del más grave al más agudo', () => {
  // Es la decisión que el documento declara como NO respaldada en las fuentes:
  // ninguna de las tres dice dónde va un djembe. Fijarla acá es lo que impide
  // que se mueva sin que nadie lo note.
  const graves = PUESTO_POR_FUENTE.BOMBO;
  ok(graves < PUESTO_POR_FUENTE.CAJON);
  ok(PUESTO_POR_FUENTE.CAJON < PUESTO_POR_FUENTE.DJEMBE);
  ok(PUESTO_POR_FUENTE.DJEMBE < PUESTO_POR_FUENTE.CONGA);
  ok(PUESTO_POR_FUENTE.CONGA < PUESTO_POR_FUENTE.MARACA);
  strictEqual(PUESTO_POR_FUENTE.MARACA, PUESTO_POR_FUENTE.SHAKER, 'maraca y shaker son lo mismo para esto');
  // Y toda la percusión va antes del bajo, que es el otro cimiento.
  ok(PUESTO_POR_FUENTE.SHAKER < PUESTO_POR_FUENTE.BAJO);
});

test('el documento existe y nombra sus tres fuentes', () => {
  // Si el documento desaparece, la propuesta de orden vuelve a ser la intuición
  // de quien programa, que es justo lo que se decidió no hacer.
  const doc = readFileSync(new URL('../../../docs/orden-del-soundcheck.md', import.meta.url), 'utf8');
  for (const dominio of ['theproaudiofiles.com', 'sweetwater.com', 'gearank.com']) {
    ok(doc.includes(dominio), `falta la fuente ${dominio}`);
  }
});

// --- Las etapas -------------------------------------------------------------

test('las seis etapas siguen el orden que publica la fuente', () => {
  // **Ecualizador antes que compresor**, que es lo que dice la fuente. La
  // primera versión los tenía al revés y lo justificaba con un razonamiento
  // propio; una auditoría comparó contra el original.
  deepStrictEqual([...ETAPAS_EN_ORDEN], [
    'GANANCIA', 'PUERTA', 'ECUALIZADOR', 'COMPRESOR', 'ENVIO_A_EFECTOS', 'ENVIO_A_MONITORES',
  ]);
  strictEqual(ETAPAS_EN_ORDEN[0], 'GANANCIA');
  // Los envíos al final porque lo dice la fuente. NO porque se sepa dónde
  // derivan: eso depende de si el envío se toma antes o después del
  // procesamiento, y no está medido.
  strictEqual(ETAPAS_EN_ORDEN[ETAPAS_EN_ORDEN.length - 1], 'ENVIO_A_MONITORES');
});

test('el documento no le atribuye a ninguna fuente un motivo que no da', () => {
  // **Es el hallazgo más caro de esta tanda.** El documento existe para que el
  // orden no salga de la intuición de quien programa, y su primera versión
  // inventó el acuerdo entre las tres fuentes: una no da ningún motivo, otra es
  // sólo de batería y contradice el orden de toms y aéreos, y la tercera tiene
  // otra secuencia. Este test impide que la frase vuelva.
  const doc = readFileSync(new URL('../../../docs/orden-del-soundcheck.md', import.meta.url), 'utf8');
  ok(!/las tres fuentes.{0,40}(mismo|coinciden)/i.test(doc),
    'el documento no puede volver a decir que las tres fuentes coinciden o dan el mismo motivo');
  ok(doc.includes('no da ningún motivo'), 'tiene que decir que la fuente principal no da motivo');
  ok(doc.includes('contradice'), 'tiene que decir que una fuente contradice a la otra');
  ok(doc.includes('lo decidí yo') || doc.includes('los decidí yo'),
    'tiene que separar lo decidido de lo respaldado');
});

test('cada etapa declara si su ley está medida, y hoy sólo lo está la ganancia', () => {
  // El día que una ley se mida, alcanza con cambiar esta tabla. Si el dato
  // estuviera repartido por las pantallas, alguna seguiría diciendo «sin medir»
  // después de la medición, o peor, al revés.
  for (const e of ETAPAS_EN_ORDEN) {
    ok(e in LEY_MEDIDA, `la etapa ${e} tiene que declarar si su ley está medida`);
  }
  strictEqual(LEY_MEDIDA.GANANCIA, true, 'la ganancia está medida: docs/protocol-spec.md');
  const sinMedir = ETAPAS_EN_ORDEN.filter((e: EtapaDeInstrumento) => !LEY_MEDIDA[e]);
  strictEqual(sinMedir.length, 5, `al 2026-09-11 faltan cinco y quedan ${sinMedir.join(', ')}`);
});

// --- El recorrido completo, y lo que un auditor pidió comprobar ------------

import { moverPaso, normalizarBanda, podarIdsMuertos, recorridoDeLaBanda } from '../src/index.ts';

const CATALOGO: Record<string, Instrumento | null> = {
  Bombo: como('BOMBO'), Bajo: como('BAJO'), Guitarra: como('GUITARRA'),
  Voz: como('VOZ'), Maraca: como('MARACA'), Shaker: como('SHAKER'),
  Talkback: null,
};
const clasificar = (a: ChannelAssignment): Instrumento | null => CATALOGO[a.instrumento] ?? null;

test('el recorrido sale del dominio, no de una copia en la pantalla', () => {
  // **El caso que un auditor construyó antes de que esto existiera.** Una
  // reimplementación con `sort` --que es estable-- empataría por el orden de
  // entrada; `ordenPropuesto` empata por número de CANAL. Maraca y shaker
  // comparten el puesto 30, así que con la maraca primera en la lista y en un
  // canal más alto, las dos versiones difieren.
  //
  // El defecto se escondería solo, porque la lista de asignaciones ya suele
  // venir ordenada por canal: hay que forzarlo a mano.
  const r = recorridoDeLaBanda([canal(9, 'Maraca'), canal(2, 'Shaker')], clasificar, null, []);
  deepStrictEqual(r.pasos.map((p) => p.etiqueta), ['Shaker', 'Maraca'],
    'empata el canal, no el orden de entrada');
});

test('un canal sacado del recorrido no desaparece: queda para traerlo de vuelta', () => {
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo'), canal(3, 'Talkback')];
  const r = recorridoDeLaBanda(asignaciones, clasificar, null, ['ch_3'] as ChannelAssignmentId[]);
  deepStrictEqual(r.pasos.map((p) => p.etiqueta), ['Bombo', 'Voz']);
  deepStrictEqual(r.fuera.map((p) => p.etiqueta), ['Talkback'], 'sacado, no perdido');
  // Control positivo: sin sacar nada, el talkback se recorre.
  strictEqual(recorridoDeLaBanda(asignaciones, clasificar, null, []).pasos.length, 3);
});

test('lo sacado conserva su puesto propuesto, por si vuelve', () => {
  // Si al traerlo de vuelta apareciera al final por haber estado afuera, sacar
  // y volver a traer perdería el orden en silencio.
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo'), canal(3, 'Bajo')];
  const fuera = ['ch_2', 'ch_3'] as ChannelAssignmentId[];
  const r = recorridoDeLaBanda(asignaciones, clasificar, null, fuera);
  deepStrictEqual(r.fuera.map((p) => p.etiqueta), ['Bombo', 'Bajo'], 'en el orden propuesto');
});

test('sin orden guardado manda la propuesta, y se dice cuál de las dos es', () => {
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Bombo')];
  strictEqual(recorridoDeLaBanda(asignaciones, clasificar, null, []).ordenPropio, false);
  const propio = recorridoDeLaBanda(
    asignaciones, clasificar, ['ch_1', 'ch_2'] as ChannelAssignmentId[], []);
  strictEqual(propio.ordenPropio, true);
  deepStrictEqual(propio.pasos.map((p) => p.etiqueta), ['Voz', 'Bombo']);
});

test('restaurar olvida el orden y la propuesta vuelve a acompañar', () => {
  // Es la diferencia entre olvidar y congelar, que el usuario decidió: con
  // `null`, una clasificación corregida después mueve el orden. Si restaurar
  // hubiera copiado la propuesta de hoy, quedaría congelada para siempre.
  const asignaciones = [canal(1, 'Voz'), canal(2, 'Talkback')];
  const conOrdenPropio = ['ch_1', 'ch_2'] as ChannelAssignmentId[];
  deepStrictEqual(
    recorridoDeLaBanda(asignaciones, clasificar, conOrdenPropio, []).pasos.map((p) => p.etiqueta),
    ['Voz', 'Talkback']);
  // El catálogo aprende a clasificar el canal 2 como bombo. Con orden propio,
  // el orden NO se mueve; después de restaurar, sí.
  const aprendido = (a: ChannelAssignment): Instrumento | null =>
    (a.instrumento === 'Talkback' ? como('BOMBO') : clasificar(a));
  deepStrictEqual(
    recorridoDeLaBanda(asignaciones, aprendido, conOrdenPropio, []).pasos.map((p) => p.etiqueta),
    ['Voz', 'Talkback'], 'con orden propio, el orden guardado gana');
  deepStrictEqual(
    recorridoDeLaBanda(asignaciones, aprendido, null, []).pasos.map((p) => p.etiqueta),
    ['Talkback', 'Voz'], 'restaurado, la propuesta vuelve a mandar');
});

// --- Mover una fila ---------------------------------------------------------

const PASOS = (...etiquetas: string[]) =>
  etiquetas.map((e, i) => ({
    asignacionId: `ch_${i + 1}` as ChannelAssignmentId, canal: i + 1,
    etiqueta: e, puestoPropuesto: 0,
  }));

test('mover una fila devuelve el orden nuevo, con identificadores', () => {
  const r = moverPaso(PASOS('a', 'b', 'c', 'd'), 0, 2);
  deepStrictEqual(r, ['ch_2', 'ch_3', 'ch_1', 'ch_4']);
  // Y hacia arriba.
  deepStrictEqual(moverPaso(PASOS('a', 'b', 'c'), 2, 0), ['ch_3', 'ch_1', 'ch_2']);
});

test('un arrastre que vuelve al mismo lugar NO es un cambio', () => {
  // Levantar una fila, pasearla y soltarla donde estaba tiene que producir cero
  // escrituras: es el mismo criterio que el resto de la aplicación aplica a los
  // formularios --escribir una letra y borrarla no es un cambio--. Lo pidió un
  // auditor de expectativas como caso reservado, antes de que existiera esto.
  strictEqual(moverPaso(PASOS('a', 'b', 'c'), 1, 1), null);
});

test('soltar más allá del final es soltar al final, no un error', () => {
  deepStrictEqual(moverPaso(PASOS('a', 'b', 'c'), 0, 99), ['ch_2', 'ch_3', 'ch_1']);
  deepStrictEqual(moverPaso(PASOS('a', 'b', 'c'), 2, -5), ['ch_3', 'ch_1', 'ch_2']);
  // Pero si el recorte lo devuelve a su propio lugar, tampoco es un cambio.
  strictEqual(moverPaso(PASOS('a', 'b', 'c'), 2, 99), null);
  strictEqual(moverPaso(PASOS('a', 'b', 'c'), 0, -5), null);
});

test('mover una fila que no existe no inventa un orden', () => {
  strictEqual(moverPaso(PASOS('a', 'b'), 5, 0), null);
  strictEqual(moverPaso([], 0, 0), null);
});

test('una banda sin los campos nuevos se lee sin romperse', () => {
  // Los documentos guardados antes de este cambio no tienen las claves. Se
  // completan al leer, sin migración: el documento entero vive en una columna
  // JSON y `normalizarBanda` ya es el punto por donde pasa toda lectura.
  const vieja = { id: 'b1', nombre: 'Vieja', integrantes: [], asignaciones: [], mixSignature: null };
  const leida = normalizarBanda(vieja as never);
  strictEqual(leida.ordenDelRecorrido, null, 'null es «nunca reordenó»');
  deepStrictEqual(leida.fueraDelRecorrido, []);
  // Y una que ya los tiene no se toca.
  const nueva = { ...vieja, ordenDelRecorrido: ['x'], fueraDelRecorrido: ['y'] };
  strictEqual(normalizarBanda(nueva as never), nueva as never, 'devuelve el mismo objeto');
});

test('un instrumento con fuente en NULO va al final, no al principio', () => {
  // **Es la rama que la pantalla realmente produce**, y era la única sin test.
  // `instrumentoDeAsignacion()` nunca devuelve `null`: para un texto que el
  // catálogo no reconoce devuelve `{ fuente: null, … }`. Un barrido de
  // mutaciones mostró que borrar esa mitad de la guarda dejaba toda la suite en
  // verde, y con eso el canal sin clasificar salía PRIMERO.
  const sinClasificar: Instrumento = {
    fuente: null, variante: null, rol: null, textoOriginal: 'zzz talkback qwerty',
  };
  const r = ordenPropuesto(
    [canal(1, 'raro'), canal(2, 'Voz')],
    (a) => (a.instrumento === 'raro' ? sinClasificar : como('VOZ')),
  );
  deepStrictEqual(r.map((p) => p.etiqueta), ['Voz', 'raro'], 'lo no clasificado va al final');
  strictEqual(r[1]?.puestoPropuesto, PUESTO_DESCONOCIDO);
  // Y la otra mitad de la guarda, la del instrumento ausente, sigue cubierta.
  strictEqual(ordenPropuesto([canal(1, 'x')], () => null)[0]?.puestoPropuesto, PUESTO_DESCONOCIDO);
});

test('los identificadores muertos se podan, para que una decisión no se revierta sola', () => {
  // **Quitar y volver a asignar un canal acuña un identificador nuevo.** Sin
  // podar, un canal que el usuario sacó del recorrido, desasignó y reasignó
  // vuelve adentro: su decisión se revierte sin aviso. Y los arreglos crecen sin
  // techo dentro del documento de la banda. Lo encontró una auditoría.
  const vivas = [canal(1, 'Voz'), canal(2, 'Bombo')];
  const conMuertos = ['ch_1', 'ch_99', 'ch_2'] as ChannelAssignmentId[];
  deepStrictEqual(podarIdsMuertos(conMuertos, vivas), ['ch_1', 'ch_2'], 'se va el que no existe');
  // El orden de los que quedan no se toca.
  deepStrictEqual(podarIdsMuertos(['ch_2', 'ch_1'] as ChannelAssignmentId[], vivas), ['ch_2', 'ch_1']);
  // Control positivo: sin muertos, no se pierde nadie.
  deepStrictEqual(podarIdsMuertos(['ch_1', 'ch_2'] as ChannelAssignmentId[], vivas), ['ch_1', 'ch_2']);
  deepStrictEqual(podarIdsMuertos([], vivas), []);
});
