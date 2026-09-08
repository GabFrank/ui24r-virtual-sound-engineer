import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIVE_INTERVALO_MS, MENSAJE_ALIVE, VU_BYTES_POR_CANAL, VU_CABECERA_BYTES,
  codificarVu, decodificar, decodificarVu, decodificarVuCanales, despojarSocketIo,
} from '../src/protocol.ts';
import { faderADb } from '../src/conversiones.ts';

/**
 * Trama `VU2` capturada de la consola real el 2026-09-08, firmware 3.4.8318-ui24,
 * con musica entrando **solo por las entradas RCA**, que en esta consola son los
 * canales 21 y 22. Es la evidencia con la que se comprueba el desplazamiento:
 * cualquier lectura que no ponga la señal justo ahi esta mal.
 */
const VU2_CON_SENAL_EN_RCA =
  'GAIGBAoCAgAAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAHcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPd4eFZ4ePd4eFN4ePcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAAAA9wAAAAAAAPcAAAAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPcAAAAA9wAAAAD3AAAAAPduSW5t921JAG33eHhJeHj3eHhIeHj3';

test('se quita el envoltorio de socket.io de una linea de estado', () => {
  // Sin esto, `decodificar` recibia "3:::SETD^..." y todo caia en OTRO.
  const t = despojarSocketIo('3:::SETD^i.0.mix^0.41');
  assert.equal(t.clase, 'datos');
  assert.deepEqual(t.lineas, ['SETD^i.0.mix^0.41']);
  assert.equal(decodificar(t.lineas[0]!).tipo, 'SETD');
});

test('una sola trama puede traer muchas lineas', () => {
  // Asi llega el volcado inicial: ~220 mensajes de ~2 KB, cada uno con decenas
  // de lineas separadas por \n.
  const t = despojarSocketIo('3:::UPDATE_PLAYLIST\nSETS^i.0.name^VOZ\nSETD^i.0.mix^0.5');
  assert.equal(t.lineas.length, 3);
  assert.equal(decodificar(t.lineas[1]!).tipo, 'SETS');
});

test('el latido y la conexion no son protocolo', () => {
  assert.equal(despojarSocketIo('2::').clase, 'latido');
  assert.deepEqual(despojarSocketIo('2::').lineas, []);
  assert.equal(despojarSocketIo('1::').clase, 'conectado');
  assert.equal(despojarSocketIo('0::').clase, 'desconectado');
  assert.equal(despojarSocketIo('basura sin formato').clase, 'desconocida');
});

test('el analizador se reconoce como tal', () => {
  // Es la señal de vida de la consola: llega a 30 Hz con señal y sin ella.
  const m = decodificar('RTA^AAAA');
  assert.equal(m.tipo, 'RTA');
});

test('VU2: la señal cae en los canales 21 y 22, que son las RCA', () => {
  const canales = decodificarVuCanales(VU2_CON_SENAL_EN_RCA);
  assert.equal(canales.length, 24, 'la cabecera declara 24 entradas');
  assert.ok(canales[20]!.entrada > 0.4, `ch21 dio ${canales[20]!.entrada}`);
  assert.ok(canales[21]!.entrada > 0.4, `ch22 dio ${canales[21]!.entrada}`);
  const conSenal = canales.filter((c) => c.entrada > 0).length;
  assert.equal(conSenal, 2, 'solo dos canales tenian señal');
});

test('VU2: el canal 1 no lee la cabecera', () => {
  // La regresion concreta que esto impide. La version anterior asumia un byte
  // por canal sin cabecera, asi que el canal 1 devolvia el byte 0 -- la cuenta
  // de entradas, 24 -- informado como un nivel de -72,5 dB.
  const canales = decodificarVuCanales(VU2_CON_SENAL_EN_RCA);
  assert.equal(canales[0]!.entrada, 0, 'el canal 1 estaba en silencio y debe dar 0');
  assert.equal(decodificarVu(VU2_CON_SENAL_EN_RCA)[0], -Infinity);
});

test('VU2: la salida queda por debajo de la entrada con el fader bajo 0 dB', () => {
  const ch21 = decodificarVuCanales(VU2_CON_SENAL_EN_RCA)[20]!;
  assert.ok(ch21.salida < ch21.entrada,
    `salida ${ch21.salida} no quedo por debajo de la entrada ${ch21.entrada}`);
  assert.equal(ch21.byteReduccion, 247, 'sin reduccion de ganancia');
});

test('VU2: cabecera de 8 bytes y paso de 6', () => {
  assert.equal(VU_CABECERA_BYTES, 8);
  assert.equal(VU_BYTES_POR_CANAL, 6);
  // 24 canales: 8 + 6*24 = 152 bytes como minimo.
  const canales = decodificarVuCanales(VU2_CON_SENAL_EN_RCA);
  assert.equal(canales.length, 24);
});

test('VU2: una trama corta o vacia no revienta', () => {
  assert.deepEqual(decodificarVuCanales(''), []);
  assert.deepEqual(decodificarVuCanales('AAAA'), []);
});

test('VU2: ida y vuelta por el codificador del simulador', () => {
  const posiciones = [0, 0.25, 0.5, 1];
  const canales = decodificarVuCanales(codificarVu(posiciones));
  assert.equal(canales.length, posiciones.length);
  for (let i = 0; i < posiciones.length; i++) {
    assert.ok(Math.abs(canales[i]!.entrada - posiciones[i]!) < 0.005,
      `${posiciones[i]} volvio como ${canales[i]!.entrada}`);
  }
});

test('la ley de fader duplicada en protocol coincide con la de conversiones', () => {
  // `protocol.ts` repite la formula para no depender del modulo de unidades.
  // Si alguna vez divergen, esto lo detecta.
  for (const posicion of [0.1, 0.25, 0.5, 0.7647058823529421, 0.9, 1]) {
    const porProtocolo = decodificarVu(codificarVu([posicion]))[0]!;
    const porConversiones = faderADb(Math.round(posicion / 0.004167508166392142)
      * 0.004167508166392142);
    assert.ok(Math.abs(porProtocolo - porConversiones) < 1e-9,
      `en ${posicion}: protocolo ${porProtocolo}, conversiones ${porConversiones}`);
  }
});

test('ALIVE es el texto plano que espera la consola', () => {
  // Medido: sin esto la consola deja de emitir. El cliente oficial lo manda
  // cada segundo.
  assert.equal(MENSAJE_ALIVE, 'ALIVE');
  assert.equal(ALIVE_INTERVALO_MS, 1000);
});
