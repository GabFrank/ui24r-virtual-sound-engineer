/**
 * ¿El tono llega a la consola, y qué le hace al flujo del medidor?
 *
 * **La pregunta que el ítem 108 no pudo contestar sobre sí mismo.** Sus dos
 * corridas del 2026-09-15 fallaron con el mismo síntoma —8, 8 y 5 cuadros `VU2`
 * por captura donde hacen falta 20, o sea ~2/s— y **nueve hipótesis cayeron
 * contra el aparato**: los flujos `/raw` abiertos, el grabador, el decodificador
 * descartando cuadros cortos, el conflicto con `afplay`, `analizar()` bloqueando
 * el bucle, el latido `ALIVE` llegando tarde por ese bloqueo, la edad de la
 * conexión, el preámbulo HTTP y las escrituras por el socket. Cada una medida,
 * cada una a ~22 cuadros/s, que es la cadencia sana.
 *
 * Lo que nunca se comprobó es lo más básico, y es la regla de la disciplina que
 * se saltó: **«comprobá que la fuente suena antes de concluir sobre el
 * instrumento»**. Una medición hecha sobre silencio parece un hallazgo y no lo
 * es.
 *
 * **Por qué el silencio explicaría todo de una vez.** Cinco documentos de este
 * repositorio afirman que la consola suprime `VU2` sin señal —una trama en 30 s—.
 * Si el tono no llega, el canal está callado en las tres capturas del 108 —C0 lo
 * mutea a propósito y C1 dependería del tono— y el flujo cae al régimen de
 * silencio. Las sondas, en cambio, siempre midieron con el canal 10 recibiendo
 * el piso de ruido de la Scarlett a −70,3 dB, que es señal real.
 *
 * Y si el tono **sí** llega, entonces la supresión por silencio no explica nada
 * y el hallazgo es otro: la consola estaría bajando la cadencia por un motivo que
 * ninguna de las diez pruebas tocó.
 *
 * **Las dos respuestas sirven**, que es lo que hace que valga la pena correrlo.
 *
 * ## Qué escribe
 *
 * **Una sola clave: `m.afs.enabled`.** El usuario autorizó apagar el supresor
 * para esto. Se apaga, **se comprueba releyendo por HTTP que quedó en 0** —la
 * guarda de la sexta auditoría del 108, la que evita plantar una notch
 * permanente— y sólo entonces suena. Vuelve por `restaurarClaves()` dentro de
 * `conRestauracion`, y la pila de filtros del supresor se compara antes contra
 * después.
 *
 * **No se toca el fader, ni el ecualizador, ni el compresor, ni el mute.** Este
 * guion no mide ninguna ley: sólo pregunta si hay señal. Cuanto menos escriba,
 * menos hay que restaurar.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/llega-el-tono.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const maquina = argTexto(3, '192.168.0.78');
const n = canal - 1;

const FM = 48000;
const HZ = 1000;
const NIVEL_DBFS = -18;
/** Segundos de tono. Corto a propósito: esto no mide una ley, pregunta si hay señal. */
const SEGUNDOS_DE_TONO = 10;
const SEGUNDOS_DE_CAPTURA = 3;
/** La entrada de la Scarlett donde vuelve el general. Base cero. */
const ENTRADA_GENERAL = 0;
const GRABADOR = 'tools/audio/bin/grabar';

const carpeta = mkdtempSync(join(tmpdir(), 'llega-el-tono-'));

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
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: { db: number; crudo: number; llegada: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  cuadros.push({ db: dbDeMedidor(c.salida), crudo: c.salida, llegada: Date.now() });
});

/** La pila de filtros del supresor, leída por HTTP. */
const pilaDelSupresor = (e: ReadonlyMap<string, string>): string[] => {
  const f: string[] = [];
  for (let i = 0; i < 12; i++) {
    const v = e.get(`m.afs.eq.${i}`);
    if (v !== undefined) f.push(`${i}:${v}`);
  }
  return f;
};

avisarSiHayPendiente();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const pilaAntes = pilaDelSupresor(e0);
const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];

