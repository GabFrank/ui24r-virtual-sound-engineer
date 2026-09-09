/** Todo lo que la consola informa de un canal, para ver qué tiene puesto. */
import { Ui24rTransport } from '@vse/mixer-adapter';
const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const t = new Ui24rTransport();
const crudo = new Map<string, number>();
t.alRecibir((l) => {
  if (!l.startsWith('SETD^')) return;
  const [, r, v] = l.split('^');
  if (r?.startsWith(`i.${n}.`) || r?.startsWith(`hw.${n}.`)) crudo.set(r, Number(v));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
const interesa = [...crudo.keys()].filter((k) => /dyn|gate|eq|deesser|phantom|gain|mix|mute|pan|insert|src/.test(k)).sort();
for (const k of interesa) console.log(`  ${k.padEnd(28)} = ${crudo.get(k)}`);
