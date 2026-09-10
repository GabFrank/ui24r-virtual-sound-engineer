import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Redondeo a n decimales: 24 - 1,15 no da 22,85 exacto en coma flotante. */
function redondear(v: number, n: number): number {
  return Math.round(v * 10 ** n) / 10 ** n;
}
import {
  FADER_DB_MAXIMO, FADER_DB_MINIMO, FADER_POSICION_0_DB, GANANCIA_DB_MAXIMA,
  GANANCIA_DB_MINIMA, GANANCIA_ESCALONES, ORIGEN_DE_LAS_CURVAS,
  VERIFICADO_CONTRA_CONSOLA, dbAFader, dbAGanancia, faderADb, gananciaADb,
  gananciaAlcanzable, rawParaGananciaMasCercana,
  CORRECCION_PREVIO_DB,
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

test('la ganancia recorre el rango confirmado, con la correccion medida', () => {
  // El piso no cambia: la correccion empieza en 26 dB. El techo si, y esa
  // diferencia es el hallazgo: la consola dice 57 y el previo entrega 55,85.
  assert.equal(gananciaADb(0), GANANCIA_DB_MINIMA);
  assert.equal(gananciaADb(1), GANANCIA_DB_MAXIMA + CORRECCION_PREVIO_DB);
});

test('la ganancia NO es lineal: la consola indexa una tabla', () => {
  // Esta prueba reemplaza a `gananciaADb(0.5) === (min + max) / 2`, que era la
  // suposicion anterior. La consola hace `ui24pgains[trunc(64*v)] - 1`, no una
  // recta. En el medio del recorrido la recta erraba medio decibel, y no es
  // parejo: erra mas en unos tramos que en otros.
  const recta = (v: number): number =>
    GANANCIA_DB_MINIMA + v * (GANANCIA_DB_MAXIMA - GANANCIA_DB_MINIMA);
  assert.equal(gananciaADb(0.5), 26 + CORRECCION_PREVIO_DB,
    'la tabla dice 26 dB en la mitad del recorrido y el previo entrega 1,15 menos');
  assert.equal(recta(0.5), 25.5, 'la recta que se suponia antes daba 25,5');
  let peor = 0;
  for (let i = 0; i <= 1000; i++) {
    peor = Math.max(peor, Math.abs(gananciaADb(i / 1000) - recta(i / 1000)));
  }
  assert.ok(peor > 1,
    `si la recta se aleja menos de 1 dB de la tabla, revisa la tabla: se aleja ${peor}`);
});

test('la ganancia tiene 48 escalones, y no son parejos', () => {
  // Lo que el asistente de ganancia tiene que respetar: no hay medio escalon.
  assert.equal(GANANCIA_ESCALONES.length, 48);
  assert.equal(GANANCIA_ESCALONES[0], GANANCIA_DB_MINIMA);
  assert.equal(GANANCIA_ESCALONES[GANANCIA_ESCALONES.length - 1],
    GANANCIA_DB_MAXIMA + CORRECCION_PREVIO_DB);
  // De 2 en 2 hasta +24, de 1 en 1 desde ahi. El salto de 24 a 26 que la tabla
  // de la consola declara como de 2 dB vale en realidad mucho menos. Este 0,85
  // es lo que da la correccion de 1,15; lo MEDIDO contra el aparato fue 0,71, y
  // la diferencia cae dentro de las dos decimas de incertidumbre que declara la
  // evidencia. O sea que el numero es derivado, no medido.
  for (let i = 1; i < GANANCIA_ESCALONES.length; i++) {
    const salto = redondear(GANANCIA_ESCALONES[i]! - GANANCIA_ESCALONES[i - 1]!, 2);
    const anterior = GANANCIA_ESCALONES[i - 1]!;
    const esperado = anterior === 24 ? 0.85 : (GANANCIA_ESCALONES[i]! <= 24 ? 2 : 1);
    assert.equal(salto, esperado,
      `salto de ${salto} dB hasta ${GANANCIA_ESCALONES[i]}, se esperaba ${esperado}`);
  }
});

test('encadenar las dos conversiones no da el escalon mas cercano', () => {
  // El desajuste que esta prueba fija por escrito: `GAIN24toV` reparte el
  // recorrido en 63 partes y `VtoGAIN24` lo trunca sobre 64 indices.
  //
  // La primera version de esta prueba afirmaba "siempre cae por debajo" y la
  // prueba la desmintio: 9,75 dB sube a 10. El sesgo es mayormente hacia abajo
  // pero no siempre, y esa es justo la clase de regla que conviene medir en vez
  // de suponer.
  assert.equal(gananciaAlcanzable(11.5), 10, 'pedir 11,5 aterriza en 10');
  assert.equal(gananciaAlcanzable(9.75), 10, 'y 9,75 sube a 10');
  let porArriba = 0;
  let porAbajo = 0;
  for (let i = 0; i <= 25200; i++) {
    const db = GANANCIA_DB_MINIMA + i * 0.0025;
    if (db > GANANCIA_DB_MAXIMA) break;
    const caida = gananciaAlcanzable(db);
    assert.ok(GANANCIA_ESCALONES.includes(caida), `${caida} no es un escalon`);
    porArriba = Math.max(porArriba, caida - db);
    porAbajo = Math.max(porAbajo, db - caida);
  }
  assert.ok(porAbajo > 1.9 && porAbajo < 2,
    `desvio por abajo de ${porAbajo.toFixed(3)} dB, se esperaba cerca de 1,97`);
  assert.ok(porArriba > 0.9 && porArriba < 1,
    `desvio por arriba de ${porArriba.toFixed(3)} dB, se esperaba cerca de 0,98`);
});

test('para elegir bien hay que ir al escalon mas cercano, no al de abajo', () => {
  // Lo que un asistente tiene que hacer: 11,5 esta mas cerca de 12 que de 10.
  assert.equal(gananciaADb(rawParaGananciaMasCercana(11.5)), 12);
  assert.equal(gananciaADb(rawParaGananciaMasCercana(11.4)), 12);
  assert.equal(gananciaADb(rawParaGananciaMasCercana(10.6)), 10);
  for (const db of GANANCIA_ESCALONES) {
    assert.equal(gananciaADb(rawParaGananciaMasCercana(db)), db,
      `${db} dB es un escalon y deberia elegirse a si mismo`);
  }
  const techo = GANANCIA_DB_MAXIMA + CORRECCION_PREVIO_DB;
  for (let db = GANANCIA_DB_MINIMA; db <= techo; db += 0.25) {
    const elegido = gananciaADb(rawParaGananciaMasCercana(db));
    assert.ok(GANANCIA_ESCALONES.includes(elegido));
    // Un escalon y medio: el salto de 24 a 24,85 es el mas angosto y el de 24
    // hacia abajo mide 2, asi que en esa zona la mitad de un salto llega a 1.
    assert.ok(Math.abs(elegido - db) <= 1.05,
      `${db} dB fue a ${elegido}, demasiado lejos`);
  }
});

test('la ganancia se acota en vez de salirse del rango', () => {
  assert.equal(gananciaADb(-1), GANANCIA_DB_MINIMA);
  assert.equal(gananciaADb(2), GANANCIA_DB_MAXIMA + CORRECCION_PREVIO_DB);
  assert.equal(dbAGanancia(-100), 0);
  assert.equal(dbAGanancia(100), 1);
});

test('ida y vuelta de la ganancia, escalon por escalon', () => {
  // Antes se recorria de 0,5 en 0,5 dB y se exigia cierre exacto. Eso solo
  // podia pasar con una recta. El destino es escalonado: la unica ida y vuelta
  // que tiene sentido exigir es la de los valores que la consola puede tomar,
  // y esa cierra exacta en los 48.
  for (const db of GANANCIA_ESCALONES) {
    assert.equal(gananciaADb(dbAGanancia(db)), db, `${db} dB no volvio igual`);
  }
});

test('ningun valor crudo cae fuera de la tabla de ganancia', () => {
  for (let i = 0; i <= 2000; i++) {
    const db = gananciaADb(i / 2000);
    assert.ok(GANANCIA_ESCALONES.includes(db), `${db} dB no es un escalon`);
  }
});

test('el fader llega a +10 dB, y 0 dB no esta en el tope', () => {
  // La suposicion peligrosa que esto descarta: que 1,0 sea 0 dB. No lo es.
  assert.equal(faderADb(1), 10);
  assert.ok(Math.abs(faderADb(FADER_POSICION_0_DB)) < 1e-9,
    `la posicion de 0 dB dio ${faderADb(FADER_POSICION_0_DB)}`);
});

test('la curva del fader coincide con la que muestra la consola', () => {
  // Puntos calculados con las funciones que sirve la propia consola. Si alguien
  // toca la curva, esto lo detecta.
  const puntos: readonly (readonly [number, number])[] = [
    [-60, 0.058824], [-40, 0.186230], [-30, 0.269355], [-20, 0.376506],
    [-10, 0.529412], [-6, 0.612728], [-3, 0.685589], [0, 0.764706],
    [3, 0.843756], [6, 0.916539], [10, 1],
  ];
  for (const [db, posicion] of puntos) {
    assert.ok(Math.abs(dbAFader(db) - posicion) < 1e-6,
      `${db} dB deberia caer en ${posicion} y cayo en ${dbAFader(db)}`);
    assert.ok(Math.abs(faderADb(posicion) - db) < 1e-3,
      `la posicion ${posicion} deberia dar ${db} dB y dio ${faderADb(posicion)}`);
  }
});

test('las curvas estan declaradas como tomadas de la consola', () => {
  // El reverso de la prueba anterior a la medicion, que exigia `false` para que
  // nadie confundiera una estimacion con un dato. Ahora exige `true` y ademas
  // que quede escrito de que firmware salieron: una curva de otra consola no
  // vale, y sin esa referencia la bandera no significa nada.
  assert.equal(VERIFICADO_CONTRA_CONSOLA, true);
  assert.equal(ORIGEN_DE_LAS_CURVAS.firmware, '3.4.8318-ui24');
  assert.equal(ORIGEN_DE_LAS_CURVAS.modelo, 'ui24');
});
