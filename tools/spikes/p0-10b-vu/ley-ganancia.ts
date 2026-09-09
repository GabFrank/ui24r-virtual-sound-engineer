/**
 * La ley de la ganancia de entrada, medida contra el aparato.
 *
 * **Por qué es la medición que más importa del MVP.** `gananciaADb` es la
 * curva con la que el asistente propone «subí cuatro decibeles», o sea lo
 * único que esta aplicación le dice hoy al usuario. Sale de leer las tablas de
 * la consola y **nunca se midió contra el aparato**. Después de lo que pasó
 * con el recorrido del medidor —una lectura de código que parecía sólida y
 * estaba mal— una curva sin medir es una deuda con intereses.
 *
 * **El método es el mismo que resolvió lo del medidor**: mover algo que ya está
 * adentro de la consola, con la fuente fija. La ganancia es anterior al punto
 * donde se toma el medidor de entrada, así que subirla tiene que subir la
 * lectura en la misma cantidad. Acá el testigo no sirve —la ganancia afecta a
 * los dos medidores— así que la fuente se deja quieta y se verifica que la
 * escalera cierre consigo misma.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-fader.ts 10
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, gananciaADb, VU_ESCALA,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const NIVEL_FUENTE_DB = Number(process.argv[5] ?? '-30');
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
const CRUDOS = (process.argv[4] ?? '0.25,0.30,0.35,0.40,0.45,0.50,0.55,0.60,0.65,0.70')
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
console.log('crudo      | ganancia segun codigo | entrada leida | subida medida | subida esperada | diferencia');

const medidas: { crudo: number; salida: number; entrada: number }[] = [];

for (const crudo of CRUDOS) {
  t.enviar(codificarSetd(`hw.${n}.gain`, crudo));
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
  const diferencias: number[] = [];
  for (const m of medidas) {
    const subidaMedida = dbDeMedidor(m.entrada * VU_ESCALA) - dbDeMedidor(base.entrada * VU_ESCALA);
    const subidaEsperada = gananciaADb(m.crudo) - gananciaADb(base.crudo);
    const diferencia = subidaMedida - subidaEsperada;
    if (m !== base) diferencias.push(diferencia);
    console.log(
      `${m.crudo.toFixed(4).padStart(10)} | ${`${gananciaADb(m.crudo).toFixed(1)} dB`.padStart(21)} | `
      + `${dbDeMedidor(m.entrada * VU_ESCALA).toFixed(2).padStart(13)} | `
      + `${subidaMedida.toFixed(2).padStart(13)} | ${subidaEsperada.toFixed(2).padStart(15)} | `
      + `${(diferencia >= 0 ? '+' : '') + diferencia.toFixed(2)}`,
    );
  }
  const peor = diferencias.reduce((p, d) => Math.max(p, Math.abs(d)), 0);
  const media = diferencias.reduce((s, d) => s + d, 0) / (diferencias.length || 1);
  console.log('');
  console.log(`diferencia media ${media >= 0 ? '+' : ''}${media.toFixed(2)} dB, peor caso ${peor.toFixed(2)} dB`);
  console.log('Un escalon del medidor son 0,33 dB: por debajo de eso no se puede distinguir.');
}

await t.desconectar();
