import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import { ordenDeExposicion, type ParejaExpuesta } from '@vse/assistants';
import { emplazar, type ElementoCaptacion, type Emisor, type EscenarioElementoId,
  type PAComponentId } from '@vse/domain';
import {
  encabezadoDelInforme, frasePorLoQueFalta, lineasDeExposicion,
} from '../src/app/escenario/lo-que-dice-la-geometria.ts';

/**
 * Lo que la pantalla dice, y sobre todo lo que no dice.
 *
 * La tentación de esta pantalla es escribir «este monitor está acoplando con
 * este micrófono». La geometría no sabe eso: sabe qué pareja está más expuesta
 * según lo que el usuario cargó. Estos tests fijan esa diferencia.
 */

function pareja(
  nombre: string, rango: { min: number; max: number },
  opciones: { distancia?: { min: number; max: number }; angulo?: { min: number; max: number } | null;
    envio?: boolean | null; reservas?: string[] } = {},
): ParejaExpuesta {
  const componente = {
    id: nombre as PAComponentId, nombre, bus: { tipo: 'AUX', indice: 1 } as const,
    silenciable: true, clase: 'MONITOR_CUNA' as const, modelo: null,
  };
  const emisor: Emisor = {
    nombre, bus: componente.bus, componente,
    emplazamiento: emplazar({ x: 0, y: 0, z: 0 }, 'FIJO'),
  };
  const captacion: ElementoCaptacion = {
    tipo: 'CAPTACION', id: `m-${nombre}` as EscenarioElementoId, nombre: `Voz de ${nombre}`,
    emplazamiento: emplazar({ x: 1, y: 1, z: 1 }, 'FIJO'),
    captacion: 'MICROFONO', patron: 'CARDIOIDE', asignacionId: null, fuenteId: null,
  };
  return {
    emisor, captacion,
    distanciaM: opciones.distancia ?? { min: 1.2, max: 1.2 },
    anguloEnElMicrofono: opciones.angulo === undefined ? { min: 30, max: 30 } : opciones.angulo,
    nuloDelPatronGrados: 180, exposicion: { rango },
    llegaPorElEnvio: opciones.envio === undefined ? true : opciones.envio,
    reservas: opciones.reservas ?? [],
  };
}

test('sin rango, la distancia va como número; con rango, como rango', () => {
  // **Este test fijaba lo contrario y lo vetó el usuario el 2026-09-12:** «al
  // crear el instrumento/microfono, se indica si es fijo o tiene rango de
  // movimiento, punto final». Decía «la distancia se muestra siempre como
  // rango, aunque colapse», y exigía «unos 1,20 m» para dos extremos idénticos.
  //
  // Si el usuario declaró que algo es fijo, el número **es** una medición, y
  // ponerle «unos» adelante es el sistema desconfiando de un dato que el propio
  // usuario cargó.
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { distancia: { min: 1.2, max: 1.2 } }),
  ]));
  ok(lineas[0]?.detalle.includes('1,20 m'), lineas[0]?.detalle);
  ok(!lineas[0]?.detalle.includes('unos'), `sin «unos»: ${lineas[0]?.detalle}`);
  const conDuda = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { distancia: { min: 0.8, max: 1.6 } }),
  ]));
  ok(conDuda.lineas[0]?.detalle.includes('entre 0,80 y 1,60 m'), conDuda.lineas[0]?.detalle);
});

test('un ángulo sin determinar se dice, no se muestra como 0 a 180 grados', () => {
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { angulo: { min: 0, max: 180 } }),
  ]));
  ok(lineas[0]?.detalle.includes('sin determinar'), lineas[0]?.detalle);
  // Control positivo: un ángulo acotado sí se muestra con sus números.
  const acotado = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { angulo: { min: 20, max: 40 } }),
  ]));
  ok(acotado.lineas[0]?.detalle.includes('20° y 40°'), acotado.lineas[0]?.detalle);
});

test('no saber si llega por el envío se muestra; saber que llega, no ensucia la línea', () => {
  const sinSaber = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { envio: null }),
  ]));
  ok(sinSaber.lineas[0]?.detalle.includes('no se sabe si le llega'), sinSaber.lineas[0]?.detalle);
  const sabiendo = lineasDeExposicion(ordenDeExposicion([pareja('cuna', { min: 10, max: 20 })]));
  ok(!sabiendo.lineas[0]!.detalle.includes('no se sabe'));
});

