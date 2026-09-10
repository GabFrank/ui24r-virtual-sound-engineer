import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const vals = new Map<string, string>();
t.alRecibir((l) => {
  if (l.startsWith('SETS^') || l.startsWith('SETD^')) {
    const [, r, v] = l.split('^');
    if (r && r.startsWith('var.')) vals.set(r, v ?? '');
  }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
for (const [k, v] of [...vals].sort()) console.log(`  ${k} = ${JSON.stringify(v)}`);
