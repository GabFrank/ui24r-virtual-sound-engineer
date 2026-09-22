import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PONER_LA_BANDA } from '@vse/domain';
import { entrada } from '@vse/mixer-adapter';
import { SafetyEngine } from '../src/engine.ts';
import type { CambioPropuesto } from '../src/types.ts';
import { contexto } from './helpers.ts';

/**
 * «Poner la banda» en el motor (ADR-039, decisión 3).
 *
 * **La etiqueta es necesaria y no suficiente**: el motor comprueba que los tres
 * cambios tengan la forma que la etiqueta declara. Y **la exención del salto
 * libre todavía NO está encendida**, porque falta medir que una campana neutra
 * se corre sin que la respuesta se mueva; así que lo observable hoy es que la
 * forma se exige y que un salto grande se sigue rechazando por el tope.
 *
 * **Los pares crudo/magnitud van atados por la ley medida**, con `toRaw` de la
 * propia tabla y no con números escritos a mano: si no, lo que rechazaría sería
 * `verificarAtadura` y el test pasaría por la razón equivocada.
 */
function hoja(path: string, desde: number, hasta: number): CambioPropuesto {
  const e = entrada(path);
  assert.ok(e !== undefined && e.estado === 'PROBADO', `${path} sin ley medida`);
  return {
    kind: path.includes('.hpf.') ? 'HPF' : 'CHANNEL_EQ',
    path,
    unidad: e.unidad,
    valorEsperado: e.toRaw(desde),
    valorPropuesto: e.toRaw(hasta),
    magnitudEsperada: desde,
    magnitudPropuesta: hasta,
  } as CambioPropuesto;
}

const gain = (db: number, canal = 9, banda = 2) => hoja(`i.${canal}.eq.b${banda}.gain`, db === 0 ? 3 : 0, db);
const freq = (hasta: number, canal = 9, banda = 2) => hoja(`i.${canal}.eq.b${banda}.freq`, 1000, hasta);
const q = (hasta: number, canal = 9, banda = 2) => hoja(`i.${canal}.eq.b${banda}.q`, 1.0, hasta);

const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };
const poniendo = { ...ok, tipoDeOperacion: PONER_LA_BANDA };

const motivos = (v: ReturnType<SafetyEngine['evaluar']>) =>
  (v.permitido ? [] : v.rechazos.map((r) => r.codigo));

test('la forma correcta no se rechaza POR LA FORMA', () => {
  // Ganancia a cero, frecuencia y ancho de la misma banda del mismo canal, en
  // ese orden. Con un movimiento chico --1000 a 1200 Hz son 0,26 octavas y el Q
  // de 1,0 a 1,2 son 0,22 octavas de ancho-- pasa entera.
  const v = new SafetyEngine().evaluar([gain(0), freq(1200), q(1.2)], contexto(), poniendo);
  assert.equal(v.permitido, true, motivos(v).join(', '));
});

test('el orden equivocado se rechaza, y con su propio codigo', () => {
  // La frecuencia antes que la ganancia saca el salto al cable con la campana
  // todavia en su ganancia vieja. El ejecutor escribe uno por uno: eso se oye.
  const v = new SafetyEngine().evaluar([freq(1200), gain(0), q(1.2)], contexto(), poniendo);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('PONER_LA_BANDA_MAL_FORMADA'), motivos(v).join(', '));
  // **Y el mensaje dice cual de las cinco condiciones fallo**, que es lo que
  // necesita quien la propuso: con un solo motivo generico habria que adivinar.
  const r = !v.permitido && v.rechazos.find((x) => x.codigo === 'PONER_LA_BANDA_MAL_FORMADA');
  assert.ok(r && /orden/.test(r.mensaje), r ? r.mensaje : '');
});