console.log(`=== ¿LLEGA EL TONO? — canal ${canal} (i.${n}) en ${maquina} ===`);
console.log('');
console.log(`   supresor del general: ${exigirClave(e0, 'm.afs.enabled')}`);
console.log(`   fader del canal:      ${exigirClave(e0, `i.${n}.mix`)}  (NO se toca)`);
console.log(`   mute del canal:       ${exigirClave(e0, `i.${n}.mute`)}  (NO se toca)`);
console.log(`   filtros del supresor: ${pilaAntes.length}`);
console.log('');

/** Cuenta cuadros y mide el nivel del canal durante una ventana. */
let picoEnSilencio = NaN; let picoConTono = NaN; let ultimoPico = NaN;
const ventana = async (etiqueta: string, ms: number): Promise<number> => {
  cuadros = [];
  const a = Date.now();
  await new Promise((r) => { setTimeout(r, ms); });
  const d = (Date.now() - a) / 1000;
  const xs = cuadros;
  const ps = xs.length / d;
  const pico = xs.length === 0 ? NaN : Math.max(...xs.map((x) => x.db));
  // **Cuantos valores DISTINTOS trae la tanda.** Si la consola emitiera por
  // reloj, un tono fijo daria muchos cuadros con el mismo valor. Si emite por
  // CAMBIO, un tono fijo casi no da cuadros, y los que da son todos distintos.
  // Es la medicion que separa las dos hipotesis.
  const distintos = new Set(xs.map((x) => x.crudo)).size;
  let repetidosSeguidos = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]!.crudo === xs[i - 1]!.crudo) repetidosSeguidos++;
  console.log(`   ${etiqueta.padEnd(24)} ${String(xs.length).padStart(4)} cuadros = `
    + `${ps.toFixed(1).padStart(5)}/s | pico ${Number.isNaN(pico) ? '(sin datos)' : `${pico.toFixed(1)} dB`}`
    + ` | ${distintos} valor(es) distinto(s), ${repetidosSeguidos} repetido(s) seguido(s)`);
  ultimoPico = pico;
  return ps;
};

let sonando: ReturnType<typeof spawn> | null = null;

