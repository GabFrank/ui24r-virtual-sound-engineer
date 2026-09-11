import { test } from 'node:test';
import { strictEqual, deepStrictEqual, match } from 'node:assert/strict';
import {
  fueraDelPuntoDeRetorno, avisoDelPuntoDeRetorno,
} from '../src/que-no-devuelve-el-punto-de-retorno.ts';

/**
 * INV-001 promete un punto de retorno. Este modulo enumera su letra chica.
 *
 * Las rutas son **formas reales**: `i.N.safe`, `m.safe`, `var.unsaved.chsafes`,
 * contrastadas contra las 6732 claves capturadas de la consola.
 */

test('sin nada marcado no hay nada que avisar', () => {
  // El caso normal, y tiene que ser silencioso: un cartel que aparece siempre
  // es un cartel que se deja de leer.
  const num = new Map([['i.0.safe', 0], ['m.safe', 0], ['i.8.safe', 0]]);
  const f = fueraDelPuntoDeRetorno([...num.keys()], (r) => num.get(r) ?? null, () => null);
  deepStrictEqual(f.protegidas, []);
  strictEqual(avisoDelPuntoDeRetorno(f), null);
});

test('enumera lo marcado, con el nombre que la consola le da', () => {
  const num = new Map([['i.0.safe', 0], ['i.8.safe', 1], ['m.safe', 1]]);
  const txt = new Map([['i.8.name', 'VOZ JOSE']]);
  const f = fueraDelPuntoDeRetorno([...num.keys()], (r) => num.get(r) ?? null, (r) => txt.get(r) ?? null);
  deepStrictEqual(f.protegidas.map((p) => p.fuente), ['i.8', 'm']);
  strictEqual(f.protegidas[0]!.nombre, 'VOZ JOSE');
  strictEqual(f.protegidas[1]!.nombre, null, 'el general no tiene nombre puesto');
});

test('el campo que un recall NO devuelve va siempre, este marcado lo que este', () => {
  // `m.afs.enabled` es el unico de 45 campos que un LOADSNAPSHOT no devolvio,
  // medido el 2026-09-10. No depende de ningun safe.
  const f = fueraDelPuntoDeRetorno([], () => null, () => null);
  deepStrictEqual(f.sinRestaurar, ['m.afs.enabled']);
});

test('el aviso distingue lo medido de lo observado', () => {
  // **La diferencia que este proyecto viene aprendiendo a los golpes.** Que un
  // safe impida la restauracion es lo que el nombre sugiere y lo que el manual
  // insinua -- y el propio manual dice que el alcance exacto necesita ensayo.
  // Que la supresion de realimentacion no vuelva SI esta medido.
  const num = new Map([['i.8.safe', 1]]);
  const f = fueraDelPuntoDeRetorno([...num.keys()], (r) => num.get(r) ?? null, () => null);
  const aviso = avisoDelPuntoDeRetorno(f)!;
  match(aviso, /no está medido si una recuperación las devuelve/);
  match(aviso, /Lo que sí está medido/);
});

test('un safe a medio camino no cuenta: es un interruptor', () => {
  // Leerlo con un umbral invitaria a discutir que pasa con 0,5, que no ocurre:
  // la consola publica 0 o 1.
  const num = new Map([['i.0.safe', 0.4], ['i.1.safe', 0.6]]);
  const f = fueraDelPuntoDeRetorno([...num.keys()], (r) => num.get(r) ?? null, () => null);
  deepStrictEqual(f.protegidas.map((p) => p.fuente), ['i.1']);
});

test('concuerda el singular y el plural', () => {
  const uno = new Map([['i.8.safe', 1]]);
  const dos = new Map([['i.8.safe', 1], ['m.safe', 1]]);
  const leer = (m: Map<string, number>) => (r: string) => m.get(r) ?? null;
  match(avisoDelPuntoDeRetorno(fueraDelPuntoDeRetorno([...uno.keys()], leer(uno), () => null))!,
    /1 fuente marcada/);
  match(avisoDelPuntoDeRetorno(fueraDelPuntoDeRetorno([...dos.keys()], leer(dos), () => null))!,
    /2 fuentes marcadas/);
});
