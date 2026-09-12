import { test } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert/strict';
import {
  distanciaM, anguloFueraDeEjeGrados, puedenSuperponerse, emplazar, rangoInutil,
  elementosDelEscenario, validarEscenario, INCERTIDUMBRE_POR_FIJEZA,
  anguloDeCaptacion, NULO_DEL_PATRON_GRADOS,
  type Emplazamiento, type Escenario, type ElementoCaptacion, type ElementoFuente, type PuntoM,
  type EmplazamientoDeComponente,
} from '../src/index.ts';
import type {
  PAComponentSpec, PAComponentId, VenueProfileId, ChannelAssignmentId, EscenarioElementoId,
} from '../src/index.ts';

/**
 * El modelo del escenario, y sobre todo la regla que lo gobierna: **ninguna
 * inferencia geométrica se presenta más precisa que sus entradas**.
 *
 * Los ángulos de estos tests están elegidos para poder comprobarse **sin
 * repetir la cuenta del código**: 0°, 90° y 180° salen de la simetría, y 53,13°
 * es el triángulo 3-4-5 de toda la vida. Un test que recalcule `acos` del
 * producto escalar no probaría nada: seguiría al código hasta el error.
 */

const PUNTO = (x: number, y: number, z: number): PuntoM => ({ x, y, z });

/** Sin duda ninguna: para aislar la geometría de la incertidumbre. */
function exacto(p: PuntoM, azimut: number | null = null, inclinacion = 0): Emplazamiento {
  return emplazar(
    p, 'FIJO',
    azimut === null ? null : { azimutGrados: azimut, inclinacionGrados: inclinacion },
    { posicionM: 0, orientacionGrados: 0 },
  );
}

// --- Distancia --------------------------------------------------------------

test('la distancia devuelve un rango, y sin duda en las entradas el rango es un punto', () => {
  const r = distanciaM(exacto(PUNTO(0, 0, 0)), exacto(PUNTO(3, 4, 0)));
  strictEqual(r.min, 5);
  strictEqual(r.max, 5);
});

test('las incertidumbres se suman, no se componen en cuadratura', () => {
  // 0,30 + 0,40 = 0,70. En cuadratura darían 0,50, que es un rango más
  // angosto: componer supone errores aleatorios independientes, y un cantante
  // que se corre medio metro no es ruido gaussiano alrededor de su marca.
  const a = emplazar(PUNTO(0, 0, 0), 'FIJO', null, { posicionM: 0.30 });
  const b = emplazar(PUNTO(3, 4, 0), 'FIJO', null, { posicionM: 0.40 });
  const r = distanciaM(a, b);
  ok(Math.abs(r.min - 4.30) < 1e-12, `min esperado 4,30 y llegó ${r.min}`);
  ok(Math.abs(r.max - 5.70) < 1e-12, `max esperado 5,70 y llegó ${r.max}`);
});

test('la distancia no baja de cero, y eso es lo que dice «pueden estar en el mismo sitio»', () => {
  // Quien canta se agacha hacia su cuña con el micrófono en la mano: 50 cm
  // marcados, pero medio metro de duda. El modelo no puede descartar que lo
  // haya apoyado encima, y decirlo es más útil que un número prolijo.
  //
  // El primer ejemplo que escribí acá tenía el micrófono a 1,43 m y daba 0,83,
  // no 0. El test lo encontró: a metro y medio la duda de medio metro **no**
  // alcanza para tocarse, y la regla de recortar en cero no se ejercitaba.
  // **Y la segunda versión de este test se rompió sola al cambiar una
  // constante.** Pedía `r.max > 1.0`, que con `FIJO` en 0,10 daba 1,1 y pasaba;
  // el 2026-09-12 `FIJO` pasó a valer 0 y el máximo quedó en 1,0 exacto. El
  // umbral estaba calibrado contra el valor de la constante, no contra la regla.
  // Ahora se fija la regla: el máximo **es** la distancia más las dos dudas.
  const cuna = emplazar(PUNTO(2, 1, 0.2), 'FIJO');
  const mano = emplazar(PUNTO(2, 1.3, 0.6), 'EN_MANO');
  const duda = INCERTIDUMBRE_POR_FIJEZA.FIJO.posicionM + INCERTIDUMBRE_POR_FIJEZA.EN_MANO.posicionM;
  const r = distanciaM(cuna, mano);
  strictEqual(r.min, 0, 'el mínimo se recorta en cero: no existe la distancia negativa');
  ok(Math.abs(r.max - (0.5 + duda)) < 1e-9, `el máximo es la distancia más las dudas: ${r.max}`);
  strictEqual(puedenSuperponerse(cuna, mano), true);

  // Control positivo: el mismo punto, pero con el micrófono en un pie, SÍ se
  // puede separar de la cuña. Si el recorte en cero se aplicara siempre, este
  // caso también daría 0 y el test de arriba no probaría nada.
  const pie = emplazar(PUNTO(2, 1.3, 0.6), 'EN_PIE');
  ok(distanciaM(cuna, pie).min > 0.3, 'un micrófono en un pie no se superpone con la cuña');
  strictEqual(puedenSuperponerse(cuna, pie), false);
});

