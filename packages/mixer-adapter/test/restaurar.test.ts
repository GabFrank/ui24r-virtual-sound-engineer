import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restaurarClaves, type TransporteRestaurable } from '../../../tools/spikes/restaurar.ts';

/**
 * **El único código que escribe en el camino de restauración, y no tenía tests.**
 *
 * Una auditoría de controles lo marcó como el riesgo número uno sin cubrir el
 * 2026-09-13: *«si esto se equivoca, la consola del usuario queda distinta y nadie
 * se entera»*. Tiene un bucle de tres reintentos y una reconexión, y hasta hoy
 * nada de eso se había ejercitado.
 *
 * Existe porque `conRestauracion` declara honestamente que **no cubre el socket
 * muerto**, y ése resultó ser el caso que pasa de verdad: la medición 101 perdió
 * el WebSocket a mitad de corrida, la restauración escribió por el mismo socket
 * muerto, y la consola quedó con cinco claves cambiadas.
 */
class TransporteDePrueba implements TransporteRestaurable {
  conectado: boolean;
  readonly enviadas: string[] = [];
  intentosDeConexion = 0;
  /** Cuántos intentos fallan antes de que la conexión prenda. */
  fallarPrimeros: number;

  constructor(conectado: boolean, fallarPrimeros = 0) {
    this.conectado = conectado;
    this.fallarPrimeros = fallarPrimeros;
  }

  async conectar(): Promise<void> {
    this.intentosDeConexion += 1;
    if (this.intentosDeConexion <= this.fallarPrimeros) {
      throw new Error('no se pudo abrir');
    }
    this.conectado = true;
  }

  enviar(linea: string): void {
    if (!this.conectado) throw new Error('transporte no conectado');
    this.enviadas.push(linea);
  }
}

const PARES = [['i.9.mix', 0.7647058824], ['m.afs.enabled', 1], ['a.4.mix', 0]] as const;

test('con el transporte vivo, escribe todas las claves en orden', async () => {
  const t = new TransporteDePrueba(true);
  await restaurarClaves(t, '192.168.0.78', PARES);
  assert.equal(t.intentosDeConexion, 0, 'no tiene por qué reconectar si está vivo');
  assert.deepEqual(t.enviadas, [
    'SETD^i.9.mix^0.7647058824',
    'SETD^m.afs.enabled^1',
    'SETD^a.4.mix^0',
  ]);
});

test('con el transporte caido, reconecta y escribe igual', async () => {
  // **El caso que de verdad pasó.** Sin esto, la restauración escribía por el
  // socket muerto, lanzaba «transporte no conectado», y la consola quedaba con
  // las claves de la medición puestas.
  const t = new TransporteDePrueba(false);
  await restaurarClaves(t, '192.168.0.78', PARES);
  assert.equal(t.intentosDeConexion, 1);
  assert.equal(t.enviadas.length, 3, 'las tres claves, después de reconectar');
});

test('si el primer intento falla, reintenta', async () => {
  const t = new TransporteDePrueba(false, 2);
  await restaurarClaves(t, '192.168.0.78', PARES);
  assert.equal(t.intentosDeConexion, 3, 'dos fallidos y el tercero prende');
  assert.equal(t.enviadas.length, 3);
});

test('si no puede reconectar, lanza DICIENDO que clave quedo en que valor', async () => {
  // **Lo único útil cuando ya no hay nada que hacer.** Un error que sólo dice
  // «no se pudo» obliga a alguien a reconstruir a mano qué tocó la corrida.
  const t = new TransporteDePrueba(false, 99);
  await assert.rejects(
    () => restaurarClaves(t, '192.168.0.78', PARES),
    (e: Error) => {
      assert.match(e.message, /i\.9\.mix=0\.7647058824/);
      assert.match(e.message, /m\.afs\.enabled=1/);
      assert.match(e.message, /a\.4\.mix=0/);
      assert.match(e.message, /192\.168\.0\.78/);
      return true;
    },
  );
  assert.equal(t.enviadas.length, 0, 'no escribió nada a medias');
});

test('no se rinde antes de los tres intentos', async () => {
  const t = new TransporteDePrueba(false, 99);
  await assert.rejects(() => restaurarClaves(t, '192.168.0.78', PARES));
  assert.equal(t.intentosDeConexion, 3,
    'si esto baja, alguien recortó los reintentos y la restauración se rinde antes');
});

test('una lista vacia no lanza ni reconecta de mas', async () => {
  const t = new TransporteDePrueba(true);
  await restaurarClaves(t, '192.168.0.78', []);
  assert.deepEqual(t.enviadas, []);
});
