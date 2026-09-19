import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/engine.ts';
import { DiarioEnMemoria, entradaDesdeCambios } from '../src/journal.ts';
import type { CambioRegistrado } from '../src/journal.ts';
import { historialDeLaSesion } from '../src/historial-de-la-sesion.ts';
import { contexto, crudoDeEnvio } from './helpers.ts';
import type { CambioPropuesto } from '../src/types.ts';
import type { Measurement } from '@vse/domain';



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

/**
 * Las mediciones que las transacciones de abajo citan por nombre.
 *
 * **`m-N` es la escucha que sigue a la transaccion `N`**, treinta segundos
 * despues de que esa transaccion escribiera. Sin esto ninguna contaria: desde
 * el 2026-09-18 el historial resuelve el identificador contra una medicion de
 * verdad, y comprueba que sea de esta sesion, posterior a la escritura, con
 * senal y de al menos diez segundos.
 */
/**
 * El instante en que estos tests juzgan.
 *
 * La ultima medicion empieza a las 10:05:30 y dura diez segundos, asi que su
 * ventana termina a las 10:05:40. El reloj va despues: desde el 2026-09-18 una
 * escucha cuenta recien cuando su ventana TERMINO, y no cuando alguien declara
 * que va a durar diez segundos.
 */
const AHORA = Date.parse('2026-09-17T11:00:00.000Z');

const MEDICIONES: readonly Measurement[] = [1, 2, 3, 4, 5].map((n) => ({
  id: `m-${n}`,
  sessionId: SESION,
  timestamp: `2026-09-17T10:0${n}:30.000Z`,
  signalType: 'PERFORMANCE',
  duracionS: 10,
  referenceMode: null, paComponent: null, channelId: null, posicion: null,
  sceneId: null, buildState: null, micProfileId: null,
  calibrationStateId: 'cal-1', snapshotRef: null,
  sampleRate: 48000,
  directRef: null, acousticRef: null, consoleTelemetry: null, archivoAudio: null,
}) as unknown as Measurement);
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
  // **`enviadoEl` con una fecha de verdad, y antes decia `'ya'`.** Desde el
  // 2026-09-18 el historial compara la medicion contra el momento en que la
  // escritura llego al cable, y una cadena que no es una fecha no se puede
  // ordenar: se rechaza en vez de conceder. La suite tenia que dejar de
  // modelar un diario que la aplicacion no escribe.
  const registrado: CambioRegistrado = {
    ...entrada.cambios[0]!, enviadoEl: `2026-09-17T10:0${id}:00.000Z`,
    confirmadoPor: 'WITNESS', verificado: true,
  };
  await diario.registrarCambio(id, 0, registrado);
}

async function contextoDesdeElDiario(diario: DiarioEnMemoria) {
  return contexto(historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA));
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

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
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

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
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

  const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
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
  const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);

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
  const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
  assert.equal(historial.acumuladoPorRuta.get(RUTA), 0, 'subio dos y bajo dos');
  assert.equal(e.evaluar([paso(-32, -30)], contexto(historial), ok).permitido, true);
});

/**
 * **La rafaga que anotaba mediciones que no existen, medida de punta a punta.**
 *
 * Es el agujero que se cerro el 2026-09-18, y este test lo mide en vez de
 * describirlo: la cifra del documento y la del codigo son la misma corrida.
 *
 * Cada paso es honesto --2 dB, atado al crudo por la ley medida, dentro del
 * tope-- y lo unico que se declara sin respaldo es `medicionPosteriorId`, que
 * hasta ese dia el historial solo comprobaba que no fuera nulo. Con eso
 * dieciseis transacciones levantaban una cuña **32 dB, de -32 a nominal**, y lo
 * que cortaba no era ningun freno de INV-004 sino el final del recorrido.
 *
 * Ahora corta el segundo paso. **Dos decibeles en vez de treinta y dos.**
 */
test('anotar mediciones que no existen ya no levanta la cuña 32 dB', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();

  let actual = -32;
  let aceptadas = 0;
  for (let i = 0; i < 40 && actual < 0; i++) {
    const destino = Math.min(actual + 2, 0);
    const c = paso(actual, destino);
    const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
    if (!e.evaluar([c], contexto(historial), ok).permitido) break;
    // Se anota una medicion que NO esta en `MEDICIONES`: una cadena inventada.
    await yaAplicado(diario, String(i + 1), c, `medicion-que-no-existe-${i}`);
    actual = destino;
    aceptadas++;
  }

  assert.equal(aceptadas, 1, 'el segundo paso ya no pasa');
  assert.equal(actual - -32, 2,
    'la cuña se movio dos decibeles; con la guarda vieja se movia treinta y dos');
});

