import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
let antes = '(no llego)';
t.alRecibir((l) => { if (l.startsWith('SETS^var.rta^') || l.startsWith('SETD^var.rta^')) antes = l; });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
console.log(`antes: ${antes}`);
t.enviar('SETS^var.rta^');
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

const v = new Ui24rTransport();
let despues = '(no llego)';
let tramasRta = 0, conValor = 0;
v.alRecibir((l) => {
  if (l.startsWith('SETS^var.rta^') || l.startsWith('SETD^var.rta^')) despues = l;
  if (l.startsWith('RTA^')) { tramasRta++; if ([...Buffer.from(l.slice(4), 'base64')].some((b) => b > 0)) conValor++; }
});
await v.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await v.desconectar();
console.log(`despues: ${despues}`);
console.log(`tramas RTA en 6 s: ${tramasRta}, con algun valor distinto de cero: ${conValor}`);
