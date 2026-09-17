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
): Promise<void> {
  const entrada = entradaDesdeCambios(
    id, SESION, 'rampa', 'ASSISTED', null, [c], new Map([[c.path, c.valorEsperado]]),
  );
  await diario.abrir({ ...entrada, creadoEl: `2026-09-17T10:0${id}:00.000Z`, medicionPosteriorId });
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

test('el presupuesto por sesion frena la rampa, y antes no frenaba nada', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();
  // Tres pasos de 2 dB, cada uno con su escucha: seis decibeles movidos. El
  // tope del envio a monitor es 4 por sesion, asi que el tercero no entra.
  await yaAplicado(diario, '1', paso(-32, -30), 'm-1');
  await yaAplicado(diario, '2', paso(-30, -28), 'm-2');

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION));
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 4, 'lleva cuatro decibeles movidos');

  const tercero = e.evaluar([paso(-28, -26)], contexto(historial), ok);
  assert.equal(tercero.permitido, false, 'el tercer paso se pasa del presupuesto');

  // Y esto es lo que la aplicacion hacia hasta hoy: cada paso parecia el primero.
  assert.equal(e.evaluar([paso(-28, -26)], contexto(), ok).permitido, true,
    'CONTROL: con el historial vacio la rampa seguia sin fin');
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
