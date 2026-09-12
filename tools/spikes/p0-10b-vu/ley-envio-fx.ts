/**
 * La ley del envío a un bus de efectos, medida contra el aparato.
 *
 * **Esto no es la medición del auxiliar con otro número de bus.** El ítem 96a
 * midió que el medidor del bus de efectos toma **después del procesador**: cola
 * de 1170 ms, canales descorrelacionados con fuente mono y 7,7 dB de dispersión
 * entre 100 Hz y 10 kHz. Toda lectura es envío × reverb.
 *
 * **Por qué la ley igual se puede sacar.** Si el reverb es lineal e invariante,
 * su ganancia en régimen es un factor constante a frecuencia fija, y **un factor
 * constante se cancela en las diferencias**. Pero eso impone tres condiciones
 * que la corrida del auxiliar no tenía, y las tres están acá:
 *
 * 1. **Asentamiento de varios RT60 por punto.** Con RT60 ≈ 2,1 s medido en 96a,
 *    son seis segundos, no los 2,5 del auxiliar. Leer antes es leer la cola del
 *    punto anterior, y eso produce una curva suave, monótona y equivocada.
 * 2. **La linealidad hay que probarla, no suponerla.** La ley entera se corre a
 *    **dos niveles absolutos** separados por el fader del canal. Si el reverb es
 *    lineal, las dos curvas son paralelas. Una curva sola, por limpia que salga,
 *    no prueba nada: los tres barridos de 84,5 dB de este proyecto eran rectas
 *    impecables y estaban mal, y lo que los delató fue que no coincidían **entre
 *    sí**.
 * 3. **Izquierda y derecha por separado**, nunca promediadas: se
 *    descorrelacionan, y la descorrelación puede depender del nivel.
 *
 * **Ida y vuelta.** El barrido se hace bajando y subiendo. Si no coinciden, lo
 * que se midió fue la cola y no la ley.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-envio-fx.ts 10 1 192.168.0.78
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
const fx = Number(process.argv[3] ?? '1');
const maquina = process.argv[4] ?? '192.168.0.78';
const FM = 48000;
const HZ = 1000;
const SEGUNDOS = 900;
const RESOLUCION_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

/** Seis segundos: casi tres RT60 de los 2,1 s medidos en 96a. */
const ASENTAMIENTO_MS = 6000;
/** Y dos más promediando, para que el promedio no toque el transitorio. */
const VENTANA_MS = 2000;

const PREVIO = { envio: 0, fader: 0.7647058824 };

/** Los dos niveles absolutos para probar la linealidad. */
const FADERES = [0.7647058824, 0.55];

const CRUDOS = [1.0, 0.9, 0.8, 0.7647058824, 0.7, 0.6, 0.5, 0.4];

function tonoLargo(): string {
  const muestras = FM * SEGUNDOS;
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
  const ruta = join(tmpdir(), 'vse-tono-fx.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let izq: number[] = []; let der: number[] = []; let testigo: number[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const e = decodificarVuBuses(carga).efectos[fx];
  const c = decodificarVuCanales(carga)[n];
  if (e !== undefined) { izq.push(e.preIzq); der.push(e.preDer); }
  if (c !== undefined) testigo.push(c.pre);
});

const media = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);
const desvio = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
};

interface Punto { crudo: number; izq: number; der: number; dispIzq: number; testigo: number; n: number }

async function medir(crudo: number): Promise<Punto> {
  t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, crudo));
  await new Promise((r) => setTimeout(r, ASENTAMIENTO_MS));
  izq = []; der = []; testigo = [];
  await new Promise((r) => setTimeout(r, VENTANA_MS));
  const dbIzq = izq.map((v) => dbDeMedidor(v));
  return {
    crudo, izq: media(izq), der: media(der),
    dispIzq: desvio(dbIzq.filter((v) => Number.isFinite(v))),
    testigo: media(testigo), n: izq.length,
  };
}

await t.conectar(maquina);
const sonando = spawn('afplay', [tonoLargo()]);
await new Promise((r) => setTimeout(r, 3000));

console.log(`canal ${canal} (i.${n}) -> efecto ${fx + 1} (f.${fx}), tono de ${HZ} Hz a -1 dBFS`);
console.log(`asentamiento ${ASENTAMIENTO_MS} ms + ventana ${VENTANA_MS} ms por punto`);
console.log(`resolucion ${RESOLUCION_DB.toFixed(4)} dB por escalon`);
console.log('');

const series: { fader: number; sentido: string; puntos: Punto[] }[] = [];

for (const fader of FADERES) {
  t.enviar(codificarSetd(`i.${n}.mix`, fader));
  await new Promise((r) => setTimeout(r, 2000));
  for (const sentido of ['bajando', 'subiendo']) {
    const orden = sentido === 'bajando' ? CRUDOS : [...CRUDOS].reverse();
    const puntos: Punto[] = [];
    console.log(`--- fader del canal ${fader.toFixed(4)}, ${sentido} ---`);
    console.log('crudo      | izq dB   | der dB   | disp izq | testigo  | n');
    for (const c of orden) {
      const p = await medir(c);
      puntos.push(p);
      console.log(`${p.crudo.toFixed(4).padStart(10)} | `
        + `${dbDeMedidor(p.izq).toFixed(2).padStart(8)} | ${dbDeMedidor(p.der).toFixed(2).padStart(8)} | `
        + `${p.dispIzq.toFixed(2).padStart(8)} | ${dbDeMedidor(p.testigo).toFixed(2).padStart(8)} | ${String(p.n).padStart(3)}`);
    }
    series.push({ fader, sentido, puntos });
    console.log('');
  }
}

