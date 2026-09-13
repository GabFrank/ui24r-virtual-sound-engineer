/**
 * La escala en dB del bloque de bus, contra un instrumento externo.
 *
 * **Contrato:** `docs/compromisos/102-la-escala-del-bloque-de-bus.md`.
 *
 * **Por qué existe.** La 99b ancló el paso del medidor **de canal** contra la
 * salida real —rango implicado 79,91 dB contra el 80 declarado— y declaró que eso
 * **no rescata a la 94 ni a la 96b**, porque ésas leyeron los bloques de la cola
 * de la trama, que tienen otro formato y cuya escala el `protocol-spec` §4.4
 * declara no medida. Con el auxiliar 5 entrando a la interfaz, esa mitad se cierra
 * para el bloque de auxiliar.
 *
 * **Se barre el ENVÍO y se lee el byte `pre`**, que es el que la 94 usó. Barrer el
 * fader del auxiliar movería `post` y dejaría `pre` quieto: se mediría el byte que
 * la 94 no usó.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/escala-del-bloque-de-bus.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuBuses, decodificarVuCanales,
  dbDeMedidor, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const auxiliar = argIndice(3, 'auxiliar', 5, { desde: 1, hasta: 10 });
const a = auxiliar - 1;
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
const FM = 48000;
const NIVEL_DBFS = -15;
const SEGUNDOS_DE_CAPTURA = 3;

const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
const TOLERANCIA_MEDIDOR_DB = 2 * ESCALON_DB;
const BYTE_PISO = 16;
const BYTE_TECHO = 239;
const byteDeMedidor = (db: number): number => Math.round((db + MEDIDOR_RANGO_DB) / ESCALON_DB);
const MARGEN_MINIMO_DB = 45;
const errorPorRuido = (m: number): number => 8.686 * Math.pow(10, -m / 20);
const CUADROS_MINIMOS = 20;
const PUNTOS_MINIMOS = 10;
const RECORRIDO_MINIMO_DB = 20;

/**
 * El atenuador fijo: el fader del auxiliar, quieto durante todo el barrido.
 *
 * **El auxiliar llega a la interfaz veinte decibeles más caliente que el general**
 * —reconocimiento del 2026-09-13: ganancia de cadena 38,8 dB, y con el envío en
 * 0,75 la interfaz ve −8,55 dBFS—. Subir el envío desde ahí recorta.
 *
 * Bajando el fader del auxiliar se baja lo que llega a la interfaz **sin tocar
 * `pre`**, que está antes de él. Es una ganancia estática: se cancela en toda
 * atenuación relativa al arranque, y `post` siguiendo a `pre` lo comprueba (B3).
 */
const FADER_DEL_AUXILIAR = 0.45;

