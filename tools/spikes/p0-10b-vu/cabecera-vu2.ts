/**
 * La cabecera de VU2 dice cuantos hay de cada cosa.
 *
 * El mapa de la cola se hizo a mano, moviendo senal seccion por seccion, y dio
 * 2 de linea, 6 subgrupos, 4 efectos y 10 auxiliares. Leyendo `parseVUdata`
 * aparece algo mejor: esos numeros VIENEN EN LA CABECERA, y el cliente los usa
 * para avanzar. La cola no tiene un reparto fijo: es autodescriptiva.
 *
 *   e += 6*charCodeAt(0)   entradas
 *   e += 6*charCodeAt(1)   reproductor
 *   e += 7*charCodeAt(2)   subgrupos
 *   e += 7*charCodeAt(3)   efectos
 *          charCodeAt(4)   auxiliares, de a 5
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const t = new Ui24rTransport();
let hecho = false;
t.alRecibir((l) => {
  if (!l.startsWith('VU2^') || hecho) return;
  hecho = true;
  const b = [...Buffer.from(l.slice(4), 'base64')];
  const [ent, med, sub, fx, aux] = b;
  console.log(`cabecera: ${b.slice(0, 8).join(' ')}`);
  console.log(`  [0] entradas     = ${ent}`);
  console.log(`  [1] reproductor  = ${med}`);
  console.log(`  [2] subgrupos    = ${sub}`);
  console.log(`  [3] efectos      = ${fx}`);
  console.log(`  [4] auxiliares   = ${aux}`);
  const calculado = 8 + 6 * ent! + 6 * med! + 7 * sub! + 7 * fx! + 5 * aux!;
  console.log('');
  console.log(`largo segun la cabecera: ${calculado}`);
  console.log(`largo real de la trama:  ${b.length}`);
  console.log(`resto para el general:   ${b.length - calculado} bytes`);
});
await t.conectar(process.argv[2] ?? '192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
await t.desconectar();
