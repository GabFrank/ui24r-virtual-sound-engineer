import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
// SOLO la etiqueta. NO se manda LOADSNAPSHOT: eso aplicaria la instantanea y
// cambiaria el estado entero de la consola, que es lo contrario de restaurar.
t.enviar('SETS^var.currentSnapshot^Prueba asistente');
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();
console.log('etiqueta devuelta');