// **El papelito, ANTES de la primera escritura.** Si a este proceso lo matan de
// golpe --SIGKILL, corte de energia--, `conRestauracion` no llega a correr y lo
// unico que sabe que hay que restaurar muere con el. El papelito sobrevive.
anotarPendiente('llega-el-tono.ts', maquina, PREVIO);

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1000); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    console.log('=== ANTES DEL TONO ===');
    const antes = await ventana('en silencio', 6000);
    picoEnSilencio = ultimoPico;

    // **La guarda que evita la notch permanente.** Se apaga el supresor y se
    // COMPRUEBA releyendo por HTTP. Si no quedó en 0, se lanza: abortar cuesta
    // una corrida, seguir cuesta un filtro permanente en la consola del usuario.
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const afs = await leerUnaClave(maquina, 'm.afs.enabled');
    if (afs !== 0) {
      throw new Error(`m.afs.enabled quedo en ${afs}: el supresor del general sigue encendido `
        + `y no se mete tono con el supresor activo.`);
    }
    console.log('');
    console.log('   supresor apagado y COMPROBADO por HTTP');
    console.log('');

    console.log('=== CON EL TONO SONANDO ===');
    sonando = spawn('afplay', [tono(SEGUNDOS_DE_TONO + 4)]);
    let falloDelTono: Error | null = null;
    sonando.on('error', (e) => { falloDelTono = e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => { setTimeout(r, 2000); });
    if (falloDelTono !== null) throw falloDelTono;
    if (sonando.exitCode !== null) {
      throw new Error(`afplay salio con ${sonando.exitCode} apenas arrancado: el tono no suena.`);
    }

    const conTono = await ventana('con tono', 6000);
    picoConTono = ultimoPico;

    // Lo que vuelve por el lazo, medido con el instrumento externo.
    const wav = join(carpeta, 'vuelta.wav');
    const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'],
      { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    hijo.stderr?.on('data', (b: Buffer) => { err += b.toString(); });
    const codigo = await new Promise<number | null>((res, rej) => {
      hijo.on('error', rej); hijo.on('close', (c) => res(c));
    });
    if (codigo !== 0) {
      throw new Error(`el grabador salio con ${codigo}: ${err.trim() || '(nada)'}`);
    }
    const an = analizar(wav, HZ) as { canales: { tonoDb: number; ruidoEnBinDb: number }[] };
    const g = an.canales[ENTRADA_GENERAL]!;

    sonando.kill();
    await new Promise((r) => { setTimeout(r, 2000); });
    console.log('');
    console.log('=== DESPUES DEL TONO ===');
    const despues = await ventana('en silencio otra vez', 6000);

    console.log('');
    console.log('=== VEREDICTO ===');
    console.log(`   el bin de ${HZ} Hz que vuelve por el lazo: ${g.tonoDb.toFixed(2)} dBFS`);
    console.log(`   el ruido de ese bin:                   ${g.ruidoEnBinDb.toFixed(2)} dBFS`);
    const margen = g.tonoDb - g.ruidoEnBinDb;
    console.log(`   margen sobre el ruido:                 ${margen.toFixed(1)} dB`);
    console.log('');
    // **Quien contesta si el tono llega es el medidor de la CONSOLA, no el lazo.**
    // La primera version decidia por el margen del bin que vuelve por la
    // Scarlett, y eso mezcla dos preguntas: si el tono entra a la consola, y si
    // el camino de vuelta lo trae. La corrida del 2026-09-15 las separo sola: el
    // medidor del canal salto de -71,0 a -22,7 dB --el tono ENTRA-- mientras el
    // bin de vuelta quedaba 24,2 dB sobre el ruido, y el guion imprimio «EL TONO
    // NO LLEGA» contradiciendo su propia linea de arriba. Un veredicto que
    // ignora el instrumento mas directo que tiene.
    const entra = picoConTono - picoEnSilencio;
    console.log(`   el medidor de la consola subio ${entra.toFixed(1)} dB con el tono`);
    if (entra >= 20) {
      console.log('   EL TONO ENTRA A LA CONSOLA. Lo dice su propio medidor.');
    } else {
      console.log('   EL TONO NO ENTRA: el medidor de la consola no se movio.');
    }
    if (margen >= 40) {
      console.log('   Y VUELVE por el lazo con margen de sobra.');
    } else {
      console.log(`   Pero VUELVE flojo: ${margen.toFixed(1)} dB sobre el ruido del bin.`);
      console.log('   Eso es del camino de vuelta --nivel de salida, cable, entrada 1--,');
      console.log('   y es una pregunta distinta de si el tono entra.');
    }
    console.log('');
    console.log(`   cadencia VU2: ${antes.toFixed(1)}/s en silencio, ${conTono.toFixed(1)}/s con tono, `
      + `${despues.toFixed(1)}/s despues`);
  },
);

const e1 = await estadoPorHttpExigido(maquina);
const pilaDespues = pilaDelSupresor(e1);
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
console.log(`   m.afs.enabled  esperado ${PREVIO[0]![1]}  leido ${exigirClave(e1, 'm.afs.enabled')}`);
console.log(`   filtros del supresor: ${pilaAntes.length} antes, ${pilaDespues.length} despues`);
const pilaIgual = pilaAntes.join('|') === pilaDespues.join('|');
const afsVolvio = Number(exigirClave(e1, 'm.afs.enabled')) === PREVIO[0]![1];
console.log(pilaIgual
  ? '   Sin cambios: el supresor no planto nada.'
  : '   LA PILA CAMBIO. Hay que mirar la consola.');
// Ver el comentario del guion hermano: el papelito solo se borra si la relectura
// por HTTP confirma que todo volvio.
if (pilaIgual && afsVolvio) cerrarPendiente();
else process.exitCode = 1;

await t.desconectar();
