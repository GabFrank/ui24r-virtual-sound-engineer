/** Que fuente declara cada canal: i.N.src y sus vecinos, leidos del volcado. */
import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const v = new Map<string, string>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const [, r, val] = l.split('^');
  if (r && /^i\.\d+\.(src|scsrc|name)$/.test(r)) v.set(r, val ?? '');
  if (r && /^var\.mtk\.(soundcheck|state)/.test(r)) v.set(r, val ?? '');
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
console.log('canal | nombre        | src   | scsrc');
for (let n = 0; n < 24; n++) {
  const nom = (v.get(`i.${n}.name`) ?? '').padEnd(13);
  console.log(`${String(n + 1).padStart(5)} | ${nom} | ${(v.get(`i.${n}.src`) ?? '—').padStart(5)} | ${v.get(`i.${n}.scsrc`) ?? '—'}`);
}
for (const [k, val] of [...v].filter(([k]) => k.startsWith('var.'))) console.log(`  ${k} = ${val}`);
