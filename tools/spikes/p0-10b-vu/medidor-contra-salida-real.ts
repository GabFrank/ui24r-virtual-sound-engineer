/**
 * El medidor de la consola contra la salida real, capturada por la interfaz.
 *
 * **Contrato:** `docs/compromisos/99b-el-medidor-contra-la-salida-real.md`.
 *
 * **Por qué existe.** Las cinco mediciones del 2026-09-12 terminan todas con la
 * misma declaración: «esto es autoconsistencia y no calibración». Se contrasta
 * un medidor de la consola contra otro medidor de la misma consola, los dos
 * decodificados con constantes del mismo `mixer.html`. Con la salida del general
 * entrando a la interfaz hay por primera vez un **segundo instrumento**.
 *
 * **Y hay una hipótesis que esto tiene que decidir**, que un auditor levantó y
 * no se podía descartar desde adentro: que la consola no **mida** el medidor
 * post-fader sino que lo **calcule** como `pre × tabla(fader)`. Si fuera así,
 * cada vez que este proyecto comparó un medidor post-fader contra `faderADb`
 * estaba contrastando una tabla contra sí misma. Toca a la 94 y a la 96b, que
 * midieron leyes de envío leyendo medidores post-fader.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/medidor-contra-salida-real.ts 10 192.168.0.78
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, decodificarVuBuses,
  dbDeMedidor, faderADb, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
// @ts-expect-error -- el analizador es JavaScript puro y no tiene tipos.
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');

const HZ = 1000;
const FM = 48000;
/** El nivel del tono. Moderado: nada está conectado, pero tampoco hace falta. */
const NIVEL_DBFS = -20;

const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
/** Dos escalones: toda atenuación de acá es diferencia de dos lecturas. */
const TOLERANCIA_MEDIDOR_DB = 2 * ESCALON_DB;

/**
 * Cuánto tiene que separar el tono del ruido del bin para que el punto valga.
 *
 * Veinte decibeles. No es el criterio de «se ve»: es el de «se ve con una cifra
 * confiable». A menos de eso el ruido del bin empieza a mover el segundo decimal
 * y la comparación contra el medidor pierde sentido.
 */
const MARGEN_MINIMO_DB = 20;

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');

/** El canal de la interfaz donde entra el general, y el de su referencia. */
const ENTRADA_GENERAL = 0;
const ENTRADA_REFERENCIA = 2;

