import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import {
  destinoDelArrastre, desplazamientoVisual, ordenEnVuelo, UMBRAL_DE_ARRASTRE_PX,
  type ArrastreDeLista,
} from '../src/app/recorrido/arrastre-de-lista.ts';
import { UMBRAL_DE_ARRASTRE_PX as UMBRAL_DEL_PLANO } from '../src/app/escenario/plano.ts';

/**
 * La aritmética del arrastre, probada sin navegador.
 *
 * Vive separada del componente justamente para esto: un auditor de expectativas
 * señaló, antes de que existiera, que un test con el ratón **no distingue** una
 * implementación que funciona con el dedo de una que no. Lo que sí se puede
 * probar acá es la cuenta; que el gesto llegue es cosa de la tablet.
 */

const ALTO = 56;
const arrastre = (desde: number, cuantas = 5): ArrastreDeLista =>
  ({ desde, pointerId: 1, agarreY: 500, altoDeFila: ALTO, cuantas });

test('mientras el dedo no supera el umbral, el gesto todavía puede ser un toque', () => {
  const a = arrastre(2);
  strictEqual(destinoDelArrastre(a, 500), null, 'sin moverse');
  strictEqual(destinoDelArrastre(a, 500 + UMBRAL_DE_ARRASTRE_PX - 1), null, 'apenas por debajo');
  // Control positivo: pasado el umbral, sí contesta.
  ok(destinoDelArrastre(a, 500 + UMBRAL_DE_ARRASTRE_PX + 1) !== null);
});

test('el destino sale del DESPLAZAMIENTO, no de la posición del dedo', () => {
  // Es el defecto que el plano del escenario tuvo y que una auditoría midió en
  // 34 cm: agarrar la fila por abajo la movía de entrada, sin que el dedo se
  // hubiera movido. Acá se agarra lejos del borde y el destino sigue siendo el
  // propio puesto hasta que el dedo se mueve de verdad.
  const a = { ...arrastre(2), agarreY: 9999 };
  strictEqual(destinoDelArrastre(a, 9999), null, 'el agarre descentrado no mueve nada');
  strictEqual(destinoDelArrastre(a, 9999 + ALTO), 3, 'un alto de fila hacia abajo: un puesto');
});

test('el salto ocurre al pasar la mitad de la fila siguiente', () => {
  // Con truncado habría que arrastrar una fila entera para que se moviera, y el
  // gesto se sentiría trabado.
  const a = arrastre(2);
  strictEqual(destinoDelArrastre(a, 500 + ALTO * 0.4), 2, 'menos de media fila: se queda');
  strictEqual(destinoDelArrastre(a, 500 + ALTO * 0.6), 3, 'pasada la mitad: salta');
});

test('el destino se recorta a la lista: no hay puesto −1 ni puesto 99', () => {
  const a = arrastre(2);
  strictEqual(destinoDelArrastre(a, 500 - ALTO * 50), 0);
  strictEqual(destinoDelArrastre(a, 500 + ALTO * 50), 4);
  // Con un alto de fila sin medir todavía, no se inventa un destino.
  strictEqual(destinoDelArrastre({ ...a, altoDeFila: 0 }, 500 + 100), null);
});

test('la fila levantada sigue al dedo pero no se va de la lista', () => {
  const a = arrastre(2);
  strictEqual(desplazamientoVisual(a, 500 + ALTO), ALTO);
  // Hacia arriba sólo puede subir dos filas; hacia abajo, dos.
  strictEqual(desplazamientoVisual(a, 500 - ALTO * 50), -2 * ALTO);
  strictEqual(desplazamientoVisual(a, 500 + ALTO * 50), 2 * ALTO);
});

