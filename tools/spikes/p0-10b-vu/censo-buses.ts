/**
 * Cuantos objetos de cada familia declara la consola.
 *
 * Es la comprobacion independiente del mapa de la cola: el mapa se hizo
 * moviendo senal y mirando bytes; esto cuenta el vocabulario. Si las dos
 * cuentas coinciden, el mapa no depende de haber adivinado un paso.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const familias = new Map<string, Set<number>>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const m = /^(i|a|s|f|l|p)\.(\d+)\./.exec(l.split('^')[1] ?? '');
  if (!m) return;
  const [, fam, idx] = m;
  if (!familias.has(fam!)) familias.set(fam!, new Set());
  familias.get(fam!)!.add(Number(idx));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await t.desconectar();
const nombres: Record<string, string> = {
  i: 'entradas', a: 'auxiliares', s: 'subgrupos', f: 'efectos', l: 'linea', p: 'reproductor',
};
for (const [fam, idxs] of [...familias].sort()) {
  const orden = [...idxs].sort((x, y) => x - y);
  console.log(`  ${fam}.N  ${String(orden.length).padStart(2)} ${nombres[fam] ?? '?'}`
    + `  (indices ${orden[0]}..${orden[orden.length - 1]})`);
}
