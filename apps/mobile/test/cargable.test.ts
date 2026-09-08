import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cargable, Lectura, intentarGuardar } from '../src/app/ui/cargable.ts';

/** Una promesa que se resuelve cuando el test quiere. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rec) => { resolver = res; rechazar = rec; });
  return { promesa, resolver, rechazar };
}

// --- Cargable -------------------------------------------------------------

test('el esqueleto es solo de la primera vez', async () => {
  // La promesa estaba escrita en el archivo, en el mensaje del PR y en la
  // documentacion, y no se cumplia en ningun caso: `cargando` era cierto en
  // toda recarga y el esqueleto tapaba el valor conservado.
  let n = 0;
  const c = new Cargable<number[]>([], async () => [++n]);

  assert.equal(c.cargando(), true, 'antes de la primera lectura no hay nada que mostrar');
  await c.recargar();
  assert.deepEqual(c.valor(), [1]);
  assert.equal(c.cargando(), false);

  const segunda = c.recargar();
  assert.equal(c.cargando(), false, 'con algo en pantalla, el esqueleto no vuelve');
  assert.equal(c.recargando(), true, 'pero se avisa que se esta releyendo');
  await segunda;
  assert.deepEqual(c.valor(), [2]);
});

test('un fallo al recargar no vacia lo que ya estaba', async () => {
  let fallar = false;
  const c = new Cargable<string[]>([], async () => {
    if (fallar) throw new Error('el almacen no contesta');
    return ['banda'];
  });
  await c.recargar();

  fallar = true;
  await c.recargar();

  assert.deepEqual(c.valor(), ['banda'], 'lo que habia sigue sirviendo');
  assert.equal(c.problema(), null, 'no es bloqueante: hay algo que mostrar');
  assert.match(c.avisoDeRecarga() ?? '', /no contesta/);
});

test('un fallo sin nada previo si es bloqueante', async () => {
  const c = new Cargable<string[]>([], async () => { throw new Error('sin base'); });
  await c.recargar();
  assert.match(c.problema() ?? '', /sin base/);
  assert.equal(c.avisoDeRecarga(), null);
});

test('una respuesta vieja no pisa a la nueva', async () => {
  // Pasa al navegar de una banda a otra: si la lectura de la primera contesta
  // ultima, su respuesta llegaba despues y ganaba.
  const primera = diferida<string>();
  const segunda = diferida<string>();
  const cola = [primera.promesa, segunda.promesa];
  const c = new Cargable<string>('', () => cola.shift()!);

  const a = c.recargar();
  const b = c.recargar();
  segunda.resolver('B');
  await b;
  primera.resolver('A');
  await a;

  assert.equal(c.valor(), 'B', 'gana la ultima pedida, no la ultima en contestar');
  assert.equal(c.cargando(), false);
});

// --- Lectura --------------------------------------------------------------

test('una lectura vieja no escribe el formulario', async () => {
  // El defecto: el numero de orden se comprobaba despues de que el closure ya
  // habia escrito. El formulario quedaba con los datos de la banda A bajo la
  // ruta de la B, y guardar escribia sobre A.
  const escrito: string[] = [];
  const primera = diferida<string>();
  const segunda = diferida<string>();
  const l = new Lectura();

  const a = l.correr(() => primera.promesa, (v) => escrito.push(v));
  const b = l.correr(() => segunda.promesa, (v) => escrito.push(v));

  segunda.resolver('B');
  await b;
  primera.resolver('A');
  await a;

  assert.deepEqual(escrito, ['B'], 'la lectura vieja no llego a aplicar nada');
});

test('la lectura reporta el fallo y deja de cargar', async () => {
  const l = new Lectura();
  assert.equal(l.cargando(), true, 'arranca cargando: todavia no leyo nada');
  await l.correr(async () => { throw new Error('no se pudo leer'); }, () => {});
  assert.match(l.problema() ?? '', /no se pudo leer/);
});

test('tras una lectura buena, recargar no vuelve a mostrar el esqueleto', async () => {
  const l = new Lectura();
  await l.correr(async () => 1, () => {});
  assert.equal(l.cargando(), false);
  const segunda = l.correr(async () => 2, () => {});
  assert.equal(l.cargando(), false, 'el formulario ya tiene algo que mostrar');
  await segunda;
});

// --- intentarGuardar ------------------------------------------------------

test('guardar bien no avisa nada y dice que si', async () => {
  const avisos: string[] = [];
  const ok = await intentarGuardar(async () => {}, (m) => avisos.push(m), 'guardar la banda');
  assert.equal(ok, true);
  assert.deepEqual(avisos, []);
});

test('guardar mal avisa con el motivo y dice que no', async () => {
  // Sin esto la promesa quedaba rechazada sin manejar: ni aviso de exito, ni
  // error, ni navegacion. Al usuario le parecia que el boton no hizo nada, con
  // lo que acababa de escribir todavia sin guardar.
  const avisos: string[] = [];
  const ok = await intentarGuardar(
    async () => { throw new Error('sin espacio en el disco'); },
    (m) => avisos.push(m),
    'guardar la banda',
  );
  assert.equal(ok, false);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0]!, /No se pudo guardar la banda/);
  assert.match(avisos[0]!, /sin espacio en el disco/);
});
