import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
const [ruta, valor] = [process.argv[2]!, Number(process.argv[3])];
const t = new Ui24rTransport();
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));
t.enviar(codificarSetd(ruta, valor));
await new Promise((r) => setTimeout(r, 1000));
console.log(`enviado ${ruta} = ${valor}`);
await t.desconectar();
