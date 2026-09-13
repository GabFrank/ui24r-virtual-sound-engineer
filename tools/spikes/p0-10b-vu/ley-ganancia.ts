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
 * **Convertido a `conRestauracion` el 2026-09-13, y estaba en los tres trinquetes.**
 * Escribía `hw.N.gain` —la ganancia del previo del canal— en diez posiciones y
 * **nunca leía el valor previo ni lo restauraba**: terminaba dejándola en 0,70
 * cuando la del usuario es 0,2508. No era un riesgo ante una señal: era certeza en
 * toda corrida completa, y la ganancia del previo es de las que se notan.
 *
 * Y hacía sonar **trescientos segundos** de tono sostenido con el supresor del
 * general encendido, que es como la 104 le plantó al usuario una notch de −18 dB
 * que sólo `clearall` borra, llevándose sus filtros de ring-out.
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
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const NIVEL_FUENTE_DB = Number(process.argv[5] ?? '-30');
const HZ = 1000;
const FM = 48000;
// Largo del tono. Un barrido de veinte puntos tarda mas de un minuto y medio,
// y cuando el tono se acaba las lecturas siguen saliendo: son el ruido de
// fondo subiendo con la ganancia, que se parece lo suficiente a una medicion
// como para que uno la crea. Paso una vez.
const SEGUNDOS = 300;

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
const e0 = await estadoPorHttpExigido(maquina);
const PREVIO: readonly (readonly [string, number])[] = [
  [`hw.${n}.gain`, Number(exigirClave(e0, `hw.${n}.gain`))],
  // Trescientos segundos de tono sostenido con el supresor encendido le plantan al
  // general una notch de −18 dB, y borrarla exige `clearall`, que se lleva la pila
  // entera incluido el ring-out del usuario.
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];
console.log(`hw.${n}.gain antes: ${PREVIO[0]![1]} | supresor del general: ${PREVIO[1]![1]}`);

const ruta = tonoLargo();
let sonando: ReturnType<typeof spawn> | null = null;
const medidas: { crudo: number; salida: number; entrada: number }[] = [];

await conRestauracion(
  async () => {
    sonando?.kill();
    // El audio tarda en dejar de salir aunque `afplay` muera al instante, y
    // reencender el supresor con el tono sonando es como se planto la notch.
    await new Promise((r) => setTimeout(r, 1500));
    await restaurarClaves(t, maquina, PREVIO);
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 1200));
    sonando = spawn('afplay', [ruta]);
    await new Promise((r) => setTimeout(r, 2500));

    console.log(`canal ${canal}, tono de ${HZ} Hz a ${NIVEL_FUENTE_DB} dBFS, `
      + `ganancia en ${CRUDOS.length} posiciones`);
    console.log('crudo      | ganancia segun codigo | entrada leida | subida medida | subida esperada | diferencia');

    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(`hw.${n}.gain`, crudo));
      await new Promise((r) => setTimeout(r, 1200));
      entradas = []; salidas = [];
      await new Promise((r) => setTimeout(r, 2500));
      if (salidas.length === 0) { console.log(`${crudo} sin tramas`); continue; }
      const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
      medidas.push({ crudo, salida: media(salidas), entrada: media(entradas) });
    }
  },
);

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

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  let bien = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(fin, k));
    const ok = Math.abs(leido - v) < 1e-9;
    if (!ok) bien = false;
    console.log(`   ${k.padEnd(16)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (ok ? '' : '   <-- NO COINCIDE'));
  }
  console.log(bien ? '   Comprobado por un camino distinto del que escribio.'
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) process.exitCode = 1;
}
await t.desconectar();