/** Los crudos del envío que se barren. */
const CRUDOS = [
  1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60,
  0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.25, 0.20, 0.15, 0.10,
];

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const ENTRADA_AUXILIAR = 1;
const ENTRADA_REFERENCIA = 2;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-102-'));

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
  const ruta = join(tmpdir(), 'vse-102-tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: {
  pre: number; post: number; reduccion: number; puerta: boolean; canalSalida: number;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const bus = decodificarVuBuses(carga).auxiliares[a];
  const c = decodificarVuCanales(carga)[n];
  if (bus === undefined || c === undefined) return;
  cuadros.push({
    pre: bus.pre, post: bus.post, reduccion: bus.reduccionDb,
    puerta: bus.indicadorDePuerta, canalSalida: c.salida,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

interface Medida {
  preDb: number; postDb: number; canalDb: number;
  reduccionMax: number; cuadros: number;
  realDb: number; referenciaDb: number; margenDb: number; picoDb: number; recorta: boolean;
}

let sonando: ReturnType<typeof spawn> | null = null;

async function medirPunto(etiqueta: string): Promise<Medida> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  cuadros = [];
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const xs = cuadros;
  const an = analizar(wav, HZ) as {
    canales: {
      tonoDb: number; picoDb: number; margenEnBinDb: number; recorteExacto: boolean;
    }[];
  };
  rmSync(wav, { force: true });
  if (sonando !== null && sonando.exitCode !== null) {
    throw new Error(`el tono dejo de sonar: afplay salio con ${sonando.exitCode}`);
  }
  const aux = an.canales[ENTRADA_AUXILIAR]!;
  return {
    preDb: dbDeMedidor(media(xs.map((c) => c.pre))),
    postDb: dbDeMedidor(media(xs.map((c) => c.post))),
    canalDb: dbDeMedidor(media(xs.map((c) => c.canalSalida))),
    reduccionMax: xs.length === 0 ? NaN : xs.reduce((m, c) => Math.max(m, c.reduccion), 0),
    cuadros: xs.length,
    realDb: aux.tonoDb,
    picoDb: aux.picoDb,
    margenDb: aux.margenEnBinDb,
    recorta: aux.recorteExacto,
    referenciaDb: an.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

// ---------------------------------------------------------------- montaje

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.aux.${a}.value`, Number(exigirClave(e0, `i.${n}.aux.${a}.value`))],
  [`a.${a}.mix`, Number(exigirClave(e0, `a.${a}.mix`))],
  [`a.${a}.gate.enabled`, Number(exigirClave(e0, `a.${a}.gate.enabled`))],
  [`a.${a}.dyn.bypass`, Number(exigirClave(e0, `a.${a}.dyn.bypass`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
];

console.log('=== 102 — LA ESCALA EN dB DEL BLOQUE DE BUS ===');
console.log(`canal ${canal} (i.${n}) -> auxiliar ${auxiliar} (a.${a}) -> entrada 2 de la interfaz`);
console.log(`escalon declarado: ${ESCALON_DB.toFixed(6)} dB | tolerancia ${TOLERANCIA_MEDIDOR_DB.toFixed(4)} dB`);
console.log(`ventana util: bytes ${BYTE_PISO}..${BYTE_TECHO} = `
  + `${dbDeMedidor(BYTE_PISO * VU_ESCALA).toFixed(2)} .. ${dbDeMedidor(BYTE_TECHO * VU_ESCALA).toFixed(2)} dB`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.aux.${a}.value`, `i.${n}.aux.${a}.post`, `i.${n}.aux.${a}.postproc`,
  `a.${a}.mix`, `a.${a}.mute`, `a.${a}.gate.enabled`, `a.${a}.gate.thresh`,
  `a.${a}.dyn.bypass`, `a.${a}.dyn.ratio`, `a.${a}.eq.bypass`, `a.${a}.afs.enabled`,
  `i.${n}.mix`, `hw.${n}.gain`, `i.${n}.dyn.bypass`, `i.${n}.gate.enabled`,
  `i.${n}.deesser.enabled`, `hwoutaux.${a}.src`,
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}
console.log('');
console.log(`   El envio es PRE-FADER (i.${n}.aux.${a}.post = ${e0.get(`i.${n}.aux.${a}.post`)}),`);
console.log('   asi que el fader del canal no lo toca y el medidor del canal sirve de');
console.log('   testigo: tiene que quedarse quieto durante todo el barrido.');

interface Punto {
  crudo: number; sentido: 'baja' | 'sube';
  preDb: number; postDb: number; byte: number; canalDb: number;
  realDb: number; referenciaDb: number; margenDb: number; picoDb: number;
  reduccionMax: number; cuadros: number;
  anulado: string | null; fueraDeVentana: boolean;
}

const puntos: Punto[] = [];
let recorridoDb = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // Todo lo dependiente del nivel, puenteado. El ecualizador del auxiliar y su
    // fader son estaticos y se cancelan en la resta: se registran y no se tocan.
    t.enviar(codificarSetd(`a.${a}.gate.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.mix`, FADER_DEL_AUXILIAR));
    await new Promise((r) => setTimeout(r, 2500));
    console.log('');
    console.log('=== LO QUE SE NEUTRALIZA ===');
    console.log(`   puerta del auxiliar: estaba en ${PREVIO[2]![1]}, se apaga`);
    console.log(`   compresor del auxiliar: bypass estaba en ${PREVIO[3]![1]}, se puentea`);
    console.log('   compresor, puerta y de-esser del canal: puenteados');
    console.log(`   fader del auxiliar puesto en ${FADER_DEL_AUXILIAR} como ATENUADOR FIJO:`);
    console.log('   baja lo que llega a la interfaz sin tocar `pre`, que esta antes de el.');
    console.log('   Es una ganancia estatica y se cancela; B3 lo comprueba.');

    sonando = spawn('afplay', [tono(900)]);
    await new Promise((r) => setTimeout(r, 3000));

    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, CRUDOS[0]!));
    await new Promise((r) => setTimeout(r, 2500));
    const arranque = await medirPunto('arranque');
    const byteArranque = byteDeMedidor(arranque.preDb);
    recorridoDb = arranque.preDb - dbDeMedidor(BYTE_PISO * VU_ESCALA);
    console.log('');
    console.log('=== EL RECORRIDO, CALCULADO ANTES DE BARRER ===');
    console.log(`   arranque: pre ${arranque.preDb.toFixed(2)} dB = byte ${byteArranque}`);
    console.log(`   interfaz: ${arranque.realDb.toFixed(2)} dBFS, pico ${arranque.picoDb.toFixed(2)}, `
      + `margen ${arranque.margenDb.toFixed(1)} dB`);
    console.log(`   RECORRIDO DEL MEDIDOR: ${recorridoDb.toFixed(1)} dB`);
    if (arranque.recorta || arranque.picoDb > -1) {
      throw new Error(`la interfaz recorta en el arranque (pico ${arranque.picoDb.toFixed(2)} dBFS): `
        + `bajar FADER_DEL_AUXILIAR, que hoy esta en ${FADER_DEL_AUXILIAR}`);
    }
    if (byteArranque > BYTE_TECHO) {
      throw new Error(`el arranque cae en el byte ${byteArranque}, por encima del techo `
        + `${BYTE_TECHO}: los bytes 240..255 informan posiciones mayores que 1`);
    }
    if (recorridoDb < RECORRIDO_MINIMO_DB) {
      throw new Error(`${recorridoDb.toFixed(1)} dB de recorrido es menos que los `
        + `${RECORRIDO_MINIMO_DB} que hacen falta. La medicion 94 se declaro indecidible `
        + 'con 18 dB: correr esto seria un control que solo puede confirmar.');
    }

    console.log('');
    console.log('crudo  | pre    | byte | post   | real   | ref    | at.pre | at.real | '
      + 'pre-real | canal  | margen | n');

    let topePre = NaN;
    let topeReal = NaN;

    for (const sentido of ['baja', 'sube'] as const) {
      const orden = sentido === 'baja' ? CRUDOS : [...CRUDOS].reverse();
      for (const crudo of orden) {
        t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, crudo));
        await new Promise((r) => setTimeout(r, 2000));
        const p = await medirPunto(`${sentido}-${crudo}`);
        if (sentido === 'baja' && crudo === CRUDOS[0]) {
          topePre = p.preDb; topeReal = p.realDb;
        }
        const b = byteDeMedidor(p.preDb);
        const atPre = topePre - p.preDb;
        const atReal = topeReal - p.realDb;
        const fueraDeVentana = b < BYTE_PISO || b > BYTE_TECHO;
        const anulado = p.cuadros < CUADROS_MINIMOS
            ? `solo ${p.cuadros} cuadros (minimo ${CUADROS_MINIMOS})`
          : !Number.isFinite(p.realDb) ? 'sin tono en la captura'
          : p.recorta || p.picoDb > -1 ? `la interfaz recorta (pico ${p.picoDb.toFixed(2)})`
          : p.reduccionMax > 0 ? `el compresor del auxiliar actuo (${p.reduccionMax.toFixed(2)} dB)`
          : p.margenDb < MARGEN_MINIMO_DB
            ? `margen de ${p.margenDb.toFixed(1)} dB: el instrumento erraria `
              + `${errorPorRuido(p.margenDb).toFixed(2)} dB`
          : null;

        puntos.push({
          crudo, sentido, preDb: p.preDb, postDb: p.postDb, byte: b, canalDb: p.canalDb,
          realDb: p.realDb, referenciaDb: p.referenciaDb, margenDb: p.margenDb,
          picoDb: p.picoDb, reduccionMax: p.reduccionMax, cuadros: p.cuadros,
          anulado, fueraDeVentana,
        });

        console.log(`${crudo.toFixed(2).padStart(6)} | ${p.preDb.toFixed(2).padStart(6)} | `
          + `${String(b).padStart(4)} | ${p.postDb.toFixed(2).padStart(6)} | `
          + `${p.realDb.toFixed(2).padStart(6)} | ${p.referenciaDb.toFixed(2).padStart(6)} | `
          + `${atPre.toFixed(2).padStart(6)} | ${atReal.toFixed(2).padStart(7)} | `
          + `${(atPre - atReal).toFixed(2).padStart(8)} | ${p.canalDb.toFixed(2).padStart(6)} | `
          + `${p.margenDb.toFixed(0).padStart(6)} | ${String(p.cuadros).padStart(3)}`
          + (fueraDeVentana ? '  [fuera]' : '')
          + (anulado === null ? '' : `   ANULADO: ${anulado}`));
      }
    }
  },
);

