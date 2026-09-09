/**
 * Que significa `i.N.stereoIndex`, y si enlazar un canal enlaza al vecino.
 *
 * En reposo los 24 canales valen -1 y las entradas de linea valen 0 y 1. Eso
 * admite dos lecturas incompatibles: que el numero sea LA POSICION dentro del
 * par --0 izquierda, 1 derecha-- o que sea EL INDICE DEL PAR, y que la linea
 * sean dos pares distintos de un solo canal cada uno, que no tendria sentido.
 *
 * Se separa escribiendo: si al poner `i.4.stereoIndex` la consola mueve sola
 * `i.5.stereoIndex`, el enlace es una relacion que ella mantiene y la
 * aplicacion solo tiene que leerla. Si no mueve nada, hay que escribir los dos.
 *
 * Escribe en la consola. Canales 5 y 6, que estan libres --la senal esta en el
 * 10 y la musica en 21 y 22--. Anota el valor anterior y lo devuelve.
 *
 * La consola no le devuelve eco a quien escribe, asi que hace falta el testigo:
 * sin el, no se puede distinguir "no cambio nada" de "cambio y no lo vi".
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const A = 4, B = 5; // canales 5 y 6

const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();

const previos = new Map<string, string>();
const vistoPorTestigo: string[] = [];

const interesa = (r: string): boolean => /^i\.\d+\.(stereoIndex|pan)$/.test(r);

escritor.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r && interesa(r) && !previos.has(r)) previos.set(r, v ?? '');
});
testigo.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r && interesa(r)) vistoPorTestigo.push(`${r}=${v}`);
});

await escritor.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));
console.log('valores en reposo:');
for (const c of [A, B]) console.log(`  i.${c}.stereoIndex = ${previos.get(`i.${c}.stereoIndex`) ?? 'sin dato'}`);

await testigo.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));
vistoPorTestigo.length = 0;

try {
  console.log('');
  // El cliente de la consola escribe LAS DOS claves --0 al primero, 1 al
  // segundo--; la consola no mantiene el par sola. Se comprueba escribiendo
  // solo una y despues las dos.
  console.log(`se escribe SOLO i.${A}.stereoIndex = 0`);
  escritor.enviar(`SETD^i.${A}.stereoIndex^0`);
  await new Promise((r) => setTimeout(r, 3000));
  const soloUna = vistoPorTestigo.slice();

  console.log(`ahora tambien i.${B}.stereoIndex = 1`);
  vistoPorTestigo.length = 0;
  escritor.enviar(`SETD^i.${B}.stereoIndex^1`);
  await new Promise((r) => setTimeout(r, 3000));
  console.log(`  el testigo vio: ${vistoPorTestigo.join(', ') || 'nada'}`);
  vistoPorTestigo.length = 0;
  vistoPorTestigo.push(...soloUna);

  console.log(`el testigo vio ${vistoPorTestigo.length} cambio(s):`);
  for (const v of vistoPorTestigo) console.log(`    ${v}`);
  const tocoAlVecino = vistoPorTestigo.some((v) => v.startsWith(`i.${B}.stereoIndex=`));
  console.log('');
  console.log(tocoAlVecino
    ? `--> LA CONSOLA MANTIENE EL PAR: movio sola i.${B}. Se lee, no se declara.`
    : `--> la consola NO movio i.${B}. El enlace no se hace por esta clave, o hay que escribir las dos.`);
} finally {
  for (const [r, v] of previos) escritor.enviar(`SETD^${r}^${v}`);
  await new Promise((r) => setTimeout(r, 2000));
  console.log('');
  console.log('restaurado:');
  for (const c of [A, B]) console.log(`  i.${c}.stereoIndex = ${previos.get(`i.${c}.stereoIndex`)}`);
  await escritor.desconectar();
  await testigo.desconectar();
}
