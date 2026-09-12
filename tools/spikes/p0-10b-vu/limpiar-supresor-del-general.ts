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
    // **El orden del CSV es `freq, Q, gain, tipo`.** Lo dice el volcado crudo,
    // que es el arbitro: `docs/spikes/SPK-P0.1/evidence/prueba-A-pasivo.txt`
    // tiene `m.afs.eq.1^376.4693603516,7.0,-6.0,2` --un notch de -6 dB con Q 7,
    // porque un Q de -6 no existe-- y la ranura vacia es `1000,116,0,0`, que es
    // exactamente lo que el docblock de VACIA de este mismo archivo lee bien:
    // «mil hercios, Q 116, ganancia cero».
    //
    // **Este comentario decia lo contrario y el codigo lo seguia.** Afirmaba
    // «el orden es freq, gain, Q» y presentaba el error como ya corregido,
    // contradiciendo al docblock de VACIA veinte lineas mas arriba. Los dos
    // comentarios del archivo se contradecian entre si y el codigo obedecio al
    // equivocado: se imprimio «7,0 dB Q=-18,0» para filtros de -18 dB con Q 7.
    //
    // Es la forma que este proyecto ya tiene nombrada: **el error vive en la
    // capa que justifica, no en la que implementa.** Un docblock escrito con
    // seguridad, que contradice otro del mismo archivo, y nadie mira el dato
    // crudo porque el comentario suena convencido. La unica defensa fue que el
    // 116 de una ranura vacia es un numero con significado: no hay ganancia de
    // 116 dB, asi que ese campo tiene que ser el Q.
    const [hz, q, ganancia] = x.texto.split(',');
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
