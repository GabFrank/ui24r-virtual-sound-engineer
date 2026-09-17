import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/engine.ts';
import { DiarioEnMemoria, entradaDesdeCambios } from '../src/journal.ts';
import type { CambioRegistrado } from '../src/journal.ts';
import { historialDeLaSesion } from '../src/historial-de-la-sesion.ts';
import { contexto, crudoDeEnvio } from './helpers.ts';
import type { CambioPropuesto } from '../src/types.ts';

/**
 * El circuito entero: se escribe, queda en el diario, el historial lo dobla y
 * el motor frena.
 *
 * **Por qué no alcanzaban los tests que ya había.** `engine.test.ts` prueba que
 * el motor frena **cuando se le pasa un contexto con historial**, y lo hace
 * bien. Lo que nadie probaba es que **alguien se lo pase**: los dos servicios
 * de producción le entregaban mapas vacíos, así que las dos reglas estaban
 * verdes en los tests y muertas en la aplicación. Es la forma de INV-034 --una
 * invariante viva pero inerte-- y de `techoPorRuta`, que también consultaba un
 * mapa que nadie llenaba.
 *
 * Este test recorre el circuito completo con el diario de verdad en el medio.
 */

const SESION = 's1';
const RUTA = 'i.3.aux.1.value';
const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };

function paso(desdeDb: number, hastaDb: number): CambioPropuesto {
  return {
    kind: 'MONITOR_AUX_SEND', path: RUTA, unidad: 'dB',
    valorPropuesto: crudoDeEnvio(hastaDb), valorEsperado: crudoDeEnvio(desdeDb),
    magnitudPropuesta: hastaDb, magnitudEsperada: desdeDb,
  };
}

/** Escribe en el diario un paso ya aplicado y confirmado, como hace el ejecutor. */
async function yaAplicado(
  diario: DiarioEnMemoria, id: string, c: CambioPropuesto, medicionPosteriorId: string | null,
  nivelEstablecidoEn: readonly string[] = [],
): Promise<void> {
  const entrada = entradaDesdeCambios(
    id, SESION, 'rampa', 'ASSISTED', null, [c], new Map([[c.path, c.valorEsperado]]),
  );
  await diario.abrir({
    ...entrada, creadoEl: `2026-09-17T10:0${id}:00.000Z`, medicionPosteriorId,
    nivelEstablecidoEn,
  });
  const registrado: CambioRegistrado = {
    ...entrada.cambios[0]!, enviadoEl: 'ya', confirmadoPor: 'WITNESS', verificado: true,
  };
  await diario.registrarCambio(id, 0, registrado);
}

async function contextoDesdeElDiario(diario: DiarioEnMemoria) {
  return contexto(historialDeLaSesion(await diario.deLaSesion(SESION)));
}

test('un segundo paso sin haber escuchado se frena, y antes no se frenaba', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();

  // Primer paso de la rampa: la ruta no se toco nunca, pasa.
  const primero = e.evaluar([paso(-32, -30)], await contextoDesdeElDiario(diario), ok);
  assert.equal(primero.permitido, true, 'el primer paso de una rampa tiene que pasar');

  // Se aplica y queda en el diario SIN medicion posterior anotada.
  await yaAplicado(diario, '1', paso(-32, -30), null);

  // Segundo paso: el motor ahora ve que la ruta se toco y que nadie escucho.
  const segundo = e.evaluar([paso(-30, -28)], await contextoDesdeElDiario(diario), ok);
  assert.equal(segundo.permitido, false,
    'mover dos veces sin escuchar en el medio es lo que la regla 4 prohibe');
  assert.ok(
    !segundo.permitido && segundo.rechazos.some((r) => /medici[oó]n/i.test(r.mensaje)),
    'y el motivo tiene que decir que falta la medicion',
  );

  // Con el contexto vacio --lo que la aplicacion pasaba hasta hoy-- pasaba.
  const comoAntes = e.evaluar([paso(-30, -28)], contexto(), ok);
  assert.equal(comoAntes.permitido, true,
    'CONTROL: con el historial vacio el segundo paso pasaba, que es el agujero');
});

test('habiendo escuchado, la rampa sigue', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  await yaAplicado(diario, '1', paso(-32, -30), 'm-1');
  const segundo = e.evaluar([paso(-30, -28)], await contextoDesdeElDiario(diario), ok);
  assert.equal(segundo.permitido, true, 'se escucho: el paso siguiente esta autorizado');
});

/**
 * **Este test decia lo contrario hasta el 2026-09-17, y decia bien lo que el
 * motor hacia y mal lo que tenia que hacer.** Comprobaba que el presupuesto de
 * 4 dB frenaba la rampa al tercer paso, que es exactamente la imposibilidad que
 * ADR-034 destapo: levantar una cuña desde el piso del tramo medido hasta un
 * nivel de trabajo son mas de veinte decibeles, y con 4 por sesion el paso 3 del
 * soundcheck del usuario --«levanto el volumen del aux para que el musico tenga
 * referencia»-- no se podia dar. Nadie lo habia notado porque ninguna pantalla
 * llamaba al servicio.
 *
 * Lo que reemplaza al presupuesto mientras la cuña no tiene nivel es el techo de
 * nominal, y el test de abajo lo comprueba. **No se saco un freno: se cambio uno
 * por otro**, y por eso los dos tests van juntos.
 */
