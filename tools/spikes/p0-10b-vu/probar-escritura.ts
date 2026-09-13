/**
 * ¿Cuál de las cinco formas de mandar un `SETD` la consola acepta?
 *
 * Es una sonda del protocolo: prueba envoltorios distintos sobre la misma clave y
 * corta en el primero que produce un cambio. Por eso toca el socket por dentro en
 * el último intento — es una prueba, no código de producción.
 *
 * **Convertido a `conRestauracion` el 2026-09-13, y era de los que no restauraban
 * nada.** Escribía `i.9.mute` al valor contrario y terminaba: con la ruta por
 * omisión eso deja el canal 10 del usuario **muteado**. No era un riesgo ante una
 * señal —eso ya sería malo—: era certeza en toda corrida que encontrara una forma
 * que funcione, o sea en toda corrida exitosa.
 *
 * Y leía el valor previo del volcado del WebSocket con una espera de 3500 ms. Si
 * no llegaba, `valor` quedaba en `null`, `objetivo` salía 1 por comparar con
 * `null`, y la sonda escribía 1 sobre una clave cuyo valor no conocía.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/probar-escritura.ts [ruta] [maquina]
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { argTexto } from '../argumentos.ts';

const RUTA = argTexto(2, 'i.9.mute');
const maquina = argTexto(3, '192.168.0.78');

const t = new Ui24rTransport();
let valor: number | null = null;
const vistos: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith(`SETD^${RUTA}^`)) { valor = Number(l.split('^')[2]); vistos.push(l); }
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const inicial = Number(exigirClave(e0, RUTA));
const PREVIO: readonly (readonly [string, number])[] = [[RUTA, inicial]];

// **Un interruptor y nada más.** La sonda escribe «el valor contrario»; sobre una
// clave continua eso no significa nada y el resultado tampoco.
if (inicial !== 0 && inicial !== 1) {
  throw new Error(`${RUTA} vale ${inicial}, y esta sonda escribe «el valor contrario»: `
    + 'sólo tiene sentido sobre una clave binaria. Pasá otra ruta.');
}
valor = inicial;
const objetivo = inicial === 1 ? 0 : 1;
console.log(`ruta ${RUTA}, valor inicial ${inicial} (leido por HTTP), se intenta ${objetivo}`);

const intentos: [string, () => void][] = [
  ['SETD pelado', () => t.enviar(`SETD^${RUTA}^${objetivo}`)],
  ['SETD con decimal', () => t.enviar(`SETD^${RUTA}^${objetivo}.0`)],
  ['@SETD', () => t.enviar(`@SETD^${RUTA}^${objetivo}`)],
  ['INIT y despues SETD', () => { t.enviar('INIT'); setTimeout(() => t.enviar(`SETD^${RUTA}^${objetivo}`), 1200); }],
  ['SETD sin envoltorio socket.io', () => {
    // Accede al socket por dentro: es una prueba, no codigo de produccion.
    const ws = (t as unknown as { ws: WebSocket }).ws;
    ws.send(`SETD^${RUTA}^${objetivo}`);
  }],
];

await conRestauracion(
  async () => {
    await restaurarClaves(t, maquina, PREVIO);
  },
  async () => {
    for (const [nombre, enviar] of intentos) {
      const antes = valor;
      try { enviar(); } catch (e) { console.log(`  ${nombre.padEnd(32)} error al enviar: ${e}`); continue; }
      await new Promise((r) => setTimeout(r, 2500));
      const cambio = valor !== antes;
      console.log(`  ${nombre.padEnd(32)} ${cambio ? `*** FUNCIONA (${antes} -> ${valor}) ***` : 'sin efecto'}`);
      if (cambio) break;
    }
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