// --- Ángulo fuera de eje ----------------------------------------------------

test('el ángulo fuera de eje: en el eje, de costado y por detrás', () => {
  const monitor = exacto(PUNTO(0, 0, 0), 0); // apunta a +y, hacia el público
  const enEje = anguloFueraDeEjeGrados(monitor, exacto(PUNTO(0, 3, 0)));
  const deCostado = anguloFueraDeEjeGrados(monitor, exacto(PUNTO(3, 0, 0)));
  const detras = anguloFueraDeEjeGrados(monitor, exacto(PUNTO(0, -3, 0)));
  deepStrictEqual(enEje, { min: 0, max: 0 });
  deepStrictEqual(deCostado, { min: 90, max: 90 });
  deepStrictEqual(detras, { min: 180, max: 180 });
});

test('el azimut crece hacia +x: un escenario espejado tiene que fallar acá', () => {
  // **Este test existe porque los otros no distinguían el espejo.** Todos
  // usaban azimut 0, y con el versor invertido en x --`-sin(a)` en vez de
  // `sin(a)`-- los cinco asertos de ángulo daban exactamente lo mismo: 20 de 20
  // en verde con la izquierda y la derecha cambiadas. Lo encontró una auditoría
  // que reimplementó la función al revés, y se comprobó rompiéndola a
  // propósito.
  //
  // Es el error que pone la cuña apuntando al otro lado del escenario y señala
  // como más acoplado al micrófono equivocado, sin que nada se queje.
  const aLaDerecha = exacto(PUNTO(0, 0, 0), 90);
  deepStrictEqual(anguloFueraDeEjeGrados(aLaDerecha, exacto(PUNTO(3, 0, 0))), { min: 0, max: 0 });
  deepStrictEqual(anguloFueraDeEjeGrados(aLaDerecha, exacto(PUNTO(-3, 0, 0))), { min: 180, max: 180 });
  const aLaIzquierda = exacto(PUNTO(0, 0, 0), -90);
  deepStrictEqual(anguloFueraDeEjeGrados(aLaIzquierda, exacto(PUNTO(-3, 0, 0))), { min: 0, max: 0 });
});

test('el ángulo fuera de eje cuenta la altura, no solo el piso', () => {
  const monitor = exacto(PUNTO(0, 0, 0), 0);
  // 3 adelante y 4 arriba: el 3-4-5, con el coseno en 3/5.
  const r = anguloFueraDeEjeGrados(monitor, exacto(PUNTO(0, 3, 4)));
  ok(r !== null);
  ok(Math.abs(r.min - 53.130102) < 1e-5, `esperado 53,13° y llegó ${r.min}`);
  strictEqual(r.min, r.max);

  // Control positivo: la misma cuña inclinada 53,13° hacia arriba lo pone en
  // el eje. Si la inclinación se ignorara, este caso daría 53,13° otra vez.
  const inclinada = exacto(PUNTO(0, 0, 0), 0, 53.130102);
  const r2 = anguloFueraDeEjeGrados(inclinada, exacto(PUNTO(0, 3, 4)));
  ok(r2 !== null && r2.min < 1e-4, `la cuña inclinada lo tiene en el eje, y dio ${r2?.min}`);
});

