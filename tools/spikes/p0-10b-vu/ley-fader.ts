/**
 * La ley del fader, medida contra el aparato.
 *
 * **Por qué hace falta.** El recorrido del medidor quedó con dos respuestas que
 * no cierran: los tonos de nivel conocido dan 84,1 a 85,3 dB, y la
 * comprobación cruzada —entrada menos salida tiene que ser el fader— da 79,3 a
 * 80,0. Un 6 % de diferencia. La hipótesis más económica es que el error no
 * esté en el medidor sino en `faderADb`, que también sale de leer el código de
 * la consola y que **nunca se midió**: un error de escala suyo es invisible en
 * esa comprobación, porque entra en sus dos términos por igual.
 *
 * **Cómo se separa una cosa de la otra.** Con la fuente fija, mover el fader no
 * cambia el nivel de entrada y sí el de salida. Entonces:
 *
 * - el medidor de **entrada** funciona de testigo: si se mueve, la fuente se
 *   movió y la corrida no vale;
 * - la diferencia de **salida** entre dos posiciones del fader es la
 *   atenuación que el fader introduce de verdad, medida con el medidor.
 *
 * Eso da la ley del fader en unidades del medidor. Si el polinomio del código
 * y la medición discrepan en el mismo 6 %, la contradicción queda explicada y
 * se corrigen las dos constantes de una vez.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-fader.ts 10
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, faderADb, VU_ESCALA,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const NIVEL_FUENTE_DB = Number(process.argv[5] ?? '-12');
const HZ = 1000;
const FM = 48000;
const SEGUNDOS = 60;

/**
 * Posiciones crudas del fader a recorrer. La primera es 0 dB según el código.
 *
 * Se recorren de arriba hacia abajo y con paso fino: lo que interesa no es un
 * punto sino **la forma de la curva**, porque la primera medición mostró que
 * la razón entre lo medido y el polinomio no es constante — 1,01 arriba, 1,06
 * en el medio, 1,02 abajo. Un error de escala daría una razón plana; una
 * curva mal modelada da esto.
 */
const CRUDOS = (process.argv[4] ?? '0.7647058824,0.72,0.68,0.64,0.60,0.56,0.52,0.48,0.44,0.40,0.36,0.32,0.28,0.24,0.20')
  .split(',').map(Number);

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
  const ruta = join(tmpdir(), 'vse-tono-largo.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let entradas: number[] = [];
let salidas: number[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const m = decodificarVuCanales(linea.slice(4))[canal - 1];
  if (m === undefined) return;
  entradas.push(m.entrada / VU_ESCALA);
  salidas.push(m.salida / VU_ESCALA);
});

await t.conectar(maquina);
const ruta = tonoLargo();
const sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2500));

console.log(`canal ${canal}, tono de ${HZ} Hz a ${NIVEL_FUENTE_DB} dBFS, fader en ${CRUDOS.length} posiciones`);
console.log('crudo      | entrada (testigo) | salida    | atenuacion medida | segun faderADb | razon');

const medidas: { crudo: number; salida: number; entrada: number }[] = [];

for (const crudo of CRUDOS) {
  t.enviar(codificarSetd(`i.${n}.mix`, crudo));
  await new Promise((r) => setTimeout(r, 1200));
  entradas = []; salidas = [];
  await new Promise((r) => setTimeout(r, 2500));
  if (salidas.length === 0) { console.log(`${crudo} sin tramas`); continue; }
  const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  medidas.push({ crudo, salida: media(salidas), entrada: media(entradas) });
}

sonando.kill();

const base = medidas[0];
if (base !== undefined) {
  for (const m of medidas) {
    const atenuacionMedida = dbDeMedidor(m.salida * VU_ESCALA) - dbDeMedidor(base.salida * VU_ESCALA);
    const atenuacionCodigo = faderADb(m.crudo) - faderADb(base.crudo);
    const razon = atenuacionCodigo === 0 ? 1 : atenuacionMedida / atenuacionCodigo;
    const derivaTestigo = dbDeMedidor(m.entrada * VU_ESCALA) - dbDeMedidor(base.entrada * VU_ESCALA);
    console.log(
      `${m.crudo.toFixed(4).padStart(10)} | ${(`${dbDeMedidor(m.entrada * VU_ESCALA).toFixed(2)} (${derivaTestigo >= 0 ? '+' : ''}${derivaTestigo.toFixed(2)})`).padStart(17)} | `
      + `${dbDeMedidor(m.salida * VU_ESCALA).toFixed(2).padStart(9)} | `
      + `${atenuacionMedida.toFixed(2).padStart(17)} | ${atenuacionCodigo.toFixed(2).padStart(14)} | `
      + `${atenuacionCodigo === 0 ? '—' : razon.toFixed(4)}`,
    );
  }
  const utiles = medidas.slice(1);
  const razones = utiles.map((m) => {
    const med = dbDeMedidor(m.salida * VU_ESCALA) - dbDeMedidor(base.salida * VU_ESCALA);
    const cod = faderADb(m.crudo) - faderADb(base.crudo);
    return med / cod;
  });
  const promedio = razones.reduce((s, v) => s + v, 0) / razones.length;
  console.log('');
  console.log(`razon promedio medida/codigo: ${promedio.toFixed(4)}`);
  console.log('1,00 = el polinomio del fader es correcto y hay que revisar el recorrido del medidor.');
  console.log('~0,94 = el fader tambien esta escalado de mas, y las dos constantes se corrigen juntas.');
}

await t.desconectar();
