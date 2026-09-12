import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import { emplazar, distanciaM, type PuntoM } from '@vse/domain';
import {
  calcularEscala, aPantalla, aMetros, precisionDelDedoM, radioIncertidumbrePx,
  elDedoEsMasGruesoQueLaDuda, puntaDeLaFlecha, aCentimetros, puntoACentimetros,
  moverArrastre, lineasDeDistancia, UMBRAL_DE_ARRASTRE_PX, BLANCO_MINIMO_PX, YEMA_PX,
  escalaConVista, vistaInicial, zoomUtilMaximo, acercarSobre, encuadreCompleto,
  ZOOM_MINIMO, PASO_DE_ZOOM,
  type Arrastre, type FichaDelPlano,
} from '../src/app/escenario/plano.ts';
import { INCERTIDUMBRE_POR_FIJEZA } from '@vse/domain';
import { metros } from '../src/app/escenario/lo-que-dice-la-geometria.ts';

/**
 * El mapeo entre el local y la pantalla.
 *
 * **Estos tests están escritos para fallar ante un espejo.** El modelo del
 * escenario tuvo exactamente ese defecto y veinte tests lo dejaron pasar,
 * porque todos usaban el mismo eje. Acá cada eje se comprueba por separado y
 * con un punto que no sea simétrico, para que invertir cualquiera de los dos
 * rompa algo.
 *
 * La convención: el escenario arriba, el público abajo. `y` del modelo crece
 * hacia abajo en pantalla y `x` hacia la derecha; ningún eje se voltea.
 */

const DIM = { largo: 12, ancho: 8, alto: 4 };

/** Un punto en metros, corto de escribir. */
const PUNTO = (x: number, y: number, z: number): PuntoM => ({ x, y, z });

/** Una ficha fija del plano, que es el caso por defecto. */
function ficha(id: string, posicion: PuntoM): FichaDelPlano {
  return {
    id, etiqueta: id, origen: 'CAPTACION',
    emplazamiento: emplazar(posicion, 'FIJO'),
  } as FichaDelPlano;
}
const P = (x: number, y: number, z: number): PuntoM => ({ x, y, z });

test('la escala hace entrar el local sin deformarlo', () => {
  // 8 m de ancho y 12 de largo en un lienzo de 400x800 con 24 de margen:
  // útil 352x752, así que 44 px/m por ancho y 62,67 por largo. Manda el menor.
  const e = calcularEscala(DIM, 400, 800, 24);
  strictEqual(e.pxPorMetro, 44);
  strictEqual(e.anchoPx, 8 * 44);
  strictEqual(e.altoPx, 12 * 44);
});

test('la escala manda del otro lado cuando el lienzo es ancho y bajo', () => {
  // Control positivo: si siempre ganara el ancho, este caso daría lo mismo.
  const e = calcularEscala(DIM, 2000, 200, 10);
  strictEqual(e.pxPorMetro, 180 / 12);
});

test('un local que no es cuadrado distingue qué eje es cuál', () => {
  // Con largo y ancho iguales, confundirlos no rompería nada.
  const e = calcularEscala({ largo: 12, ancho: 8, alto: 4 }, 1000, 1000, 0);
  strictEqual(e.pxPorMetro, 1000 / 12, 'el largo es el que no entra');
  strictEqual(e.anchoPx, 8 * (1000 / 12));
});

// --- El espejo, que es lo que estos tests vienen a atrapar ------------------

test('el local se centra en el eje que sobra', () => {
  // 8 de ancho y 12 de largo a 44 px/m ocupan 352x528 en un útil de 352x752:
  // el ancho entra justo y sobran 224 px de alto, 112 de cada lado. Pegarlo al
  // margen de arriba haría que el plano pareciera corrido respecto de la sala.
  const e = calcularEscala(DIM, 400, 800, 24);
  strictEqual(e.origenX, 24, 'en el eje que entra justo, el origen es el margen');
  strictEqual(e.origenY, 24 + (752 - 528) / 2);
});

test('el escenario queda arriba y el público abajo: y crece hacia abajo', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  const enElEscenario = aPantalla(P(0, 0, 0), e);
  const enElPublico = aPantalla(P(0, 12, 0), e);
  deepStrictEqual(enElEscenario, { x: e.origenX, y: e.origenY });
  ok(enElPublico.y > enElEscenario.y, 'el público tiene que quedar más abajo');
  strictEqual(enElPublico.y, e.origenY + 12 * 44);
});

test('x crece hacia la derecha, y los dos ejes se comprueban por separado', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  // Un punto asimétrico: invertir cualquiera de los dos ejes lo mueve.
  const p = aPantalla(P(2, 9, 1.5), e);
  strictEqual(p.x, e.origenX + 2 * 44);
  strictEqual(p.y, e.origenY + 9 * 44);
  // Y si los ejes estuvieran cambiados entre sí, esto sería origenY + 9*44.
  ok(p.x < p.y, 'x=2 m tiene que caer antes en pantalla que y=9 m');
});

test('la vuelta de pantalla a metros deshace exactamente la ida', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  const origen = P(2.5, 9.25, 1.5);
  const vuelta = aMetros(aPantalla(origen, e), e, DIM, origen.z);
  deepStrictEqual(puntoACentimetros(vuelta), origen);
});

