/**
 * Censo del vocabulario que la consola emite.
 *
 * Cuenta cada tipo de mensaje que llega en una ventana de tiempo. Sirve para
 * dos cosas: saber que existe --el adaptador solo reconoce cinco tipos y la
 * consola podria estar hablando de mas-- y, sobre todo, para comparar dos
 * ventanas y ver si aparece algo nuevo cuando se enciende una funcion.
 *
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/censo.ts 20
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const segundos = Number(process.argv[2] ?? '20');
const maquina = process.argv[3] ?? '192.168.0.78';
const t = new Ui24rTransport();
const cuenta = new Map<string, number>();
const ejemplo = new Map<string, string>();

t.alRecibir((l) => {
  // El tipo es lo que va antes del primer ^; si no hay ^, la linea entera.
  const tipo = l.includes('^') ? l.slice(0, l.indexOf('^')) : l.slice(0, 24);
  cuenta.set(tipo, (cuenta.get(tipo) ?? 0) + 1);
  if (!ejemplo.has(tipo)) ejemplo.set(tipo, l.slice(0, 90));
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, segundos * 1000));
await t.desconectar();

const filas = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
console.log(`${segundos} s de escucha, ${filas.length} tipos distintos:`);
for (const [tipo, n] of filas) {
  console.log(`  ${String(n).padStart(6)}  ${tipo.padEnd(14)} ${ejemplo.get(tipo) ?? ''}`);
}
