import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const estado = new Map<string, number>();
t.alRecibir((l) => { if (l.startsWith('SETD^')) { const [, r, v] = l.split('^'); if (r) estado.set(r, Number(v)); } });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
const cambios: [string, number][] = JSON.parse(process.argv[2]!);
for (const [ruta, valor] of cambios) {
  t.enviar(`SETD^${ruta}^${valor}`);
  await new Promise((r) => setTimeout(r, 200));
}
await new Promise((r) => setTimeout(r, 800));
t.enviar('INIT');
await new Promise((r) => setTimeout(r, 5000));
for (const [ruta, valor] of cambios) {
  const ahora = estado.get(ruta);
  console.log(`  ${ruta.padEnd(24)} = ${ahora}  ${Math.abs((ahora ?? NaN) - valor) < 1e-6 ? 'ok' : '<-- NO QUEDO'}`);
}
await t.desconectar();
