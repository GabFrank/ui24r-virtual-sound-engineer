import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlmacenEnMemoria, type Coleccion, type Documento } from '@vse/store';
import { Registro } from '../src/registro.ts';
import { SumideroPersistente } from '../src/persistente.ts';
import { aJsonl, leerEventos } from '../src/informe.ts';
import type { LogEvent, LogSink } from '../src/tipos.ts';

function evento(n: number, nivel: LogEvent['level'] = 'info'): LogEvent {
  return {
    ts: new Date(Date.UTC(2026, 8, 8, 12, 0, 0, n)).toISOString(),
    sessionId: 's1',
    category: 'system',
    level: nivel,
    event: `e${n}`,
    payload: { n },
  };
}

test('encola y no guarda hasta completar el lote', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 3 });
  s.escribir(evento(1));
  s.escribir(evento(2));
  assert.equal(s.pendientes, 2);
  assert.equal(await almacen.contar('log_event'), 0);
  s.escribir(evento(3));
  await s.volcar();
  assert.equal(await almacen.contar('log_event'), 3);
});

test('volcar a mano guarda una cola incompleta', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 100 });
  s.escribir(evento(1));
  await s.volcar();
  assert.equal(await almacen.contar('log_event'), 1);
});

test('vuelven en orden cronologico aunque compartan milisegundo', async () => {
  // Es el caso real de un arranque: varios eventos con la misma marca. Si el
  // identificador fuera solo la marca, el orden seria arbitrario y ademas el
  // segundo evento pisaria al primero.
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1 });
  const mismoInstante: LogEvent = { ...evento(0), event: 'a' };
  s.escribir(mismoInstante);
  s.escribir({ ...mismoInstante, event: 'b' });
  s.escribir({ ...mismoInstante, event: 'c' });
  await s.volcar();
  assert.equal(await almacen.contar('log_event'), 3);
  const { eventos: leidos } = await leerEventos(almacen);
  assert.deepEqual(leidos.map((e) => e.event), ['c', 'b', 'a']);
});

test('la purga deja el maximo y borra los mas viejos', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1, maximo: 5, purgarCada: 1 });
  for (let i = 1; i <= 12; i++) s.escribir(evento(i));
  await s.volcar();
  assert.equal(await almacen.contar('log_event'), 5);
  const { eventos: quedan } = await leerEventos(almacen);
  assert.deepEqual(quedan.map((e) => e.event), ['e12', 'e11', 'e10', 'e9', 'e8']);
});

test('no purga mientras no se llega al maximo', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1, maximo: 50, purgarCada: 1 });
  for (let i = 1; i <= 10; i++) s.escribir(evento(i));
  await s.volcar();
  assert.equal(await almacen.contar('log_event'), 10);
});

/** Almacén que siempre falla al guardar. */
class AlmacenRoto extends AlmacenEnMemoria {
  override async guardar(_c: Coleccion, _d: Documento): Promise<void> {
    throw new Error('sin espacio');
  }
}

test('un almacen que falla no lanza y deja el error a la vista', async () => {
  const s = new SumideroPersistente(new AlmacenRoto(), { lote: 1 });
  s.escribir(evento(1));
  await s.volcar();
  assert.match(s.ultimoError ?? '', /sin espacio/);
});

test('un almacen que falla no acumula cola sin limite', async () => {
  // Devolver el lote a la cola parece lo correcto y no lo es: con el almacen
  // roto la cola creceria hasta quedarse sin memoria.
  const s = new SumideroPersistente(new AlmacenRoto(), { lote: 1 });
  for (let i = 0; i < 500; i++) s.escribir(evento(i));
  await s.volcar();
  assert.equal(s.pendientes, 0);
});

test('un sumidero roto no impide que los demas reciban', () => {
  const recibidos: LogEvent[] = [];
  const roto: LogSink = { escribir() { throw new Error('roto'); } };
  const bueno: LogSink = { escribir(e) { recibidos.push(e); } };
  const r = new Registro();
  r.agregarSink(roto);
  r.agregarSink(bueno);
  r.info('system', 'hola');
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0]?.event, 'hola');
});

test('el registro pone la sesion en cada evento', () => {
  const recibidos: LogEvent[] = [];
  const r = new Registro();
  r.agregarSink({ escribir(e) { recibidos.push(e); } });
  r.info('system', 'sin_sesion');
  r.fijarSesion('s7');
  r.info('system', 'con_sesion');
  assert.equal(recibidos[0]?.sessionId, null);
  assert.equal(recibidos[1]?.sessionId, 's7');
});

test('escritura lleva los campos obligatorios de INV-022', () => {
  const recibidos: LogEvent[] = [];
  const r = new Registro();
  r.agregarSink({ escribir(e) { recibidos.push(e); } });
  r.escritura({
    transactionId: 't1', path: 'i.3.mix', unidad: 'dB',
    previous: -6, expected: -6, sent: -4.5, ack: 'ECHO', verified: true,
  });
  const e = recibidos[0];
  assert.equal(e?.category, 'transaction');
  assert.equal(e?.event, 'write');
  for (const campo of ['transactionId', 'path', 'previous', 'expected', 'sent', 'ack',
    'verified', 'unidad']) {
    assert.ok(campo in (e?.payload ?? {}), `falta ${campo} en la carga util`);
  }
});

