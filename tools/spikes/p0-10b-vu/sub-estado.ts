import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const claves = new Map<string, string>();
t.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r?.startsWith('s.0.') && !/eq|dyn|gate|mtx|fx/.test(r)) claves.set(r, v ?? '');
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await t.desconectar();
for (const [k, v] of [...claves].sort()) console.log(`  ${k} = ${v}`);