test('las demás filas se corren en vuelo para mostrar dónde va a caer', () => {
  deepStrictEqual(ordenEnVuelo(4, 0, 2), [1, 2, 0, 3]);
  deepStrictEqual(ordenEnVuelo(4, 3, 1), [0, 3, 1, 2]);
  deepStrictEqual(ordenEnVuelo(4, 1, 1), [0, 1, 2, 3], 'sin movimiento, sin cambio');
  // Fuera de rango no inventa nada.
  deepStrictEqual(ordenEnVuelo(3, 7, 0), [0, 1, 2]);
  deepStrictEqual(ordenEnVuelo(3, 0, 99), [1, 2, 0], 'pasarse por arriba es ir al final');
  // **Y por abajo importa de verdad**, aunque por arriba no: `splice` con un
  // índice negativo cuenta desde el FINAL, así que sin recortar, un destino de
  // −1 metería la fila anteúltima en vez de primera. Un barrido de mutaciones
  // encontró que el recorte parecía inerte porque este caso faltaba.
  deepStrictEqual(ordenEnVuelo(3, 0, -1), [0, 1, 2], 'pasarse por abajo es ir al principio');
  deepStrictEqual(ordenEnVuelo(4, 3, -2), [3, 0, 1, 2]);
});

test('el umbral es el MISMO que el del plano, no uno parecido', () => {
  // Estaban declarados dos veces, cada uno con su ocho, y un docblock afirmaba
  // que eran el mismo. Era cierto y nada lo ataba. Ahora se reexporta.
  strictEqual(UMBRAL_DE_ARRASTRE_PX, UMBRAL_DEL_PLANO);
  strictEqual(UMBRAL_DE_ARRASTRE_PX, 8, 'y vale ocho, contra el número y no contra sí mismo');
  ok(UMBRAL_DE_ARRASTRE_PX < ALTO / 2, 'más chico que media fila: no se pierde ningún arrastre');
});

test('el borde exacto del umbral cuenta como arrastre', () => {
  // `<` y no `<=`: a exactamente ocho píxeles el gesto ya es un arrastre. Un
  // barrido de mutaciones encontró que los tests saltaban el borde --usaban
  // umbral menos uno y umbral más uno-- así que las dos versiones pasaban.
  const a = arrastre(2);
  ok(destinoDelArrastre(a, 500 + UMBRAL_DE_ARRASTRE_PX) !== null, 'justo en el umbral, sí');
  ok(destinoDelArrastre(a, 500 - UMBRAL_DE_ARRASTRE_PX) !== null, 'y hacia arriba también');
});

test('el recorte trata lo no finito como el mínimo, y eso sólo vale para dibujar', () => {
  // **Este test fijaba el defecto, no el arreglo.** La primera versión afirmaba
  // que `destinoDelArrastre` con un agarre en NaN devolvía 0, o sea el puesto
  // más alto de la lista: yo había atado con un test que una coordenada rota se
  // convirtiera en un reordenamiento real. Un auditor señaló que el destino
  // correcto ahí es «ningún destino», y el caso vive ahora en el test de abajo.
  //
  // Para el desplazamiento visual el mínimo sí corresponde: es sólo dibujo, no
  // cambia ningún dato, y una fila pegada al tope es preferible a una fila en
  // una posición indefinida.
  const a = arrastre(2);
  strictEqual(desplazamientoVisual({ ...a, agarreY: NaN }, 500), -2 * ALTO);
});

test('una coordenada rota es un no-gesto, no un salto al tope de la lista', () => {
  // La guarda de recorte devuelve el mínimo ante un valor no finito, y acá eso
  // significaba **mover la fila al puesto 0**: un NaN se convertía en un
  // reordenamiento real en vez de en nada. Lo señaló un auditor.
  const a = arrastre(3);
  strictEqual(destinoDelArrastre({ ...a, agarreY: NaN }, 500), null);
  strictEqual(destinoDelArrastre(a, NaN), null);
  strictEqual(destinoDelArrastre(a, Infinity), null);
  // Control positivo: una coordenada buena sigue dando destino.
  ok(destinoDelArrastre(a, 500 + ALTO) !== null);
});
