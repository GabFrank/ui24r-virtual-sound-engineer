import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * El analizador es GLOBAL: elegir su fuente le cambia la pantalla al operador.
 * ADR-025 exige pedir permiso y devolver lo que habia.
 */
async function conAdaptador(fn: (t: TransporteFalso, a: Ui24rMixerAdapter) => Promise<void>): Promise<void> {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t);
  await a.conectar('ws://prueba');
  try { await fn(t, a); } finally { await a.desconectar(); }
}

test('se devuelve LO QUE SE LEYO, no una cadena vacia', async () => {
  await conAdaptador(async (t, a) => {
    // Lo que la consola traia en su volcado.
    t.entra('SETS^var.rta^i.3');
    assert.equal(a.fuenteOriginalDelAnalizador(), 'i.3');

    t.enviadas.length = 0;
    a.tomarAnalizador('i.9');
    assert.deepEqual(t.enviadas, ['SETS^var.rta^i.9']);

    t.enviadas.length = 0;
    a.devolverAnalizador();
    assert.deepEqual(t.enviadas, ['SETS^var.rta^i.3'],
      'reconstruir el valor en vez de leerlo fue el error que costo dias en las sondas');
  });
});

test('la primera lectura manda: las siguientes pueden ser nuestro propio rebote', async () => {
  await conAdaptador(async (t, a) => {
    t.entra('SETS^var.rta^i.3');
    t.entra('SETS^var.rta^i.9');
    assert.equal(a.fuenteOriginalDelAnalizador(), 'i.3');
  });
});

test('si nunca llego la clave, no se escribe nada al devolver', async () => {
  await conAdaptador(async (t, a) => {
    a.tomarAnalizador('i.9');
    t.enviadas.length = 0;
    a.devolverAnalizador();
    assert.deepEqual(t.enviadas, [],
      'dejarlo como esta es menos danino que poner un valor que nadie leyo');
  });
});

test('devolver sin haberlo tomado no hace nada', async () => {
  await conAdaptador(async (t, a) => {
    t.entra('SETS^var.rta^i.3');
    t.enviadas.length = 0;
    a.devolverAnalizador();
    assert.deepEqual(t.enviadas, []);
  });
});

test('el espectro solo se decodifica si alguien lo mira', async () => {
  await conAdaptador(async (t, a) => {
    const vistos: readonly number[][] = [];
    // Sin suscriptores, una trama con valores no rompe ni cuesta nada.
    t.entra('RTA^' + Buffer.from([0, 40, 80]).toString('base64'));

    const recibidas: (readonly number[])[] = [];
    const quitar = a.alEspectro((b) => recibidas.push(b));
    t.entra('RTA^' + Buffer.from([0, 40, 80]).toString('base64'));
    assert.equal(recibidas.length, 1);
    assert.equal(recibidas[0]?.length, 3);
    // 40 bytes por 0,375 dB son 15.
    assert.ok(Math.abs((recibidas[0]?.[1] ?? 0) - 15) < 1e-9);

    quitar();
    t.entra('RTA^' + Buffer.from([0, 40, 80]).toString('base64'));
    assert.equal(recibidas.length, 1, 'al quitar el oyente deja de decodificar');
    assert.equal(vistos.length, 0);
  });
});

test('una trama en ceros no despierta a nadie', async () => {
  await conAdaptador(async (t, a) => {
    const recibidas: (readonly number[])[] = [];
    a.alEspectro((b) => recibidas.push(b));
    // Es lo que manda la consola con el analizador apagado.
    t.entra('RTA^' + Buffer.alloc(122).toString('base64'));
    assert.equal(recibidas.length, 0);
  });
});

/**
 * La retencion de INV-003: maximo 20 automaticas, y NUNCA nada ajeno.
 */
test('al guardar se borran las mas viejas, y solo las propias', async () => {
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t, { esperaGuardadoMs: 1, timeoutConfirmacionMs: 60 });
  await a.conectar('ws://prueba');
  try {
    // La consola responde con 22 automaticas mas dos del usuario en el mismo
    // show. Con el maximo en 20, sobran dos --las mas viejas-- y las del
    // usuario NO se tocan pase lo que pase.
    const viejas = Array.from({ length: 22 }, (_, i) => `VSE_AUTO_${1000 + i}`);
    const quitar = t.alRecibir((l) => {
      if (l.startsWith('SNAPSHOTLIST^')) return;
      if (!l.startsWith('SAVESNAPSHOT^') && !l.startsWith('CREATESHOW')) return;
    });
    // Se contesta la lista cada vez que la piden.
    const original = t.enviar.bind(t);
    (t as unknown as { enviar: (l: string) => void }).enviar = (l: string): void => {
      original(l);
      if (l.startsWith('SNAPSHOTLIST^')) {
        setTimeout(() => t.entra(
          ['SNAPSHOTLIST', 'VSE', ...viejas, 'Alma caninde', 'VSE_a_mano'].join('^'),
        ), 1);
      }
    };

    await a.guardarInstantanea();
    quitar();

    const borrados = t.enviadas.filter((l) => l.startsWith('DELETESNAPSHOT^'));
    assert.equal(borrados.length, 2, 'sobraban dos sobre el maximo de 20');
    assert.deepEqual(borrados, [
      'DELETESNAPSHOT^VSE^VSE_AUTO_1000',
      'DELETESNAPSHOT^VSE^VSE_AUTO_1001',
    ], 'las mas viejas primero');

    for (const l of t.enviadas) {
      assert.ok(!l.includes('Alma caninde'), 'jamas una instantanea del usuario');
      assert.ok(!l.includes('VSE_a_mano'), 'ni una VSE_ que no sea automatica');
    }
  } finally {
    await a.desconectar();
  }
});
