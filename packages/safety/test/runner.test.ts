import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SafetyEngine } from '../src/engine.ts';
import { DiarioEnMemoria } from '../src/journal.ts';
import { EjecutorDeTransacciones } from '../src/runner.ts';
import type { CambioPropuesto } from '../src/types.ts';
import { MezcladoraFalsa, contexto } from './helpers.ts';

const sinEspera = { pacingMs: 0, dormir: async () => {} };

function montar(
  iniciales: Record<string, number> = { 'i.3.mix': -6, 'i.4.mix': -8, 'i.5.mix': -5 },
) {
  const mixer = new MezcladoraFalsa(iniciales);
  // La consola dice tener la instantánea que usan los tests. INV-001 se
  // verifica releyendo esta lista, no comprobando que la referencia exista.
  mixer.snapshots = ['VSE_AUTO_1'];
  const safety = new SafetyEngine();
  const diario = new DiarioEnMemoria();
  const ejecutor = new EjecutorDeTransacciones(mixer, safety, diario, sinEspera);
  return { mixer, safety, diario, ejecutor };
}

const fader = (path: string, propuesto: number, esperado: number): CambioPropuesto => ({
  kind: 'CHANNEL_FADER', path, unidad: 'dB',
  valorPropuesto: propuesto, valorEsperado: esperado,
});

const conSnapshot = { conexionPermiteEscribir: true, snapshotRef: 'VSE_AUTO_1' };

test('una transacción válida se aplica y queda registrada', async () => {
  const { mixer, diario, ejecutor } = montar();
  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'balance de coros', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'APLICADA');
  assert.deepEqual(mixer.escrituras, [{ path: 'i.3.mix', valor: -4 }]);

  const entrada = await diario.leer('tx1');
  assert.equal(entrada?.estado, 'APLICADA');
  assert.equal(entrada?.cambios[0]?.valorPrevio, -6, 'guarda el valor previo leído de la consola');
  assert.equal(entrada?.cambios[0]?.verificado, true);
});

test('INV-020: el diario se escribe antes de tocar la consola', async () => {
  // Si se escribiera después, una caída entre la escritura y el registro
  // dejaría un cambio aplicado del que no queda rastro.
  const { mixer, diario, ejecutor } = montar();
  mixer.caerEnEscrituraNumero = 0; // muere en la primera escritura

  await assert.rejects(
    () => ejecutor.ejecutar('tx1', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot),
    /caída simulada/,
  );

  const entrada = await diario.leer('tx1');
  assert.ok(entrada, 'la transacción quedó en el diario pese a la caída');
  assert.equal(entrada?.estado, 'APLICANDO');
});

test('INV-020: tras una caída se muestra la diferencia y no se reaplica nada', async () => {
  const { mixer, ejecutor } = montar();
  mixer.caerEnEscrituraNumero = 1; // muere en la segunda de tres

  await assert.rejects(() => ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8), fader('i.5.mix', -3, -5)],
    contexto(), conSnapshot,
  ));

  const escriturasAntes = mixer.escrituras.length;
  const pendientes = await ejecutor.recuperarTrasCaida();

  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0]?.diferencias.length, 1, 'solo el cambio que alcanzó a enviarse');
  assert.equal(pendientes[0]?.diferencias[0]?.path, 'i.3.mix');
  assert.equal(pendientes[0]?.diferencias[0]?.enviado, -4);
  assert.equal(pendientes[0]?.diferencias[0]?.previo, -6);
  assert.equal(
    mixer.escrituras.length, escriturasAntes,
    'recuperar no escribe nada: decide una persona',
  );
});

test('INV-011: un conflicto detiene la transacción sin escribir', async () => {
  const { mixer, diario, ejecutor } = montar();
  // Alguien movió el fader desde otro dispositivo entre el cálculo y el envío.
  mixer.cambioExterno('i.3.mix', -2);

  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );

  assert.equal(r.estado, 'CONFLICTO');
  assert.equal(mixer.escrituras.length, 0, 'no se sobrescribió el cambio ajeno');
  assert.equal((await diario.leer('tx1'))?.estado, 'CONFLICTO');
});

