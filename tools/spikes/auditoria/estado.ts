/** Lee (y opcionalmente escribe) rutas puntuales. Uso: estado.ts ruta[=valor] ... */
import { Cliente, dormir } from './cliente.ts';

const args = process.argv.slice(2);
const escrituras = args.filter((s) => s.includes('=')).map((s) => {
  const i = s.indexOf('=');
  return [s.slice(0, i), s.slice(i + 1)] as [string, string];
});
const leer = args.map((s) => (s.includes('=') ? s.slice(0, s.indexOf('=')) : s));

const c = new Cliente();
const estado = new Map<string, string>();
c.al((l) => {
  const p = l.split('^');
  if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) estado.set(p[1], p.slice(2).join('^'));
});
await c.conectar();
await dormir(3500);
console.log('--- antes ---');
for (const r of leer) console.log(`${r} = ${estado.get(r) ?? '(ausente)'}`);
if (escrituras.length) {
  for (const [r, v] of escrituras) c.enviar(`SETD^${r}^${v}`);
  await dormir(800);
  c.cerrar();
  const d = new Cliente();
  const e2 = new Map<string, string>();
  d.al((l) => { const p = l.split('^'); if ((p[0] === 'SETD' || p[0] === 'SETS') && p.length >= 3) e2.set(p[1], p.slice(2).join('^')); });
  await d.conectar();
  await dormir(3500);
  console.log('--- despues (reconectado) ---');
  for (const r of leer) console.log(`${r} = ${e2.get(r) ?? '(ausente)'}`);
  d.cerrar();
} else c.cerrar();
process.exit(0);
