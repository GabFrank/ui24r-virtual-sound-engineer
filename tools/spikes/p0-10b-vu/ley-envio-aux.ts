/**
 * La ley del envío a un auxiliar, medida contra el aparato.
 *
 * **Por qué hace falta.** `i.N.aux.M.value` va de 0 a 1 y nadie sabe a cuántos
 * decibeles corresponde. Sin ese eje no se puede declarar un límite en dB, e
 * INV-004 rechaza todo parámetro sin límite: es lo que mantiene
 * `MONITOR_AUX_SEND` cerrado a la escritura.
 *
 * **Cómo se separa el envío de todo lo demás.** Con la fuente fija, mover el
 * envío no cambia el nivel del canal y sí el del bus auxiliar. Entonces:
 *
 * - el medidor del **canal** funciona de testigo: si se mueve, la fuente se
 *   movió y la corrida no vale;
 * - la diferencia del medidor **del auxiliar** entre dos valores del envío es
 *   la atenuación que el envío introduce de verdad.
 *
 * **Por qué el auxiliar 3 y no el 1.** El 1 (`a.0`) tiene el supresor encendido
 * con un filtro plantado de −18 dB en 999,97 Hz: un barrido con tono de 1 kHz
 * por ahí mediría el notch y daría una curva creíble y falsa. El 3 (`a.2`)
 * tiene `afs.enabled = 0`.
 *
 * **Por qué no hace falta subir `a.2.mix`, que está en 0.** El medidor de un
 * auxiliar es una tira mono y su byte `+0` **no sigue al fader del bus** —
 * medido el 2026-09-09 moviendo `a.0.mix`. Se lee `pre`, y el fader del bus
 * queda donde está: una escritura menos que restaurar.
 *
 * Contrato de expectativas: `docs/compromisos/94-ley-del-envio-a-auxiliar.md`,
 * escrito antes de correr esto.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-envio-aux.ts 10 2 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, decodificarVuBuses,
  dbDeMedidor, faderADb, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const aux = Number(process.argv[3] ?? '2');
const maquina = process.argv[4] ?? '192.168.0.78';
/**
 * Nivel del tono, en dBFS. Por argumento porque **el rango útil del barrido lo
 * fija la fuente**: con −12 dBFS el medidor del bus llega al piso a los 18 dB
 * de atenuación, y 18 dB no alcanzan para separar la ley del fader de una
 * curva parecida — el desvío entero cabe en un escalón del medidor.
 */
const NIVEL_FUENTE_DB = Number(process.argv[6] ?? '-12');
const HZ = 1000;
const FM = 48000;
const SEGUNDOS = 240;

/** El fader del canal, para restaurarlo después de la prueba de `post`. */
const FADER_ORIGINAL = 0.7647058824;

/**
 * Cuánto vale un escalón del medidor, en dB.
 *
 * **Se deriva, no se escribe.** Es el rango del medidor por su escala: un byte
 * de diferencia son `MEDIDOR_RANGO_DB * VU_ESCALA` decibeles, hoy 0,3334.
 * Escribir 0,333 a mano acá —que es lo que hacía la primera versión— crea dos
 * números que dicen lo mismo y pueden separarse el día que alguien toque el
 * rango, y toda la conclusión de esta medición cuelga de este valor.
 *
 * **Ningún hallazgo por debajo de esto existe.**
 */
const RESOLUCION_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

/**
 * Valores del envío a recorrer, de arriba hacia abajo.
 *
 * Paso fino a propósito: lo que interesa no es un punto sino **la forma de la
 * curva**. Un error de escala da una razón plana contra el polinomio; una
 * curva distinta da una razón que se mueve, y eso sólo se ve con varios puntos.
 */
// **`??` no cae al valor por defecto con una cadena vacía**, sólo con
// `null`/`undefined`. Pasar `""` desde la línea de órdenes --para saltear este
// argumento y llegar al siguiente-- barría un solo punto, el cero, y la corrida
// se archivaba igual con una tabla de una fila. Se comprueba el vacío a mano.
const listaCruda = process.argv[5];
const CRUDOS = ((listaCruda === undefined || listaCruda.trim() === '') ? [
  '1.0', '0.95', '0.90', '0.85', '0.80', '0.7647058824', '0.72', '0.68', '0.64',
  '0.60', '0.56', '0.52', '0.48', '0.44', '0.40', '0.36', '0.32', '0.28',
  '0.24', '0.20', '0.16', '0.12', '0.08', '0.05',
].join(',') : listaCruda).split(',').map(Number);

if (CRUDOS.length < 5 || CRUDOS.some((x) => !Number.isFinite(x))) {
  console.error(`lista de valores invalida: ${CRUDOS.length} puntos`);
  console.error('Un barrido de menos de cinco puntos no dibuja ninguna curva.');
  process.exit(2);
}

function tonoLargo(): string {
  const muestras = FM * SEGUNDOS;
  const amplitud = Math.pow(10, NIVEL_FUENTE_DB / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), 'vse-tono-envio.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let testigo: number[] = [];
let bus: number[] = [];
let crudosDelBus: number[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const c = decodificarVuCanales(carga)[n];
  if (c !== undefined) testigo.push(c.pre / VU_ESCALA);
  const b = decodificarVuBuses(carga).auxiliares[aux];
  if (b !== undefined) { bus.push(b.pre / VU_ESCALA); crudosDelBus.push(b.pre); }
});

const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
const maximo = (xs: number[]): number => xs.reduce((s, v) => Math.max(s, v), 0);

await t.conectar(maquina);
const ruta = tonoLargo();
const sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2500));

