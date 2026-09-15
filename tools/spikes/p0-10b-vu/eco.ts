/**
 * Criterio 3 de SPK-P0.1: ¿la consola devuelve eco de las escrituras propias?
 *
 * La respuesta decide cómo se confirma cada escritura, y por lo tanto toda la
 * política de confirmación (SPK-ACK-POLICY). Si no hay eco, `escribir()` no
 * puede esperar uno: quedaría siempre en UNVERIFIED.
 *
 * **Convertido a `conRestauracion` el 2026-09-13, y era el peor de la lista.**
 * Los otros guiones sin convertir restauraban en un `finally` —que no corre ante
 * una señal— y el riesgo era que murieran en el momento malo. Éste **no
 * restauraba nada, nunca**: escribía el valor contrario al que encontraba y
 * terminaba. Con la ruta por omisión eso deja el canal 10 del usuario **muteado**,
 * o desmuteado, según cómo estuviera. Se corrió así al menos una vez.
 *
 * Y el valor previo se lee por HTTP en vez de cazarlo del volcado del WebSocket:
 * `estadoPorHttpExigido` falla si la lectura no llegó, que es la garantía que
 * esperar cuatro segundos no da. Si no llegaba, `inicial` quedaba en `null`,
 * `objetivo` salía 1 por la comparación con `null`, y el guion escribía 1 sobre
 * una clave cuyo valor no conocía.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/eco.ts [ruta] [maquina]
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { argTexto } from '../argumentos.ts';

const RUTA = argTexto(2, 'i.9.mute');
const maquina = argTexto(3, '192.168.0.78');

const t = new Ui24rTransport();
let valor: number | null = null;
let escuchando = false;
const recibidas: { linea: string; enMs: number }[] = [];
let envioEnMs = 0;

t.alRecibir((l) => {
  if (!l.startsWith(`SETD^${RUTA}^`)) return;
  valor = Number(l.split('^')[2]);
  if (escuchando) recibidas.push({ linea: l, enMs: Date.now() - envioEnMs });
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const inicial = Number(exigirClave(e0, RUTA));
const PREVIO: readonly (readonly [string, number])[] = [[RUTA, inicial]];

// **Un interruptor y nada más.** Si la ruta no es binaria, escribir «el otro
// valor» no significa nada y la prueba del eco tampoco.
if (inicial !== 0 && inicial !== 1) {
  throw new Error(`${RUTA} vale ${inicial}, y este guion escribe «el valor contrario»: `
    + 'sólo tiene sentido sobre una clave binaria. Pasá otra ruta.');
}
const objetivo = inicial === 1 ? 0 : 1;
console.log(`ruta ${RUTA}, valor inicial ${inicial} (leido por HTTP), se escribe ${objetivo}`);

await conRestauracion(
  async () => {
    await restaurarClaves(t, maquina, PREVIO);
  },
  async () => {
    escuchando = true;
    envioEnMs = Date.now();
    t.enviar(codificarSetd(RUTA, objetivo));
    await new Promise((r) => setTimeout(r, 6000));

    console.log(`lineas recibidas para esa ruta en 6 s: ${recibidas.length}`);
    for (const r of recibidas) console.log(`  +${r.enMs} ms  ${r.linea}`);

    console.log('');
    console.log('ahora se pide INIT para ver que quedo de verdad:');
    recibidas.length = 0;
    envioEnMs = Date.now();
    t.enviar('INIT');
    await new Promise((r) => setTimeout(r, 6000));
    for (const r of recibidas) console.log(`  +${r.enMs} ms  ${r.linea}`);
    console.log(`valor tras INIT: ${valor}  ->  `
      + `${valor === objetivo ? 'LA ESCRITURA SE APLICO' : 'no se aplico'}`);
  },
);

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  const leido = Number(exigirClave(fin, RUTA));
  const bien = leido === inicial;
  console.log(`   ${RUTA} esperado ${inicial}, leido ${leido}`
    + (bien ? '   comprobado por un camino distinto del que escribio' : '   <-- NO COINCIDE'));
  if (!bien) process.exitCode = 1;
}
await t.desconectar();