await new Promise((r) => setTimeout(r, 1500));

// ------------------------------------------------------------ veredictos

const utiles = puntos.filter((p) => p.anulado === null);
const enVentana = utiles.filter((p) => !p.fueraDeVentana);
const bajando = enVentana.filter((p) => p.sentido === 'baja');
const rango = (xs: number[]) => (xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs));

console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 102 ===');
console.log(`   ${utiles.length} puntos utiles de ${puntos.length} | ${enVentana.length} en la ventana`);
for (const p of puntos.filter((x) => x.anulado !== null)) {
  console.log(`     crudo ${p.crudo} ${p.sentido}: ${p.anulado}`);
}

// B1 — el testigo
{
  const d = rango(puntos.map((p) => p.canalDb).filter(Number.isFinite));
  console.log('');
  console.log(`B1 deriva del medidor del canal: ${d.toFixed(2)} dB`);
  console.log(d <= TOLERANCIA_MEDIDOR_DB
    ? '   PASA. El envio es pre-fader y no toca el canal, como el aparato declara.'
    : '   FALLA: o se movio la fuente, o el envio no esta donde este proyecto cree.');
}

// B2 — la referencia interna
{
  const d = rango(puntos.map((p) => p.referenciaDb).filter(Number.isFinite));
  console.log('');
  console.log(`B2 deriva de la referencia interna: ${d.toFixed(2)} dB`);
  console.log(d <= 0.2 ? '   PASA.' : '   FALLA: cambio el nivel que emite la computadora.');
}