test('un conflicto en el segundo cambio no deshace el primero, pero lo deja registrado', async () => {
  const { mixer, ejecutor } = montar();
  mixer.conflictoEn.add('i.4.mix');

  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)],
    contexto(), conSnapshot,
  );

  assert.equal(r.estado, 'CONFLICTO');
  assert.equal(mixer.escrituras.length, 1, 'el primero sí se aplicó');
  // El usuario decide si revierte: la aplicación no revierte sola algo que
  // pudo ser deliberado.
});

test('una escritura sin confirmar detiene la transacción en parcial', async () => {
  const { mixer, ejecutor } = montar();
  mixer.sinConfirmarEn.add('i.4.mix');

  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8), fader('i.5.mix', -3, -5)],
    contexto(), conSnapshot,
  );

  assert.equal(r.estado, 'PARCIAL');
  assert.equal(r.estado === 'PARCIAL' && r.aplicados, 1);
  assert.equal(r.estado === 'PARCIAL' && r.total, 3);
  assert.equal(mixer.escrituras.length, 2, 'no siguió con el tercero');
});

test('INV-002: sin valor previo confirmado no se escribe', async () => {
  const { mixer, ejecutor } = montar();
  mixer.olvidar('i.3.mix'); // nunca llegó por el protocolo

  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );

  assert.equal(r.estado, 'RECHAZADA');
  assert.match(
    r.estado === 'RECHAZADA' ? r.motivos.join(' ') : '',
    /no habría a qué revertir/,
  );
  assert.equal(mixer.escrituras.length, 0);
});

test('INV-002: revertir restaura el valor previo leído, no el calculado', async () => {
  const { mixer, ejecutor } = montar();
  await ejecutor.ejecutar(
    'tx1', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(mixer.leer('i.3.mix').value, -4);

  const r = await ejecutor.revertir('tx1');
  assert.equal(r.revertidos, 1);
  assert.deepEqual(r.fallidos, []);
  assert.equal(mixer.leer('i.3.mix').value, -6, 'vuelve exactamente al valor previo');
});

test('revertir va en orden inverso al de aplicación', async () => {
  const { mixer, ejecutor } = montar();
  await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)],
    contexto(), conSnapshot,
  );
  mixer.escrituras.length = 0;

  await ejecutor.revertir('tx1');
  assert.deepEqual(
    mixer.escrituras.map((e) => e.path),
    ['i.4.mix', 'i.3.mix'],
    'si dos cambios se afectan entre sí, deshacerlos en el mismo orden puede no volver al original',
  );
});

test('revertir una transacción parcial solo deshace lo que se envió', async () => {
  const { mixer, ejecutor } = montar();
  mixer.sinConfirmarEn.add('i.4.mix');
  await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8), fader('i.5.mix', -3, -5)],
    contexto(), conSnapshot,
  );
  mixer.escrituras.length = 0;
  mixer.sinConfirmarEn.clear();

  await ejecutor.revertir('tx1');
  const rutas = mixer.escrituras.map((e) => e.path);
  assert.ok(!rutas.includes('i.5.mix'), 'el tercero nunca se envió: no hay nada que deshacer');
});

test('INV-021: una avalancha externa suspende las transacciones abiertas', async () => {
  const { mixer, diario, ejecutor } = montar();
  mixer.caerEnEscrituraNumero = 1;
  await assert.rejects(() => ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)],
    contexto(), conSnapshot,
  ));

  const suspendidas = await ejecutor.suspenderPorCambioMasivo('recuperación de instantánea');
  assert.deepEqual(suspendidas, ['tx1']);
  assert.equal((await diario.leer('tx1'))?.estado, 'SUSPENDIDA');
});

test('una transacción rechazada no deja rastro en el diario', async () => {
  const { diario, ejecutor } = montar();
  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [{ kind: 'MONITOR_AUX_SEND', path: 'i.3.aux.1.value', unidad: 'dB',
       valorPropuesto: -6, valorEsperado: -10 }],
    contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'RECHAZADA');
  assert.equal(await diario.leer('tx1'), undefined,
    'lo que no se intenta no se registra como intento');
});