test('la lista se corta, y lo que se corta se informa', () => {
  // Una lista truncada en silencio se lee como si fuera completa.
  const muchas = Array.from({ length: 12 }, (_, i) => pareja(`c${i}`, { min: 100 - i * 10, max: 101 - i * 10 }));
  const { lineas, sinMostrar } = lineasDeExposicion(ordenDeExposicion(muchas), 5);
  strictEqual(lineas.length, 5);
  strictEqual(sinMostrar, 7);
  // Y cuando entran todas, no dice que falta ninguna.
  strictEqual(lineasDeExposicion(ordenDeExposicion(muchas), 20).sinMostrar, 0);
});

test('cada línea dice de cuántas otras no se la puede separar', () => {
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('a', { min: 10, max: 20 }), pareja('b', { min: 15, max: 25 }), pareja('c', { min: 1, max: 2 }),
  ]));
  deepStrictEqual(lineas.map((l) => l.empatadaCon), [1, 1, 0]);
  // La tercera está separada de las dos: eso es lo que permite afirmar un orden.
  strictEqual(lineas[2]?.empatadaCon, 0);
});

test('el encabezado dice que es un orden y no una medición, y avisa del empate', () => {
  const solo = encabezadoDelInforme(ordenDeExposicion([pareja('a', { min: 10, max: 20 })]));
  ok(solo.includes('No es una medición'), solo);
  ok(solo.includes('analizador'), 'tiene que decir de dónde sale la frecuencia');
  const empate = encabezadoDelInforme(ordenDeExposicion([
    pareja('a', { min: 10, max: 20 }), pareja('b', { min: 15, max: 25 }),
  ]));
  ok(empate.includes('no se puede separar'), empate);
  ok(empate.includes('medirlas las separa') || empate.includes('punto ciego'),
    'tiene que decir qué hacer al respecto');
  strictEqual(encabezadoDelInforme([]).includes('Todavía no hay'), true);
});

test('ninguna línea afirma que haya realimentación', () => {
  // Es la frase que esta pantalla no puede decir: la geometría no sabe si algo
  // está sonando, sabe qué pareja está más expuesta.
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('a', { min: 10, max: 20 }), pareja('c', { min: 1, max: 2 }),
  ]));
  const todo = [...lineas.map((l) => `${l.titulo} ${l.detalle}`),
    encabezadoDelInforme(ordenDeExposicion([pareja('a', { min: 10, max: 20 })]))].join(' ').toLowerCase();
  for (const prohibida of ['está acoplando', 'realimenta', 'hay realimentación', 'db', 'hercios']) {
    ok(!todo.includes(prohibida), `no puede decir «${prohibida}»: ${todo}`);
  }
});

test('no se llama «menos expuestas» a las que el corte dejó dentro del mismo escalón', () => {
  // Una auditoría corrió el caso real: cuatro emisores por tres micrófonos dan
  // un escalón único de doce parejas y un tope de ocho, así que la tarjeta
  // mostraba «la geometría no puede separar estas doce» y «y cuatro más, menos
  // expuestas» al mismo tiempo. Las dos frases no pueden ser ciertas juntas.
  const todasEmpatadas = Array.from({ length: 12 }, (_, i) => pareja(`c${i}`, { min: 1, max: 100 }));
  const r = lineasDeExposicion(ordenDeExposicion(todasEmpatadas), 8);
  strictEqual(r.sinMostrar, 4);
  strictEqual(r.elCorteParteUnEscalon, true);
  const frase = frasePorLoQueFalta(r.sinMostrar, r.elCorteParteUnEscalon)!;
  ok(frase.includes('mismo escalón'), frase);
  ok(!frase.includes('menos expuestas'), frase);

  // Control positivo: con escalones separados, el corte no parte ninguno y sí
  // se puede decir que las que faltan están más abajo.
  const separadas = Array.from({ length: 12 }, (_, i) => pareja(`s${i}`, { min: 100 - i * 10, max: 101 - i * 10 }));
  const s = lineasDeExposicion(ordenDeExposicion(separadas), 8);
  strictEqual(s.elCorteParteUnEscalon, false);
  ok(frasePorLoQueFalta(s.sinMostrar, s.elCorteParteUnEscalon)!.includes('menos expuestas'));
});

