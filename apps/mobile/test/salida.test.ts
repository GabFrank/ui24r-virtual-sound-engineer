import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SalidaSinGuardar } from '../src/app/ui/salida.ts';

test('preguntar abre el dialogo y esperar la respuesta', async () => {
  const s = new SalidaSinGuardar();
  assert.equal(s.abierto(), false);
  const respuesta = s.preguntar();
  assert.equal(s.abierto(), true);
  s.responder(true);
  assert.equal(await respuesta, true);
  assert.equal(s.abierto(), false);
});

test('quedarse es una respuesta como cualquier otra', async () => {
  const s = new SalidaSinGuardar();
  const respuesta = s.preguntar();
  s.responder(false);
  assert.equal(await respuesta, false);
});

test('cancelar resuelve como quedarse', async () => {
  // La red de seguridad estaba descripta en el comentario y la clase no la
  // tenia, que es peor que no tenerla: se lee como que el caso esta cubierto.
  // Sin ella, una pantalla destruida con el dialogo abierto deja la promesa
  // sin resolver y el router esperando para siempre.
  const s = new SalidaSinGuardar();
  const respuesta = s.preguntar();
  s.cancelar();
  assert.equal(await respuesta, false, 'la respuesta que no pierde nada');
  assert.equal(s.abierto(), false);
});

test('cancelar sin pregunta abierta no hace nada', () => {
  const s = new SalidaSinGuardar();
  s.cancelar();
  assert.equal(s.abierto(), false);
});

test('una segunda pregunta resuelve la primera como quedarse', async () => {
  // Dejar una promesa sin resolver deja al router esperando para siempre.
  const s = new SalidaSinGuardar();
  const primera = s.preguntar();
  const segunda = s.preguntar();
  assert.equal(await primera, false);
  s.responder(true);
  assert.equal(await segunda, true);
});
