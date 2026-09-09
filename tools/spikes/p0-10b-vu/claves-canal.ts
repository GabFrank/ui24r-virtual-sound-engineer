import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const claves = new Set<string>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const r = l.split('^')[1] ?? '';
  if (r.startsWith('i.9.')) claves.add(r.slice(4).replace(/^(\w+)\.\d+\./, '$1.N.'));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
console.log([...claves].sort().join('  '));
