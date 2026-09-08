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
