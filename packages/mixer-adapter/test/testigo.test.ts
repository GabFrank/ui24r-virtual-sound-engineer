import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ui24rMixerAdapter } from '../src/ui24r-adapter.ts';
import { codificarSetd } from '../src/protocol.ts';
import { TransporteFalso } from './transporte-falso.ts';

/**
 * Confirmación de escrituras por segunda conexión testigo (ADR-024).
 *
 * Estas pruebas van contra transportes falsos y no cierran ninguna invariante:
 * lo que prueban es la lógica del adaptador, no el protocolo. Los hechos del
 * protocolo que las motivan están medidos contra la consola y viven en
 * SPK-P0.1 y SPK-ACK-POLICY: no hay eco al emisor, sí hay difusión a los demás
 * clientes, y dos conexiones del mismo proceso cuentan como clientes distintos
 * —el testigo vio la escritura a los 27 ms—.
 */

const RUTA = 'i.8.mix';
const QUIETUD_MS = 10;
const TIMEOUT_MS = 120;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deja el adaptador conectado y con el estado confirmado ya válido.
 *
 * Sin volcado el almacén queda INVALID y toda escritura sale como conflicto
 * antes de llegar al testigo, que es lo que estas pruebas quieren mirar.
 */
async function adaptadorListo(t: TransporteFalso, valorInicial = 0.5) {
  const a = new Ui24rMixerAdapter(t, {
    quietudVolcadoMs: QUIETUD_MS,
    timeoutConfirmacionMs: TIMEOUT_MS,
  });
  await a.conectar('ws://prueba');
  t.entra(codificarSetd(RUTA, valorInicial));
  await esperar(QUIETUD_MS * 3);
  return a;
}

test('la escritura se confirma cuando el testigo ve el valor difundido', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  const escritura = a.escribir(RUTA, 0.75, 0.5);
  await esperar(QUIETUD_MS * 4);

  const testigo = t.sesiones[0];
  assert.ok(testigo, 'la escritura tiene que haber abierto la segunda conexión');
  assert.deepEqual(t.enviadas, [codificarSetd(RUTA, 0.75)]);
  testigo.entra(codificarSetd(RUTA, 0.75));

  const r = await escritura;
  assert.equal(r.status, 'APPLIED');
  assert.equal(r.confirmedBy, 'WITNESS');
  assert.equal(r.actual, 0.75);

  // El valor tiene que quedar en el estado confirmado aunque la conexión
  // principal nunca lo haya visto: si no, el siguiente cambio sobre la misma
  // ruta compararía contra el valor viejo.
  assert.equal(a.leer(RUTA).value, 0.75);
  assert.equal(a.leer(RUTA).source, 'SELF');
  await a.desconectar();
});

test('no se confirma si el testigo ve esa ruta con otro valor', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  const escritura = a.escribir(RUTA, 0.75, 0.5);
  await esperar(QUIETUD_MS * 4);

  // Alguien más movió el mismo fader a otra parte. Eso no confirma lo nuestro.
  t.sesiones[0]!.entra(codificarSetd(RUTA, 0.31));

  const r = await escritura;
  assert.equal(r.status, 'UNVERIFIED');
  assert.equal(r.confirmedBy, 'TIMEOUT');
  await a.desconectar();
});

test('se agota el tiempo si el testigo no ve nada para esa ruta', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  const escritura = a.escribir(RUTA, 0.75, 0.5);
  await esperar(QUIETUD_MS * 4);
  // Tráfico que no es lo que se espera: otra ruta y una trama de medidores.
  t.sesiones[0]!.entra(codificarSetd('i.9.mix', 0.75));

  const r = await escritura;
  assert.equal(r.status, 'UNVERIFIED');
  assert.equal(r.confirmedBy, 'TIMEOUT');
  assert.match(r.motivo ?? '', /el testigo no vio/);
  // La escritura sí se envió: «sin confirmar» no es «no se escribió».
  assert.deepEqual(t.enviadas, [codificarSetd(RUTA, 0.75)]);
  await a.desconectar();
});

test('sin escrituras no se abre ninguna segunda conexión', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  // Un rato de vida normal en OBSERVE: estado, medidores y analizador.
  for (let i = 0; i < 20; i++) t.entra(codificarSetd(`i.${i}.mix`, 0.4));
  t.entra('RTA^AAAA');
  a.canales(4);
  a.leer(RUTA);
  await esperar(QUIETUD_MS * 4);

  assert.equal(t.sesiones.length, 0, 'el testigo no se abre hasta que hay algo que escribir');
  assert.equal(a.testigoAbierto, false);
  await a.desconectar();
});

test('la segunda escritura reusa el testigo que abrió la primera', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  const primera = a.escribir(RUTA, 0.75, 0.5);
  await esperar(QUIETUD_MS * 4);
  t.sesiones[0]!.entra(codificarSetd(RUTA, 0.75));
  assert.equal((await primera).status, 'APPLIED');

  // Se escribe otra vez sobre la misma ruta, esperando lo que dejó la primera.
  const segunda = a.escribir(RUTA, 0.9, 0.75);
  await esperar(QUIETUD_MS);
  t.sesiones[0]!.entra(codificarSetd(RUTA, 0.9));

  assert.equal((await segunda).status, 'APPLIED');
  assert.equal(t.sesiones.length, 1, 'una sola sesión testigo para toda la conexión');
  await a.desconectar();
});

test('el volcado del propio testigo no confirma una escritura', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  // Reescribir el valor que ya estaba es el caso peligroso: la línea del
  // volcado del testigo trae exactamente ese valor y, sin la espera de quietud,
  // se daría por confirmada una escritura que todavía no salió.
  const escritura = a.escribir(RUTA, 0.5, 0.5);
  await esperar(1);
  t.sesiones[0]!.entra(codificarSetd(RUTA, 0.5));

  const r = await escritura;
  assert.equal(r.status, 'UNVERIFIED');
  await a.desconectar();
});

test('sin testigo no se escribe: se rechaza y no sale nada por el socket', async () => {
  const t = new TransporteFalso();
  t.fallaLaSesionNueva = true;
  const a = await adaptadorListo(t);

  const r = await a.escribir(RUTA, 0.75, 0.5);
  assert.equal(r.status, 'REJECTED');
  assert.equal(r.confirmedBy, 'NONE');
  assert.deepEqual(t.enviadasSinLatido, [], 'no se manda a ciegas lo que no se va a poder confirmar');
  await a.desconectar();
});

test('si el testigo se cae, la escritura en vuelo queda sin verificar', async () => {
  const t = new TransporteFalso();
  const a = await adaptadorListo(t);

  const escritura = a.escribir(RUTA, 0.75, 0.5);
  await esperar(QUIETUD_MS * 4);
  t.sesiones[0]!.cae('se cortó');

  const r = await escritura;
  assert.equal(r.status, 'UNVERIFIED');
  await a.desconectar();
});