test('mientras la cuña no tiene nivel, el presupuesto no frena la rampa', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  // Tres pasos de 2 dB, cada uno con su escucha: seis decibeles movidos, mas
  // del presupuesto de 4. Antes el tercero se rechazaba.
  await yaAplicado(diario, '1', paso(-32, -30), 'm-1');
  await yaAplicado(diario, '2', paso(-30, -28), 'm-2');

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 4, 'lleva cuatro decibeles movidos');
  assert.equal(historial.rutasConNivelEstablecido.has(RUTA), false,
    'nadie dijo todavia que asi esta bien');

  const tercero = e.evaluar([paso(-28, -26)], contexto(historial), ok);
  assert.equal(tercero.permitido, true,
    'poner el nivel de una cuña no tiene presupuesto acumulado: lo acota el techo');
});

test('el techo de nominal es lo que frena la rampa', async () => {
  const e = new SafetyEngine();
  // Sin nivel establecido y sin nada movido: lo unico que puede frenar es el techo.
  const hastaNominal = e.evaluar([paso(-2, 0)], contexto(), ok);
  assert.equal(hastaNominal.permitido, true, 'llegar a nominal esta permitido');

  const masAlla = e.evaluar([paso(-1, 1)], contexto(), ok);
  assert.equal(masAlla.permitido, false, 'pasar de nominal es decision del usuario');
  assert.ok(
    !masAlla.permitido && masAlla.rechazos.some((r) => r.codigo === 'TECHO_ABSOLUTO'),
    'y el motivo es el techo, no el salto: el paso era de 2 dB, dentro del tope',
  );
});

test('establecido el nivel, el presupuesto vuelve y se mide desde ahi', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  // Una rampa larga --diez decibeles, mucho mas que el presupuesto-- y al final
  // el musico dice que asi esta bien: ahi queda el ancla.
  await yaAplicado(diario, '1', paso(-32, -30), 'm-1');
  await yaAplicado(diario, '2', paso(-30, -28), 'm-2');
  await yaAplicado(diario, '3', paso(-28, -26), 'm-3');
  await yaAplicado(diario, '4', paso(-26, -24), 'm-4');
  await yaAplicado(diario, '5', paso(-24, -22), 'm-5', [RUTA]);

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 0,
    'el ancla mueve la referencia: el retoque no nace con el presupuesto gastado');
  assert.ok(historial.rutasConNivelEstablecido.has(RUTA));

  // Ahora si rige el presupuesto, y se cuenta desde los -22 en que quedo.
  assert.equal(e.evaluar([paso(-22, -20)], contexto(historial), ok).permitido, true,
    'un retoque de 2 dB desde el nivel establecido entra');
});

test('desde el nivel establecido, el presupuesto de 4 dB vuelve a frenar', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  await yaAplicado(diario, '1', paso(-32, -22), 'm-1', [RUTA]);
  await yaAplicado(diario, '2', paso(-22, -20), 'm-2');
  await yaAplicado(diario, '3', paso(-20, -18), 'm-3');

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 4, 'cuatro decibeles desde el ancla');

  const cuarto = e.evaluar([paso(-18, -16)], contexto(historial), ok);
  assert.equal(cuarto.permitido, false, 'retocar tiene el presupuesto de ADR-028 otra vez');
  assert.ok(
    !cuarto.permitido && cuarto.rechazos.some((r) => r.codigo === 'ACUMULADO_EXCEDIDO'),
    'y lo que frena es el presupuesto, no el techo: -16 esta muy por debajo de nominal',
  );
});

/**
 * **El techo rige tambien al retocar, y es una decision del usuario del
 * 2026-09-17.** ADR-034 lo escribio pensando en la subida desde el piso y dejo
 * el retoque con «los topes de ADR-028 sin cambios»; asi, un nivel establecido
 * apenas debajo de nominal se cruzaba con un retoque normal. Preguntado entre
 * tres opciones, eligio que el techo rija siempre.
 */
test('el techo de nominal rige tambien cuando se retoca', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  // La cuña quedo establecida en -1 dB, apenas debajo de nominal. La rampa que
  // la llevo hasta ahi va resumida en una sola entrada del diario: lo que este
  // test prueba es el retoque posterior, no la subida.
  await yaAplicado(diario, '1', paso(-32, -1), 'm-1', [RUTA]);
  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));

  const retoque = e.evaluar([paso(-1, 1)], contexto(historial), ok);
  assert.equal(retoque.permitido, false,
    'el presupuesto lo permitiria --2 de 4-- y el techo no');
  assert.ok(
    !retoque.permitido && retoque.rechazos.some((r) => r.codigo === 'TECHO_ABSOLUTO'),
  );
  // Y hacia abajo el retoque sigue teniendo su presupuesto entero.
  assert.equal(e.evaluar([paso(-1, -3)], contexto(historial), ok).permitido, true);
});

test('volver hacia donde estaba devuelve presupuesto', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  await yaAplicado(diario, '1', paso(-32, -30), 'm-1');
  await yaAplicado(diario, '2', paso(-30, -32), 'm-2');
  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 0, 'subio dos y bajo dos');
  assert.equal(e.evaluar([paso(-32, -30)], contexto(historial), ok).permitido, true);
});