test('el dedo que se sale del plano se frena en la pared, no inventa un dato', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  // Arriba y a la izquierda del lienzo: coordenadas negativas.
  deepStrictEqual(aMetros({ x: -500, y: -500 }, e, DIM, 1), { x: 0, y: 0, z: 1 });
  // Y más allá de la pared del fondo.
  deepStrictEqual(aMetros({ x: 99999, y: 99999 }, e, DIM, 1), { x: 8, y: 12, z: 1 });
  // La altura también se recorta, y es el eje que no se puede arrastrar.
  strictEqual(aMetros({ x: 100, y: 100 }, e, DIM, 99).z, 4);
  strictEqual(aMetros({ x: 100, y: 100 }, e, DIM, -1).z, 0);
  // Un NaN no se propaga: un lienzo todavía sin medir daba NaN por metro.
  deepStrictEqual(aMetros({ x: NaN, y: NaN }, e, DIM, NaN), { x: 0, y: 0, z: 0 });
});

// --- La honestidad de la precisión -----------------------------------------

test('el ejemplo que está escrito en el comentario da lo que dice', () => {
  // El docblock de `precisionDelDedoM` afirma 51,4 px/m y 86 cm para una sala
  // de 12 por 8 en un lienzo de 700 px con el margen de 28 que usa el
  // componente. Si alguien cambia el margen o la escala, el comentario queda
  // viejo en silencio; este test lo impide.
  //
  // La primera versión decía 58 px/m y 76 cm, y era una cuenta estimada sin
  // restar los márgenes.
  const e = calcularEscala({ ancho: 12, largo: 8, alto: 4 }, 700, Math.round(700 * (8 / 12)), 28);
  strictEqual(Number(e.pxPorMetro.toFixed(1)), 51.4);
  strictEqual(Number(precisionDelDedoM(e).toFixed(2)), 0.86);
});

test('un dedo vale casi un metro sobre un plano de sala chica', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  // 44 px por metro y una yema de 44 px: un metro justo. La pantalla tiene que
  // poder decir esto en vez de aceptar un arrastre como si fuera al
  // centímetro.
  strictEqual(precisionDelDedoM(e), YEMA_PX / 44);
  strictEqual(precisionDelDedoM(e), 1);
  // En un lienzo más grande el dedo vale menos, que es lo que hace útil zoom.
  ok(precisionDelDedoM(calcularEscala(DIM, 1600, 3200, 24)) < 0.3);
});

test('el dedo se compara contra la duda ya declarada del elemento', () => {
  const e = calcularEscala(DIM, 400, 800, 24); // 1 m por dedo
  // Un micrófono en un pie está a ±5 cm: arrastrarlo con el dedo lo EMPEORA.
  ok(elDedoEsMasGruesoQueLaDuda(emplazar(P(2, 2, 1.5), 'EN_PIE'), e));
  // Control positivo: sobre un plano grande, el mismo micrófono se puede
  // arrastrar sin perder lo que ya se sabía.
  const grande = calcularEscala(DIM, 6000, 12000, 24);
  strictEqual(elDedoEsMasGruesoQueLaDuda(emplazar(P(2, 2, 1.5), 'EN_PIE'), grande), false);
  // Y un micrófono de mano, con medio metro de duda, se arrastra sin culpa
  // incluso en el plano chico: el dedo no es peor que lo que ya había.
  strictEqual(elDedoEsMasGruesoQueLaDuda(emplazar(P(2, 2, 1.5), 'EN_MANO'), e), false);
});

test('el círculo de duda se dibuja aunque quede diminuto', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  strictEqual(radioIncertidumbrePx(emplazar(P(0, 0, 0), 'EN_PIE'), e), 0.05 * 44);
  strictEqual(radioIncertidumbrePx(emplazar(P(0, 0, 0), 'EN_MANO'), e), 0.5 * 44);
  // Una duda negativa --dato roto-- no dibuja un radio negativo.
  const roto = { ...emplazar(P(0, 0, 0), 'FIJO'), incertidumbrePosicionM: -1 };
  strictEqual(radioIncertidumbrePx(roto, e), 0);
});

test('el blanco mínimo es el mismo que declara la ficha de diseño', () => {
  // 48 vive en dos lugares: acá, porque este archivo hace aritmética y no puede
  // leer una ficha CSS, y en `--tap-min` de los tokens. Dos números que dicen
  // lo mismo y pueden separarse son un defecto esperando; esto los compara.
  const tokens = readFileSync(
    new URL('../src/styles/_tokens.scss', import.meta.url), 'utf8');
  const m = /--tap-min:\s*(\d+)px/.exec(tokens);
  ok(m !== null, 'la ficha --tap-min tiene que existir en los tokens');
  strictEqual(Number(m![1]), BLANCO_MINIMO_PX);
});

test('el blanco mínimo del dedo es más grande que el círculo de duda de un pie', () => {
  // La consecuencia de diseño: el blanco táctil no puede ser el círculo de
  // duda, porque un micrófono bien medido sería intocable. Son dos cosas
  // distintas y el componente dibuja las dos.
  const e = calcularEscala(DIM, 400, 800, 24);
  ok(BLANCO_MINIMO_PX > radioIncertidumbrePx(emplazar(P(0, 0, 0), 'EN_PIE'), e) * 2);
});

// --- La flecha -------------------------------------------------------------

