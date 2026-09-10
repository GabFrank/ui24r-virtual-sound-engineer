/** Forma cruda de VU2/RTA/VUA: longitud, cabecera, bytes. */
import { Cliente, dormir } from './cliente.ts';

const c = new Cliente();
const vistos = new Map<string, { n: number; ejemplo: Buffer; largos: Set<number> }>();
c.al((l) => {
  const i = l.indexOf('^');
  if (i < 0) return;
  const tipo = l.slice(0, i);
  if (tipo !== 'VU2' && tipo !== 'RTA' && tipo !== 'VUA') return;
  const b = Buffer.from(l.slice(i + 1), 'base64');
  const e = vistos.get(tipo) ?? { n: 0, ejemplo: b, largos: new Set<number>() };
  e.n++; e.ejemplo = b; e.largos.add(b.length);
  vistos.set(tipo, e);
});
await c.conectar();
await dormir(4000);
c.cerrar();
for (const [tipo, e] of vistos) {
  console.log(`\n### ${tipo}  tramas=${e.n}  largos=${[...e.largos].join(',')}`);
  const b = e.ejemplo;
  const filas: string[] = [];
  for (let i = 0; i < b.length; i += 16) {
    filas.push(String(i).padStart(4) + ': ' +
      [...b.subarray(i, i + 16)].map((x) => String(x).padStart(3)).join(' '));
  }
  console.log(filas.join('\n'));
}
process.exit(0);
