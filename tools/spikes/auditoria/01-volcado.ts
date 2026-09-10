/** Volcado inicial: guarda TODO lo que manda la consola al conectarse. */
import { writeFileSync } from 'node:fs';
import { Cliente, dormir } from './cliente.ts';

const salida = process.argv[2] ?? '/tmp/vol.txt';
const segundos = Number(process.argv[3] ?? 6);

const c = new Cliente();
const lineas: string[] = [];
const t0 = Date.now();
c.al((l) => lineas.push(`${String(Date.now() - t0).padStart(6)} ${l}`));
await c.conectar();
await dormir(segundos * 1000);
c.cerrar();
writeFileSync(salida, lineas.join('\n'));
console.log(`lineas=${lineas.length} -> ${salida}`);
process.exit(0);