test('la flecha apunta abajo a 0°, a la derecha a 90° y arriba a 180°', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  const desde = P(4, 6, 0);
  const base = aPantalla(desde, e);
  const enAzimut = (a: number) =>
    puntaDeLaFlecha(emplazar(desde, 'FIJO', { azimutGrados: a, inclinacionGrados: 0 }), e, 40);

  const alPublico = enAzimut(0)!;
  ok(Math.abs(alPublico.x - base.x) < 1e-9);
  ok(alPublico.y - base.y > 39, 'azimut 0 mira al público, que está abajo');

  const aLaDerecha = enAzimut(90)!;
  ok(aLaDerecha.x - base.x > 39, 'azimut 90 mira a la derecha');
  ok(Math.abs(aLaDerecha.y - base.y) < 1e-9);

  // El caso que atrapa un espejo en x: si el signo se invirtiera, esto
  // apuntaría a la derecha igual que el anterior.
  const aLaIzquierda = enAzimut(-90)!;
  ok(aLaIzquierda.x - base.x < -39, 'azimut -90 mira a la izquierda');

  const alFondo = enAzimut(180)!;
  ok(alFondo.y - base.y < -39, 'azimut 180 mira al fondo del escenario');
});

test('lo que no apunta a ningún lado no dibuja flecha', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  strictEqual(puntaDeLaFlecha(emplazar(P(1, 1, 0), 'FIJO'), e, 40), null);
  // Control positivo: el mismo punto con orientación sí la dibuja.
  ok(puntaDeLaFlecha(emplazar(P(1, 1, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }), e, 40) !== null);
});

test('la inclinación no cambia la flecha: un plano no la puede mostrar', () => {
  const e = calcularEscala(DIM, 400, 800, 24);
  const plana = puntaDeLaFlecha(emplazar(P(4, 6, 0), 'FIJO', { azimutGrados: 45, inclinacionGrados: 0 }), e, 40);
  const alTecho = puntaDeLaFlecha(emplazar(P(4, 6, 0), 'FIJO', { azimutGrados: 45, inclinacionGrados: 80 }), e, 40);
  deepStrictEqual(plana, alTecho);
});

// --- Redondeo ---------------------------------------------------------------

test('las coordenadas se guardan al centímetro y no con dieciséis cifras', () => {
  strictEqual(aCentimetros(2.4718309859154927), 2.47);
  strictEqual(aCentimetros(2.475), 2.48);
  strictEqual(aCentimetros(0), 0);
  strictEqual(aCentimetros(-0.004), -0);
  deepStrictEqual(puntoACentimetros(P(1.23456, 7.891, 0.5)), { x: 1.23, y: 7.89, z: 0.5 });
});

// --- El arrastre: tocar no es mover ----------------------------------------

test('tocar una ficha sin mover el dedo NO la mueve', () => {
  // Es el defecto que una auditoría midió: el editor movía el elemento a la
  // posición absoluta del dedo, así que apoyar el dedo a 20 px del centro del
  // blanco --que mide 48-- y levantarlo corría el micrófono 34 cm, y dejaba la
  // pantalla en «sin guardar». Tocar para leer los números ensuciaba el dato.
  const e = calcularEscala(DIM, 720, 1080, 28);
  const origenM = { x: 2, y: 3, z: 1.5 };
  const centro = aPantalla(origenM, e);
  const agarrePx = { x: centro.x + 20, y: centro.y + 20 };
  const a: Arrastre = { id: 'c:mic', pointerId: 1, agarrePx, origenM };
  strictEqual(moverArrastre(a, agarrePx, e, DIM), null, 'sin desplazamiento, nada');
  // Y un temblor por debajo del umbral tampoco.
  strictEqual(moverArrastre(a, { x: agarrePx.x + 4, y: agarrePx.y + 4 }, e, DIM), null);
});

test('el elemento se mueve lo que se movió el dedo, no adonde cayó el dedo', () => {
  const e = calcularEscala(DIM, 720, 1080, 28);
  const origenM = { x: 2, y: 3, z: 1.5 };
  const centro = aPantalla(origenM, e);
  // Se agarra descentrado a propósito: si la cuenta usara la posición absoluta,
  // el resultado saltaría esos 20 px además del desplazamiento.
  const a: Arrastre = { id: 'c:mic', pointerId: 1, agarrePx: { x: centro.x + 20, y: centro.y + 20 }, origenM };
  const unMetro = e.pxPorMetro;
  const r = moverArrastre(a, { x: centro.x + 20 + unMetro, y: centro.y + 20 }, e, DIM);
  deepStrictEqual(r, { x: 3, y: 3, z: 1.5 }, 'un metro a la derecha, y nada más');
});

test('el arrastre respeta las paredes y no toca la altura', () => {
  const e = calcularEscala(DIM, 720, 1080, 28);
  const origenM = { x: 2, y: 3, z: 1.5 };
  const centro = aPantalla(origenM, e);
  const a: Arrastre = { id: 'c:mic', pointerId: 1, agarrePx: centro, origenM };
  const r = moverArrastre(a, { x: centro.x + 99999, y: centro.y - 99999 }, e, DIM);
  deepStrictEqual(r, { x: DIM.ancho, y: 0, z: 1.5 }, 'se frena en la pared, y la altura no cambia');
});

test('el umbral de arrastre es más chico que el radio del blanco', () => {
  // Si fuera más grande, habría arrastres intencionales que no se registran.
  ok(UMBRAL_DE_ARRASTRE_PX < BLANCO_MINIMO_PX / 2);
  ok(UMBRAL_DE_ARRASTRE_PX > 0);
});

// --- Qué va en el plano ----------------------------------------------------

import {
  loQueVaEnElPlano, loQueLeFaltaAlMicrofono, idDeFicha,
} from '../src/app/escenario/plano.ts';
import type {
  Emplazamiento, Escenario, ElementoCaptacion, ElementoFuente, EscenarioElementoId,
  PAComponentId, PAComponentSpec, VenueProfileId, ChannelAssignmentId,
} from '@vse/domain';