// B3 — post sigue a pre
{
  let peor = 0; let donde = NaN;
  const conAmbos = utiles.filter((p) => Number.isFinite(p.preDb) && Number.isFinite(p.postDb));
  const tope = conAmbos[0];
  for (const p of conAmbos) {
    if (tope === undefined) break;
    const d = Math.abs((tope.preDb - p.preDb) - (tope.postDb - p.postDb));
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`B3 post sigue a pre: desvio maximo ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(peor <= TOLERANCIA_MEDIDOR_DB
    ? '   PASA. Entre pre y post solo hay ganancia estatica, MEDIDO: el fader del\n'
      + '   auxiliar estuvo quieto y se comporto como el atenuador fijo que se supuso.'
    : '   FALLA: hay algo entre pre y post que no es una ganancia estatica.');
}

const topeP = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.preDb ?? NaN;
const topeR = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.realDb ?? NaN;

// B4 — la pregunta central
{
  console.log('');
  if (bajando.length < PUNTOS_MINIMOS) {
    console.log(`B4 NO SE PUEDE DECIDIR: ${bajando.length} puntos en la ventana, `
      + `hacen falta ${PUNTOS_MINIMOS}.`);
  } else {
    let peor = 0; let donde = NaN;
    const difs: number[] = [];
    for (const p of bajando) {
      const d = (topeP - p.preDb) - (topeR - p.realDb);
      difs.push(d);
      if (Math.abs(d) > peor) { peor = Math.abs(d); donde = p.crudo; }
    }
    const tramo = Math.max(...bajando.map((p) => p.preDb)) - Math.min(...bajando.map((p) => p.preDb));
    console.log(`B4 el byte pre contra la salida real: desvio maximo ${peor.toFixed(2)} dB `
      + `en el crudo ${donde}`);
    console.log(`   ${bajando.length} puntos sobre un tramo de ${tramo.toFixed(1)} dB`);
    const pos = difs.filter((d) => d > ESCALON_DB / 2).length;
    const neg = difs.filter((d) => d < -ESCALON_DB / 2).length;
    console.log(`   signo: ${pos} positivas, ${neg} negativas, ${difs.length - pos - neg} `
      + 'dentro de medio escalon');
    console.log(peor <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. **El paso del bloque de AUXILIAR es el mismo que el del canal**, y\n'
        + '   las cifras en dB de la medicion 94 quedan en pie.'
      : '   FALLA. El bloque de auxiliar tiene su propia escala y **hay que rehacer\n'
        + '   las cifras en dB de la 94**.');
  }
}

// B5 — el paso, contra el instrumento externo
{
  console.log('');
  const xs = bajando.map((p) => p.byte);
  const ys = bajando.map((p) => p.realDb);
  if (xs.length < PUNTOS_MINIMOS) {
    console.log(`B5 NO SE PUEDE DECIDIR: ${xs.length} puntos en la ventana.`);
  } else {
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0);
    const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
    const pendiente = den === 0 ? NaN : num / den;
    const error = Math.abs(pendiente - ESCALON_DB) / ESCALON_DB;
    const tramo = Math.max(...ys) - Math.min(...ys);
    console.log(`B5 paso del bloque de auxiliar: ${pendiente.toFixed(6)} dB por byte`);
    console.log(`   declarado ${ESCALON_DB.toFixed(6)} | error ${(error * 100).toFixed(2)} % | `
      + `${xs.length} puntos sobre ${tramo.toFixed(1)} dB`);
    console.log(`   RANGO IMPLICADO: ${(pendiente / VU_ESCALA).toFixed(2)} dB `
      + `(declarado ${MEDIDOR_RANGO_DB}; la 99b midio 79,91 sobre el bloque de CANAL)`);
    console.log(error <= 0.01
      ? '   PASA.'
      : '   FALLA: el bloque de bus tiene su propio paso, y hay que rehacer las cifras\n'
        + '   en dB de la 94 y de la 96b.');
    if (tramo > 33.4) {
      console.log(`   SUBORDINADA: con ${tramo.toFixed(1)} dB de tramo, B5 no puede fallar si`);
      console.log('   B4 paso. Se declaro antes de mirar los datos, y su valor es publicar el');
      console.log('   rango implicado para contrastarlo contra el 80.');
    }
  }
}

// B6 — ida y vuelta
{
  let peor = 0; let donde = NaN;
  for (const p of bajando) {
    const v = utiles.find((x) => x.crudo === p.crudo && x.sentido === 'sube');
    if (v === undefined) continue;
    const d = Math.abs(p.realDb - v.realDb);
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`B6 histeresis en la salida real: ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(peor <= TOLERANCIA_MEDIDOR_DB ? '   PASA.' : '   FALLA: los puntos no estan asentados.');
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   **Nada del bloque de EFECTOS.** El de auxiliar es mono de 5 bytes y el de');
console.log('   efectos estereo de 7: son formatos distintos y medir uno no da el otro.');
console.log('   **La 96b sigue tocada** aunque esto pase.');
console.log('   Nada sobre la LEY del envio: esto mide a cuantos dB equivale un escalon');
console.log('   del medidor, no que dB corresponden a cada crudo. La 94 contesto eso otro.');
console.log('   Nada en dBu ni dBFS absolutos: son diferencias por un camino que no se toca.');
console.log('   Nada sobre un error de escala constante, invisible en una medicion relativa.');
console.log('   Un auxiliar, un canal, una frecuencia, un nivel de fuente.');
console.log('   Y un acuerdo dentro del umbral es una COTA, no una identidad.');

// La restauracion, comprobada por HTTP.
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const eFin = await estadoPorHttpExigido(maquina);
  let todo = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(eFin, k));
    const bien = Math.abs(leido - v) < 1e-9;
    if (!bien) todo = false;
    console.log(`   ${k.padEnd(24)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (bien ? '' : '   <-- NO COINCIDE'));
  }
  console.log(todo
    ? '   Todo restaurado, comprobado por un camino distinto del que escribio.'
    : '   **HAY CLAVES SIN RESTAURAR.** Hay que ponerlas a mano.');
}
await t.desconectar();