test('el ritmo entre escrituras se respeta', async () => {
  const mixer = new MezcladoraFalsa({ 'i.3.mix': -6, 'i.4.mix': -8 });
  mixer.snapshots = ['VSE_AUTO_1'];
  const esperas: number[] = [];
  const ejecutor = new EjecutorDeTransacciones(
    mixer, new SafetyEngine(), new DiarioEnMemoria(),
    { pacingMs: 100, dormir: async (ms) => { esperas.push(ms); } },
  );

  await ejecutor.ejecutar(
    'tx1', 's1', 'x',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)],
    contexto(), conSnapshot,
  );

  assert.deepEqual(esperas, [100], 'una espera entre los dos, ninguna antes del primero');
});

test('INV-001: si la instantanea ya no esta en la consola, no se escribe', async () => {
  // El segundo escenario del enunciado de la invariante: borrar la instantanea
  // entre guardarla y aplicar. Antes no podia ocurrir, porque "verificado"
  // significaba "la referencia no es nula".
  const { mixer, ejecutor } = montar();
  mixer.snapshots = [];

  const r = await ejecutor.ejecutar(
    'tx-sin-snap', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'RECHAZADA');
  if (r.estado === 'RECHAZADA') {
    assert.equal(r.motivos.some((m) => m.startsWith('INV-001')), true, r.motivos.join(' | '));
  }
  assert.deepEqual(mixer.escrituras, [], 'no se escribio nada');
});

test('INV-001: si la consola no contesta la lista, tampoco se escribe', async () => {
  // Sin poder comprobar que existe la red de la que depende el retroceso, la
  // respuesta segura es no escribir.
  const { mixer, ejecutor } = montar();
  mixer.listarSnapshots = async () => { throw new Error('conexion caida'); };

  const r = await ejecutor.ejecutar(
    'tx-sin-lista', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'RECHAZADA');
  assert.deepEqual(mixer.escrituras, []);
});

test('INV-021: con el almacen invalido no se escribe', async () => {
  // Es la rama que la mezcladora falsa no podia ejercitar: devolvia siempre
  // VALID, asi que la proteccion contra escribir despues de una avalancha
  // nunca se ejecutaba en ningun test.
  const { mixer, ejecutor } = montar();
  mixer.estadoDelAlmacen = 'INVALID';

  const r = await ejecutor.ejecutar(
    'tx-invalido', 's1', 'x', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'RECHAZADA');
  if (r.estado === 'RECHAZADA') {
    assert.equal(r.motivos.some((m) => m.includes('INV-002')), true);
  }
  assert.deepEqual(mixer.escrituras, []);
});

// --- INV-034: aviso de transacción en curso ------------------------------
//
// La cláusula "no actualizar durante una transacción" estaba escrita, probada
// en el paquete de actualización, y muerta: la señal de la aplicación no la
// ponía nadie en `true`. Estas pruebas fijan quién avisa y, sobre todo, que el
// aviso siempre se apaga.

function montarConAviso(iniciales?: Record<string, number>) {
  const avisos: boolean[] = [];
  const mixer = new MezcladoraFalsa(iniciales ?? { 'i.3.mix': -6 });
  mixer.snapshots = ['VSE_AUTO_1'];
  const safety = new SafetyEngine();
  const diario = new DiarioEnMemoria();
  const ejecutor = new EjecutorDeTransacciones(mixer, safety, diario, {
    ...sinEspera,
    alCambiarActividad: (enCurso) => avisos.push(enCurso),
  });
  return { avisos, mixer, safety, diario, ejecutor };
}

test('una transacción aplicada avisa que empieza y que termina', async () => {
  const { avisos, ejecutor } = montarConAviso();
  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'balance', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(r.estado, 'APLICADA');
  assert.deepEqual(avisos, [true, false]);
});