const VENUE = 'venue_1' as VenueProfileId;
const escenarioCon = (
  elementos: readonly (ElementoFuente | ElementoCaptacion)[],
  emisores: readonly { componenteId: PAComponentId; emplazamiento: Emplazamiento }[] = [],
): Escenario =>
  ({ venueProfileId: VENUE, elementos, emisores, actualizado: '2026-09-11T00:00:00.000Z', notas: null });

const VOZ: ElementoFuente = {
  tipo: 'FUENTE', id: 'ana' as EscenarioElementoId, nombre: 'Ana',
  emplazamiento: emplazar(P(2, 2.1, 1.6), 'EN_PIE'), bandMemberId: null,
};
const MIC: ElementoCaptacion = {
  tipo: 'CAPTACION', id: 'ana' as EscenarioElementoId, nombre: 'Voz de Ana',
  emplazamiento: emplazar(P(2, 2, 1.6), 'EN_PIE', { azimutGrados: 180, inclinacionGrados: 0 }),
  captacion: 'MICROFONO', patron: 'CARDIOIDE', asignacionId: 'ch_1' as ChannelAssignmentId,
  fuenteId: 'ana' as EscenarioElementoId,
};
const CUNA: PAComponentSpec = {
  id: 'ana' as PAComponentId,
  nombre: 'ana', bus: { tipo: 'AUX', indice: 1 }, silenciable: true,
  clase: 'MONITOR_CUNA', modelo: null,
};
const LUGAR_CUNA = emplazar(P(2, 1, 0.2), 'FIJO', { azimutGrados: 0, inclinacionGrados: 35 });
const UBICADA = [{ componenteId: CUNA.id, emplazamiento: LUGAR_CUNA }];
const GENERAL: PAComponentSpec = {
  id: 'general' as PAComponentId,
  nombre: 'General', bus: { tipo: 'MASTER' }, silenciable: false, clase: 'PRINCIPAL', modelo: null,
};

test('tres orígenes con el mismo nombre no se pisan en el plano', () => {
  // La fuente, el micrófono y la cuña se llaman «ana» a propósito: sin prefijo
  // por origen, arrastrar uno movería otro, y el defecto sería invisible hasta
  // que alguien pusiera el mismo nombre dos veces.
  const r = loQueVaEnElPlano(escenarioCon([VOZ, MIC], UBICADA), [CUNA, GENERAL]);
  strictEqual(r.fichas.length, 3);
  strictEqual(new Set(r.fichas.map((f) => f.id)).size, 3, 'los tres identificadores tienen que ser distintos');
  deepStrictEqual(r.fichas.map((f) => f.origen).sort(), ['CAPTACION', 'EMISOR', 'FUENTE']);
  strictEqual(idDeFicha('FUENTE', 'ana'), 'f:ana');
  // El emisor se identifica por su posición en la lista, no por el nombre: dos
  // componentes pueden llamarse igual y con el nombre se movían los dos.
  strictEqual(r.fichas.find((f) => f.origen === 'EMISOR')?.id, 'e:ana');
});

test('dos componentes con el mismo nombre se arrastran por separado', () => {
  // El dominio nombra el caso: los dos lados de un general estéreo. Con el
  // nombre como identidad, mover uno los apilaba a los dos en el mismo punto.
  const izq: PAComponentSpec = { ...CUNA, id: 'izq' as PAComponentId, nombre: 'General' };
  const der: PAComponentSpec = { ...CUNA, id: 'der' as PAComponentId, nombre: 'General' };
  const aca = emplazar(P(1, 1, 0), 'FIJO');
  const esc = escenarioCon([], [
    { componenteId: izq.id, emplazamiento: aca }, { componenteId: der.id, emplazamiento: aca },
  ]);
  deepStrictEqual(loQueVaEnElPlano(esc, [izq, der]).fichas.map((f) => f.id), ['e:izq', 'e:der']);
  const movido = aplicarMovida({ escenario: esc, componentes: [izq, der] },
    { id: 'e:der', emplazamiento: emplazar(P(7, 7, 0), 'FIJO') });
  const porId = new Map(movido.escenario.emisores.map((e) => [e.componenteId, e.emplazamiento.posicion]));
  deepStrictEqual(porId.get(izq.id), { x: 1, y: 1, z: 0 }, 'el izquierdo no se movió');
  deepStrictEqual(porId.get(der.id), { x: 7, y: 7, z: 0 });
});

test('el lugar se escribe en el escenario, no en el componente', () => {
  // Es la decisión que tomó el usuario después de que una auditoría mostrara
  // que dos locales compartiendo el mismo sistema se pisaban las posiciones.
  const estado = { escenario: escenarioCon([]), componentes: [CUNA] };
  const r = aplicarMovida(estado, { id: 'e:ana', emplazamiento: LUGAR_CUNA });
  deepStrictEqual(r.componentes, [CUNA], 'el equipo no se toca');
  deepStrictEqual(r.escenario.emisores.map((e) => e.componenteId), ['ana']);
});

test('el que no tiene lugar no se dibuja, pero vuelve para que se lo pueda pedir', () => {
  const r = loQueVaEnElPlano(escenarioCon([], UBICADA), [CUNA, GENERAL]);
  deepStrictEqual(r.fichas.map((f) => f.etiqueta), ['ana']);
  deepStrictEqual(r.sinUbicar.map((c) => c.nombre), ['General']);
  deepStrictEqual(r.noRadian, []);
});

