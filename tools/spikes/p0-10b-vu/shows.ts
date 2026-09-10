import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const lineas: string[] = [];
t.alRecibir((l) => { if (l.startsWith('SHOWLIST^') || l.startsWith('SNAPSHOTLIST^')) lineas.push(l); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
t.enviar('SHOWLIST');
await new Promise((r) => setTimeout(r, 2000));
const shows = (lineas.find((l) => l.startsWith('SHOWLIST^')) ?? '').split('^').slice(1).filter(Boolean);
console.log('shows en la consola:', shows.join(' | '));
for (const s of shows) {
  lineas.length = 0;
  t.enviar(`SNAPSHOTLIST^${s}`);
  await new Promise((r) => setTimeout(r, 1500));
  const l = lineas.find((x) => x.startsWith('SNAPSHOTLIST^')) ?? '';
  console.log(`  ${s}: ${l.split('^').slice(2).filter(Boolean).join(', ') || '(vacio)'}`);
}
await t.desconectar();