test('el aviso está encendido mientras se escribe, no solo al final', async () => {
  const { avisos, ejecutor, mixer } = montarConAviso();
  let encendidoAlEscribir: boolean | null = null;
  mixer.alEscribir = () => { encendidoAlEscribir = avisos[avisos.length - 1] ?? null; };
  await ejecutor.ejecutar(
    'tx1', 's1', 'balance', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  assert.equal(encendidoAlEscribir, true);
});

test('una transacción rechazada también apaga el aviso', async () => {
  const { avisos, ejecutor } = montarConAviso();
  const r = await ejecutor.ejecutar(
    'tx1', 's1', 'sin conexión', [fader('i.3.mix', -4, -6)], contexto(),
    { conexionPermiteEscribir: false, snapshotRef: 'VSE_AUTO_1' },
  );
  assert.equal(r.estado, 'RECHAZADA');
  assert.deepEqual(avisos, [true, false]);
});

test('si la escritura lanza, el aviso se apaga igual', async () => {
  // Es el caso que importa: un aviso que se queda encendido deja la aplicación
  // sin poder actualizarse nunca más, y nadie sabe que está pegado.
  const { avisos, ejecutor, mixer } = montarConAviso();
  mixer.alEscribir = () => { throw new Error('la consola se cayó'); };
  await assert.rejects(() => ejecutor.ejecutar(
    'tx1', 's1', 'balance', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  ));
  assert.deepEqual(avisos, [true, false]);
});

test('revertir también cuenta como transacción en curso', async () => {
  const { avisos, ejecutor } = montarConAviso();
  await ejecutor.ejecutar(
    'tx1', 's1', 'balance', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  avisos.length = 0;
  await ejecutor.revertir('tx1');
  assert.deepEqual(avisos, [true, false]);
});

test('un fallo al revertir apaga el aviso', async () => {
  const { avisos, ejecutor } = montarConAviso();
  await assert.rejects(() => ejecutor.revertir('no-existe'));
  assert.deepEqual(avisos, [true, false]);
});

test('dos transacciones solapadas: el aviso no se apaga con una todavia escribiendo', async () => {
  // Con un booleano en vez de un contador, el `finally` de la primera apagaba
  // el aviso mientras la segunda seguia en `escribir()`. En esa ventana
  // INV-034 deja empezar una descarga en mitad de una escritura.
  const { avisos, ejecutor } = montarConAviso({ 'i.3.mix': -6, 'i.4.mix': -8 });

  // La segunda empieza antes de que termine la primera: `ejecutar` cede en su
  // primer `await` -- la relectura de la lista de instantaneas -- asi que las
  // dos quedan abiertas a la vez sin necesidad de trucos de sincronizacion.
  const p1 = ejecutor.ejecutar(
    'tx1', 's1', 'una', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  const p2 = ejecutor.ejecutar(
    'tx2', 's1', 'otra', [fader('i.4.mix', -6, -8)], contexto(), conSnapshot,
  );

  await Promise.all([p1, p2]);

  // Un solo encendido y un solo apagado, y el apagado al final de todo.
  assert.deepEqual(avisos, [true, false],
    `se avisó ${JSON.stringify(avisos)}: el aviso se apagó y se volvió a encender`);
});

test('revertir mientras se aplica no apaga el aviso a mitad', async () => {
  const { avisos, ejecutor } = montarConAviso({ 'i.3.mix': -6, 'i.4.mix': -8 });
  await ejecutor.ejecutar(
    'tx1', 's1', 'una', [fader('i.3.mix', -4, -6)], contexto(), conSnapshot,
  );
  avisos.length = 0;

  const aplicar = ejecutor.ejecutar(
    'tx2', 's1', 'otra', [fader('i.4.mix', -6, -8)], contexto(), conSnapshot,
  );
  const revertir = ejecutor.revertir('tx1');
  await Promise.all([aplicar, revertir]);

  assert.deepEqual(avisos, [true, false]);
});

// --- INV-005: el ritmo entre escrituras y la exencion de las de sistema ---

function montarConRitmo(iniciales: Record<string, number>) {
  const esperas: number[] = [];
  const mixer = new MezcladoraFalsa(iniciales);
  mixer.snapshots = ['VSE_AUTO_1'];
  const ejecutor = new EjecutorDeTransacciones(
    mixer, new SafetyEngine(), new DiarioEnMemoria(),
    { dormir: async (ms) => { esperas.push(ms); } },
  );
  return { esperas, ejecutor };
}

test('INV-005: sin tipo de operacion se espera cien milisegundos', async () => {
  // El ejecutor llevaba un 100 escrito a mano. Ahora sale de `PACING_MS`, que
  // hasta hoy no la importaba ningun codigo de produccion.
  const { esperas, ejecutor } = montarConRitmo({ 'i.3.mix': -6, 'i.4.mix': -8 });
  await ejecutor.ejecutar('tx1', 's1', 'balance',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)], contexto(), conSnapshot);
  assert.deepEqual(esperas, [100]);
});

/**
 * Ninguna transaccion de sistema puede pasar el motor todavia.
 *
 * INV-004 rechaza cualquier parametro sin limite declarado, y ninguno de los
 * que tocan las operaciones de sistema -- envio al bus de analisis, mutes de
 * componente, reserva del reproductor -- tiene uno. Inventarles un tope para
 * que estas pruebas pasen seria la misma falta que inventar una conversion a
 * decibeles: un numero sin evidencia con forma de regla. Asi que la exencion
 * se prueba donde es decidible, en el dominio (`limits.test.ts`), y aca se
 * prueba lo que si importa: que declararla no alcance.
 */

test('INV-005: la exencion no se concede por declararla', async () => {
  // Era el agujero: `tipoDeOperacion` es una cadena libre que provee quien
  // propone, y nada la cruzaba con lo que la transaccion tocaba. Este mismo
  // test, en su version anterior, aplicaba ocho faders de canal declarando
  // ANALYSIS_BUS_SELECT y esperaba APLICADA.
  const { esperas, ejecutor } = montarConRitmo({ 'i.3.mix': -6, 'i.4.mix': -8 });
  await ejecutor.ejecutar('tx1', 's1', 'faders disfrazados',
    [fader('i.3.mix', -4, -6), fader('i.4.mix', -6, -8)], contexto(),
    { ...conSnapshot, tipoDeOperacion: 'MUTE_COMPONENTE' });
  assert.deepEqual(esperas, [100], 'faders de canal no son una operacion de sistema');
});

test('INV-005: ocho faders declarados como sistema siguen rechazandose', async () => {
  const iniciales: Record<string, number> = {};
  const cambios = [];
  for (let i = 1; i <= 8; i++) {
    iniciales[`i.${i}.mix`] = -6;
    cambios.push(fader(`i.${i}.mix`, -4, -6));
  }
  const { ejecutor } = montarConRitmo(iniciales);
  const r = await ejecutor.ejecutar('tx1', 's1', 'faders disfrazados',
    cambios, contexto(), { ...conSnapshot, tipoDeOperacion: 'ANALYSIS_BUS_SELECT' });
  assert.equal(r.estado, 'RECHAZADA');
  assert.ok(r.estado === 'RECHAZADA' && r.motivos.some((m) => m.includes('INV-005')));
});

test('INV-005: sin tipo de operacion, cuatro faders pasan y ocho no', async () => {
  const iniciales: Record<string, number> = {};
  const cambios = [];
  for (let i = 1; i <= 8; i++) {
    iniciales[`i.${i}.mix`] = -6;
    cambios.push(fader(`i.${i}.mix`, -4, -6));
  }
  const { ejecutor } = montarConRitmo(iniciales);
  const cuatro = await ejecutor.ejecutar('tx1', 's1', 'cuatro',
    cambios.slice(0, 4), contexto(), conSnapshot);
  assert.equal(cuatro.estado, 'APLICADA');
  const ocho = await ejecutor.ejecutar('tx2', 's1', 'ocho',
    cambios, contexto(), conSnapshot);
  assert.equal(ocho.estado, 'RECHAZADA');
});