test('los intraurales van aparte de los que falta ubicar', () => {
  const iem: PAComponentSpec = { ...GENERAL, id: 'iem' as PAComponentId, nombre: 'Intraurales', clase: 'IEM' };
  const r = loQueVaEnElPlano(escenarioCon([]), [iem, GENERAL]);
  deepStrictEqual(r.noRadian.map((c) => c.nombre), ['Intraurales']);
  deepStrictEqual(r.sinUbicar.map((c) => c.nombre), ['General'], 'al general sí hay que pedirle lugar');
});

test('el detalle de cada ficha dice qué es y por dónde sale', () => {
  const r = loQueVaEnElPlano(escenarioCon([VOZ, MIC], UBICADA), [CUNA]);
  const porOrigen = new Map(r.fichas.map((f) => [f.origen, f.detalle]));
  strictEqual(porOrigen.get('EMISOR'), 'Monitor de piso — sale por el auxiliar 1');
  strictEqual(porOrigen.get('CAPTACION'), 'Micrófono cardioide');
  strictEqual(porOrigen.get('FUENTE'), 'Fuente — suena por sí misma');
  // Una caja directa dice que no capta aire, que es por qué no participa.
  const di = loQueVaEnElPlano(escenarioCon([{ ...MIC, captacion: 'DIRECTA', patron: null }]), []);
  strictEqual(di.fichas[0]?.detalle, 'Caja directa — no capta aire');
});

test('cada hueco del micrófono tiene su frase, y no todos dicen lo mismo', () => {
  const sinPatron = loQueLeFaltaAlMicrofono('MICROFONO', null, true);
  const desconocido = loQueLeFaltaAlMicrofono('MICROFONO', 'DESCONOCIDO', true);
  const sinEje = loQueLeFaltaAlMicrofono('MICROFONO', 'CARDIOIDE', false);
  ok(sinPatron?.includes('patrón polar'));
  strictEqual(desconocido, sinPatron, 'sin cargar y desconocido son el mismo hueco');
  ok(sinEje?.includes('hacia dónde apunta'));
  ok(sinPatron !== sinEje, 'dos huecos distintos no pueden decir lo mismo');
  // Lo que está completo, y lo que no necesita nada, no dicen nada.
  strictEqual(loQueLeFaltaAlMicrofono('MICROFONO', 'CARDIOIDE', true), null);
  strictEqual(loQueLeFaltaAlMicrofono('MICROFONO', 'OMNI', false), null, 'un omni no necesita eje');
  strictEqual(loQueLeFaltaAlMicrofono('DIRECTA', null, false), null, 'una caja directa no necesita nada');
});

// --- Devolver el movimiento a su origen ------------------------------------

import { aplicarMovida, type EstadoDelPlano } from '../src/app/escenario/plano.ts';

const ESTADO: EstadoDelPlano = {
  escenario: escenarioCon([VOZ, MIC], UBICADA), componentes: [CUNA, GENERAL],
};
const AHI = emplazar(P(5, 5, 1), 'FIJO');

test('cada ficha vuelve a su origen aunque los tres se llamen igual', () => {
  // La fuente, la captación y el componente comparten el nombre «ana». Sin el
  // prefijo, mover uno movería otro y no se notaría hasta que alguien repitiera
  // un nombre.
  const trasFuente = aplicarMovida(ESTADO, { id: 'f:ana', emplazamiento: AHI });
  deepStrictEqual(trasFuente.escenario.elementos[0]?.emplazamiento, AHI);
  deepStrictEqual(trasFuente.escenario.elementos[1]?.emplazamiento, MIC.emplazamiento, 'el micrófono no se movió');
  deepStrictEqual(trasFuente.escenario.emisores, UBICADA, 'la cuña tampoco');

  const trasCaptacion = aplicarMovida(ESTADO, { id: 'c:ana', emplazamiento: AHI });
  deepStrictEqual(trasCaptacion.escenario.elementos[1]?.emplazamiento, AHI);
  deepStrictEqual(trasCaptacion.escenario.elementos[0]?.emplazamiento, VOZ.emplazamiento);

  const trasEmisor = aplicarMovida(ESTADO, { id: 'e:ana', emplazamiento: AHI });
  deepStrictEqual(trasEmisor.escenario.emisores[0]?.emplazamiento, AHI);
  deepStrictEqual(trasEmisor.escenario.elementos[0]?.emplazamiento, VOZ.emplazamiento);
});

test('una ficha que ya no existe no crea una entrada de la nada', () => {
  const borrada = aplicarMovida(ESTADO, { id: 'f:no-existe', emplazamiento: AHI });
  strictEqual(borrada, ESTADO, 'el estado tiene que volver igual, sin copiar');
  // **Las tres ramas, y no una.** El primer intento sólo probaba `f:`, así que
  // quitarle la guarda a la rama de los componentes no rompía ningún test: la
  // mutación pasó 24 de 24. Lo encontró romper el código a propósito.
  strictEqual(aplicarMovida(ESTADO, { id: 'e:no-existe', emplazamiento: AHI }), ESTADO, 'componente inexistente');
  strictEqual(aplicarMovida(ESTADO, { id: 'c:no-existe', emplazamiento: AHI }), ESTADO, 'captación inexistente');
  strictEqual(aplicarMovida(ESTADO, { id: 'ana', emplazamiento: AHI }), ESTADO, 'sin prefijo, no se toca nada');
  strictEqual(aplicarMovida(ESTADO, { id: 'x:ana', emplazamiento: AHI }), ESTADO, 'prefijo desconocido');
  strictEqual(ESTADO.escenario.elementos.length, 2, 'y nada se agregó');
});