test('la ganancia que no queda en cero se rechaza', () => {
  // Medio decibel ya es una campana, y el permiso sale de que quede muda.
  const v = new SafetyEngine().evaluar([gain(0.5), freq(1200), q(1.2)], contexto(), poniendo);
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('PONER_LA_BANDA_MAL_FORMADA'));
});

test('otra banda u otro canal no son la misma campana', () => {
  const e = new SafetyEngine();
  const otraBanda = e.evaluar([gain(0), freq(1200, 9, 3), q(1.2, 9, 3)], contexto(), poniendo);
  assert.ok(motivos(otraBanda).includes('PONER_LA_BANDA_MAL_FORMADA'));
  const otroCanal = e.evaluar([gain(0), freq(1200, 10), q(1.2, 10)], contexto(), poniendo);
  assert.ok(motivos(otroCanal).includes('PONER_LA_BANDA_MAL_FORMADA'));
});

test('la etiqueta sobre cualquier otra cosa no se la lleva de arriba', () => {
  // Es la forma de `correspondeExencionDeSistema`: la etiqueta la pone quien
  // quiere el permiso, asi que el contenido tiene que respaldarla. Tres hojas
  // del pasa-altos no son poner una banda.
  const v = new SafetyEngine().evaluar(
    [gain(0), gain(0, 9, 3), gain(0, 9, 4)], contexto(), poniendo,
  );
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('PONER_LA_BANDA_MAL_FORMADA'), motivos(v).join(', '));
});

test('sin la etiqueta, la forma correcta no pide nada distinto', () => {
  // La comprobacion es una EXIGENCIA sobre quien declara la operacion, no un
  // permiso que se conceda por parecerse: los mismos tres cambios sin etiqueta
  // se juzgan como tres cambios normales, y pasan porque son chicos.
  const v = new SafetyEngine().evaluar([gain(0), freq(1200), q(1.2)], contexto(), ok);
  assert.equal(v.permitido, true, motivos(v).join(', '));
  assert.ok(!motivos(v).includes('PONER_LA_BANDA_MAL_FORMADA'));
});

/**
 * **La exención del salto libre NO está encendida, y este test lo fija.**
 *
 * ADR-039 la deja condicionada a una medición que falta: correr una campana
 * neutra a lo largo del tramo medido y comprobar que la respuesta no se mueve.
 * Lo que hay hoy es una cota sobre una configuración quieta y la teoría del
 * filtro, y eso no es lo mismo. Hasta que esa medición exista, la forma se
 * exige y el salto se sigue acotando.
 *
 * **Si este test empieza a fallar porque el salto pasa, la exención se
 * encendió**: eso es una decisión que necesita la medición primero, y toca la
 * consola del usuario.
 */
test('la exencion del salto libre sigue apagada: la forma correcta no exime del tope', () => {
  // 1000 -> 4000 Hz son dos octavas, con la campana en cero y la forma perfecta.
  const v = new SafetyEngine().evaluar([gain(0), freq(4000), q(2.5)], contexto(), poniendo);
  assert.equal(v.permitido, false, 'el salto libre todavia no esta medido');
  assert.ok(!motivos(v).includes('PONER_LA_BANDA_MAL_FORMADA'), 'y no es por la forma');
  assert.ok(motivos(v).includes('DELTA_EXCEDIDO'), motivos(v).join(', '));
});

test('INV-005: poner la banda no entra en AUTO, que admite un solo parametro', () => {
  // Tres cambios contra el maximo de cuatro de ASSISTED entran; en AUTO el
  // maximo es uno, y eso es coherente con que poner una banda es un movimiento
  // grande. La etiqueta no toca el maximo: no es una operacion de sistema.
  const v = new SafetyEngine().evaluar(
    [gain(0), freq(1200), q(1.2)],
    contexto({ nivelAutonomia: 'AUTO', confianza: 'HIGH' }),
    poniendo,
  );
  assert.equal(v.permitido, false);
  assert.ok(motivos(v).includes('DEMASIADOS_PARAMETROS'), motivos(v).join(', '));
});