const CRUDOS = [
  1.0, 0.95, 0.90, 0.85, 0.80, 0.7647058824, 0.72, 0.68, 0.64,
  0.60, 0.56, 0.52, 0.48, 0.44, 0.40, 0.36, 0.32, 0.28,
  0.24, 0.20, 0.16, 0.12, 0.08, 0.05,
];

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, NIVEL_DBFS / 20) * 32767;
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
  const ruta = join(tmpdir(), 'vse-medidor-real.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: {
  pre: number; entrada: number; salida: number;
  reduccionGeneral: number; postGeneral: number;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const c = decodificarVuCanales(carga)[n];
  const g = decodificarVuBuses(carga).general;
  if (c === undefined || g === null || g === undefined) return;
  cuadros.push({
    pre: c.pre, entrada: c.entrada, salida: c.salida,
    // **El compresor del general se vigila en cada punto, no sólo al empezar.**
    // El nivel que le llega cambia en cada paso del barrido, así que verificarlo
    // una vez sería un control que sólo puede confirmar.
    reduccionGeneral: g.izquierdo.reduccionDb,
    postGeneral: g.izquierdo.post,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

const carpeta = mkdtempSync(join(tmpdir(), 'vse-99b-'));

/**
 * Un punto: se graba el audio y se leen los medidores **en la misma ventana**.
 *
 * El grabador corre como subproceso y las tramas del WebSocket se juntan
 * mientras tanto. No es una sincronización a la muestra —no hace falta— pero sí
 * garantiza que los dos instrumentos miran el mismo tramo de señal, que es lo
 * que una prueba suelta de hoy no hizo: el auxiliar se abrió a mitad de la
 * grabación y el resultado parecía distorsión.
 */
async function medirPunto(etiqueta: string, segundos = 3): Promise<{
  preDb: number; entradaDb: number; salidaDb: number;
  postGeneralDb: number; reduccionGeneralMax: number; cuadros: number;
  realDb: number; referenciaDb: number; ruidoRealDb: number;
}> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  cuadros = [];
  const hijo = spawn(GRABADOR, [String(segundos), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const xs = cuadros;
  const a = analizar(wav, HZ) as {
    canales: { tonoDb: number; ruidoDb: number }[];
  };
  // El archivo se borra en cuanto se leyó: cuarenta y ocho capturas de tres
  // segundos son doscientos megabytes que no aportan nada una vez medidos.
  rmSync(wav, { force: true });
  return {
    preDb: dbDeMedidor(media(xs.map((c) => c.pre))),
    entradaDb: dbDeMedidor(media(xs.map((c) => c.entrada))),
    salidaDb: dbDeMedidor(media(xs.map((c) => c.salida))),
    postGeneralDb: dbDeMedidor(media(xs.map((c) => c.postGeneral))),
    reduccionGeneralMax: xs.length === 0 ? NaN
      : xs.reduce((m, c) => Math.max(m, c.reduccionGeneral), 0),
    cuadros: xs.length,
    realDb: a.canales[ENTRADA_GENERAL]!.tonoDb,
    ruidoRealDb: a.canales[ENTRADA_GENERAL]!.ruidoDb,
    referenciaDb: a.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

// ---------------------------------------------------------------- montaje

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const PREVIO = {
  fader: Number(exigirClave(e0, `i.${n}.mix`)),
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
};

console.log('=== 99b — EL MEDIDOR DE LA CONSOLA CONTRA LA SALIDA REAL ===');
console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a ${NIVEL_DBFS} dBFS`);
console.log(`escalon del medidor: ${ESCALON_DB.toFixed(6)} dB | tolerancia ${TOLERANCIA_MEDIDOR_DB.toFixed(4)} dB`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.mix`, `i.${n}.mute`, `hw.${n}.gain`, `i.${n}.dyn.ratio`, `i.${n}.gate.thresh`,
  `i.${n}.eq.bypass`, `i.${n}.deesser.enabled`, `i.${n}.subgroup`,
  'm.mix', 'm.dyn.bypass', 'm.dyn.l.ratio', 'm.dyn.l.threshold', 'm.gate.enabled',
  'm.eq.bypass', 'm.delayL', 'm.afs.enabled', 'm.afs.numfixed', 'm.afs.numtotal',
]) {
  console.log(`   ${k.padEnd(22)} ${e0.get(k) ?? '(ausente)'}`);
}
console.log('');

const sonando = spawn('afplay', [tono(600)]);

interface Punto {
  readonly crudo: number;
  readonly sentido: 'baja' | 'sube';
  readonly preDb: number;
  readonly entradaDb: number;
  readonly salidaDb: number;
  readonly realDb: number;
  readonly referenciaDb: number;
  readonly margenDb: number;
  readonly reduccionGeneralMax: number;
  readonly cuadros: number;
  readonly anulado: string | null;
}

const puntos: Punto[] = [];
let balistica: { ms: number; medidorDb: number }[] = [];

await conRestauracion(
  () => {
    sonando.kill();
    t.enviar(codificarSetd(`i.${n}.mix`, PREVIO.fader));
    t.enviar(codificarSetd('m.afs.enabled', PREVIO.afs));
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`supresor del general: estaba en ${PREVIO.afs}, se apaga para medir`);
    await new Promise((r) => setTimeout(r, 3000));

    console.log('');
    console.log('crudo      | medidor | real   | ref    | segun ley | med-ley | real-ley | '
      + 'med-real | margen | pre    | entrada | n');

    let topeMedidor = NaN;
    let topeReal = NaN;

    for (const sentido of ['baja', 'sube'] as const) {
      const orden = sentido === 'baja' ? CRUDOS : [...CRUDOS].reverse();
      for (const crudo of orden) {
        t.enviar(codificarSetd(`i.${n}.mix`, crudo));
        await new Promise((r) => setTimeout(r, 2000));
        const p = await medirPunto(`${sentido}-${crudo}`);

        if (sentido === 'baja' && crudo === CRUDOS[0]) {
          topeMedidor = p.salidaDb;
          topeReal = p.realDb;
        }
        const atenuacionMedidor = topeMedidor - p.salidaDb;
        const atenuacionReal = topeReal - p.realDb;
        const segunLey = faderADb(CRUDOS[0]!) - faderADb(crudo);
        const margen = p.realDb - p.ruidoRealDb;

        const anulado = p.cuadros === 0 ? 'sin tramas de la consola'
          : !Number.isFinite(p.realDb) ? 'sin tono en la captura'
          : p.reduccionGeneralMax > 0 ? `el compresor del general actuo (${p.reduccionGeneralMax.toFixed(2)} dB)`
          : margen < MARGEN_MINIMO_DB ? `margen de ${margen.toFixed(1)} dB sobre el ruido del bin`
          : null;

        puntos.push({
          crudo, sentido, preDb: p.preDb, entradaDb: p.entradaDb, salidaDb: p.salidaDb,
          realDb: p.realDb, referenciaDb: p.referenciaDb, margenDb: margen,
          reduccionGeneralMax: p.reduccionGeneralMax, cuadros: p.cuadros, anulado,
        });

        console.log(`${crudo.toFixed(4).padStart(10)} | ${p.salidaDb.toFixed(2).padStart(7)} | `
          + `${p.realDb.toFixed(2).padStart(6)} | ${p.referenciaDb.toFixed(2).padStart(6)} | `
          + `${segunLey.toFixed(2).padStart(9)} | `
          + `${(atenuacionMedidor - segunLey).toFixed(2).padStart(7)} | `
          + `${(atenuacionReal - segunLey).toFixed(2).padStart(8)} | `
          + `${(atenuacionMedidor - atenuacionReal).toFixed(2).padStart(8)} | `
          + `${margen.toFixed(1).padStart(6)} | ${p.preDb.toFixed(2).padStart(6)} | `
          + `${p.entradaDb.toFixed(2).padStart(7)} | ${String(p.cuadros).padStart(3)}`
          + (anulado === null ? '' : `   ANULADO: ${anulado}`));
      }
    }

    // --- El control de balistica -----------------------------------------
    //
    // Un medidor calculado del fader sigue al fader al instante; uno que integra
    // audio tiene una cola. **No lleva umbral**: no hay valor previo contra el
    // cual compararlo, y ponerle uno inventado seria fabricar un criterio. Se
    // informa con sus numeros.
    console.log('');
    console.log('=== BALISTICA: cuanto tarda el medidor en caer ===');
    t.enviar(codificarSetd(`i.${n}.mix`, 1.0));
    await new Promise((r) => setTimeout(r, 3000));
    cuadros = [];
    const t0 = Date.now();
    t.enviar(codificarSetd(`i.${n}.mix`, 0.05));
    await new Promise((r) => setTimeout(r, 3000));
    balistica = cuadros.map((c, i) => ({
      // Los cuadros llegan cada ~34 ms; el instante exacto de cada uno no se
      // registra, asi que esto es el indice por la cadencia medida, no un reloj.
      ms: Math.round((i * 3000) / Math.max(1, cuadros.length)),
      medidorDb: dbDeMedidor(c.salida),
    }));
    for (const b of balistica.filter((_, i) => i % 2 === 0).slice(0, 14)) {
      console.log(`   ${String(b.ms).padStart(5)} ms -> ${b.medidorDb.toFixed(2)} dB`);
    }
  },
);

await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();

// ------------------------------------------------------------ veredictos

const utiles = puntos.filter((p) => p.anulado === null);
console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 99b ===');
console.log(`   ${utiles.length} puntos utiles de ${puntos.length}`);
for (const p of puntos.filter((x) => x.anulado !== null)) {
  console.log(`     crudo ${p.crudo} ${p.sentido}: ${p.anulado}`);
}

const rango = (xs: number[]) =>
  (xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs));

// M1 — los testigos de la consola
{
  const dPre = rango(puntos.map((p) => p.preDb).filter(Number.isFinite));
  const dEnt = rango(puntos.map((p) => p.entradaDb).filter(Number.isFinite));
  console.log('');
  console.log(`M1 deriva de pre: ${dPre.toFixed(2)} dB | de entrada: ${dEnt.toFixed(2)} dB`);
  console.log(Math.max(dPre, dEnt) <= TOLERANCIA_MEDIDOR_DB
    ? '   PASA. El fader esta aguas abajo de los dos, como el proyecto cree.'
    : '   FALLA: o se movio la fuente, o el fader no esta donde este proyecto cree.');
}

// M2 — la referencia interna de la interfaz
{
  const d = rango(puntos.map((p) => p.referenciaDb).filter(Number.isFinite));
  console.log('');
  console.log(`M2 deriva de la referencia interna: ${d.toFixed(2)} dB`);
  console.log(d <= 0.2 ? '   PASA. El camino de reproduccion no se movio.'
    : '   FALLA: cambio el camino de reproduccion y las comparaciones no valen.');
}

const bajando = utiles.filter((p) => p.sentido === 'baja');
const topeM = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.salidaDb ?? NaN;
const topeR = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.realDb ?? NaN;
const ley = (c: number) => faderADb(CRUDOS[0]!) - faderADb(c);

// M3 — la salida real contra faderADb
{
  let peor = 0; let donde = NaN;
  for (const p of bajando) {
    const d = Math.abs((topeR - p.realDb) - ley(p.crudo));
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`M3 salida real contra faderADb: desvio maximo ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(peor <= 0.5
    ? '   PASA. `faderADb` describe el fader, medido AFUERA de la consola.'
    : '   FALLA. Primera evidencia medida afuera de que `faderADb` no describe el\n'
      + '   fader. Toca todo lo que la usa.');
}

// M4 — el medidor contra la salida real: la pregunta central
{
  let peor = 0; let donde = NaN;
  const difs: number[] = [];
  for (const p of bajando) {
    const d = (topeM - p.salidaDb) - (topeR - p.realDb);
    difs.push(d);
    if (Math.abs(d) > peor) { peor = Math.abs(d); donde = p.crudo; }
  }
  console.log('');
  console.log(`M4 medidor contra salida real: desvio maximo ${peor.toFixed(2)} dB en el crudo ${donde}`);
  const positivos = difs.filter((d) => d > ESCALON_DB / 2).length;
  const negativos = difs.filter((d) => d < -ESCALON_DB / 2).length;
  console.log(`   signo de las diferencias: ${positivos} positivas, ${negativos} negativas, `
    + `${difs.length - positivos - negativos} dentro de medio escalon`);
  console.log(peor <= TOLERANCIA_MEDIDOR_DB
    ? '   PASA. **El medidor predice la salida real.** Calculado o medido, sirve\n'
      + '   para lo que la aplicacion lo usa. Esto NO distingue «medido» de\n'
      + '   «calculado y correcto»: ninguna comparacion estacionaria puede.'
    : '   FALLA. El medidor no predice la salida, y la 94 y la 96b --que midieron\n'
      + '   leyes a traves de medidores post-fader-- quedan tocadas.');
}

// M5 — el escalon del medidor contra el instrumento externo
{
  // Minimos cuadrados de lecturas del medidor (en bytes) contra dB reales.
  const xs = bajando.map((p) => (p.salidaDb + MEDIDOR_RANGO_DB) / ESCALON_DB);
  const ys = bajando.map((p) => p.realDb);
  if (xs.length >= 3) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0);
    const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
    const pendiente = den === 0 ? NaN : num / den;
    const error = Math.abs(pendiente - ESCALON_DB) / ESCALON_DB;
    console.log('');
    console.log(`M5 escalon del medidor, contra el instrumento externo: `
      + `${pendiente.toFixed(6)} dB por byte`);
    console.log(`   declarado ${ESCALON_DB.toFixed(6)} | error ${(error * 100).toFixed(2)} %`);
    console.log(error <= 0.02
      ? '   PASA. `MEDIDOR_RANGO_DB` y `VU_ESCALA` quedan contrastadas AFUERA.'
      : '   FALLA: el escalon del medidor no es el declarado, y eso toca TODAS las\n'
        + '   mediciones de este proyecto.');
  }
}

// M6 — ida y vuelta
{
  let peor = 0; let donde = NaN;
  for (const p of bajando) {
    const v = utiles.find((x) => x.crudo === p.crudo && x.sentido === 'sube');
    if (v === undefined) continue;
    const d = Math.abs(p.realDb - v.realDb);
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`M6 histeresis en la salida real: ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(peor <= TOLERANCIA_MEDIDOR_DB ? '   PASA.' : '   FALLA: los puntos no estan asentados.');
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada en dBu ni dBFS absolutos de la consola: entre su salida y la');
console.log('   interfaz hay una ganancia que nadie midio. Son DIFERENCIAS por un');
console.log('   camino que no se toca.');
console.log('   No distingue «medido» de «calculado y correcto».');
console.log('   Un canal, una frecuencia, un nivel, un fader. Nada de la ley inversa.');
console.log('');
console.log(`restaurado: i.${n}.mix ${PREVIO.fader}, m.afs.enabled ${PREVIO.afs}, `
  + 'los dos leidos del aparato antes de empezar.');
console.log('Por el mismo camino que escribio, asi que la comprobacion por HTTP va aparte.');