test('el identificador que devuelve el plano es el que aplicarMovida entiende', () => {
  // Los dos lados del prefijo viven en archivos distintos y podrían separarse
  // sin que nada fallara: este test los ata.
  const plano = loQueVaEnElPlano(ESTADO.escenario, ESTADO.componentes);
  for (const f of plano.fichas) {
    const despues = aplicarMovida(ESTADO, { id: f.id, emplazamiento: AHI });
    ok(despues !== ESTADO, `la ficha ${f.id} tiene que poder moverse`);
  }
});

// --- Mutaciones que sobrevivían --------------------------------------------
//
// Una auditoría probó variantes del código y encontró dos que ningún test
// notaba. Los casos de abajo existen para que las dos mueran.

test('el umbral del dedo grueso no se puede duplicar sin que falle algo', () => {
  // La mutación era `* 2` -> `* 4` en `elDedoEsMasGruesoQueLaDuda`. Los tres
  // casos que había probados dejaban un hueco enorme entre ellos, así que el
  // umbral se podía correr al doble sin consecuencias.
  //
  // Este caso cae justo en el hueco: con `* 2` el dedo es más grueso, con `* 4`
  // no lo es.
  const e = calcularEscala(DIM, 400, 800, 24); // 1 m por dedo
  const justoAdentro = { ...emplazar(P(2, 2, 1.5), 'FIJO'), incertidumbrePosicionM: 0.40 };
  strictEqual(elDedoEsMasGruesoQueLaDuda(justoAdentro, e), true, '1 m contra 0,80 m: más grueso');
  const justoAfuera = { ...emplazar(P(2, 2, 1.5), 'FIJO'), incertidumbrePosicionM: 0.60 };
  strictEqual(elDedoEsMasGruesoQueLaDuda(justoAfuera, e), false, '1 m contra 1,20 m: no lo es');
  // Y el borde exacto: `>` y no `>=`.
  const enElBorde = { ...emplazar(P(2, 2, 1.5), 'FIJO'), incertidumbrePosicionM: 0.50 };
  strictEqual(elDedoEsMasGruesoQueLaDuda(enElBorde, e), false);
});

test('la altura también se redondea al centímetro', () => {
  // La mutación era dejar `z` sin redondear. Ningún test lo notaba porque todas
  // las alturas de prueba ya eran redondas: 1.5, 0, 1.6.
  deepStrictEqual(puntoACentimetros(P(1, 2, 1.66666666)), { x: 1, y: 2, z: 1.67 });
});

// --- Las distancias en vivo -------------------------------------------------

test('las distancias salen de la ficha elegida hacia las demás, ordenadas', () => {
  const e = calcularEscala(DIM, 700, 500, 28);
  const fichas = [
    ficha('a', PUNTO(1, 1, 0)),
    ficha('lejos', PUNTO(9, 1, 0)),
    ficha('cerca', PUNTO(2, 1, 0)),
  ];
  const ls = lineasDeDistancia('a', fichas, e, metros, distanciaM);
  deepStrictEqual(ls.map((l) => l.id), ['cerca', 'lejos'], 'de más cerca a más lejos');
  // La elegida no se mide contra sí misma.
  strictEqual(ls.length, 2);
  // Todas arrancan en el mismo punto: la ficha elegida.
  deepStrictEqual(ls[0]!.desde, ls[1]!.desde);
  // Y el número va a mitad de camino.
  strictEqual(ls[0]!.medio.x, (ls[0]!.desde.x + ls[0]!.hasta.x) / 2);
});

test('una ficha que no existe no dibuja nada, en vez de romper', () => {
  const e = calcularEscala(DIM, 700, 500, 28);
  deepStrictEqual(lineasDeDistancia('fantasma', [ficha('a', PUNTO(1, 1, 0))], e, metros, distanciaM), []);
});

test('el texto de la distancia usa el MISMO formateador que el informe', () => {
  // **Dos formateadores que dicen lo mismo y pueden separarse son un defecto
  // esperando.** El informe de geometría y el plano tienen que decir «1,20 m»
  // los dos, y el día que uno cambie tiene que cambiar el otro. Por eso el
  // formateador se pasa por argumento y este test lo ata al de verdad.
  const e = calcularEscala(DIM, 700, 500, 28);
  const fichas = [ficha('a', PUNTO(1, 1, 0)), ficha('b', PUNTO(2, 1, 0))];
  const l = lineasDeDistancia('a', fichas, e, metros, distanciaM)[0]!;
  const esperado = metros(
    distanciaM(fichas[0]!.emplazamiento, fichas[1]!.emplazamiento).min,
    distanciaM(fichas[0]!.emplazamiento, fichas[1]!.emplazamiento).max,
  );
  strictEqual(l.texto, esperado);
});

test('dos cosas fijas dan un número, no un rango: es lo que decidió el usuario', () => {
  const e = calcularEscala(DIM, 700, 500, 28);
  const fichas = [ficha('a', PUNTO(1, 1, 0)), ficha('b', PUNTO(2.2, 1, 0))];
  const l = lineasDeDistancia('a', fichas, e, metros, distanciaM)[0]!;
  strictEqual(l.texto, '1,20 m');
  ok(!l.texto.includes('entre'), `sin rango: ${l.texto}`);
});

