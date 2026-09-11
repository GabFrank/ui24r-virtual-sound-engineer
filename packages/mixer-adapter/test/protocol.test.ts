import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIVE_INTERVALO_MS, MENSAJE_ALIVE, VU_BYTES_POR_CANAL, VU_CABECERA_BYTES,
  bytesABase64, codificarVu, dbDeMedidor, decodificar, decodificarVu, decodificarVuCanales,
  despojarSocketIo, MEDIDOR_RANGO_DB, MEDIDOR_SATURACION, VU_ESCALA,
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

test('VU2: el medidor es lineal en decibeles, no la ley del fader', () => {
  // Sale del `mixer.html` de la consola: dibuja la barra con `c = h * value`,
  // proporcional a la posicion, y pone las marcas de su escala en
  // `-dB * h / VU_RANGE` con `VU_RANGE = 80`. Las dos cosas juntas no dejan
  // otra recta posible. Este test existe porque aca vivia el contrario: uno
  // que exigia que la conversion del medidor coincidiera con la del fader,
  // que era la hipotesis, y la hipotesis resulto falsa.
  assert.equal(MEDIDOR_RANGO_DB, 80);
  assert.equal(dbDeMedidor(1), 0, 'la punta de la escala es 0 dB');
  assert.equal(dbDeMedidor(0.5), -MEDIDOR_RANGO_DB / 2, 'la mitad de la barra es la mitad del recorrido');
  assert.equal(dbDeMedidor(0), -Infinity, 'sin senal no hay decibeles que dar');

  for (const posicion of [0.1, 0.25, 0.5, 0.9, 1]) {
    const porFader = faderADb(posicion);
    assert.ok(Math.abs(dbDeMedidor(posicion) - porFader) > 1,
      `en ${posicion} las dos leyes coinciden, y no deberian`);
  }
});

test('VU2: la escala coincide con la ley de fader de la propia consola', () => {
  // La prueba fuerte de la escala, y la unica sin cadena analogica en el medio:
  // el fader es una ganancia digital dentro de la consola. Con la fuente fija,
  // bajarlo del crudo 0,7647 al 0,20 movio el medidor de salida del byte 181,0
  // al 66,3. Segun la ley de fader eso son 38,19 dB de atenuacion, y nuestra
  // conversion tiene que dar lo mismo.
  //
  // Medir con una fuente externa da otro numero --y tres numeros distintos
  // segun el nivel-- porque mide la cadena entera y no el medidor. Ver la nota
  // de MEDIDOR_RANGO_DB.
  const dbDeByte = (byte: number): number => dbDeMedidor(byte * VU_ESCALA);
  const medido = dbDeByte(181.0) - dbDeByte(66.3);
  const segunElFader = faderADb(0.7647058824) - faderADb(0.2);

  assert.ok(
    Math.abs(medido - segunElFader) < 0.2,
    `el medidor dio ${medido.toFixed(2)} dB y el fader ${segunElFader.toFixed(2)}`,
  );
});

test('VU2: coincide con lo que se leyo en la pantalla de la consola', () => {
  // Estos son los puntos de la primera sesion, leidos a ojo de una barra en
  // movimiento: valen como control de sensatez, no como calibracion. La
  // tolerancia es la de leer una barra, no la de la medicion de arriba.
  const dbDeByte = (byte: number): number => dbDeMedidor(byte * VU_ESCALA);

  // Guitarra en el canal 1: byte de entrada 225, fader del canal en -6,9 dB,
  // y la consola mostraba unos -12 en la barra, que es la salida.
  assert.ok(Math.abs((dbDeByte(225) - 6.9) - -12) < 3, `dio ${(dbDeByte(225) - 6.9).toFixed(1)}`);
  // Musica por las RCA: byte de salida 102, barra alrededor de -40 a -45.
  assert.ok(Math.abs(dbDeByte(102) - -43) < 6, `dio ${dbDeByte(102).toFixed(1)}`);
});

test('VU2: el umbral de saturacion es la punta de la escala, y lo pone la consola', () => {
  // `setVU` hace `1 <= b ? this.clip.clip() : ...`. Saturar es llegar a 0 dB,
  // no pasar un umbral elegido por nosotros.
  assert.equal(MEDIDOR_SATURACION, 1);
  assert.equal(dbDeMedidor(MEDIDOR_SATURACION), 0);
});

test('VU2: el bit 7 del ultimo byte es la puerta, no la saturacion', () => {
  // Costo una lectura equivocada: el byte vale 247 en todos los canales
  // quietos --con el bit 7 puesto-- y tomarlo por saturacion daba los 24
  // canales saturando sin parar. En `parseVUdata` ese bit termina en
  // `this.gi.setValue(...)`, y `gi` es un `GATEind`.
  const cabecera = [1, 0, 0, 0, 0, 0, 0, 0];
  const conPuerta = decodificarVuCanales(bytesABase64([...cabecera, 100, 100, 100, 0, 0, 247]));
  const sinPuerta = decodificarVuCanales(bytesABase64([...cabecera, 100, 100, 100, 0, 0, 119]));

  // Se comprueba que el bit se lee, no que signifique "abierta": la polaridad
  // no esta medida y el nombre del campo ya no la afirma.
  assert.equal(conPuerta[0]?.indicadorDePuerta, true);
  assert.equal(sinPuerta[0]?.indicadorDePuerta, false);
  assert.ok(
    (conPuerta[0]?.entrada ?? 1) < MEDIDOR_SATURACION,
    'y con el bit puesto el canal ni siquiera esta cerca de saturar',
  );
});

