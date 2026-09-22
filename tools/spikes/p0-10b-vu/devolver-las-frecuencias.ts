/**
 * Devuelve a su sitio las frecuencias de banda que una corrida dejo movidas.
 *
 * **Existe por un defecto propio, del 2026-09-16.** Al hacer que
 * `ley-ganancia-del-eq.ts` COLOQUE la banda en 1000 Hz --para poder medir las que
 * no vienen ahi de fabrica-- se agrego la escritura y no se agrego la clave a
 * `PREVIO`. Las bandas 1, 3 y 4 del canal 10 quedaron las tres en 1000 Hz.
 *
 * El guion ya esta arreglado; esto devuelve lo que quedo mal de las corridas que
 * se hicieron con la version rota.
 *
 * **Los valores a los que vuelve NO se inventan.** Salen del volcado completo del
 * estado del aparato tomado el 2026-09-15 a las 21:50, antes de la primera
 * medicion de esta tanda, y coinciden ademas con los valores de fabrica que trae
 * el estado archivado de `fmalcher/soundcraft-ui` para otra Ui24R.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/devolver-las-frecuencias.ts [maquina]
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';

const maquina = argTexto(2, '192.168.0.78');
const n = 9;

/** De fabrica, del volcado del 2026-09-15 21:50. 200, 1000, 4000, 10000 y 16000 Hz. */
const DE_FABRICA: readonly (readonly [string, number])[] = [
  [`i.${n}.eq.b1.freq`, 0.3286901902],
  [`i.${n}.eq.b2.freq`, 0.5584347738],
  [`i.${n}.eq.b3.freq`, 0.7563259869],
  [`i.${n}.eq.b4.freq`, 0.887124964],
  [`i.${n}.eq.b5.freq`, 0.9542171999],
];

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const hz = (v: number): number => 20 * Math.pow(1102.5, v);

console.log('=== DEVOLVER LAS FRECUENCIAS DE BANDA DEL CANAL 10 ===');
console.log('');
const movidas = DE_FABRICA.filter(([k, v]) => Number(exigirClave(e0, k)) !== v);
for (const [k, v] of DE_FABRICA) {
  const ahora = Number(exigirClave(e0, k));
  const marca = ahora === v ? 'ya esta' : `MOVIDA -> vuelve a ${hz(v).toFixed(0)} Hz`;
  console.log(`   ${k.padEnd(18)} ahora ${hz(ahora).toFixed(0).padStart(6)} Hz   ${marca}`);
}
console.log('');

if (movidas.length === 0) {
  console.log('No hay ninguna movida. No se escribe nada.');
  await t.desconectar();
  process.exit(0);
}

// **El papelito, aunque el destino sea el valor de fabrica.** Si el proceso muere
// entre una escritura y otra, algunas bandas quedan devueltas y otras no, y nadie
// lo sabria. El papelito deja en disco cuales tenian que volver.
anotarPendiente('devolver-las-frecuencias.ts', maquina, DE_FABRICA);

// **`conRestauracion` con el mismo destino en las dos ramas, y no es teatro.**
// Lo correcto aca es que las claves terminen de fabrica pase lo que pase: si el
// proceso muere a mitad, el `finally` vuelve a escribirlas.
await conRestauracion(
  async () => { await restaurarClaves(t, maquina, movidas); },
  async () => { await restaurarClaves(t, maquina, movidas); },
);

const e1 = await estadoPorHttpExigido(maquina);
console.log('=== RELEIDO POR HTTP ===');
let bien = true;
for (const [k, v] of DE_FABRICA) {
  const leido = Number(exigirClave(e1, k));
  const ok = leido === v;
  if (!ok) bien = false;
  console.log(`   ${k.padEnd(18)} esperado ${v}  leido ${leido}  ${ok ? 'OK' : 'MAL'}`);
}
await t.desconectar();
console.log('');
console.log(bien ? 'Las cinco bandas del canal 10 vuelven a estar donde estaban.'
  : 'ALGUNA NO VOLVIO. Hay que mirar la consola.');
if (bien) cerrarPendiente(); else process.exitCode = 1;
