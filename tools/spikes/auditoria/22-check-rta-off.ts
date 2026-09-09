import { Cliente, dormir } from './cliente.ts';
const c = new Cliente();
let n = 0, noCero = 0;
c.al((l) => { if (l.startsWith('RTA^')) { n++; if ([...Buffer.from(l.slice(4), 'base64')].some((x) => x !== 0)) noCero++; } });
await c.conectar(); await dormir(4000); c.cerrar();
console.log(`tramas RTA=${n}  con datos=${noCero}  (0 con datos = analizador apagado)`);
process.exit(0);
