/**
 * El medidor de reducción contra la caída real de nivel, hasta el fondo.
 *
 * **Por qué hace falta.** El ítem 97 dejó cuatro observaciones que no cierran, y
 * la hipótesis que mejor las sostiene es que **el medidor de reducción deja de
 * ser lineal por encima de 11 dB**. Está contrastado en tres puntos —4,66, 9,00
 * y 10,80 dB— y todos caen por debajo de 11; las mediciones que fallaron
 * trabajaban con reducciones de hasta 19.
 *
 * **El método, y por qué es independiente del medidor bajo sospecha.** La
 * reducción real se lee en el **medidor de nivel** del canal, cuyo recorrido de
 * 80 dB sí está medido. Con fuente y umbral fijos se barre la relación:
 *
 * - en `ratio = 1` la relación es 1:1, **no hay reducción**, y ese nivel es la
 *   referencia;
 * - en cualquier otro crudo, la caída de `entrada` respecto de esa referencia
 *   **es** la reducción real.
 *
 * **Se usa `ratio = 1` como referencia y no `dyn.bypass`, a propósito.** El
 * puenteo saca el bloque entero, incluida su ganancia de compensación
 * (`dyn.gain`, `dyn.outgain`), así que la diferencia mezclaría la reducción con
 * la compensación. Con la relación en 1:1 el bloque sigue en circuito con la
 * misma compensación y lo único que cambia es cuánto comprime.
 *
 * Y se registra `pre` como testigo: el ecualizador y el dinámico no lo tocan,
 * así que si se mueve, la fuente se movió.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/calibrar-medidor-de-reduccion.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, dbDeReduccion,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const HZ = 1000;
const FM = 48000;
const ESCALON_REDUCCION = (dbDeReduccion(240) - dbDeReduccion(246)) / 6;
const PREVIO = { threshold: 0.875, ratio: 1 };

/**
 * Umbral bien abajo, para que haya exceso de sobra.
 *
 * No importa cuántos dB de exceso son --eso es justo lo que el ítem 97 no pudo
 * fijar-- porque este experimento no lo necesita: mide la caída de nivel contra
 * lo que el medidor de reducción dice, y las dos cosas salen del aparato.
 */
const UMBRAL = 0.14;

/** De «sin comprimir» a «comprimir todo lo que se pueda». */
const RAZONES = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05];

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, -1 / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), 'vse-calibrar.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let pre: number[] = []; let entrada: number[] = []; let red: number[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  pre.push(c.pre); entrada.push(c.entrada); red.push(c.reduccionDb);
});
const media = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);
async function leer(ms = 2000) {
  pre = []; entrada = []; red = [];
  await new Promise((r) => setTimeout(r, ms));
  return { pre: media(pre), entrada: media(entrada), red: media(red), n: red.length };
}

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
// **Se EXIGE la clave, no se supone.** Antes esto era `?? '1'`, y una lectura
// HTTP fallida --que `estadoPorHttp` devuelve como mapa vacio-- hacia imprimir
// «estaba en 1» sin haberlo medido y ENCENDER al restaurar un supresor que el
// usuario podia tener apagado. Lo encontro una auditoria de instrumentos el
// 2026-09-12: era el hallazgo mas peligroso de los seis, porque toca el unico
// de 45 campos que una instantanea no devuelve.
const AFS = exigirClave(e0, 'm.afs.enabled');
t.enviar(codificarSetd('m.afs.enabled', 0));
await new Promise((r) => setTimeout(r, 1200));
const sonando = spawn('afplay', [tono(600)]);
await new Promise((r) => setTimeout(r, 3000));

t.enviar(codificarSetd(`i.${n}.dyn.threshold`, UMBRAL));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, 1));
await new Promise((r) => setTimeout(r, 2000));

console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a -1 dBFS, umbral en crudo ${UMBRAL}`);
console.log(`escalon del medidor de reduccion: ${ESCALON_REDUCCION.toFixed(4)} dB`);
console.log(`supresor: estaba en ${AFS}, se apaga`);
console.log('');
const ref = await leer();
console.log(`referencia en ratio = 1 (sin comprimir): entrada = ${dbDeMedidor(ref.entrada).toFixed(2)} dB, `
  + `reduccion informada = ${ref.red.toFixed(2)} dB, pre = ${dbDeMedidor(ref.pre).toFixed(2)}`);
console.log('');
console.log('razon |  entrada  | caida REAL | reduccion INFORMADA | diferencia | pre (testigo) | n');

const filas: { a: number; real: number; informada: number; pre: number }[] = [];
for (const a of RAZONES) {
  t.enviar(codificarSetd(`i.${n}.dyn.ratio`, a));
  await new Promise((r) => setTimeout(r, 1500));
  const l = await leer();
  const real = dbDeMedidor(ref.entrada) - dbDeMedidor(l.entrada);
  filas.push({ a, real, informada: l.red, pre: dbDeMedidor(l.pre) });
  console.log(`${a.toFixed(2).padStart(5)} | ${dbDeMedidor(l.entrada).toFixed(2).padStart(9)} | `
    + `${real.toFixed(2).padStart(10)} | ${l.red.toFixed(2).padStart(19)} | `
    + `${(l.red - real).toFixed(2).padStart(10)} | ${dbDeMedidor(l.pre).toFixed(2).padStart(13)} | ${String(l.n).padStart(3)}`);
}

sonando.kill();
t.enviar(codificarSetd(`i.${n}.dyn.threshold`, PREVIO.threshold));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, PREVIO.ratio));
t.enviar(codificarSetd('m.afs.enabled', Number(AFS)));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

console.log('');
console.log('=== EL MEDIDOR DE REDUCCION, POR TRAMOS ===');
const bajo = filas.filter((f) => f.real > 0 && f.real <= 11);
const alto = filas.filter((f) => f.real > 11);
for (const [etiqueta, xs] of [['hasta 11 dB (donde YA estaba verificado)', bajo], ['arriba de 11 dB (donde no)', alto]] as const) {
  if (xs.length === 0) { console.log(`  ${etiqueta}: sin puntos`); continue; }
  const peor = Math.max(...xs.map((f) => Math.abs(f.informada - f.real)));
  console.log(`  ${etiqueta}: ${xs.length} puntos, desvio maximo ${peor.toFixed(2)} dB `
    + `= ${(peor / ESCALON_REDUCCION).toFixed(2)} escalones`);
}
console.log('');
console.log('Si el desvio de arriba es chico en los dos tramos, el medidor esta bien');
console.log('y el problema del item 97 esta en la ley. Si crece arriba de 11, el');
console.log('medidor es el culpable y la hipotesis queda confirmada.');
const derivaPre = Math.max(...filas.map((f) => Math.abs(f.pre - dbDeMedidor(ref.pre))));
console.log('');
console.log(`deriva maxima del testigo: ${derivaPre.toFixed(2)} dB`);
console.log('restaurado, supresor incluido. La comprobacion por HTTP va aparte.');
