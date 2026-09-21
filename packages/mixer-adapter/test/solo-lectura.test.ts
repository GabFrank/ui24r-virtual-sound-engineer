import { test } from 'node:test';
import { deepStrictEqual, throws, ok } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { soloLectura, ORDENES_DE_LECTURA } from '../../../tools/spikes/solo-lectura.ts';

/**
 * **La conexión de sólo lectura no puede escribir.**
 *
 * Esto es lo que sostiene la exención que `restauracion-garantizada.test.ts` le
 * da a `solo-lectura.ts`. Sin estos tests, esa exención sería una promesa
 * escrita en un comentario —exactamente la clase de guarda que este repositorio
 * ya vio caerse dos veces—, y el guion de los preajustes pasaría la verificación
 * sin que nada comprobara que no escribe.
 *
 * Los tres casos son los tres que importan: que deje pasar lo que pide datos,
 * que **no** deje pasar una escritura, y que la lista blanca no se haya llenado
 * de órdenes que escriben.
 */

function transporteDePrueba(): { enviado: string[]; enviar(l: string): void } {
  const enviado: string[] = [];
  return { enviado, enviar(l: string) { enviado.push(l); } };
}

test('deja pasar una orden que pide datos', () => {
  const t = transporteDePrueba();
  soloLectura(t).pedir('PRESETLIST^eqch');
  deepStrictEqual(t.enviado, ['PRESETLIST^eqch']);
});

test('rechaza una escritura, y no la manda', () => {
  const t = transporteDePrueba();
  const l = soloLectura(t);
  // Control positivo: la forma exacta con la que se escribe una clave.
  throws(() => l.pedir('SETD^i.9.eq.b1.gain^0.75'), /sólo lectura/);
  throws(() => l.pedir('SETS^i.9.eq.prname^loquesea'), /sólo lectura/);
  // Y las tres del vocabulario de preajustes que sí cambian el aparato.
  throws(() => l.pedir('WRITEPRESET^ch^u:Voz gab^{}'), /sólo lectura/);
  throws(() => l.pedir('DELETEPRESET^ch^u:Voz gab'), /sólo lectura/);
  throws(() => l.pedir('RENAMEPRESET^ch^u:Voz gab^u:otra'), /sólo lectura/);
  deepStrictEqual(t.enviado, [], 'no tiene que haber salido nada al cable');
});

test('el mensaje del rechazo dice qué se esperaba', () => {
  const t = transporteDePrueba();
  throws(
    () => soloLectura(t).pedir('LOADSNAPSHOT^VSE^auto'),
    (e: Error) => e.message.includes('PRESETLIST') && e.message.includes('conRestauracion'),
    'un error que no dice qué hacer obliga a leer el código',
  );
});

test('la lista blanca no tiene ninguna orden que escriba', () => {
  // Las cabezas de orden que este proyecto sabe que cambian el aparato. Si
  // alguna entra a la lista blanca, esta guarda lo canta antes de que un guion
  // la use creyendo que sólo lee.
  const ESCRIBEN = [
    'SETD', 'SETS', 'WRITEPRESET', 'DELETEPRESET', 'RENAMEPRESET',
    'IMPORTPRESETS', 'SAVESNAPSHOT', 'LOADSNAPSHOT', 'DELETESNAPSHOT',
    'SAVECUE', 'LOADCUE', 'DELETECUE', 'CREATESHOW', 'SAVESHOW', 'MIXER_RESET',
    'AFSLOADCHAN',
  ];
  const coladas = ESCRIBEN.filter((o) => ORDENES_DE_LECTURA.has(o));
  deepStrictEqual(coladas, []);
});

test('el guion de los preajustes no habla con la consola por otro lado', () => {
  // La exención sólo vale mientras el guion pase por acá. Si mañana alguien le
  // agrega un `.enviar(` directo, el guion vuelve a estar sin cubrir y esta
  // guarda lo dice --la de `restauracion-garantizada` también lo vería, y tener
  // las dos es a propósito: ésta explica por qué.
  const ruta = join(import.meta.dirname, '..', '..', '..',
    'tools', 'spikes', 'p0-2b-eq', 'preajustes.ts');
  const codigo = readFileSync(ruta, 'utf8');
  ok(!/\.enviar\(/.test(codigo), 'el guion tiene que pedir por soloLectura, no enviar');
  ok(/soloLectura\(/.test(codigo), 'y tiene que usar soloLectura');
});