test('ALIVE es el texto plano que espera la consola', () => {
  // Medido: sin esto la consola deja de emitir. El cliente oficial lo manda
  // cada segundo.
  assert.equal(MENSAJE_ALIVE, 'ALIVE');
  assert.equal(ALIVE_INTERVALO_MS, 1000);
});

/**
 * Los dos indicadores de saturacion de la consola, y cual es cual.
 *
 * Leido del mixer.html el 2026-09-09, en parseVUdata:
 *   m = +0 (pre)   n = +1 (entrada)   q = +2 (salida)
 *   inStrips[g].setVU(n, q, ...)   -> clip sobre q, la SALIDA
 *   gainStrips[g].setVUPre(m)      -> clip propio sobre m, el PREVIO
 *
 * El byte +1 NO tiene indicador de clip. El adaptador contaba sobre el, que
 * es justo el unico de los tres que la consola no vigila.
 */
test('VU2: el byte +1 no es ninguno de los dos indicadores de saturacion', () => {
  const cabecera = [1, 0, 0, 0, 0, 0, 0, 0];
  // pre y salida por debajo del tope, entrada clavada arriba.
  const soloEntrada = decodificarVuCanales(
    bytesABase64([...cabecera, 100, 240, 100, 0, 0, 247]),
  )[0];
  assert.ok(soloEntrada !== undefined);
  assert.ok(soloEntrada.pre < MEDIDOR_SATURACION, 'el previo no satura');
  assert.ok(soloEntrada.salida < MEDIDOR_SATURACION, 'la salida tampoco');
  // Y sin embargo `entrada` esta arriba: contar sobre este byte inventaria una
  // saturacion que la consola no muestra en ningun lado.
  assert.ok(soloEntrada.entrada >= MEDIDOR_SATURACION);
});

/**
 * **Los seis bytes del canal, cada uno en su lugar.**
 *
 * Hasta el 2026-09-11 `codificarVu` ponia el MISMO valor en `entrada` y en
 * `salida`, y cero en los dos dinamicos. Con eso, un lector que confundiera
 * esos campos entre si seguia en verde: dos bytes iguales no distinguen a
 * nadie, y un byte que siempre vale cero tampoco.
 *
 * Es el mismo defecto que tenia el doble de transporte, y la misma leccion: un
 * fabricante que se aparta del real en un borde crea puntos ciegos con forma de
 * test en verde. Lo encontro una auditoria, no un test.
 *
 * Aca los seis van distintos y separados por mas que el redondeo de un byte
 * --0,333 dB cada escalon-- asi que cualquier permutacion se nota.
 */
test('cada uno de los seis bytes del canal aterriza donde corresponde', () => {
  const pre = 0.20, entrada = 0.40, salida = 0.60, dinEnt = 0.75, dinSal = 0.90;
  const trama = codificarVu([entrada], [6], [pre], {
    posicionesSalida: [salida],
    posicionesDinamicoEntrada: [dinEnt],
    posicionesDinamicoSalida: [dinSal],
  });
  const c = decodificarVuCanales(trama)[0]!;

  // Un escalon del byte es VU_ESCALA; se admite eso y nada mas.
  const cerca = (a: number, b: number): boolean => Math.abs(a - b) <= VU_ESCALA;
  assert.ok(cerca(c.pre, pre), `pre: ${c.pre}`);
  assert.ok(cerca(c.entrada, entrada), `entrada: ${c.entrada}`);
  assert.ok(cerca(c.salida, salida), `salida: ${c.salida}`);
  assert.ok(cerca(c.dinamicoEntrada, dinEnt), `dinamicoEntrada: ${c.dinamicoEntrada}`);
  assert.ok(cerca(c.dinamicoSalida, dinSal), `dinamicoSalida: ${c.dinamicoSalida}`);
  assert.ok(Math.abs(c.reduccionDb - 6) < 0.4, `reduccion: ${c.reduccionDb}`);

  // Y los cinco niveles son distintos entre si: si alguno se copiara de otro,
  // esta linea lo dice aunque las de arriba se escribieran mal.
  const vistos = new Set([c.pre, c.entrada, c.salida, c.dinamicoEntrada, c.dinamicoSalida]);
  assert.equal(vistos.size, 5, 'cinco campos, cinco valores distintos');
});

/**
 * **Control positivo.** El test de arriba afirma que los campos NO se pisan, y
 * una asercion asi pasa sola si el fabricante los pone todos iguales -- que es
 * exactamente lo que hacia antes. Aca se comprueba que sin los campos nuevos,
 * `entrada` y `salida` son indistinguibles.
 */
test('control positivo: sin los campos nuevos, entrada y salida son iguales', () => {
  const c = decodificarVuCanales(codificarVu([0.4]))[0]!;
  assert.equal(c.entrada, c.salida, 'era el defecto: dos campos con el mismo valor');
  assert.equal(c.dinamicoEntrada, 0, 'y los dinamicos en cero, que no delatan a nadie');
  assert.equal(c.dinamicoSalida, 0);
});