test('lo que no apunta a ningún lado no tiene eje del que salirse', () => {
  const caja = exacto(PUNTO(1, 1, 0)); // sin orientación
  strictEqual(anguloFueraDeEjeGrados(caja, exacto(PUNTO(0, 0, 0))), null);
  // Control positivo: el mismo punto con orientación sí contesta.
  ok(anguloFueraDeEjeGrados(exacto(PUNTO(1, 1, 0), 0), exacto(PUNTO(0, 0, 0))) !== null);
});

test('más cerca que su propia duda, el ángulo es 0 a 180: eso es «no se sabe»', () => {
  const cuna = emplazar(PUNTO(2, 1, 0.2), 'FIJO', { azimutGrados: 0, inclinacionGrados: 35 });
  const mano = emplazar(PUNTO(2, 1.2, 0.4), 'EN_MANO');
  deepStrictEqual(anguloFueraDeEjeGrados(cuna, mano), { min: 0, max: 180 });
  // Control positivo: el mismo micrófono de mano a tres metros sí acota.
  const lejos = emplazar(PUNTO(2, 4.2, 1.6), 'EN_MANO');
  const r = anguloFueraDeEjeGrados(cuna, lejos);
  ok(r !== null && (r.max - r.min) < 180, `a tres metros tiene que acotar, y dio ${JSON.stringify(r)}`);
});

