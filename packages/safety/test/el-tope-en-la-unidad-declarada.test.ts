import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verificarLimite } from '@vse/domain';
import { SafetyEngine } from '../src/engine.ts';
import type { CambioPropuesto } from '../src/types.ts';
import { contexto } from './helpers.ts';

/**
 * **El tope de INV-004 tiene que estar en la unidad que INV-004 declara.**
 *
 * Hasta el 2026-09-11 el motor calculaba el delta como
 * `valorPropuesto - valorEsperado` --en CRUDO-- y lo comparaba contra
 * `LIMITES[kind].porTransaccion`, que esta en decibeles. El crudo de un
 * parametro va de 0 a 1 y el tope de la ganancia es 3: **el tope por
 * transaccion no se podia disparar nunca**.
 *
 * El campo `unidad` de `CambioPropuesto` existia desde el principio y no lo
 * leia nadie: se copiaba al diario y ahi moria. O sea que el diario registraba
 * «dB» al lado de un numero que no eran decibeles.
 *
 * **Y toda la suite estaba verde.** Los tests declaraban `unidad: 'dB'` y
 * pasaban valores que SI eran decibeles, asi que modelaban un universo donde el
 * defecto no existe. El unico llamador de produccion --el servicio que aplica
 * la ganancia-- pasaba crudo.
 */

/** El recorrido del previo de esta consola, medido (SPK-P0.2a, 2026-09-10). */
const GANANCIA_MINIMA_DB = -6;
const GANANCIA_MAXIMA_DB = 55.9;

/** Un cambio armado como lo arma produccion: crudo al cable, dB al control. */
function comoProduccion(
  crudoDesde: number, crudoHasta: number, dbDesde: number, dbHasta: number,
): CambioPropuesto {
  return {
    kind: 'PREAMP_GAIN', path: 'hw.3.gain', unidad: 'dB',
    valorPropuesto: crudoHasta, valorEsperado: crudoDesde,
    magnitudPropuesta: dbHasta, magnitudEsperada: dbDesde,
  };
}

const ok = { conexionPermiteEscribir: true, snapshotVerificado: true };

test('el previo de punta a punta se rechaza por exceder el tope', () => {
  const e = new SafetyEngine();
  // El caso extremo real: el previo entero, de -6,0 a +55,9 dB. En crudo son
  // 0,985, que es menos que el tope de 3 y por eso pasaba.
  const v = e.evaluar(
    [comoProduccion(0, 0.985, GANANCIA_MINIMA_DB, GANANCIA_MAXIMA_DB)],
    contexto(), ok,
  );
  assert.equal(v.permitido, false, 'un salto de 61,9 dB no puede pasar un tope de 3');
  assert.ok(
    !v.permitido && v.rechazos.some((r) => r.codigo === 'DELTA_EXCEDIDO'),
    'y tiene que rechazarse POR EL TOPE, no por otra regla que dé el mismo veredicto',
  );
});

/**
 * **Control positivo, y es el que mide el hueco.**
 *
 * Sin esto, el test de arriba no distingue «el tope funciona» de «el motor
 * rechaza todo por algun otro motivo». Acá se le pregunta al control de limites
 * directamente, con el delta que el codigo viejo le pasaba.
 */
test('control positivo: con el delta en crudo el tope no se dispara', () => {
  const ctx = {
    kind: 'PREAMP_GAIN' as const, acumuladoEnSesion: 0,
    hayMedicionPosterior: true, esPrimerCambioDelParametro: true,
  };
  // Lo que el motor calculaba antes: 0,985 - 0 = 0,985, contra un tope de 3.
  assert.equal(
    verificarLimite({ ...ctx, deltaSolicitado: 0.985 }).permitido, true,
    'el crudo entero del previo pasa el tope de 3 dB: ESE era el defecto',
  );
  // Lo que calcula ahora.
  assert.equal(
    verificarLimite({ ...ctx, deltaSolicitado: GANANCIA_MAXIMA_DB - GANANCIA_MINIMA_DB }).permitido,
    false,
    'los mismos dos valores, en decibeles, se rechazan',
  );
});