test('con algo en la mano vuelve el rango, que es donde el rango sirve', () => {
  const e = calcularEscala(DIM, 700, 500, 28);
  const fijo = ficha('a', PUNTO(1, 1, 0));
  const enMano: FichaDelPlano = {
    ...ficha('b', PUNTO(3, 1, 0)),
    emplazamiento: emplazar(PUNTO(3, 1, 0), 'EN_MANO'),
  };
  const l = lineasDeDistancia('a', [fijo, enMano], e, metros, distanciaM)[0]!;
  ok(l.texto.includes('entre'), `con rango: ${l.texto}`);
});

/* ──────────────────────────────────────────────────────────────────────────
 * El zoom (ítem 91)
 *
 * Las seis expectativas quedaron registradas en
 * `docs/pedidos/2026-09-12-el-plano-como-mesa-de-trabajo.md` **antes** de
 * escribir `escalaConVista`. Cada test de acá abajo es una de ellas, en el
 * mismo orden, y la tercera es la que justifica que el ítem exista: si el zoom
 * no llega a afinar el dedo hasta la resolución del modelo, no sirve para lo
 * que se lo pidió.
 * ────────────────────────────────────────────────────────────────────────── */

/** Un lienzo de tablet, el que usa el resto del archivo. */
const LIENZO = { w: 400, h: 800, margen: 24 };

test('1. a zoom 1 la vista no cambia nada del encuadre completo', () => {
  const sinVista = calcularEscala(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  const conVista = escalaConVista(
    DIM, LIENZO.w, LIENZO.h, vistaInicial(DIM), LIENZO.margen);
  // Los cuatro campos idénticos, no "parecidos": las capturas visuales de
  // tools/visual/flujo.mjs fijaron este encuadre y el zoom no lo puede mover.
  deepStrictEqual(conVista, sinVista);
});

test('1b. un zoom por debajo del mínimo, o roto, cae en el encuadre completo', () => {
  // **El contrato no cubría el zoom no finito.** Cuando este test lo probó,
  // esperaba que Infinity se recortara al tope útil y el código lo mandaba al
  // encuadre completo. Se fijó la regla del código, no la del test, y por una
  // razón: un zoom no finito es un defecto de quien llama, y el encuadre
  // completo es el único estado del que se sabe con certeza que muestra la
  // sala. Recortar un Infinity al tope sería tratar un error como un pedido.
  const completo = calcularEscala(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  for (const zoom of [ZOOM_MINIMO, 0.5, 0, -3, NaN, Infinity, -Infinity]) {
    const e = escalaConVista(
      DIM, LIENZO.w, LIENZO.h, { zoom, centroM: { x: 1, y: 2 } }, LIENZO.margen);
    deepStrictEqual(e, completo, `zoom ${zoom} tendría que dar el encuadre completo`);
  }
});

test('2. el dedo se afina monótonamente al acercar', () => {
  const tope = zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  const centro = { x: 4, y: 6 };
  let anterior = Infinity;
  for (let zoom = 1; zoom <= tope; zoom *= PASO_DE_ZOOM) {
    const dedo = precisionDelDedoM(
      escalaConVista(DIM, LIENZO.w, LIENZO.h, { zoom, centroM: centro }, LIENZO.margen));
    ok(dedo < anterior, `a zoom ${zoom} el dedo (${dedo}) no bajó de ${anterior}`);
    anterior = dedo;
  }
  // Y que el recorrido sea de verdad, no dos pasos: si el tope quedara en 1 en
  // esta sala, el test de arriba pasaría sin probar nada.
  ok(tope > 4, `el tope útil quedó en ${tope}, demasiado chico para probar algo`);
});

test('3. en el tope, el dedo llega a la resolución más fina del modelo', () => {
  const tope = zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  const dedo = precisionDelDedoM(escalaConVista(
    DIM, LIENZO.w, LIENZO.h, { zoom: tope, centroM: { x: 4, y: 6 } }, LIENZO.margen));
  const finoDelModelo = INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM;
  // Esta es la expectativa que justifica el ítem. Y el tope se DERIVA de esta
  // misma constante, así que el test también falla si alguien escribe el tope a
  // mano y se separa de la tabla de fijeza.
  ok(dedo <= finoDelModelo + 1e-9,
    `en el tope el dedo vale ${dedo} m y el modelo declara ${finoDelModelo} m`);
});

test('4. la ida y vuelta se deshace al centímetro con cualquier vista', () => {
  // Un punto que no es simétrico en ningún eje, para que un espejo rompa.
  const origen = PUNTO(1.37, 9.42, 1.2);
  for (const zoom of [1, 2, 5.5, zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen)]) {
    for (const centroM of [{ x: 4, y: 6 }, { x: 0, y: 0 }, { x: 8, y: 12 }]) {
      const e = escalaConVista(DIM, LIENZO.w, LIENZO.h, { zoom, centroM }, LIENZO.margen);
      const vuelta = aMetros(aPantalla(origen, e), e, DIM, origen.z);
      deepStrictEqual(puntoACentimetros(vuelta), puntoACentimetros(origen),
        `zoom ${zoom} centro ${centroM.x},${centroM.y} no deshizo la ida`);
    }
  }
});

test('5. el recorte del encuadre nunca deja el local fuera del lienzo', () => {
  const tope = zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  const centrosAbsurdos = [
    { x: -1000, y: -1000 }, { x: 9999, y: 9999 },
    { x: NaN, y: NaN }, { x: Infinity, y: -Infinity },
  ];
  for (const centroM of centrosAbsurdos) {
    const e = escalaConVista(DIM, LIENZO.w, LIENZO.h, { zoom: tope, centroM }, LIENZO.margen);
    // El rectángulo del local tiene que intersecar el rectángulo del lienzo.
    ok(e.origenX < LIENZO.w && e.origenX + e.anchoPx > 0,
      `centro ${centroM.x} dejó el local fuera en x: origen ${e.origenX} ancho ${e.anchoPx}`);
    ok(e.origenY < LIENZO.h && e.origenY + e.altoPx > 0,
      `centro ${centroM.y} dejó el local fuera en y: origen ${e.origenY} alto ${e.altoPx}`);
  }
});

test('6. el blanco táctil es en píxeles CSS y no se mueve con el zoom', () => {
  // BLANCO_MINIMO_PX y YEMA_PX son píxeles de pantalla: acercar el plano no
  // cambia cuán grande es un dedo, sólo cuántos metros cubre. Si alguno de los
  // dos empezara a depender del zoom, las dos cifras que esta pantalla promete
  // no falsear quedarían falseadas --que es el defecto que ya encontró una
  // auditoría con el estiramiento del SVG.
  const cerca = escalaConVista(
    DIM, LIENZO.w, LIENZO.h,
    { zoom: zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen), centroM: { x: 4, y: 6 } },
    LIENZO.margen);
  const lejos = escalaConVista(DIM, LIENZO.w, LIENZO.h, vistaInicial(DIM), LIENZO.margen);
  strictEqual(BLANCO_MINIMO_PX, 48);
  strictEqual(YEMA_PX, 44);
  // Lo que sí cambia es cuántos metros vale ese dedo, y en la dirección buena.
  ok(precisionDelDedoM(cerca) < precisionDelDedoM(lejos));
  // Y el radio de duda dibujado crece con el zoom: 5 cm de duda a tope de zoom
  // tienen que ser un círculo visible, no un punto.
  const em = emplazar(PUNTO(4, 6, 1), 'EN_PIE');
  ok(radioIncertidumbrePx(em, cerca) > BLANCO_MINIMO_PX / 2,
    'a tope de zoom, 5 cm de duda tendrían que dibujarse más grandes que medio blanco');
});