test('la orientación de quien es mirado no ensancha el ángulo', () => {
  // El ángulo se calcula con el eje de `quien` y la recta entre posiciones:
  // hacia dónde mira `otro` no aparece en ninguno de los dos. Sumar su
  // incertidumbre ensanchaba el rango por una razón que la fórmula no
  // sostiene, y ningún test lo notaba porque todos la ponían en cero.
  const monitor = emplazar(PUNTO(0, 0, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { posicionM: 0, orientacionGrados: 5 });
  const quieto = emplazar(PUNTO(2, 2, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { posicionM: 0, orientacionGrados: 0 });
  const girando = emplazar(PUNTO(2, 2, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { posicionM: 0, orientacionGrados: 80 });
  deepStrictEqual(anguloFueraDeEjeGrados(monitor, quieto), anguloFueraDeEjeGrados(monitor, girando));
  // Control positivo: la de QUIEN mira sí tiene que ensanchar.
  const monitorDudoso = emplazar(PUNTO(0, 0, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { posicionM: 0, orientacionGrados: 30 });
  const a = anguloFueraDeEjeGrados(monitor, quieto);
  const b = anguloFueraDeEjeGrados(monitorDudoso, quieto);
  ok(a !== null && b !== null && (b.max - b.min) > (a.max - a.min));
});

test('la duda de posición pesa más de cerca que de lejos', () => {
  // La misma imprecisión de 10 cm no significa lo mismo a 50 cm que a 5 m.
  // Tratarla como un número fijo de grados sería el error de siempre.
  const conducta = (distancia: number): number => {
    const m = emplazar(PUNTO(0, 0, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { posicionM: 0.05, orientacionGrados: 0 });
    const o = emplazar(PUNTO(0, distancia, 0), 'FIJO', null, { posicionM: 0.05, orientacionGrados: 0 });
    const r = anguloFueraDeEjeGrados(m, o);
    ok(r !== null);
    return r.max - r.min;
  };
  const cerca = conducta(0.5);
  const lejos = conducta(5);
  ok(cerca > lejos * 5, `de cerca el rango tiene que ser mucho más ancho: ${cerca} contra ${lejos}`);
});

test('un rango demasiado ancho, o roto, se reconoce como inservible', () => {
  strictEqual(rangoInutil({ min: 0, max: 180 }, 60), true);
  strictEqual(rangoInutil({ min: 10, max: 40 }, 60), false);
  // Un `NaN` pasaba por apto para decidir, porque toda comparación con `NaN` es
  // falsa: un azimut mal cargado producía un rango de NaN a NaN y esta función
  // decía que servía. Lo mismo un rango invertido.
  strictEqual(rangoInutil({ min: NaN, max: NaN }, 60), true);
  strictEqual(rangoInutil({ min: 0, max: Infinity }, 60), true);
  strictEqual(rangoInutil({ min: 190, max: -10 }, 60), true);
  // Y el borde exacto no es inservible: `>` y no `>=`.
  strictEqual(rangoInutil({ min: 0, max: 60 }, 60), false);
});

// --- Incertidumbre por fijeza ----------------------------------------------

test('la fijeza pone la duda por defecto, y se puede sobreescribir', () => {
  const enMano = emplazar(PUNTO(0, 0, 0), 'EN_MANO');
  strictEqual(enMano.incertidumbrePosicionM, INCERTIDUMBRE_POR_FIJEZA.EN_MANO.posicionM);
  // Quien midió su sala con cinta sabe más que la tabla de suposiciones.
  const medido = emplazar(PUNTO(0, 0, 0), 'EN_MANO', null, { posicionM: 0.02 });
  strictEqual(medido.incertidumbrePosicionM, 0.02);
  strictEqual(medido.fijeza, 'EN_MANO', 'la fijeza no se pierde al sobreescribir la duda');
  // Y un micrófono de mano tiene que dudar más que uno en un pie: si la tabla
  // se igualara, medio modelo dejaría de tener sentido sin que nada fallara.
  ok(INCERTIDUMBRE_POR_FIJEZA.EN_MANO.posicionM > INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM);
});

// --- Las dos mitades --------------------------------------------------------

const VENUE = 'venue_1' as VenueProfileId;

function escenarioCon(
  elementos: readonly (ElementoFuente | ElementoCaptacion)[],
  emisores: readonly EmplazamientoDeComponente[] = [],
): Escenario {
  return {
    venueProfileId: VENUE, elementos, emisores,
    actualizado: '2026-09-11T00:00:00.000Z', notas: null,
  };
}

/** Ubica un componente en este local. El lugar es del local, no del equipo. */
function ubicado(c: PAComponentSpec, em: Emplazamiento): EmplazamientoDeComponente {
  return { componenteId: c.id, emplazamiento: em };
}

const CUNA: PAComponentSpec = {
  id: 'comp_cuna' as PAComponentId,
  nombre: 'Cuña de Ana', bus: { tipo: 'AUX', indice: 1 }, silenciable: true,
  clase: 'MONITOR_CUNA', modelo: null,
};
const LUGAR_DE_LA_CUNA = emplazar(PUNTO(2, 1, 0.2), 'FIJO', { azimutGrados: 0, inclinacionGrados: 35 });
const GENERAL: PAComponentSpec = {
  id: 'comp_general' as PAComponentId,
  nombre: 'General', bus: { tipo: 'MASTER' }, silenciable: false, clase: 'PRINCIPAL', modelo: null,
};

const MIC: ElementoCaptacion = {
  tipo: 'CAPTACION', id: 'cap_1' as EscenarioElementoId, nombre: 'Voz de Ana',
  emplazamiento: emplazar(PUNTO(2, 2, 1.6), 'EN_PIE', { azimutGrados: 180, inclinacionGrados: 0 }),
  captacion: 'MICROFONO', patron: 'CARDIOIDE', asignacionId: 'ch_1' as ChannelAssignmentId,
  fuenteId: 'fte_1' as EscenarioElementoId,
};
const VOZ: ElementoFuente = {
  tipo: 'FUENTE', id: 'fte_1' as EscenarioElementoId, nombre: 'Ana',
  emplazamiento: emplazar(PUNTO(2, 2.1, 1.6), 'EN_PIE'), bandMemberId: null,
};

test('las dos mitades se unen, y el componente sin lugar NO desaparece en silencio', () => {
  const r = elementosDelEscenario(escenarioCon([VOZ, MIC], [ubicado(CUNA, LUGAR_DE_LA_CUNA)]), [CUNA, GENERAL]);
  deepStrictEqual(r.emisores.map((e) => e.nombre), ['Cuña de Ana']);
  // Es la mitad importante: un monitor que el usuario no ubicó y que
  // desaparece del análisis es exactamente el caso en que la geometría y el
  // analizador se contradicen sin que nadie sepa por qué.
  deepStrictEqual(r.sinLugar.map((c) => c.nombre), ['General']);
  deepStrictEqual(r.captaciones.map((c) => c.id), ['cap_1']);
  deepStrictEqual(r.fuentes.map((f) => f.id), ['fte_1']);
  // El emisor conserva su bus: es lo que después dice qué auxiliar bajar.
  deepStrictEqual(r.emisores[0]?.bus, { tipo: 'AUX', indice: 1 });
});

test('sin lugar devuelve los componentes, no sus nombres: dos homónimos se distinguen', () => {
  // Un general estéreo son dos componentes con el mismo bus y, si el usuario
  // los llamó igual, con el mismo nombre. Devolviendo nombres, la lista decía
  // dos veces lo mismo y no había forma de pedirle al usuario que ubicara uno
  // en particular.
  const izq: PAComponentSpec = { ...GENERAL, id: 'c_izq' as PAComponentId, modelo: 'izquierdo' };
  const der: PAComponentSpec = { ...GENERAL, id: 'c_der' as PAComponentId, modelo: 'derecho' };
  const r = elementosDelEscenario(escenarioCon([]), [izq, der]);
  deepStrictEqual(r.sinLugar.map((c) => c.modelo), ['izquierdo', 'derecho']);
});

test('dos componentes homónimos se ubican por separado, cada uno con su identidad', () => {
  // El nombre no identifica: dos componentes homónimos son un caso real que el
  // propio modelo nombra. Una auditoría comprobó que la pantalla, usando el
  // nombre, movía los dos a la vez.
  const izq: PAComponentSpec = { ...CUNA, id: 'c_izq' as PAComponentId, nombre: 'Cuña' };
  const der: PAComponentSpec = { ...CUNA, id: 'c_der' as PAComponentId, nombre: 'Cuña' };
  const aca = emplazar(PUNTO(1, 1, 0.2), 'FIJO');
  const r = elementosDelEscenario(escenarioCon([], [ubicado(der, aca)]), [GENERAL, izq, der]);
  deepStrictEqual(r.emisores.map((e) => e.componente.id), ['c_der'], 'sólo el ubicado');
  deepStrictEqual(r.sinLugar.map((c) => c.id), ['c_general', 'c_izq']
    .map((x) => (x === 'c_general' ? GENERAL.id : izq.id)));
});

test('el mismo equipo en dos locales está en dos lugares, y ninguno pisa al otro', () => {
  // Es el defecto que una auditoría encontró y que decidió este modelo: con el
  // lugar guardado dentro del componente, ubicar las cuñas en un galpón movía
  // las del bar, sin aviso.
  const galpon = escenarioCon([], [ubicado(CUNA, emplazar(PUNTO(2, 1, 0.2), 'FIJO'))]);
  const bar = escenarioCon([], [ubicado(CUNA, emplazar(PUNTO(5, 3, 0.2), 'FIJO'))]);
  const equipo = [CUNA];
  deepStrictEqual(elementosDelEscenario(galpon, equipo).emisores[0]?.emplazamiento.posicion,
    { x: 2, y: 1, z: 0.2 });
  deepStrictEqual(elementosDelEscenario(bar, equipo).emisores[0]?.emplazamiento.posicion,
    { x: 5, y: 3, z: 0.2 });
});

test('los intraurales no van a «sin lugar»: no es que falte un dato, es que no acoplan', () => {
  // Con emplazamiento --en la cabeza de quien canta-- unos intraurales salían
  // como emisor a cero metros y en el eje del micrófono de voz: el par más
  // riesgoso de todo el escenario, y el único que no puede realimentar nunca.
  const iem: PAComponentSpec = {
    id: 'comp_iem' as PAComponentId,
    nombre: 'Intraurales de Ana', bus: { tipo: 'AUX', indice: 3 }, silenciable: true,
    clase: 'IEM', modelo: null,
  };
  const r = elementosDelEscenario(
    escenarioCon([], [ubicado(iem, emplazar(PUNTO(2, 2, 1.7), 'EN_MANO')), ubicado(CUNA, LUGAR_DE_LA_CUNA)]),
    [iem, CUNA, GENERAL]);
  deepStrictEqual(r.emisores.map((e) => e.nombre), ['Cuña de Ana']);
  deepStrictEqual(r.noRadian.map((c) => c.nombre), ['Intraurales de Ana']);
  // Y no se cuelan en la otra lista, que es la que le pide datos al usuario.
  deepStrictEqual(r.sinLugar.map((c) => c.nombre), ['General']);
});

test('un perfil guardado antes de que existiera el emplazamiento no rompe nada', () => {
  // Los documentos migrados traen `emplazamiento: null`; los que todavía no
  // pasaron por la migración --uno importado, por ejemplo-- ni siquiera traen
  // la clave. Los dos tienen que terminar en `sinLugar`, no en un emisor con
  // posición indefinida, que envenenaría toda la geometría de la sala.
  const viejo = { nombre: 'Lado derecho', bus: { tipo: 'MASTER' }, silenciable: false,
    clase: 'PRINCIPAL', modelo: null } as unknown as PAComponentSpec;
  // Y un escenario guardado antes de que existiera la lista de emisores: la
  // clave no está, y leerla no puede reventar.
  const escenarioViejo = {
    venueProfileId: VENUE, elementos: [], actualizado: 'x', notas: null,
  } as unknown as Escenario;
  const r = elementosDelEscenario(escenarioViejo, [viejo, CUNA]);
  deepStrictEqual(r.sinLugar.map((c) => c.nombre), ['Lado derecho', 'Cuña de Ana']);
  deepStrictEqual(r.emisores, []);
});

// --- Validación -------------------------------------------------------------

const DIMENSIONES = { largo: 12, ancho: 8, alto: 4 };

function problemasDe(elementos: readonly (ElementoFuente | ElementoCaptacion)[]): string[] {
  return validarEscenario(escenarioCon(elementos), DIMENSIONES).map((p) => `${p.elementoId}: ${p.problema}`);
}

test('un escenario bien cargado no tiene nada que decir', () => {
  deepStrictEqual(problemasDe([VOZ, MIC]), []);
});

test('un micrófono sin patrón polar no se puede analizar, y se dice', () => {
  const p = problemasDe([VOZ, { ...MIC, patron: null }]);
  strictEqual(p.length, 1, `esperaba un solo problema y hubo ${p.length}: ${p.join(' | ')}`);
  ok(p[0]?.includes('patrón polar'), p[0]);
});

test('una caja directa no capta aire: no puede tener patrón', () => {
  const di: ElementoCaptacion = { ...MIC, id: 'cap_2' as EscenarioElementoId, captacion: 'DIRECTA', patron: 'OMNI' };
  const p = problemasDe([VOZ, di]);
  ok(p.some((x) => x.includes('no capta aire')), p.join(' | '));
  // Control positivo: la misma caja directa sin patrón no da problema.
  deepStrictEqual(problemasDe([VOZ, { ...di, patron: null }]), []);
});

test('un micrófono que apunta a una fuente que no existe se denuncia', () => {
  const p = problemasDe([{ ...MIC, fuenteId: 'fte_borrada' as EscenarioElementoId }]);
  ok(p.some((x) => x.includes('fte_borrada')), p.join(' | '));
});

test('un elemento que pasa las paredes del local se denuncia por cada eje', () => {
  const afuera: ElementoFuente = { ...VOZ, id: 'fte_2' as EscenarioElementoId, emplazamiento: emplazar(PUNTO(9, 20, 5), 'FIJO') };
  const p = problemasDe([afuera]);
  strictEqual(p.length, 3, `x, y y z, los tres fuera: ${p.join(' | ')}`);
  ok(p.some((x) => x.includes('ancho')) && p.some((x) => x.includes('largo')) && p.some((x) => x.includes('alto')));
});

test('sin dimensiones no se inventa un borde, pero los negativos se denuncian igual', () => {
  // **Antes, todo el bloque de posición colgaba de que el local tuviera
  // dimensiones**, así que un escenario al aire libre pasaba sin una sola
  // comprobación: ni coordenadas negativas, ni un 200 tipeado donde iba 2,00.
  // El test anterior consagraba eso como correcto.
  const lejos: ElementoFuente = { ...VOZ, id: 'fte_2' as EscenarioElementoId, emplazamiento: emplazar(PUNTO(9, 20, 1), 'FIJO') };
  deepStrictEqual(validarEscenario(escenarioCon([lejos]), null), [], 'sin paredes no hay pared que pasar');
  ok(validarEscenario(escenarioCon([lejos]), DIMENSIONES).length > 0, 'con paredes, sí');

  const negativo: ElementoFuente = { ...VOZ, id: 'fte_3' as EscenarioElementoId, emplazamiento: emplazar(PUNTO(-1, 2, 0), 'FIJO') };
  const p = validarEscenario(escenarioCon([negativo]), null);
  strictEqual(p.length, 1, `el negativo se denuncia aunque no haya dimensiones: ${JSON.stringify(p)}`);
  ok(p[0]?.problema.includes('negativas'), p[0]?.problema);
});

test('una orientación rota o una incertidumbre negativa no pasan por buenas', () => {
  const rota: ElementoFuente = {
    ...VOZ, id: 'fte_2' as EscenarioElementoId,
    emplazamiento: emplazar(PUNTO(2, 2, 0), 'FIJO', { azimutGrados: NaN, inclinacionGrados: 0 }),
  };
  ok(problemasDe([rota]).some((x) => x.includes('no son números')), problemasDe([rota]).join(' | '));

  const dudaNegativa: ElementoFuente = {
    ...VOZ, id: 'fte_3' as EscenarioElementoId,
    emplazamiento: emplazar(PUNTO(2, 2, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 }, { orientacionGrados: -100 }),
  };
  // Con la duda angular en negativo el rango sale invertido y todo lo que lo
  // lea después le va a creer.
  ok(problemasDe([dudaNegativa]).some((x) => x.includes('orientación es negativa')));
});

test('dos elementos con el mismo identificador se denuncian', () => {
  const p = problemasDe([VOZ, { ...VOZ }]);
  ok(p.some((x) => x.includes('dos elementos con este identificador')), p.join(' | '));
});

test('un micrófono direccional sin orientación no se puede analizar; uno omni sí', () => {
  const sinEje = { ...MIC, emplazamiento: emplazar(PUNTO(2, 2, 1.6), 'EN_PIE') };
  ok(problemasDe([VOZ, sinEje]).some((x) => x.includes('direccional')));
  // Control positivo: el omnidireccional no necesita eje y no da problema.
  deepStrictEqual(problemasDe([VOZ, { ...sinEje, patron: 'OMNI' }]), []);
});

// --- El patrón polar, que era un campo inerte ------------------------------
//
// Se exigía al validar y no lo leía ninguna cuenta: CARDIOIDE, HIPERCARDIOIDE y
// BIDIRECCIONAL daban resultados idénticos. Un campo sin consecuencia
// observable no cubre nada, y peor: invita a leer 180° como el mejor caso, que
// para un bidireccional es exactamente el peor.

test('el nulo del patrón distingue cardioide de bidireccional, y el omni no tiene', () => {
  strictEqual(NULO_DEL_PATRON_GRADOS.CARDIOIDE, 180);
  strictEqual(NULO_DEL_PATRON_GRADOS.BIDIRECCIONAL, 90);
  strictEqual(NULO_DEL_PATRON_GRADOS.SUPERCARDIOIDE, 126);
  strictEqual(NULO_DEL_PATRON_GRADOS.HIPERCARDIOIDE, 110);
  strictEqual(NULO_DEL_PATRON_GRADOS.OMNI, null, 'un omni capta parejo: no hay nulo que buscar');
  strictEqual(NULO_DEL_PATRON_GRADOS.DESCONOCIDO, null, 'de un patrón sin cargar no se adivina');
  // Los cuatro direccionales tienen que ser distintos entre sí: si la tabla se
  // igualara, el campo volvería a ser inerte sin que nada fallara.
  const nulos = [
    NULO_DEL_PATRON_GRADOS.CARDIOIDE, NULO_DEL_PATRON_GRADOS.SUPERCARDIOIDE,
    NULO_DEL_PATRON_GRADOS.HIPERCARDIOIDE, NULO_DEL_PATRON_GRADOS.BIDIRECCIONAL,
  ];
  strictEqual(new Set(nulos).size, 4);
});

test('el omnidireccional NO se informa igual que una caja directa', () => {
  // Era el falso negativo más caro del archivo: el micrófono más propenso a
  // realimentar de cualquier escenario salía del análisis con el mismo `null`
  // que una caja directa, que no capta aire.
  const lejos = emplazar(PUNTO(0, 0, 0), 'FIJO', { azimutGrados: 0, inclinacionGrados: 0 });
  const omni: ElementoCaptacion = { ...MIC, patron: 'OMNI' };
  const di: ElementoCaptacion = { ...MIC, captacion: 'DIRECTA', patron: null };
  strictEqual(anguloDeCaptacion(omni, lejos).tipo, 'OMNIDIRECCIONAL');
  strictEqual(anguloDeCaptacion(di, lejos).tipo, 'SIN_CAPTACION_AEREA');
  strictEqual(anguloDeCaptacion({ ...MIC, patron: 'DESCONOCIDO' }, lejos).tipo, 'PATRON_SIN_CARGAR');
  strictEqual(anguloDeCaptacion({ ...MIC, patron: null }, lejos).tipo, 'PATRON_SIN_CARGAR');
  const sinEje: ElementoCaptacion = { ...MIC, emplazamiento: emplazar(PUNTO(2, 2, 1.6), 'EN_PIE') };
  strictEqual(anguloDeCaptacion(sinEje, lejos).tipo, 'SIN_EJE');
  // Los cinco tienen que ser distintos: si dos colapsaran, volvemos al `null`
  // que confundía tres casos.
  const tipos = [omni, di, { ...MIC, patron: 'DESCONOCIDO' as const }, sinEje]
    .map((c) => anguloDeCaptacion(c, lejos).tipo);
  strictEqual(new Set(tipos).size, 4);
});

test('un micrófono direccional contesta con ángulo y con dónde está su nulo', () => {
  const detras = emplazar(PUNTO(2, 4, 1.6), 'FIJO'); // MIC mira a 180°, o sea a -y
  const r = anguloDeCaptacion(MIC, detras);
  strictEqual(r.tipo, 'ANGULO');
  if (r.tipo !== 'ANGULO') return;
  strictEqual(r.nuloGrados, 180, 'MIC es cardioide: su nulo está atrás');
  ok(r.rango.min > 90, `algo puesto en el lado opuesto al eje: ${JSON.stringify(r.rango)}`);
  // Control positivo: el mismo micrófono con patrón bidireccional informa un
  // nulo distinto, y esos 180° dejan de ser el mejor caso.
  const bi = anguloDeCaptacion({ ...MIC, patron: 'BIDIRECCIONAL' }, detras);
  if (bi.tipo !== 'ANGULO') throw new Error('tendría que dar ángulo');
  strictEqual(bi.nuloGrados, 90);
  deepStrictEqual(bi.rango, r.rango, 'el ángulo es el mismo; lo que cambia es dónde rechaza');
});

test('un patrón sin cargar se denuncia al validar, y antes no', () => {
  ok(problemasDe([VOZ, { ...MIC, patron: 'DESCONOCIDO' }])
    .some((x) => x.includes('patrón polar')), 'DESCONOCIDO pasaba sin un solo aviso');
  // Y no se lo trata como direccional: eso era adivinar justo lo que el valor
  // viene a declarar que no se sabe.
  const sinEjeNiPatron: ElementoCaptacion = {
    ...MIC, patron: 'DESCONOCIDO', emplazamiento: emplazar(PUNTO(2, 2, 1.6), 'EN_PIE'),
  };
  const p = problemasDe([VOZ, sinEjeNiPatron]);
  strictEqual(p.length, 1, `un solo problema, el del patrón: ${p.join(' | ')}`);
  ok(!p[0]?.includes('direccional'), p[0]);
});