test('un cambio de verdad pequeno sigue pasando', () => {
  const e = new SafetyEngine();
  // Dos decibeles, que es lo que una recomendacion de ganancia propone de
  // verdad. Si esto fallara, el arreglo habria cerrado la puerta entera.
  const v = e.evaluar([comoProduccion(0.40, 0.43, 12, 14)], contexto(), ok);
  assert.equal(v.permitido, true, 'dos decibeles estan dentro del tope de tres');
});

test('el tope acumulado tambien mira decibeles', () => {
  const e = new SafetyEngine();
  const ruta = 'hw.3.gain';
  // Ya se movio 5 dB en la sesion; otros 2 lo dejarian en 7, y el maximo es 6.
  const ctx = {
    ...contexto(),
    acumuladoPorRuta: new Map([[ruta, 5]]),
    rutasYaTocadas: new Set([ruta]),
    rutasConMedicionPosterior: new Set([ruta]),
  };
  const v = e.evaluar([comoProduccion(0.40, 0.43, 12, 14)], ctx, ok);
  assert.equal(v.permitido, false, 'quedaria a 7 dB del valor inicial y el tope es 6');
  assert.ok(
    !v.permitido && v.rechazos.some((r) => r.codigo === 'ACUMULADO_EXCEDIDO'),
  );
});

/**
 * **La guarda contra la recaida, que el compilador no puede dar.**
 *
 * TypeScript obliga a que los campos ESTEN, porque son obligatorios a
 * proposito. Lo que no puede ver es que alguien los llene con el crudo:
 * `magnitudPropuesta: crudo` compila igual de bien y devuelve el defecto
 * entero, en silencio y con la suite en verde.
 *
 * Esta guarda mira el codigo de produccion --no los tests, donde los dos
 * numeros SON el mismo a proposito-- y exige que el valor crudo y la magnitud
 * no salgan del mismo sitio.
 */
test('ningun sitio de produccion pasa el crudo como si fuera la magnitud', () => {
  const RAIZ = join(import.meta.dirname, '..', '..', '..');
  const fuentes = (dir: string, salida: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n === 'dist' || n === '.git' || n === 'android'
        || n === 'test' || n === 'tests') continue;
      const r = join(dir, n);
      if (statSync(r).isDirectory()) fuentes(r, salida);
      else if (/\.ts$/.test(n) && !/\.d\.ts$|\.test\.ts$/.test(n)) salida.push(r);
    }
    return salida;
  };

  const malos: string[] = [];
  let vistos = 0;
  for (const f of [...fuentes(join(RAIZ, 'packages')), ...fuentes(join(RAIZ, 'apps'))]) {
    const texto = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    // **La coma es lo que separa un literal de una declaracion de tipo.** Sin
    // exigirla, el propio `types.ts` entraba como hallazgo: alli los dos campos
    // se llaman igual --`number`-- y terminan en punto y coma. Una guarda que
    // se denuncia a si misma se apaga en una semana.
    for (const m of texto.matchAll(
      /valorPropuesto:\s*([A-Za-z_$][\w$.]*)\s*,[\s\S]{0,500}?magnitudPropuesta:\s*([A-Za-z_$][\w$.]*)\s*,/g,
    )) {
      vistos++;
      if (m[1] === m[2]) malos.push(`${f.slice(RAIZ.length + 1)}: ${m[1]}`);
    }
  }
  // **Centinela**: si el barrido no encuentra nada, este test celebra el
  // conjunto vacio. Hoy hay exactamente un sitio de produccion que construye
  // cambios; si aparece otro, esto sube y hay que mirarlo.
  assert.equal(vistos, 1, 'sitios de produccion que construyen un CambioPropuesto');
  assert.deepEqual(malos, [], 'el crudo pasado como magnitud: el defecto de vuelta');
});
