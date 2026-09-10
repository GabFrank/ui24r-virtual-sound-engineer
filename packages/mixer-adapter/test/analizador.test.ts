import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { SHOW_DE_LA_APLICACION } from '../src/instantaneas.ts';
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

// --- La retencion comprueba lo que borro -----------------------------------
//
// Antes iba a ciegas: se mandaban los DELETESNAPSHOT y la funcion retornaba sin
// volver a leer. Que el comando funcione estaba medido, pero con un arnes de
// spike, y EL ARNES NO ES EL ADAPTADOR: bastaba un cambio en el nombre del
// show o en la gramatica para que la retencion dejara de retener sin que nada
// avisara.

/** Contesta SNAPSHOTLIST con lo que se le diga, cada vez que se lo pidan. */
function listaQueContesta(t: TransporteFalso, respuestas: string[][]): void {
  let i = 0;
  const original = t.enviar.bind(t);
  t.enviar = (linea: string) => {
    original(linea);
    if (linea.startsWith('SNAPSHOTLIST^')) {
      const cual = respuestas[Math.min(i, respuestas.length - 1)]!;
      i++;
      setTimeout(() => t.entra(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}^${cual.join('^')}`), 1);
    }
  };
}

test('si una automatica sobrevive al borrado, se avisa', async () => {
  const t = new TransporteFalso();
  const sobraron: string[][] = [];
  const a = new Ui24rMixerAdapter(t, {
    esperaGuardadoMs: 5, esperaBorradoMs: 5,
    alNoPoderBorrar: (n) => sobraron.push([...n]),
  });
  await a.conectar('ws://prueba');

  const viejas = Array.from({ length: 22 }, (_, k) => `VSE_AUTO_${1000 + k}`);
  // La primera lista trae 22 --sobran 2--; la segunda las trae TODAS otra vez,
  // o sea que la consola no borro nada.
  listaQueContesta(t, [viejas, viejas]);

  await a.guardarInstantanea();
  assert.equal(sobraron.length, 1, 'tiene que avisar una vez');
  assert.deepEqual(sobraron[0], ['VSE_AUTO_1000', 'VSE_AUTO_1001'],
    'las dos mas viejas, que son las que se pidieron borrar');
  await a.desconectar();
});

test('si el borrado funciona, no se avisa nada', async () => {
  const t = new TransporteFalso();
  const sobraron: string[][] = [];
  const a = new Ui24rMixerAdapter(t, {
    esperaGuardadoMs: 5, esperaBorradoMs: 5,
    alNoPoderBorrar: (n) => sobraron.push([...n]),
  });
  await a.conectar('ws://prueba');

  const viejas = Array.from({ length: 22 }, (_, k) => `VSE_AUTO_${1000 + k}`);
  listaQueContesta(t, [viejas, viejas.slice(2)]);

  await a.guardarInstantanea();
  assert.deepEqual(sobraron, [], 'sin sobrevivientes no hay nada que avisar');
  await a.desconectar();
});

test('un vencimiento de la lista NO se confunde con «no hay ninguna»', async () => {
  // Este es el defecto que se arreglo: pedirLista() devolvia [] al vencer, o
  // sea lo mismo que un show vacio. Con esa confusion, guardarInstantanea()
  // devolvia null y INV-001 abortaba la transaccion con un motivo que no
  // mencionaba el vencimiento por ningun lado.
  const t = new TransporteFalso();
  const a = new Ui24rMixerAdapter(t, {
    esperaGuardadoMs: 5, timeoutListaMs: 20,
  });
  await a.conectar('ws://prueba');

  // Nadie contesta SNAPSHOTLIST.
  const nombre = await a.guardarInstantanea();
  assert.equal(nombre, null, 'sin poder verificar, no hay punto de retorno');
  // Y no se mando ningun borrado: sin lista no se sabe que sobra.
  assert.equal(t.enviadas.filter((l) => l.startsWith('DELETESNAPSHOT')).length, 0,
    'borrar sobre una lista que no llego seria borrar a ciegas');
  await a.desconectar();
});
