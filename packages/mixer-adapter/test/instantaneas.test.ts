import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SHOW_DE_LA_APLICACION, nombreDeInstantanea, esDeLaAplicacion, fechaDeInstantanea,
  comandoCrearShow, comandoGuardar, comandoListar, instantaneasDeLaLista,
  comandoDevolverEtiqueta, comandoBorrar,
} from '../src/instantaneas.ts';

test('el nombre lleva la marca en milisegundos', () => {
  // INV-003 lee la fecha de aca para decidir que borrar; un nombre que no se
  // puede fechar es uno que no se borra nunca.
  assert.equal(nombreDeInstantanea(1757462400000), 'VSE_AUTO_1757462400000');
  assert.equal(fechaDeInstantanea('VSE_AUTO_1757462400000')?.getTime(), 1757462400000);
});

test('solo se reconocen como propias las que tienen la forma exacta', () => {
  assert.equal(esDeLaAplicacion('VSE_AUTO_123'), true);
  assert.equal(esDeLaAplicacion('Alma Caninde'), false);
  assert.equal(esDeLaAplicacion('VSE_AUTO_'), false);
  assert.equal(esDeLaAplicacion('VSE_AUTO_abc'), false);
  assert.equal(fechaDeInstantanea('Prueba asistente'), null);
});

test('SE GUARDA EN EL SHOW DE LA APLICACION Y EN NINGUN OTRO', () => {
  // El show no es un parametro: no hay forma de que un llamador distraido
  // --o uno nuevo dentro de un ano-- guarde encima del trabajo del usuario.
  assert.equal(comandoGuardar('VSE_AUTO_1'), 'SAVESNAPSHOT^VSE^VSE_AUTO_1');
  assert.equal(comandoCrearShow(), 'CREATESHOW^VSE');
  assert.equal(comandoListar(), 'SNAPSHOTLIST^VSE');
  assert.equal(SHOW_DE_LA_APLICACION, 'VSE');
});

test('el nombre se sanea, porque el acento circunflejo parte el mensaje', () => {
  // Es el separador del protocolo. El cliente de la consola hace lo mismo.
  assert.equal(comandoGuardar('mal^nombre'), 'SAVESNAPSHOT^VSE^mal_nombre');
});

test('de la lista se toman solo las nuestras', () => {
  const l = 'SNAPSHOTLIST^VSE^VSE_AUTO_100^algo del usuario^VSE_AUTO_200^';
  assert.deepEqual(instantaneasDeLaLista(l), ['VSE_AUTO_100', 'VSE_AUTO_200']);
  assert.deepEqual(instantaneasDeLaLista('OTRA^COSA'), []);
});

/**
 * ESTOS TESTS SON UNA GARANTIA, NO UNA COMPROBACION DE COMPORTAMIENTO.
 *
 * El usuario pidio expresamente cuidar sus instantaneas. Ahora el modulo SI
 * sabe borrar --INV-003 lo pide, maximo 20 automaticas-- asi que la garantia
 * cambia de forma: no es "no puede borrar" sino "solo puede borrar las suyas".
 */
test('NO se puede construir un borrado de algo que no sea nuestro', () => {
  // Un nombre que no se puede fechar no es una automatica nuestra. Si el
  // usuario guardo algo a mano en el show VSE, va a estar en la lista que
  // devuelve la consola, y la unica defensa que no depende de que el llamador
  // se acuerde es que el comando NO SE PUEDA CONSTRUIR.
  assert.equal(comandoBorrar('Alma caninde'), null);
  assert.equal(comandoBorrar('Prueba asistente'), null);
  assert.equal(comandoBorrar('VSE_a_mano'), null, 'ni siquiera con nuestro prefijo');
  assert.equal(comandoBorrar('VSE_AUTO_'), null);
  assert.equal(comandoBorrar('VSE_AUTO_abc'), null);
});

test('una automatica nuestra si se puede borrar, y solo en nuestro show', () => {
  assert.equal(comandoBorrar('VSE_AUTO_123'), 'DELETESNAPSHOT^VSE^VSE_AUTO_123');
});

test('el modulo no sabe borrar SHOWS ni renombrar', () => {
  const fuente = readFileSync(new URL('../src/instantaneas.ts', import.meta.url), 'utf8');

  // **Se miran solo las lineas de codigo.** Nombrar DELETESNAPSHOT en un
  // comentario para explicar por que NO esta es valioso y tiene que seguir
  // permitido; lo que no puede es aparecer en algo que viaje por el cable.
  const codigo = fuente
    .split('\n')
    .filter((l) => {
      const s = l.trim();
      return s !== '' && !s.startsWith('*') && !s.startsWith('//') && !s.startsWith('/*');
    })
    .join('\n');

  // DELETESNAPSHOT ahora si esta, acotado por comandoBorrar. Los otros tres no
  // tienen ningun motivo para aparecer: borrar un show entero, renombrar, o
  // CARGAR una instantanea --que aplicaria todo su contenido y cambiaria el
  // estado entero de la consola-- no son cosas que esta aplicacion haga.
  for (const peligroso of ['DELETESHOW', 'RENAMESNAPSHOT', 'LOADSNAPSHOT']) {
    assert.ok(!codigo.includes(peligroso),
      `${peligroso} aparece en el codigo de instantaneas.ts, y no deberia`);
  }
});

test('devolver la etiqueta escribe SOLO la etiqueta', () => {
  // Guardar una instantanea cambia cual es la actual. Si el operador toca
  // "actualizar instantanea actual" despues, escribiria sobre la automatica en
  // vez de sobre la suya. Se devuelve la etiqueta y NO se carga: cargarla
  // aplicaria todo su contenido y cambiaria el estado entero.
  assert.equal(
    comandoDevolverEtiqueta('Prueba asistente'),
    'SETS^var.currentSnapshot^Prueba asistente',
  );
});