console.log(`canal ${canal} (i.${n}) -> auxiliar ${aux + 1} (a.${aux})`);
console.log(`tono de ${HZ} Hz a ${NIVEL_FUENTE_DB} dBFS, ${CRUDOS.length} valores de envio`);
console.log('');
console.log('crudo      | testigo canal  | medidor aux | dB medidos | atenuacion | segun faderADb | razon | n');

const medidas: { crudo: number; bus: number; testigo: number; techo: number; tramas: number }[] = [];

for (const crudo of CRUDOS) {
  t.enviar(codificarSetd(`i.${n}.aux.${aux}.value`, crudo));
  await new Promise((r) => setTimeout(r, 1200));
  testigo = []; bus = []; crudosDelBus = [];
  await new Promise((r) => setTimeout(r, 2500));
  if (bus.length === 0) { console.log(`${crudo} sin tramas de bus`); continue; }
  medidas.push({
    crudo, bus: media(bus), testigo: media(testigo),
    techo: maximo(crudosDelBus), tramas: bus.length,
  });
}

const base = medidas[0];
if (base !== undefined) {
  for (const m of medidas) {
    const db = dbDeMedidor(m.bus * VU_ESCALA);
    const aten = db - dbDeMedidor(base.bus * VU_ESCALA);
    const codigo = faderADb(m.crudo) - faderADb(base.crudo);
    const razon = codigo === 0 ? null : aten / codigo;
    const deriva = dbDeMedidor(m.testigo * VU_ESCALA) - dbDeMedidor(base.testigo * VU_ESCALA);
    console.log(
      `${m.crudo.toFixed(4).padStart(10)} | `
      + `${(`${dbDeMedidor(m.testigo * VU_ESCALA).toFixed(2)} (${deriva >= 0 ? '+' : ''}${deriva.toFixed(2)})`).padStart(14)} | `
      + `${m.bus.toFixed(1).padStart(11)} | ${db.toFixed(2).padStart(10)} | `
      + `${aten.toFixed(2).padStart(10)} | ${codigo.toFixed(2).padStart(14)} | `
      + `${razon === null ? '    —' : razon.toFixed(3).padStart(5)} | ${String(m.tramas).padStart(3)}`,
    );
  }
  const utiles = medidas.slice(1).filter((m) => m.bus > 0);
  const razones = utiles.map((m) => (dbDeMedidor(m.bus * VU_ESCALA) - dbDeMedidor(base.bus * VU_ESCALA))
    / (faderADb(m.crudo) - faderADb(base.crudo)));
  console.log('');
  // **La razon es un mal resumen cerca del punto de referencia, y este guion la
  // usaba como resumen principal.** En el crudo 0,95 la razon dio 0,940 y parece
  // un desvio del 6 %; el desvio absoluto ahi es 0,15 dB, o sea medio escalon del
  // medidor. Con el denominador chico, la cuantizacion del medidor se amplifica
  // sin limite. Lo que decide es el desvio absoluto contra la resolucion.
  const desvios = utiles.map((m) => Math.abs(
    (dbDeMedidor(m.bus * VU_ESCALA) - dbDeMedidor(base.bus * VU_ESCALA))
    - (faderADb(m.crudo) - faderADb(base.crudo))));
  const peor = Math.max(...desvios);
  console.log(`desvio absoluto maximo contra faderADb: ${peor.toFixed(2)} dB `
    + `= ${(peor / RESOLUCION_DB).toFixed(2)} escalones del medidor`);
  console.log(`recorrido util medido: ${Math.abs(
    dbDeMedidor(utiles[utiles.length - 1]!.bus * VU_ESCALA)
    - dbDeMedidor(base.bus * VU_ESCALA)).toFixed(1)} dB en ${utiles.length + 1} puntos`);
  console.log('P1: todos los puntos dentro de un escalon = indistinguible de la ley del fader.');
  console.log('    NO es lo mismo que "es la ley del fader": ningun medidor puede probar eso.');
  console.log(`razon promedio medida/faderADb: ${media(razones).toFixed(4)} (informativa, no decide)`);
  const derivas = medidas.map((m) => Math.abs(
    dbDeMedidor(m.testigo * VU_ESCALA) - dbDeMedidor(base.testigo * VU_ESCALA)));
  console.log(`P4: deriva maxima del testigo: ${Math.max(...derivas).toFixed(2)} dB (se pide < 0,5)`);
  console.log(`techo crudo del medidor del bus visto: ${Math.max(...medidas.map((m) => m.techo))}`);
}

// --- P5: con post = 0, el fader del canal no debe mover el auxiliar ---
console.log('');
console.log('=== P5: el fader del canal contra el envio pre-fader ===');
t.enviar(codificarSetd(`i.${n}.aux.${aux}.value`, 0.8));
await new Promise((r) => setTimeout(r, 1500));
for (const f of [FADER_ORIGINAL, 0.5, 0.3, FADER_ORIGINAL]) {
  t.enviar(codificarSetd(`i.${n}.mix`, f));
  await new Promise((r) => setTimeout(r, 1200));
  bus = []; testigo = [];
  await new Promise((r) => setTimeout(r, 2000));
  if (bus.length === 0) { console.log(`fader ${f}: sin tramas`); continue; }
  console.log(`fader ${f.toFixed(4)} -> aux ${dbDeMedidor(media(bus) * VU_ESCALA).toFixed(2)} dB`
    + `   canal(pre) ${dbDeMedidor(media(testigo) * VU_ESCALA).toFixed(2)} dB`);
}

sonando.kill();

// --- Restauracion ---
t.enviar(codificarSetd(`i.${n}.aux.${aux}.value`, 0));
t.enviar(codificarSetd(`i.${n}.mix`, FADER_ORIGINAL));
await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();

console.log('');
console.log('restaurado por el mismo camino que escribio. La comprobacion por HTTP va aparte.');
