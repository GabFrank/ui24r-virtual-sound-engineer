import { Cliente, dormir } from './cliente.ts';
const ver = async (etiqueta: string) => {
  const c = new Cliente();
  const l: string[] = [];
  c.al((x) => { if (x.includes('var.rta')) l.push(x); });
  await c.conectar(); await dormir(4000); c.cerrar();
  console.log(`${etiqueta}: ${JSON.stringify(l)}`);
  return l;
};
await ver('inicio');
for (const intento of ['SETD^var.rta^-1', 'SETS^var.rta^-1', 'SETD^var.rta^none', 'SETD^var.rta^', 'SETS^var.rta^']) {
  const c = new Cliente();
  await c.conectar(); await dormir(2500);
  c.enviar(intento);
  await dormir(900);
  // restaurar tambien los dos filtros AFS que clearlive se llevo de mas
  c.cerrar();
  await ver(`tras ${intento}`);
}