sonando.kill();
t.enviar(codificarSetd(`i.${n}.fx.${fx}.value`, PREVIO.envio));
t.enviar(codificarSetd(`i.${n}.mix`, PREVIO.fader));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

// --- Lectura ---
function atenuaciones(p: Punto[]): Map<number, number> {
  const base = p.find((x) => x.crudo === 1.0)!;
  return new Map(p.map((x) => [x.crudo, dbDeMedidor(x.izq) - dbDeMedidor(base.izq)]));
}

console.log('=== IDA Y VUELTA: si no coinciden, se midio la cola y no la ley ===');
for (const fader of FADERES) {
  const baja = series.find((s) => s.fader === fader && s.sentido === 'bajando')!;
  const sube = series.find((s) => s.fader === fader && s.sentido === 'subiendo')!;
  const a = atenuaciones(baja.puntos); const b = atenuaciones(sube.puntos);
  const peor = Math.max(...CRUDOS.map((c) => Math.abs((a.get(c) ?? 0) - (b.get(c) ?? 0))));
  console.log(`fader ${fader.toFixed(4)}: histeresis maxima ${peor.toFixed(2)} dB `
    + `= ${(peor / RESOLUCION_DB).toFixed(2)} escalones`);
}

console.log('');
console.log('=== LINEALIDAD: las dos curvas tienen que ser PARALELAS ===');
console.log('crudo      | atenuacion a fader alto | a fader bajo | diferencia | segun faderADb');
const alta = atenuaciones(series.find((s) => s.fader === FADERES[0] && s.sentido === 'bajando')!.puntos);
const baja2 = atenuaciones(series.find((s) => s.fader === FADERES[1] && s.sentido === 'bajando')!.puntos);
let peorPar = 0; let peorLey = 0;
for (const c of CRUDOS) {
  const A = alta.get(c) ?? 0; const B = baja2.get(c) ?? 0;
  const ley = faderADb(c) - faderADb(1.0);
  peorPar = Math.max(peorPar, Math.abs(A - B));
  peorLey = Math.max(peorLey, Math.abs(A - ley));
  console.log(`${c.toFixed(4).padStart(10)} | ${A.toFixed(2).padStart(23)} | ${B.toFixed(2).padStart(12)} | `
    + `${(A - B).toFixed(2).padStart(10)} | ${ley.toFixed(2).padStart(14)}`);
}
console.log('');
// **El veredicto se computa, no se deja al lector.** Esta corrida imprimia la
// separacion, enunciaba la regla en prosa, y debajo imprimia el desvio contra
// `faderADb` con un «esto solo significa algo si la linealidad de arriba paso».
// En la corrida archivada la linealidad **fallo** --1,24 escalones-- y el
// numero de abajo se publico igual. Es el orden que la medicion 94 declara
// inaceptable: la cifra primero y la condicion despues. Lo encontro una
// auditoria de instrumentos.
//
// El umbral son DOS escalones y no uno: la separacion es la diferencia de dos
// lecturas enteras del medidor, asi que arrastra hasta dos escalones de
// cuantizacion sin que nada se haya movido. Esta en
// `docs/backlog/hallazgo-umbral-de-una-diferencia.md`, y se aplica hacia
// adelante --las corridas ya publicadas con el umbral simple no se retocan.
const ESCALONES_DE_UNA_DIFERENCIA = 2;
const linealidadPaso = peorPar <= RESOLUCION_DB * ESCALONES_DE_UNA_DIFERENCIA;
console.log(`separacion maxima entre las dos curvas: ${peorPar.toFixed(2)} dB `
  + `= ${(peorPar / RESOLUCION_DB).toFixed(2)} escalones`);
console.log(linealidadPaso
  ? `  PASA (umbral: ${ESCALONES_DE_UNA_DIFERENCIA} escalones, porque es diferencia de dos lecturas).`
  : `  FALLA (umbral: ${ESCALONES_DE_UNA_DIFERENCIA} escalones). El reverb no es lineal en este `
    + 'tramo y esta corrida NO mide la ley del envio.');
console.log('');
console.log(`desvio maximo contra faderADb: ${peorLey.toFixed(2)} dB `
  + `= ${(peorLey / RESOLUCION_DB).toFixed(2)} escalones`);
console.log(linealidadPaso
  ? '  Vale como acotacion: la linealidad paso.'
  : '  NO SIGNIFICA NADA: la linealidad de arriba fallo. No citar esta cifra.');
console.log('');
console.log('restaurado por el mismo camino que escribio. La comprobacion por HTTP va aparte.');
