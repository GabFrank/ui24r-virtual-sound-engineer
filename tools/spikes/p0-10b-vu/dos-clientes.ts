/**
 * ¿Alcanza con ser dos clientes para ver el eco de las escrituras propias?
 *
 * La consola no le devuelve la escritura a quien la hizo, pero sí la difunde a
 * los demás clientes: eso ya se vio con la aplicación de la tablet. Queda una
 * pregunta que no se contesta sola: si las **dos** conexiones salen de la misma
 * máquina y del mismo proceso, ¿la consola las sigue tratando como dos clientes
 * distintos? Si la respuesta es sí, la confirmación de escrituras tiene una
 * salida barata: un socket escribe y el otro atestigua.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

const MAQUINA = '192.168.0.78';
const RUTA = 'i.9.mute';

const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();

let valorEscritor: number | null = null;
let valorTestigo: number | null = null;
const vistoPorEscritor: number[] = [];
const vistoPorTestigo: number[] = [];
let envioEnMs = 0;
let escuchando = false;

escritor.alRecibir((l) => {
  if (!l.startsWith(`SETD^${RUTA}^`)) return;
  valorEscritor = Number(l.split('^')[2]);
  if (escuchando) vistoPorEscritor.push(Date.now() - envioEnMs);
});
testigo.alRecibir((l) => {
  if (!l.startsWith(`SETD^${RUTA}^`)) return;
  valorTestigo = Number(l.split('^')[2]);
  if (escuchando) vistoPorTestigo.push(Date.now() - envioEnMs);
});

await escritor.conectar(MAQUINA);
await testigo.conectar(MAQUINA);
await new Promise((r) => setTimeout(r, 4500));
console.log(`estado inicial: escritor ve ${valorEscritor}, testigo ve ${valorTestigo}`);

const objetivo = valorEscritor === 1 ? 0 : 1;
escuchando = true;
envioEnMs = Date.now();
escritor.enviar(codificarSetd(RUTA, objetivo));
console.log(`el escritor manda ${RUTA} = ${objetivo}`);
await new Promise((r) => setTimeout(r, 5000));

console.log('');
console.log(`el escritor recibio ${vistoPorEscritor.length} linea(s) para esa ruta`);
console.log(`el testigo   recibio ${vistoPorTestigo.length} linea(s)${vistoPorTestigo.length > 0 ? ` a los ${vistoPorTestigo[0]} ms` : ''}`);
console.log(`valor final: escritor ${valorEscritor}, testigo ${valorTestigo}`);
console.log('');
console.log(vistoPorTestigo.length > 0
  ? 'SIRVE: dos conexiones del mismo proceso alcanzan para atestiguar la escritura.'
  : 'NO SIRVE: la consola trata las dos conexiones como el mismo cliente.');

await escritor.desconectar();
await testigo.desconectar();