test('acercar sobre un punto lo deja quieto en el centro del lienzo', () => {
  const punto = { x: 2.5, y: 9 };
  const v = acercarSobre(vistaInicial(DIM), punto);
  ok(v.zoom > ZOOM_MINIMO);
  deepStrictEqual(v.centroM, punto);
  const e = escalaConVista(DIM, LIENZO.w, LIENZO.h, v, LIENZO.margen);
  const px = aPantalla(PUNTO(punto.x, punto.y, 0), e);
  // En el medio del lienzo, no del rectángulo del local: el local ya no entra.
  ok(Math.abs(px.x - LIENZO.w / 2) < 0.001, `x cayó en ${px.x}`);
  ok(Math.abs(px.y - LIENZO.h / 2) < 0.001, `y cayó en ${px.y}`);
});

test('el encuadre completo es la salida de vuelta y coincide con la vista inicial', () => {
  deepStrictEqual(encuadreCompleto(DIM), vistaInicial(DIM));
});

test('el piso del tope existe: cuando el dedo ya alcanza, el tope es 1', () => {
  // **Este test empezó con una premisa falsa y la medición la corrigió.** Decía
  // "en una sala chica el tope es 1", suponiendo que en un local de 1 × 1 m el
  // dedo ya sería más fino que los 5 cm del modelo. No lo es: da 12,5 cm, y el
  // tope queda en 2,5. La cuenta está en el comentario de `zoomUtilMaximo` y
  // sale de correr `calcularEscala`, no de estimarla.
  //
  // Lo que sí hace falta probar es que el piso del recorte funciona, y para eso
  // hay que llegar de verdad a la condición: un lienzo grande, donde el
  // encuadre completo ya afina el dedo por debajo de la resolución del modelo.
  const chica = { largo: 1, ancho: 1, alto: 3 };
  const dedoSinZoom = precisionDelDedoM(calcularEscala(chica, 2000, 2000, 24));
  ok(dedoSinZoom <= INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM,
    `la premisa del test tiene que valer: el dedo da ${dedoSinZoom} m`);
  strictEqual(zoomUtilMaximo(chica, 2000, 2000, 24), ZOOM_MINIMO);

  // Y en la tablet de verdad, con la sala más chica que tiene sentido, el tope
  // sigue arriba de 1: acercar siempre sirve. Es el argumento del ítem 91.
  ok(zoomUtilMaximo(chica, LIENZO.w, LIENZO.h, LIENZO.margen) > ZOOM_MINIMO);
});

test('el dedo sobre una sala de 12 por 8 en una tablet vale un metro justo', () => {
  // La cifra que hace falta para entender por qué este ítem existe, y sale de
  // correr la escala: 352 px útiles / 8 m de ancho = 44 px/m, y la yema son 44
  // px. Un dedo, un metro. En un local así, soltar una ficha con el dedo sin
  // zoom deja una posición con un metro de ambigüedad -- veinte veces la
  // incertidumbre que el modelo declara para algo apoyado en el piso.
  const e = calcularEscala(DIM, LIENZO.w, LIENZO.h, LIENZO.margen);
  strictEqual(e.pxPorMetro, 44);
  strictEqual(precisionDelDedoM(e), 1);
  strictEqual(zoomUtilMaximo(DIM, LIENZO.w, LIENZO.h, LIENZO.margen), 20);
});
