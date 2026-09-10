/**
 * Si la consola ya sabe que dos canales van enlazados en estereo.
 *
 * Antes de pedirle al usuario que declare a mano que el teclado son los
 * canales 5 y 6, conviene saber si el dato ya existe: los auxiliares tienen
 * `a.N.stereoIndex`, asi que la familia de entrada podria tener algo parecido.
 * Si lo tiene, declararlo a mano seria duplicar --y desincronizar-- un dato que
 * la consola mantiene sola.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const t = new Ui24rTransport();
const candidatas = new Map<string, string>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const [, r, v] = l.split('^');
  if (r === undefined) return;
  if (/stereo|link|pair|gang/i.test(r)) candidatas.set(r, v ?? '');
});

await t.conectar(process.argv[2] ?? '192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await t.desconectar();

const porFamilia = new Map<string, string[]>();
for (const [r, v] of candidatas) {
  const fam = r.replace(/\.\d+\./g, '.N.').replace(/^(\w+)\.\d+/, '$1.N');
  if (!porFamilia.has(fam)) porFamilia.set(fam, []);
  porFamilia.get(fam)!.push(`${r}=${v}`);
}
console.log(`claves con pinta de enlace: ${candidatas.size}`);
for (const [fam, xs] of [...porFamilia].sort()) {
  console.log(`\n  ${fam}  (${xs.length})`);
  for (const x of xs.slice(0, 26)) console.log(`    ${x}`);
}