test('una sola pareja que falta no dice «1 parejas»', () => {
  strictEqual(frasePorLoQueFalta(1, false), 'Hay una pareja más, menos expuestas.');
  strictEqual(frasePorLoQueFalta(0, false), null);
});

test('un micrófono sin orientación no se declara omnidireccional', () => {
  // Decir «capta desde cualquier dirección» de un cardioide al que le falta la
  // orientación es afirmar justo lo que no se sabe.
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { angulo: null }),
  ]));
  ok(lineas[0]?.detalle.includes('sin orientación cargada'), lineas[0]?.detalle);
  ok(!lineas[0]!.detalle.includes('cualquier dirección'), lineas[0]?.detalle);
});

test('«medir mejor las separa» NO se dice cuando el empate es por el nulo del patrón', () => {
  // Medido por una auditoría: con la cuña cayendo en el nulo del cardioide, el
  // piso del rango es exactamente cero y no baja por más que se mida. Con una
  // duda de ±10 cm y ±1 mm el resultado es el mismo, porque el nulo es físico y
  // no de medición. Mandar al usuario a medir mejor es mandarlo a hacer algo
  // que no arregla lo que está mirando.
  // La del nulo tiene que ser la PRIMERA --el orden es por el techo del
  // rango-- porque el encabezado habla de la más expuesta.
  const porElNulo = encabezadoDelInforme(ordenDeExposicion([
    pareja('a', { min: 0, max: 30 }, { angulo: { min: 160, max: 180 } }),
    pareja('b', { min: 15, max: 25 }),
  ]));
  ok(porElNulo.includes('punto ciego'), porElNulo);
  ok(!porElNulo.includes('medirlas las separa'), porElNulo);
  ok(porElNulo.includes('Moverlo un poco'), 'tiene que decir qué sí lo resuelve');

  // Control positivo: un empate que NO viene del nulo sí admite medir mejor.
  const porLaDuda = encabezadoDelInforme(ordenDeExposicion([
    pareja('a', { min: 10, max: 20 }, { angulo: { min: 20, max: 40 } }),
    pareja('b', { min: 15, max: 25 }, { angulo: { min: 20, max: 40 } }),
  ]));
  ok(porLaDuda.includes('medirlas las separa'), porLaDuda);
  ok(!porLaDuda.includes('punto ciego'), porLaDuda);
});

test('cuando el nulo cae dentro del rango de ángulos, la línea lo dice', () => {
  // Es lo que explica que el piso pueda ser cero, y es el dato que hacía que
  // `nuloDelPatronGrados` fuera un campo escrito y nunca leído.
  const { lineas } = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 0, max: 20 }, { angulo: { min: 160, max: 180 } }),
  ]));
  ok(lineas[0]?.reservas.some((r) => r.includes('punto ciego')), lineas[0]?.reservas.join(' | '));
  ok(lineas[0]?.reservas.some((r) => r.includes('180°')), 'tiene que decir dónde está el nulo');

  // Control positivo: con el ángulo lejos del nulo, no aparece esa reserva.
  const lejos = lineasDeExposicion(ordenDeExposicion([
    pareja('cuna', { min: 10, max: 20 }, { angulo: { min: 10, max: 30 } }),
  ]));
  ok(!lejos.lineas[0]!.reservas.some((r) => r.includes('punto ciego')));
});

test('el corte se declara partido si deja afuera a una empatada con las que se ven', () => {
  const empatadas = Array.from({ length: 12 }, (_, i) => pareja(`c${i}`, { min: 1, max: 100 }));
  const r = lineasDeExposicion(ordenDeExposicion(empatadas), 8);
  strictEqual(r.elCorteParteUnEscalon, true);
  // Y con todas separadas, el corte no parte nada.
  const separadas = Array.from({ length: 12 }, (_, i) => pareja(`s${i}`, { min: 100 - i * 10, max: 101 - i * 10 }));
  strictEqual(lineasDeExposicion(ordenDeExposicion(separadas), 8).elCorteParteUnEscalon, false);
});
