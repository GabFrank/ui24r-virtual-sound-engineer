import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  aplicarOrdenGuardado, ordenPropuesto, ui24rInput,
  ETAPAS_EN_ORDEN, LEY_MEDIDA, PUESTO_DESCONOCIDO,
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

test('el orden del código es el que publica el documento, familia por familia', () => {
  // **Son dos archivos que pueden separarse en silencio.** El documento cita
  // tres fuentes de oficio y el código tiene la tabla; si alguien cambia uno,
  // el otro queda mintiendo y ningún test de un solo archivo lo vería.
  const doc = readFileSync(new URL('../../../docs/orden-del-soundcheck.md', import.meta.url), 'utf8');
  const enElDoc = [...doc.matchAll(/^\| \d+ \| ([^|]+?) +\|/gm)].map((m) => m[1]!.trim());
  deepStrictEqual(enElDoc, [
    'Bombo', 'Redoblante', 'Toms', 'Aéreos y platos', 'Bajo', 'Guitarras',
    'Teclados, vientos, cuerdas', 'Voces',
  ], 'la tabla del documento cambió: revisá que el código la siga');

  // Y el código pone las familias que sí tiene en ese mismo orden relativo.
  const aFuente: Instrumento['fuente'][] = ['BOMBO', 'BAJO', 'GUITARRA', 'TECLADO', 'VOZ'];
  const r = ordenPropuesto(
    aFuente.map((f, i) => canal(i + 1, String(f))),
    (a) => como(a.instrumento as Instrumento['fuente']),
  );
  deepStrictEqual(r.map((p) => p.etiqueta), ['BOMBO', 'BAJO', 'GUITARRA', 'TECLADO', 'VOZ']);
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

test('las seis etapas están en el orden en que se tocan', () => {
  deepStrictEqual([...ETAPAS_EN_ORDEN], [
    'GANANCIA', 'PUERTA', 'COMPRESOR', 'ECUALIZADOR', 'ENVIO_A_EFECTOS', 'ENVIO_A_MONITORES',
  ]);
  // La ganancia primero: todo lo demás se mide sobre lo que ella deja entrar.
  strictEqual(ETAPAS_EN_ORDEN[0], 'GANANCIA');
  // Los envíos al final: mandan a otro lado lo que las anteriores dejaron.
  strictEqual(ETAPAS_EN_ORDEN[ETAPAS_EN_ORDEN.length - 1], 'ENVIO_A_MONITORES');
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
