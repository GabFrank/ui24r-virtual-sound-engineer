import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const familias = new Map<string, number>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const r = l.split('^')[1] ?? '';
  const fam = r.replace(/\d+/g, 'N').split('.').slice(0, 2).join('.');
  familias.set(fam, (familias.get(fam) ?? 0) + 1);
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
for (const [f, n] of [...familias].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ${String(n).padStart(5)}  ${f}`);
