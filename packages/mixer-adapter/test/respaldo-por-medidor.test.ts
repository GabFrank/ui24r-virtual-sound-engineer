import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import {
  codificarSetd, codificarVu, MEDIDOR_RANGO_DB, VU_ESCALA, dbDeMedidor,
} from '../src/protocol.ts';
import { gananciaADb, faderADb } from '../src/conversiones.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * El respaldo por medidor: lo que se hace cuando el testigo no pudo abrir.
 *
 * **Esto estuvo escrito y desconectado.** `confirmarPorMedidor` existia con sus
 * tests desde el 2026-09-09, la politica le asignaba fila, y NINGUN camino de
 * escritura lo llamaba: sin testigo se devolvia REJECTED y no se enviaba nada.
 * Lo encontro una auditoria, leyendo, no ejecutando. Estos tests existen para
 * que la proxima vez lo encuentre la suite.
 */

/** Un adaptador SIN posibilidad de testigo, que es el caso que se prueba. */
async function sinTestigo(
  fn: (t: TransporteFalso, a: Ui24rMixerAdapter) => Promise<void>,
): Promise<void> {
  const t = new TransporteFalso();
  // El testigo se crea pero NO CONECTA, que es lo que pasa de verdad con la
  // wifi saturada en pleno show. Es mas fiel que no darle forma de crearlo:
  // asi tambien se ejercita que el adaptador maneje la sesion que quedo a
  // medio abrir.
  t.fallaLaSesionNueva = true;
  const a = new Ui24rMixerAdapter(t, { esperaMedidorMs: 5, quietudVolcadoMs: 10 });
  await a.conectar('ws://prueba');
  try { await fn(t, a); } finally { await a.desconectar(); }
}

/**
 * Espera a que el volcado se de por terminado.
 *
 * Sin esto el almacen queda INVALID y TODA escritura sale como conflicto antes
 * de llegar al medidor: la prueba pasaria en verde sin haber ejercitado ni una
 * linea del camino que quiere mirar.
 */
const volcadoListo = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

/** Pone a todos los canales en un nivel, en la escala cruda del medidor. */
function nivel(t: TransporteFalso, posicion: number, canales = 24): void {
  t.entra(`VU2^${codificarVu(new Array(canales).fill(posicion))}`);
}

/**
 * La posicion normalizada que da ese nivel en dB.
 *
 * **Tenia un factor de mas y todos los niveles de este archivo salian inflados
 * un 6,27 %.** `codificarVu` recibe posiciones NORMALIZADAS --0 a 1-- y
 * `(db + 80) / 80` ya es esa posicion: es el despeje exacto de
 * `dB = 80 * posicion - 80`. Multiplicar ademas por `255 * MEDIDOR_RANGO_DB`, que vale
 * 1,0627, era convertir dos veces.
 *
 * Lo que costaba, medido: pedir −20 dB entregaba −16,24; pedir −6 entregaba
 * −1,36; y pedir 0 entregaba **+5,02 dB, por encima del fondo de escala**. El
 * error crece hacia arriba, que es justo donde viven los umbrales de
 * saturacion. Lo encontro una auditoria.
 *
 * **Se sigue sin llamar a `dbDeMedidor`**, y es deliberado: un test que usa la
 * funcion que deberia poder falsar no falsa nada. Lo que faltaba era comprobar
 * que las dos formulas coinciden, y eso lo hace el test de mas abajo.
 */
function posicionDe(db: number): number {
  return (db + MEDIDOR_RANGO_DB) / MEDIDOR_RANGO_DB;
}

test('sin testigo y con senal, la ganancia se confirma por el medidor', async () => {
  await sinTestigo(async (t, a) => {
    // El adaptador tiene que SABER que canal alimenta este previo: sin el `src`
    // no confirma nada, y eso es deliberado.
    t.entra('SETS^i.9.src^hw.9');
    t.entra(codificarSetd('hw.9.gain', 0.25));
    nivel(t, posicionDe(-20));
    await volcadoListo();

    const subida = gananciaADb(0.35) - gananciaADb(0.25);
    // La consola aplica: el medidor de ENTRADA sube lo que la ganancia pide.
    t.alEnviar = () => { nivel(t, posicionDe(-20 + subida)); };

    const r = await a.escribir('hw.9.gain', 0.35, 0.25);
    assert.equal(r.status, 'APPLIED');
    assert.equal(r.confirmedBy, 'VU',
      'nunca WITNESS: el medidor confirma el efecto, no el valor literal');
    assert.ok(t.enviadas.includes(codificarSetd('hw.9.gain', 0.35)));
  });
});

