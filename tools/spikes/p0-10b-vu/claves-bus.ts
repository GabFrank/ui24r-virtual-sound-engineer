import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const s = new Set<string>(), a = new Set<string>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^') && !l.startsWith('SETS^')) return;
  const r = l.split('^')[1] ?? '';
  if (r.startsWith('s.0.')) s.add(r);
  if (r.startsWith('a.0.')) a.add(r);
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await t.desconectar();
console.log('s.0:', [...s].filter((k) => !/eq|dyn|gate|insert/.test(k)).sort().join(' '));
console.log('a.0:', [...a].filter((k) => !/eq|dyn|gate|insert/.test(k)).sort().join(' '));
