import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodificarVuBuses } from '../src/vu-buses.ts';
import { VU_ESCALA } from '../src/protocol.ts';

const bytesABase64 = (xs: readonly number[]): string => Buffer.from(xs).toString('base64');

/**
 * La cola de VU2 es AUTODESCRIPTIVA: la cabecera dice cuantos hay de cada cosa.
 * Comprobado contra el aparato: la cabecera trae 24 2 6 4 10 y la trama mide
 * 306 bytes, que es 8 + 6*24 + 6*2 + 7*6 + 7*4 + 5*10 + 22 del general.
 */
function trama(entradas: number, medios: number, subs: number, fx: number, aux: number,
               relleno: (i: number) => number = () => 0, generales = 0, lineas = 0): number[] {
  // Cabecera: NINPUTS, NMEDIA, NSUBGROUPS, NFX, NAUX, NMASTERS, NLINEIN, cero.
  const b = [entradas, medios, subs, fx, aux, generales, lineas, 0];
  const cuerpo = 6 * entradas + 6 * medios + 7 * subs + 7 * fx + 5 * aux + 22;
  for (let i = 0; i < cuerpo; i++) b.push(relleno(i));
  return b;
}

test('las cuentas salen de la cabecera, no de numeros escritos a mano', () => {
  // Una consola imaginaria con otra configuracion: si las cuentas estuvieran
  // fijas en el codigo, esto leeria bytes de la seccion equivocada.
  const m = decodificarVuBuses(bytesABase64(trama(8, 1, 2, 1, 4)));
  assert.equal(m.reproductor.length, 1);
  assert.equal(m.subgrupos.length, 2);
  assert.equal(m.efectos.length, 1);
  assert.equal(m.auxiliares.length, 4);
});

test('el bloque estereo: +0/+1 son previos y +2/+3 posteriores al fader', () => {
  // Medido el 2026-09-09 moviendo s.0.mix con el canal 10 asignado: +2 y +3
  // bajaron 94 -> 50 -> 0 y +0 y +1 no se movieron.
  const b = trama(1, 0, 1, 0, 0);
  const o = 8 + 6 * 1;
  b[o + 0] = 94; b[o + 1] = 93; b[o + 2] = 50; b[o + 3] = 49; b[o + 6] = 247;
  const sub = decodificarVuBuses(bytesABase64(b)).subgrupos[0];
  assert.ok(sub !== undefined);
  assert.ok(Math.abs(sub.preIzq - 94 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs(sub.preDer - 93 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs(sub.postIzq - 50 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs(sub.postDer - 49 * VU_ESCALA) < 1e-9);
  assert.equal(sub.reduccionDb, 0, '247 es sin reduccion');
  assert.equal(sub.indicadorDePuerta, true, 'el bit 7 de 247 esta puesto');
});

test('el auxiliar es mono y su +1 es el que sigue al fader', () => {
  // Medido moviendo a.0.mix: el +1 bajo 104 -> 77 -> 37 y el +0 se quedo.
  const b = trama(1, 0, 0, 0, 1);
  const o = 8 + 6 * 1;
  b[o + 0] = 104; b[o + 1] = 37; b[o + 4] = 247;
  const aux = decodificarVuBuses(bytesABase64(b)).auxiliares[0];
  assert.ok(aux !== undefined);
  assert.ok(Math.abs(aux.pre - 104 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs(aux.post - 37 * VU_ESCALA) < 1e-9);
});

test('las secciones no comparten el paso, y por eso se leen en orden', () => {
  // Un subgrupo (7) y despues un auxiliar (5): si el auxiliar se leyera con el
  // paso del subgrupo, caeria cinco bytes mas alla y traeria basura.
  const b = trama(0, 0, 1, 0, 1);
  b[8 + 0] = 200;      // preIzq del subgrupo
  b[8 + 7 + 0] = 111;  // pre del auxiliar, justo despues del bloque de 7
  const m = decodificarVuBuses(bytesABase64(b));
  assert.ok(Math.abs((m.subgrupos[0]?.preIzq ?? 0) - 200 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs((m.auxiliares[0]?.pre ?? 0) - 111 * VU_ESCALA) < 1e-9);
});

test('una trama mas corta de lo que su cabecera promete no inventa nada', () => {
  const b = [2, 0, 4, 0, 0, 0, 0, 0, ...new Array<number>(12).fill(0)];
  assert.deepEqual(decodificarVuBuses(bytesABase64(b)).subgrupos, []);
});

/**
 * Contra una trama REAL, archivada el 2026-09-08 con musica entrando por las
 * RCA. Es la que destapo los dos rotulos invertidos de la cola.
 *
 * El proyecto llamaba "2 entradas de linea" a la seccion que va justo despues
 * de los canales, y decia que "los 22 bytes que sobran son el general". Las dos
 * cosas eran falsas: esa seccion es el REPRODUCTOR --que en esta trama esta en
 * silencio-- y los 22 finales son 10 del general y 12 de las entradas de linea,
 * que es donde esta la musica.
 *
 * Coincidian numericamente --reproductor y linea son los dos dos bloques de
 * seis-- y por eso el "censo del vocabulario" que se presento como
 * comprobacion independiente no podia distinguirlos.
 */
test('trama real: la musica de las RCA aparece en las entradas de linea, no en el reproductor', () => {
  const m = decodificarVuBuses('GAIGBAoCAgAAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAHcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPdyclBycvdyck1ycvcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPdnQmdn92dCAGf3cnJDcnL3cnJCcnL3');

  assert.equal(m.entradasDeLinea.length, 2);
  for (const linea of m.entradasDeLinea) {
    assert.ok(linea.entrada > 0.4, 'las RCA traian musica');
  }
  for (const r of m.reproductor) {
    assert.equal(r.entrada, 0, 'el reproductor estaba parado');
  }

  assert.ok(m.general !== null, 'el general se decodifica');
  assert.ok(m.general.izquierdo.pre > 0.4);
  assert.ok(m.general.derecho.pre > 0.4);
  // El general suma los dos canales de linea, asi que tiene senal aunque la
  // aplicacion no supiera leerlo hasta hoy.
  assert.ok(m.general.izquierdo.post > 0, 'y su post-fader tambien');
});

/**
 * El byte 5 es la cantidad de generales, no el 6.
 *
 * En una Ui24R los dos valen 2 y no se distingue midiendo. Lo fijan dos
 * implementaciones de terceros independientes --UI24RBridge y DigiMixer-- que
 * nombran la cabecera igual, y el orden de las secciones en la trama. El
 * mixer.html avanza el general con charCodeAt(6), que en esta consola da lo
 * mismo; este test es lo unico que impide volver a seguirlo.
 */
test('la cantidad de generales sale del byte 5 de la cabecera', () => {
  // Un general y NINGUNA linea: si se leyera del byte 6, no encontraria nada.
  const b = trama(0, 0, 0, 0, 0, () => 0, 2, 0);
  b[8 + 0] = 150; b[8 + 1] = 90;
  b[8 + 5] = 140; b[8 + 6] = 80;
  const m = decodificarVuBuses(bytesABase64(b));
  assert.ok(m.general !== null, 'el general se encuentra con la cuenta del byte 5');
  assert.ok(Math.abs(m.general.izquierdo.pre - 150 * VU_ESCALA) < 1e-9);
  assert.ok(Math.abs(m.general.derecho.pre - 140 * VU_ESCALA) < 1e-9);
});