test('sin testigo y en silencio NO SE ESCRIBE NADA', async () => {
  await sinTestigo(async (t, a) => {
    // El adaptador tiene que SABER que canal alimenta este previo: sin el `src`
    // no confirma nada, y eso es deliberado.
    t.entra('SETS^i.9.src^hw.9');
    t.entra(codificarSetd('hw.9.gain', 0.25));
    nivel(t, posicionDe(-70));   // por debajo de los -50 dB utiles
    await volcadoListo();

    t.enviadas.length = 0;
    const r = await a.escribir('hw.9.gain', 0.35, 0.25);
    assert.equal(r.status, 'REJECTED');
    assert.deepEqual(t.enviadasSinLatido, [],
      'escribir a ciegas y marcarlo «no verificado» deja al operador sin poder '
      + 'distinguir eso de un cambio que si funciono');
    assert.match(r.motivo ?? '', /silencio|dB/);
  });
});

test('sin testigo, un parametro sin efecto conocido sobre el nivel no se escribe', async () => {
  await sinTestigo(async (t, a) => {
    t.entra(codificarSetd('i.9.eq.b1.gain', 0.5));
    nivel(t, posicionDe(-20));
    await volcadoListo();

    t.enviadas.length = 0;
    const r = await a.escribir('i.9.eq.b1.gain', 0.6, 0.5);
    assert.equal(r.status, 'REJECTED');
    assert.deepEqual(t.enviadasSinLatido, []);
    assert.match(r.motivo ?? '', /no se puede confirmar por medidor/);
  });
});

test('si el nivel no se movio, la escritura sale SIN VERIFICAR y se dice cuanto falto', async () => {
  await sinTestigo(async (t, a) => {
    // El adaptador tiene que SABER que canal alimenta este previo: sin el `src`
    // no confirma nada, y eso es deliberado.
    t.entra('SETS^i.9.src^hw.9');
    t.entra(codificarSetd('hw.9.gain', 0.25));
    nivel(t, posicionDe(-20));
    await volcadoListo();
    // La consola no aplica: el nivel se queda donde estaba.

    const r = await a.escribir('hw.9.gain', 0.35, 0.25);
    assert.equal(r.status, 'UNVERIFIED');
    assert.equal(r.confirmedBy, 'TIMEOUT');
    assert.match(r.motivo ?? '', /se movió 0\.0/);
    assert.match(r.motivo ?? '', /pudo aplicarse o no/);
  });
});

test('el fader se juzga por el medidor de SALIDA, no por el de entrada', async () => {
  await sinTestigo(async (t, a) => {
    t.entra(codificarSetd('i.9.mix', 0.60));
    // Entrada y salida arrancan iguales.
    nivel(t, posicionDe(-20));
    await volcadoListo();

    const caida = faderADb(0.50) - faderADb(0.60);
    t.alEnviar = () => {
      // SOLO se mueve la salida, que es lo que hace un fader de verdad: la
      // entrada esta antes. Si el codigo mirara la entrada, esto daria «no se
      // movio» y una escritura buena saldria rechazada.
      t.entra(`VU2^${codificarVu(
        new Array(24).fill(posicionDe(-20 + caida)),
        [],
        new Array(24).fill(posicionDe(-20)),
      )}`);
    };

    const r = await a.escribir('i.9.mix', 0.50, 0.60);
    assert.equal(r.confirmedBy, 'VU');
    assert.equal(r.status, 'APPLIED');
  });
});

