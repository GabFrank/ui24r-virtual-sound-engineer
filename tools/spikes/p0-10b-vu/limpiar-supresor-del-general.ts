/**
 * Borrar los filtros que el supresor del general aprendió, y decir cuál mandato
 * hizo qué.
 *
 * **Por qué hace falta.** Las mediciones del 2026-09-12 usaron tonos sostenidos
 * de 1 kHz, 100 Hz y 10 kHz con el supresor del general encendido. Un tono
 * sostenido es indistinguible de una realimentación para un supresor, así que
 * aprendió **seis filtros de −18 dB** en esas frecuencias y desplazó a los tres
 * que el usuario tenía de sus fechas.
 *
 * Eso es atenuación real sobre su PA. El usuario pidió que se intentara borrar.
 *
 * **Lo que ya se sabe, del 2026-09-10:** `clearlive` funciona y se comprueba;
 * `clearfixed` y `clearall` no hicieron nada nunca. Por el campo que los
 * distingue, los seis de ahora parecen estar en la pila de **fijos**.
 *
 * Se prueban los tres en orden, leyendo por HTTP entre uno y otro: sin eso no se
 * puede atribuir el resultado a un mandato en particular. **`m.afs.enabled` no
 * se toca**: es el único de 45 campos que una instantánea no devuelve.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/limpiar-supresor-del-general.ts 192.168.0.78
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttp } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';

/**
 * Lo que dice una ranura vacía del supresor.
 *
 * **Y el `116` de ahí no es una ganancia: es el Q.** Una ranura vacía dice
 * `1000, 116, 0` — mil hercios, Q 116, ganancia cero—, o sea un filtro tan
 * estrecho que no hace nada. Mirar el segundo campo creyendo que es la ganancia
 * es exactamente el error que este guion cometió al imprimir.
 */
const VACIA = '1000.0000000000,116';

async function filtros(): Promise<{ i: number; texto: string }[]> {
  const e = await estadoPorHttp(maquina);
  const xs: { i: number; texto: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const f = e.get(`m.afs.eq.${i}`) ?? '';
    if (f !== '' && !f.startsWith(VACIA)) xs.push({ i, texto: f });
  }
  return xs;
}

function mostrar(etiqueta: string, xs: { i: number; texto: string }[]): void {
  console.log(`${etiqueta}: ${xs.length} filtro(s)`);
  for (const x of xs) {
    // **El orden del CSV es freq, gain, Q.** La primera version leyo `db` y `q`
    // al reves e imprimio «7,0 dB Q=-18» para un filtro de -18 dB con Q=7. Los
    // filtros eran los correctos y la etiqueta no, que en un archivo de
    // evidencia es peor que no tenerla.
    const [hz, ganancia, q] = x.texto.split(',');
    console.log(`   eq.${x.i}  ${Number(hz).toFixed(1).padStart(9)} Hz  `
      + `${Number(ganancia).toFixed(1).padStart(6)} dB  Q=${Number(q).toFixed(1)}`);
  }
}

const antes = await filtros();
mostrar('ANTES', antes);
if (antes.length === 0) {
  console.log('');
  console.log('No hay nada que borrar. No se escribe.');
  process.exit(0);
}

const e0 = await estadoPorHttp(maquina);
console.log('');
console.log(`m.afs.enabled = ${e0.get('m.afs.enabled')} (NO se toca)`);
console.log(`m.afs.fmode   = ${e0.get('m.afs.fmode')}`);

const t = new Ui24rTransport();
await t.conectar(maquina);

let quedan = antes;
for (const mandato of ['clearlive', 'clearfixed', 'clearall']) {
  if (quedan.length === 0) { console.log(`\n(ya no queda nada; no se prueba ${mandato})`); break; }
  console.log('');
  console.log(`--- ${mandato} ---`);
  // El disparador es un booleano que se pone en 1; la consola lo vuelve a 0.
  t.enviar(codificarSetd(`m.afs.${mandato}`, 1));
  await new Promise((r) => setTimeout(r, 2500));
  const despues = await filtros();
  const borrados = quedan.length - despues.length;
  console.log(`borró ${borrados} filtro(s)`);
  mostrar('quedan', despues);
  quedan = despues;
}

await t.desconectar();

const fin = await estadoPorHttp(maquina);
console.log('');
console.log('=== ESTADO FINAL, releido por HTTP ===');
console.log(`m.afs.enabled = ${fin.get('m.afs.enabled')}`);
console.log(`filtros que quedan: ${quedan.length} de los ${antes.length} que habia`);
if (quedan.length > 0) {
  console.log('Los que quedan NO se pueden borrar por protocolo: hay que hacerlo');
  console.log('desde la consola o su aplicacion web.');
}
