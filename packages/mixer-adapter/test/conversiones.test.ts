import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FADER_DB_MAXIMO, FADER_DB_MINIMO, GANANCIA_DB_MAXIMA, GANANCIA_DB_MINIMA,
  VERIFICADO_CONTRA_CONSOLA, dbAFader, dbAGanancia, faderADb, gananciaADb,
} from '../src/conversiones.ts';

test('solo el fader al cero es silencio', () => {
  assert.equal(faderADb(0), -Infinity);
  assert.ok(Number.isFinite(faderADb(0.0001)));
});

test('la curva del fader es continua: al afinar el paso, el salto se achica', () => {
  // El defecto que motiva estas pruebas: por debajo de 0,0625 se devolvia
  // -Infinity mientras justo encima la formula daba -43 dB. Un salto de 47 dB
  // en un movimiento imperceptible, y una lectura que pasaba de "bajo" a
  // "apagado" sin nada en medio.
  //
  // La comprobacion no puede ser "ningun salto supera N dB" a paso fijo: cerca
  // del cero una curva logaritmica es legitimamente empinada, y eso no es un
  // corte. Lo que distingue un corte de una pendiente es que la pendiente se
  // achica al afinar el paso y el corte no.
  const mayorSalto = (paso: number): number => {
    let peor = 0;
    let anterior = faderADb(paso);
    for (let v = paso * 2; v <= 1; v += paso) {
      const actual = faderADb(v);
      assert.ok(Number.isFinite(actual), `faderADb(${v}) no es finito`);
      peor = Math.max(peor, Math.abs(actual - anterior));
      anterior = actual;
    }
    return peor;
  };
  const grueso = mayorSalto(0.001);
  const fino = mayorSalto(0.0001);
  assert.ok(fino < grueso / 2,
    `con paso diez veces mas fino el mayor salto siguio en ${fino.toFixed(2)} dB ` +
    `(era ${grueso.toFixed(2)}): hay un corte, no una pendiente`);
});

test('no hay corte donde estaba el de -43 dB', () => {
  const antes = faderADb(0.0625 - 1e-6);
  const despues = faderADb(0.0625 + 1e-6);
  assert.ok(Number.isFinite(antes), 'justo debajo de 0,0625 volvio a ser silencio');
  assert.ok(Math.abs(despues - antes) < 0.001,
    `salto de ${(despues - antes).toFixed(1)} dB alrededor de 0,0625`);
});

test('la curva del fader no baja al subir', () => {
  let anterior = -Infinity;
  for (let v = 0; v <= 1; v += 0.001) {
    const actual = faderADb(v);
    assert.ok(actual >= anterior, `faderADb bajo de ${anterior} a ${actual} en ${v}`);
    anterior = actual;
  }
});

test('el fader se mantiene entre sus extremos', () => {
  assert.equal(faderADb(1), FADER_DB_MAXIMO);
  assert.equal(faderADb(2), FADER_DB_MAXIMO);
  for (let v = 0.000001; v < 1; v *= 2) {
    const db = faderADb(v);
    assert.ok(db >= FADER_DB_MINIMO && db <= FADER_DB_MAXIMO, `${db} fuera de rango en ${v}`);
  }
});

test('ida y vuelta del fader en el tramo no recortado', () => {
  for (let db = FADER_DB_MINIMO + 1; db <= FADER_DB_MAXIMO; db += 0.5) {
    const vuelta = faderADb(dbAFader(db));
    assert.ok(Math.abs(vuelta - db) < 1e-9, `${db} dB volvio como ${vuelta}`);
  }
});

test('fuera del tramo la vuelta elige el extremo, y esta bien que asi sea', () => {
  // Por debajo del minimo la curva esta recortada: muchos dB dan el mismo
  // valor de fader, asi que la inversa no puede existir. Se elige el cero.
  assert.equal(dbAFader(FADER_DB_MINIMO), 0);
  assert.equal(dbAFader(-200), 0);
  assert.equal(dbAFader(FADER_DB_MAXIMO), 1);
  assert.equal(dbAFader(200), 1);
});

test('la ganancia recorre el rango confirmado en la matriz', () => {
  assert.equal(gananciaADb(0), GANANCIA_DB_MINIMA);
  assert.equal(gananciaADb(1), GANANCIA_DB_MAXIMA);
  assert.equal(gananciaADb(0.5), (GANANCIA_DB_MINIMA + GANANCIA_DB_MAXIMA) / 2);
});

test('la ganancia se acota en vez de salirse del rango', () => {
  assert.equal(gananciaADb(-1), GANANCIA_DB_MINIMA);
  assert.equal(gananciaADb(2), GANANCIA_DB_MAXIMA);
  assert.equal(dbAGanancia(-100), 0);
  assert.equal(dbAGanancia(100), 1);
});

test('ida y vuelta de la ganancia', () => {
  for (let db = GANANCIA_DB_MINIMA; db <= GANANCIA_DB_MAXIMA; db += 0.5) {
    assert.ok(Math.abs(gananciaADb(dbAGanancia(db)) - db) < 1e-9);
  }
});

test('las conversiones siguen declaradas como no verificadas', () => {
  // Esta prueba falla el dia que alguien ponga la bandera en true. Es a
  // proposito: cambiarla significa que SPK-P0.2a dejo evidencia, y entonces
  // hay que actualizar tambien la matriz de capacidades y estas curvas, que
  // hoy son suposiciones con forma de funcion.
  assert.equal(VERIFICADO_CONTRA_CONSOLA, false,
    'si se midio la curva, actualiza las conversiones y la matriz de capacidades');
});