test('un conflicto se detecta ANTES de mirar ningun medidor', async () => {
  await sinTestigo(async (t, a) => {
    t.entra('SETS^i.9.src^hw.9');
    t.entra(codificarSetd('hw.9.gain', 0.40));
    nivel(t, posicionDe(-20));
    await volcadoListo();

    t.enviadas.length = 0;
    const r = await a.escribir('hw.9.gain', 0.35, 0.25);
    assert.equal(r.status, 'CONFLICT');
    assert.deepEqual(t.enviadasSinLatido, [], 'INV-011 manda: sin coincidencia no se escribe');
  });
});

test('sin el enrutamiento del previo, la ganancia NO se escribe', async () => {
  // No llega ningun `i.N.src`, asi que no se sabe que canal alimenta hw.9 y no
  // hay medidor que mirar. Suponer el de fabrica seria mirar el de otro.
  await sinTestigo(async (t, a) => {
    t.entra(codificarSetd('hw.9.gain', 0.25));
    nivel(t, posicionDe(-20));
    await volcadoListo();

    t.enviadas.length = 0;
    const r = await a.escribir('hw.9.gain', 0.35, 0.25);
    assert.equal(r.status, 'REJECTED');
    assert.deepEqual(t.enviadasSinLatido, []);
    assert.match(r.motivo ?? '', /no se puede confirmar por medidor/);
  });
});

/**
 * **El control que faltaba: que el atajo y la funcion de verdad coincidan.**
 *
 * `posicionDe` no llama a `dbDeMedidor` a proposito --un test que usa la
 * funcion que deberia poder falsar no falsa nada-- pero eso deja dos formulas
 * independientes y nadie comprobando que digan lo mismo. Durante meses NO lo
 * decian: el atajo tenia un factor de mas de 1,0627 y todos los niveles de este
 * archivo salian inflados un 6,27 %.
 *
 * Esto es lo que convierte la independencia en una comprobacion en vez de en un
 * punto ciego: si alguna de las dos se mueve, se rompe.
 */
test('el atajo de posiciones y dbDeMedidor dicen lo mismo', () => {
  // El fondo exacto queda fuera de la vuelta y no es un descuido: ver abajo.
  for (const db of [-79, -70, -50, -30, -20, -12, -6, -3, 0]) {
    const vuelta = dbDeMedidor(posicionDe(db));
    assert.ok(
      Math.abs(vuelta - db) < 1e-9,
      `pedir ${db} dB entrega ${vuelta.toFixed(2)}: las dos formulas no coinciden`,
    );
  }
  // Y el fondo de escala es el fondo: pedir 0 dB no puede dar una posicion que
  // se pase de 1. El atajo viejo daba 1,0627, o sea +5,02 dB.
  assert.equal(posicionDe(0), 1, 'cero decibeles es la punta de la escala');
  assert.equal(posicionDe(-MEDIDOR_RANGO_DB), 0, 'el fondo del recorrido es cero');

  // **El unico punto donde las dos formulas NO coinciden, y esta bien que no.**
  // Lo encontro este mismo test al escribirlo. La recta del medidor daria
  // exactamente -80 en la posicion cero, pero `dbDeMedidor` devuelve -Infinity
  // ahi a proposito: el cero de la consola es «no hay nada», no «hay algo a
  // ochenta decibeles bajo la punta». La distincion importa para el respaldo
  // por medidor, que tiene que separar «no entro nada» de «entro muy bajo».
  assert.equal(dbDeMedidor(posicionDe(-MEDIDOR_RANGO_DB)), -Infinity,
    'el fondo del medidor es silencio, no el ultimo escalon');
});

/**
 * **Control positivo.** El test de arriba afirma que dos formulas coinciden, y
 * una asercion asi pasa sola si ninguna de las dos hace nada. Aca se comprueba
 * que el atajo VIEJO no pasaria.
 */
test('control positivo: el atajo viejo no coincidia con dbDeMedidor', () => {
  const viejo = (db: number): number => ((db + 80) / 80) * 255 * VU_ESCALA;
  assert.ok(
    Math.abs(dbDeMedidor(viejo(-20)) - (-20)) > 3,
    'el atajo viejo erraba mas de tres decibeles a -20; si no, el test no separa nada',
  );
  assert.ok(dbDeMedidor(viejo(0)) > 0, 'y a 0 dB se pasaba del fondo de escala');
});