test('se puede filtrar por nivel y por sesion', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1 });
  s.escribir({ ...evento(1), level: 'debug' });
  s.escribir({ ...evento(2), level: 'warn' });
  s.escribir({ ...evento(3), level: 'error' });
  s.escribir({ ...evento(4), level: 'info', sessionId: 'otra' });
  await s.volcar();
  const { eventos: graves } = await leerEventos(almacen, { desdeNivel: 'warn' });
  assert.deepEqual(graves.map((e) => e.event), ['e3', 'e2']);
  const { eventos: deOtra } = await leerEventos(almacen, { sesion: 'otra' });
  assert.deepEqual(deOtra.map((e) => e.event), ['e4']);
});

test('el limite se aplica despues de filtrar por nivel', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1 });
  for (let i = 1; i <= 20; i++) s.escribir(evento(i, i % 5 === 0 ? 'error' : 'debug'));
  await s.volcar();
  const { eventos: graves } = await leerEventos(almacen, { desdeNivel: 'error', limite: 2 });
  assert.deepEqual(graves.map((e) => e.event), ['e20', 'e15']);
});

test('el jsonl sale cronologico y una linea por evento', async () => {
  const almacen = new AlmacenEnMemoria();
  const s = new SumideroPersistente(almacen, { lote: 1 });
  for (let i = 1; i <= 3; i++) s.escribir(evento(i));
  await s.volcar();
  const texto = aJsonl((await leerEventos(almacen)).eventos);
  const lineas = texto.split('\n');
  assert.equal(lineas.length, 3);
  assert.deepEqual(lineas.map((l) => (JSON.parse(l) as LogEvent).event), ['e1', 'e2', 'e3']);
});

/** Almacén que tarda en guardar y delata dos escrituras solapadas. */
class AlmacenLento extends AlmacenEnMemoria {
  dentro = 0;
  solapes = 0;

  override async guardar(coleccion: Coleccion, doc: Documento): Promise<void> {
    this.dentro += 1;
    if (this.dentro > 1) this.solapes += 1;
    // Cede el turno: sin esto ningún `await` puede intercalarse y el test
    // pasaría aunque los volcados no estuvieran encadenados.
    await new Promise((r) => setImmediate(r));
    await super.guardar(coleccion, doc);
    this.dentro -= 1;
  }
}

test('dos volcados a la vez no se pisan', async () => {
  // La version anterior de esta prueba pasaba con el encadenado quitado:
  // `volcarAhora` vacia la cola de forma sincrona al entrar, asi que tres
  // llamadas seguidas nunca colisionaban. Lo que hay que observar es que dos
  // guardados no se solapen, y para eso el almacen tiene que ceder el turno.
  const almacen = new AlmacenLento();
  const s = new SumideroPersistente(almacen, { lote: 1000 });

  for (let i = 1; i <= 20; i++) s.escribir(evento(i));
  const primero = s.volcar();
  // Llegan mas eventos mientras el primer volcado esta a mitad, y alguien
  // pide otro volcado: es el caso real, no tres llamadas seguidas.
  for (let i = 21; i <= 40; i++) s.escribir(evento(i));
  const segundo = s.volcar();
  await Promise.all([primero, segundo]);

  assert.equal(almacen.solapes, 0, 'hubo guardados solapados: los volcados no se encadenaron');
  assert.equal(await almacen.contar('log_event'), 40);
});

test('la lectura avisa cuando pudo quedarse corta', () => {
  // Con filtro de gravedad la busqueda mira una ventana y despues descarta: si
  // en esa ventana no habia suficientes graves, lo devuelto es "los que
  // encontre" y no "los que hay". Sin avisar, la pantalla mostraba menos y no
  // habia forma de distinguirlo de "no hay mas".
  return (async () => {
    const almacen = new AlmacenEnMemoria();
    const s = new SumideroPersistente(almacen, { lote: 1 });
    // Cien eventos, uno solo grave y al principio de todo: la ventana de
    // diez por dos no llega hasta el.
    s.escribir(evento(0, 'error'));
    for (let i = 1; i <= 99; i++) s.escribir(evento(i));
    await s.volcar();

    const corto = await leerEventos(almacen, { desdeNivel: 'error', limite: 2 });
    assert.equal(corto.eventos.length, 0);
    assert.equal(corto.truncado, true);

    const completo = await leerEventos(almacen, { limite: 5 });
    assert.equal(completo.eventos.length, 5);
    assert.equal(completo.truncado, false, 'sin filtro de nivel nunca se queda corta');
  })();
});

test('la cola no crece sin limite con un almacen lento', () => {
  // El lote que se pierde al fallar estaba razonado y probado. El almacen
  // lento no: `escribir()` apilaba sin cota, y el argumento de la clase --que
  // la memoria no puede crecer sin limite-- no cubria su propio caso.
  const lento = new AlmacenLento();
  const s = new SumideroPersistente(lento, { lote: 100000, maximoEnCola: 50 });
  for (let i = 0; i < 500; i++) s.escribir(evento(i));
  assert.equal(s.pendientes, 50);
  assert.equal(s.descartados, 450);
});
