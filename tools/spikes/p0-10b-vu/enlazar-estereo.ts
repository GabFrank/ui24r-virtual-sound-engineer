/**
 * Qué significa `i.N.stereoIndex`, y si enlazar un canal enlaza al vecino.
 *
 * En reposo los 24 canales valen -1 y las entradas de línea valen 0 y 1. Eso
 * admite dos lecturas incompatibles: que el número sea LA POSICIÓN dentro del
 * par —0 izquierda, 1 derecha— o que sea EL ÍNDICE DEL PAR, y que la línea sean
 * dos pares distintos de un solo canal cada uno, que no tendría sentido.
 *
 * Se separa escribiendo: si al poner `i.4.stereoIndex` la consola mueve sola
 * `i.5.stereoIndex`, el enlace es una relación que ella mantiene y la aplicación
 * sólo tiene que leerla. Si no mueve nada, hay que escribir las dos.
 *
 * Escribe en la consola. Canales 5 y 6, que están libres —la señal está en el 10
 * y la música en 21 y 22—.
 *
 * La consola no le devuelve eco a quien escribe, así que hace falta el testigo:
 * sin él, no se puede distinguir «no cambió nada» de «cambió y no lo vi».
 *
 * **Convertido a `conRestauracion` el 2026-09-13**, y con dos arreglos que el
 * `try/finally` anterior no daba:
 *
 * 1. **Un `finally` no corre ante una señal.** Este guion deja dos canales
 *    enlazados mientras trabaja; si muere por Ctrl-C o por un `head` que cierra
 *    la tubería, quedan así. Ya pasó en este proyecto con un envío a auxiliar.
 * 2. **Restauraba de más.** Su `previos` se llenaba con todo lo que el volcado
 *    trajera que pareciera `stereoIndex` o `pan` —los 24 canales— y al terminar
 *    los reescribía todos. Devolver cuarenta y ocho claves para arreglar dos es
 *    escribir en la consola del usuario sin motivo: cada escritura de más es una
 *    oportunidad de dejar algo distinto. Ahora restaura **las dos que escribe**.
 *
 * Y los valores previos se leen por HTTP en vez de cazarlos al vuelo del volcado
 * del WebSocket: `estadoPorHttpExigido` falla si el volcado viene corto, que es
 * la garantía que la espera de cinco segundos no daba.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { argTexto } from '../argumentos.ts';

const maquina = argTexto(2, '192.168.0.78');
const A = 4, B = 5; // canales 5 y 6

const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();

const vistoPorTestigo: string[] = [];
const interesa = (r: string): boolean => /^i\.\d+\.(stereoIndex|pan)$/.test(r);
testigo.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r && interesa(r)) vistoPorTestigo.push(`${r}=${v}`);
});

await escritor.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

// **Sólo las dos que este guion escribe.** Ver el punto 2 del docblock.
const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${A}.stereoIndex`, Number(exigirClave(e0, `i.${A}.stereoIndex`))],
  [`i.${B}.stereoIndex`, Number(exigirClave(e0, `i.${B}.stereoIndex`))],
];

console.log('valores en reposo, leidos por HTTP:');
for (const [k, v] of PREVIO) console.log(`  ${k} = ${v}`);

await testigo.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));
vistoPorTestigo.length = 0;

let soloUna: string[] = [];

await conRestauracion(
  async () => {
    await restaurarClaves(escritor, maquina, PREVIO);
  },
  async () => {
    console.log('');
    // El cliente de la consola escribe LAS DOS claves —0 al primero, 1 al
    // segundo—; la consola no mantiene el par sola. Se comprueba escribiendo
    // sólo una y después las dos.
    console.log(`se escribe SOLO i.${A}.stereoIndex = 0`);
    escritor.enviar(codificarSetd(`i.${A}.stereoIndex`, 0));
    await new Promise((r) => setTimeout(r, 3000));
    soloUna = vistoPorTestigo.slice();

    console.log(`ahora tambien i.${B}.stereoIndex = 1`);
    vistoPorTestigo.length = 0;
    escritor.enviar(codificarSetd(`i.${B}.stereoIndex`, 1));
    await new Promise((r) => setTimeout(r, 3000));
    console.log(`  el testigo vio: ${vistoPorTestigo.join(', ') || 'nada'}`);
  },
);

console.log('');
console.log(`al escribir SOLO una, el testigo vio ${soloUna.length} cambio(s):`);
for (const v of soloUna) console.log(`    ${v}`);
const tocoAlVecino = soloUna.some((v) => v.startsWith(`i.${B}.stereoIndex=`));
console.log('');
console.log(tocoAlVecino
  ? `--> LA CONSOLA MANTIENE EL PAR: movio sola i.${B}. Se lee, no se declara.`
  : `--> la consola NO movio i.${B}. El enlace no se hace por esta clave, o hay que escribir las dos.`);

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  let bien = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(fin, k));
    const ok = Math.abs(leido - v) < 1e-9;
    if (!ok) bien = false;
    console.log(`   ${k.padEnd(20)} esperado ${String(v).padEnd(6)} leido ${leido}`
      + (ok ? '' : '   <-- NO COINCIDE'));
  }
  console.log(bien ? '   Comprobado por un camino distinto del que escribio.'
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) process.exitCode = 1;
}
await escritor.desconectar();
await testigo.desconectar();
