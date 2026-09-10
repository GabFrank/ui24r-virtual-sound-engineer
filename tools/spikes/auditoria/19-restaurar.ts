/**
 * Restauracion final: devuelve a su valor del volcado inicial toda ruta que
 * haya quedado distinta. Lee el par ruta=valor de un archivo.
 */
import { readFileSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';

const archivo = process.argv[2]!;
const rutas = process.argv.slice(3);
const original = new Map<string, string>();
for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
  const i = linea.indexOf('=');
  if (i > 0) original.set(linea.slice(0, i), linea.slice(i + 1));
}

const a = new Cliente();
const ahora = new Map<string, string>();
a.al((l) => {
  const p = l.split('^');
  if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) ahora.set(p[1], p.slice(2).join('^'));
});
await a.conectar();
await dormir(4000);
for (const r of rutas) {
  const quiero = original.get(r) ?? '';
  const tengo = ahora.get(r) ?? '(ausente)';
  console.log(`${r}\n   actual: ${tengo.slice(0, 90)}\n   quiero: ${quiero.slice(0, 90)}`);
  a.enviar(`SETS^${r}^${quiero}`);
  await dormir(250);
}
await dormir(1500);
a.cerrar();
process.exit(0);