/**
 * **Y la misma rampa con escuchas de verdad SI avanza**, que es la otra mitad y
 * la que impide que esto se arregle rompiendo el caso de uso.
 *
 * **Y hay que decir para que sirve de verdad, porque la primera redaccion lo
 * dijo de mas.** Decia que sin este test un `return false` a secas en
 * `escuchaComprobada` dejaria la suite verde; una auditoria lo muto y **caen
 * diez tests, nueve de ellos preexistentes**. O sea que ese mutante ya estaba
 * cazado. Lo que este test agrega es la rampa COMPLETA de cinco pasos con cinco
 * escuchas distintas --que ninguno de los otros recorre-- y, sobre todo, deja el
 * caso de uso escrito al lado del agujero, que es donde se mira. La trampa que
 * vigila es la del techo por ruta del 2026-09-12: anclado en el piso, la
 * aplicacion no podia subir ni un decibel, y lo encontro el usuario.
 */
test('con escuchas de verdad, la rampa avanza paso a paso', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();

  let actual = -32;
  let aceptadas = 0;
  for (let n = 1; n <= 5 && actual < 0; n++) {
    const destino = actual + 2;
    const c = paso(actual, destino);
    const historial = historialDeLaSesion(await diario.deLaSesion(SESION), MEDICIONES, AHORA);
    assert.equal(e.evaluar([c], contexto(historial), ok).permitido, true,
      `el paso ${n} tendria que pasar: la escucha anterior es real`);
    await yaAplicado(diario, String(n), c, `m-${n}`);
    actual = destino;
    aceptadas++;
  }

  assert.equal(aceptadas, 5, 'cinco pasos con cinco escuchas');
  assert.equal(actual, -22, 'diez decibeles, escuchando entre uno y otro');
});


/**
 * **La rafaga con mediciones BIEN FORMADAS, que es la que la primera version de
 * este arreglo NO cerraba.**
 *
 * La auditoria adversarial del 2026-09-18 corrio esta misma rampa con
 * `Measurement` reales --de esta sesion, con señal, `duracionS: 10`-- creadas en
 * el instante de cada escritura, y la cuña volvio a subir **los 32 dB enteros en
 * 4 ms**. La guarda comprobaba que la medicion DIJERA durar diez segundos, no
 * que hubieran pasado: `duracionS` es un campo que declara quien escribe la
 * fila.
 *
 * O sea que la cifra de «2 dB en vez de 32» valia solo contra un identificador
 * que no resuelve, que es el caso facil. Este test cubre el dificil.
 */
test('mediciones bien formadas pero sin esperar tampoco levantan la cuña', async () => {
  const diario = new DiarioEnMemoria();
  const e = new SafetyEngine();

  // El reloj avanza un milisegundo por paso: la rafaga, sin esperar a nadie.
  const t0 = Date.parse('2026-09-17T12:00:00.000Z');
  const mediciones: Measurement[] = [];
  let actual = -32;
  let aceptadas = 0;

  for (let i = 0; i < 40 && actual < 0; i++) {
    const ahora = t0 + i;
    const historial = historialDeLaSesion(
      await diario.deLaSesion(SESION), mediciones, ahora,
    );
    const destino = Math.min(actual + 2, 0);
    if (!e.evaluar([paso(actual, destino)], contexto(historial), ok).permitido) break;

    const entrada = entradaDesdeCambios(
      `r${i}`, SESION, 'rafaga', 'ASSISTED', null, [paso(actual, destino)],
      new Map(), 
    );
    await diario.abrir({
      ...entrada, creadoEl: new Date(ahora).toISOString(),
      medicionPosteriorId: `real-${i}`, nivelEstablecidoEn: [],
    });
    await diario.registrarCambio(`r${i}`, 0, {
      ...entrada.cambios[0]!, enviadoEl: new Date(ahora).toISOString(),
      confirmadoPor: 'WITNESS', verificado: true,
    });
    // Una medicion IMPECABLE: existe, es de esta sesion, tiene señal, dice durar
    // diez segundos, y empieza en el mismo instante de la escritura. Lo unico
    // que le falta es haber durado.
    mediciones.push({
      id: `real-${i}`, sessionId: SESION,
      timestamp: new Date(ahora).toISOString(),
      signalType: 'PERFORMANCE', duracionS: 10,
      referenceMode: null, paComponent: null, channelId: null, posicion: null,
      sceneId: null, buildState: null, micProfileId: null,
      calibrationStateId: 'cal-1', snapshotRef: null, sampleRate: 48000,
      directRef: null, acousticRef: null, consoleTelemetry: null, archivoAudio: null,
    } as unknown as Measurement);

    actual = destino;
    aceptadas++;
  }

  assert.equal(aceptadas, 1, 'el segundo paso tampoco pasa con mediciones de verdad');
  assert.equal(actual, -30, 'dos decibeles; la auditoria midio treinta y dos');
});
