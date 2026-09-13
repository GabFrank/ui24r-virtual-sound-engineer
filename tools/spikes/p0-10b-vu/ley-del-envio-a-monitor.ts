/**
 * La ley del envio a monitor, contra la salida real.
 *
 * **Contrato:** `docs/compromisos/104-la-ley-del-envio-a-monitor.md`.
 *
 * **Por que existe.** `i.N.aux.M.value` son 240 rutas que ADR-028 decidio abrir a
 * la aplicacion, con techo y fuera del show. El techo ya tiene productor; lo que
 * falta es la **conversion**: sin una ley medida, `aRaw` rechaza con `NO_PROBADO`
 * y el motor sigue juzgando lo que el llamador declara.
 *
 * La medicion 94 lo intento y se declaro indecidible --catorce puntos sobre
 * 27,87 dB, contra un medidor con 0,333 dB de resolucion-- y su propia seccion de
 * cierre dice que hacer: rehacerlo por el auxiliar 5, que tiene el ecualizador
 * plano y esta cableado a la interfaz.
 *
 * **La diferencia con la 102, que barrio este mismo envio**: aquella medía a
 * cuantos dB equivale un escalon del medidor, y su contrato declara «nada sobre
 * la ley del envio». Esta mide la ley, y ademas **relee el crudo por HTTP en cada
 * punto**, que la 102 no hacia.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-del-envio-a-monitor.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuBuses, decodificarVuCanales,
  dbDeMedidor, faderADb, VU_ESCALA, MEDIDOR_RANGO_DB,
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
 * atenuación relativa al arranque, y `post` sigue a `pre` por construccion.
 */
const FADER_DEL_AUXILIAR = 0.45;



/** Los crudos del envío que se barren. */
const CRUDOS = [
  // **Dos crudos deliberadamente FUERA de la rejilla de centesimos.**
  // Sin ellos L5 no puede fallar: `0,95` sobrevive exacto a un cuantizador a
  // centesimos, a vigesimos o a cualquier divisor, asi que la expectativa que dice
  // «la consola no redondea» no podria ver el redondeo mas plausible, que es a la
  // rejilla que el propio barrido usa.
  1.0, 0.95, 0.90, 0.85, 0.8237, 0.80, 0.75, 0.70, 0.65, 0.6141, 0.60,
  0.55, 0.50, 0.45, 0.40, 0.35, 0.30,
  // **Los de abajo caen fuera de la ventana del medidor, y se miden igual.**
  // Ahi el byte esta aplastado contra el piso y la salida real sigue viva: es
  // exactamente el regimen donde la 94 vio un residuo unilateral y creciente y no
  // pudo decidir si era el piso del medidor o una diferencia de ley. Con la
  // interfaz mirando, **este barrido puede contestarlo**, y no cuesta nada porque
  // las capturas se hacen igual. Se informa sin umbral y NO se puntua.
  0.29, 0.28, 0.27, 0.26, 0.25, 0.20, 0.15, 0.10,
];

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const ENTRADA_AUXILIAR = 1;
const ENTRADA_REFERENCIA = 2;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-104-'));

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
  // Dentro de `carpeta`, que la restauracion borra: 900 s son 173 MB y quedarse
  // en el temporal del sistema para siempre no es gratis.
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: {
  pre: number; post: number; reduccion: number; puerta: boolean;
  canalSalida: number;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const buses = decodificarVuBuses(carga).auxiliares;
  const bus = buses[a];

  const c = decodificarVuCanales(carga)[n];
  if (bus === undefined || c === undefined) return;
  cuadros.push({
    pre: bus.pre, post: bus.post, reduccion: bus.reduccionDb,
    puerta: bus.indicadorDePuerta, canalSalida: c.salida,
  });
});

/**
 * Lee **una** clave de `/raw`, cortando en cuanto aparece.
 *
 * **`estadoPorHttp` paga su tope de 8000 ms en cada llamada, todas las veces.**
 * No es lentitud de la red: `/raw` entrega el volcado **y despues sigue emitiendo
 * `RTA` a 30 Hz**, que `protocol.ts` describe como «la unica emision que la
 * consola mantiene pase lo que pase». Asi que la carrera de 900 ms sin datos que
 * `estadoPorHttp` usa para cortar **nunca la gana el silencio**: siempre llega
 * otra trama, y la lectura corre hasta el tope.
 *
 * Con 46 puntos eso son **368 segundos** de los 900 que dura el tono, para leer
 * una clave por punto. Lo midio un auditor antes de correr.
 *
 * Aca alcanza con cortar en cuanto la clave aparece en el cuerpo acumulado.
 */
async function leerUnaClave(maquina: string, clave: string, topeMs = 3000): Promise<number> {
  const res = await fetch(`http://${maquina}/raw`);
  const lector = res.body?.getReader();
  if (lector === undefined) throw new Error(`no se pudo leer /raw de ${maquina}`);
  const re = new RegExp(`^SETD\\^${clave.replace(/\./g, '\\.')}\\^(.*)$`, 'm');
  const decoder = new TextDecoder();
  let texto = '';
  const hasta = Date.now() + topeMs;
  try {
    while (Date.now() < hasta) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decoder.decode(value, { stream: true });
      const m = texto.match(re);
      if (m !== null) return Number(m[1]);
    }
  } finally {
    void lector.cancel();
  }
  throw new Error(`${clave} no aparecio en /raw de ${maquina} en ${topeMs} ms`);
}

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

console.log('=== 104 — LA LEY DEL ENVIO A MONITOR, CONTRA LA SALIDA REAL ===');
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
// **A5 — Quien mas alimenta el auxiliar, que la 94 ya sufrio.**
//
// La 94 encontro TRES canales mas mandando al auxiliar 3 --uno casi en unidad-- y
// escribio: «con señal en ellos, el piso del barrido es la suma y no el envio».
//
// **Y aca no hay medidor de banda ancha que proteja.** `realDb` es el bin de
// 1 kHz, asi que una contribucion ajena EN 1 kHz se suma al tono sin dejar rastro:
// infla el tope y aplana la atenuacion medida. Seria un desvio contra `faderADb`
// que crece hacia abajo --la firma que L3b esta ahi para juzgar-- producido por el
// banco y no por la consola.
console.log('');
console.log(`=== QUIEN MAS ALIMENTA EL AUXILIAR ${auxiliar} ===`);
{
  const otros = [...e0.keys()]
    .filter((k) => new RegExp(`^(i|f|l|p)\\.\\d+\\.aux\\.${a}\\.value$`).test(k)
      && k !== `i.${n}.aux.${a}.value`)
    .map((k) => [k, Number(e0.get(k))] as const)
    .filter(([, v]) => v > 0);
  console.log(`   ${otros.length} tiras con el envio abierto ademas del canal ${canal}`);
  for (const [k, v] of otros) {
    console.log(`     ${k.padEnd(22)} = ${v}   (mute ${e0.get(k.replace('.value', '.mute')) ?? '?'})`);
  }
  // **Cualquier tira abierta, no «mas de 0,05».** El 0,05 no salia de ningun
  // lado, y el contrato promete abortar si hay otra tira abierta. En la 102 el
  // censo dio cero, asi que exigir cero no cuesta nada.
  if (otros.length > 0) {
    throw new Error('hay otras tiras alimentando este auxiliar con el envio abierto. '
      + 'El piso del barrido seria la SUMA y no el envio, y como `pre` es de banda '
      + 'ancha y `realDb` es el bin de 1 kHz, una contribucion ajena inflaria uno y '
      + 'no el otro: un residuo unilateral indistinguible de una diferencia de escala. '
      + 'Cerrarlas o elegir otro auxiliar.');
  }
}

// **M4 — El supresor del auxiliar, exigido y no solo mirado.**
// Van 900 segundos de 1 kHz sostenido por este bus. Si el supresor estuviera
// encendido plantaria notches de −18 dB a mitad del barrido y la corrida los
// leeria como curvatura de escala. Ya paso dos veces en este proyecto.
{
  const afs = Number(exigirClave(e0, `a.${a}.afs.enabled`));
  if (afs !== 0) {
    throw new Error(`a.${a}.afs.enabled = ${afs}. Un tono sostenido de 900 s le planta `
      + 'notches de -18 dB y el barrido mediria eso.');
  }
  console.log(`   supresor del auxiliar: apagado (a.${a}.afs.enabled = 0), comprobado`);
}

// **§7.7 — El banco tiene que estar donde el reconocimiento lo dejo.**
// Si el reconocimiento hubiera abortado sin restaurar, `e0` leeria el estado
// puenteado y lo restauraria como si fuera el original.
{
  const esperado: Record<string, number> = {
    [`i.${n}.aux.${a}.value`]: 0, [`a.${a}.mix`]: 0,
    [`a.${a}.gate.enabled`]: 1, [`a.${a}.dyn.bypass`]: 0,
  };
  for (const [k, v] of Object.entries(esperado)) {
    const leido = Number(exigirClave(e0, k));
    if (Math.abs(leido - v) > 1e-9) {
      console.log(`   AVISO: ${k} vale ${leido} y el reconocimiento lo dejo en ${v}.`);
      console.log('   Si el reconocimiento no restauro, lo que esta corrida guarde como');
      console.log('   PREVIO no es el estado original del usuario. Revisar antes de seguir.');
    }
  }
}

// **El ecualizador del auxiliar, comprobado ACA y no citado de otra corrida.**
// El contrato decia «plano --medido--» y ese «medido» era de otro archivo,
// teniendo `e0` las 6665 claves a mano. Es el defecto que la 94 y la 102
// documentaron cada una por su lado: citar un numero que no esta en el archivo de
// esta corrida. Y la 94 evito un notch del supresor y cayo justo en una
// atenuacion del ecualizador del bus.
{
  const fuera = [...e0.keys()]
    .filter((k) => k.startsWith(`a.${a}.eq.peak.`))
    .filter((k) => Math.abs(Number(e0.get(k)) - 0.5) > 1e-9);
  const cuantas = [...e0.keys()].filter((k) => k.startsWith(`a.${a}.eq.peak.`)).length;
  console.log('');
  console.log(`   ecualizador del auxiliar: ${fuera.length} de ${cuantas} claves fuera `
    + `del centro | eq.prmod = ${e0.get(`a.${a}.eq.prmod`) ?? '?'}`);
  if (fuera.length > 0) {
    throw new Error(`el ecualizador de a.${a} no esta plano: ${fuera.join(', ')}. `
      + 'La 94 evito un notch del supresor y cayo en una atenuacion del ecualizador '
      + 'del bus de 22,67 dB en 1 kHz.');
  }
}

// **Las claves de las que cuelga el camino se EXIGEN, no se imprimen.**
// Estaban todas en el volcado y ninguna en una guarda. La ley que se mide es la de
// ESTA configuracion y no la de otra.
for (const [k, v] of [
  [`hwoutaux.${a}.src`, `a.${a}`],
  [`i.${n}.aux.${a}.post`, '0'],
  [`i.${n}.aux.${a}.postproc`, '1'],
  [`a.${a}.mute`, '0'],
  [`i.${n}.mute`, '0'],
] as const) {
  const leido = String(exigirClave(e0, k));
  if (leido !== v) {
    throw new Error(`${k} = ${leido} y esta corrida mide suponiendo ${v}. `
      + 'La ley medida seria la de otra configuracion.');
  }
}
console.log(`   hwoutaux.${a}.src, post, postproc, mute del bus y del canal: comprobados`);

console.log('');
console.log(`   El envio es PRE-FADER (i.${n}.aux.${a}.post = ${e0.get(`i.${n}.aux.${a}.post`)}),`);
console.log('   asi que el fader del canal no lo toca y el medidor del canal sirve de');
console.log('   testigo: tiene que quedarse quieto durante todo el barrido.');

interface Punto {
  crudo: number; crudoLeido: number; sentido: 'baja' | 'sube';
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
    console.log('   Es una ganancia estatica: se cancela en toda atenuacion relativa al arranque.');

    sonando = spawn('afplay', [tono(900)]);
    await new Promise((r) => setTimeout(r, 3000));

    // **M5 — El piso del medidor del bus, MEDIDO en esta corrida.**
    // De aca sale el 16 de la ventana, y hasta hoy era una afirmacion. El envio ya
    // vale 0, asi que no cuesta nada.
    const piso = await medirPunto('piso');
    console.log('');
    console.log('=== EL PISO DEL MEDIDOR, MEDIDO Y NO HEREDADO ===');
    console.log(`   con el envio en 0: pre ${piso.preDb.toFixed(2)} dB = byte `
      + `${byteDeMedidor(piso.preDb)} | la interfaz ve ${piso.realDb.toFixed(2)} dBFS`);
    if (byteDeMedidor(piso.preDb) >= BYTE_PISO) {
      throw new Error(`el bus lee el byte ${byteDeMedidor(piso.preDb)} SIN señal: o la `
        + `ventana ${BYTE_PISO}..${BYTE_TECHO} esta mal puesta, o alguien mas alimenta `
        + 'este auxiliar.');
    }

    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, CRUDOS[0]!));
    await new Promise((r) => setTimeout(r, 2500));
    const arranque = await medirPunto('arranque');

    // **A3 — Las guardas de abajo son inertes con NaN, asi que esto va primero.**
    // `media([])` da NaN, `dbDeMedidor(NaN)` da NaN, y `NaN > 239` y `NaN < 20` son
    // los dos FALSE: las tres guardas del arranque se saltearian solas justo en el
    // caso que tienen que atajar, el flujo VU2 muerto.
    if (!Number.isFinite(arranque.preDb) || !Number.isFinite(arranque.realDb)) {
      throw new Error(`el arranque no dio numeros: pre ${arranque.preDb}, real `
        + `${arranque.realDb}, ${arranque.cuadros} cuadros. Con NaN las guardas de `
        + 'recorrido y de techo no disparan.');
    }
    if (arranque.cuadros < CUADROS_MINIMOS) {
      throw new Error(`${arranque.cuadros} cuadros en el arranque (minimo `
        + `${CUADROS_MINIMOS}): el flujo VU2 no esta llegando.`);
    }
    if (arranque.margenDb < MARGEN_MINIMO_DB) {
      throw new Error(`margen de ${arranque.margenDb.toFixed(1)} dB ya en el tope: el `
        + `instrumento erraria ${errorPorRuido(arranque.margenDb).toFixed(2)} dB.`);
    }
    const byteArranque = byteDeMedidor(arranque.preDb);
    recorridoDb = arranque.preDb - dbDeMedidor(BYTE_PISO * VU_ESCALA);
    console.log('');
    console.log('=== EL RECORRIDO, CALCULADO ANTES DE BARRER ===');
    console.log(`   arranque: pre ${arranque.preDb.toFixed(2)} dB = byte ${byteArranque}`);
    console.log(`   interfaz: ${arranque.realDb.toFixed(2)} dBFS, pico ${arranque.picoDb.toFixed(2)}, `
      + `margen ${arranque.margenDb.toFixed(1)} dB`);
    console.log(`   hueco del medidor hasta el piso de la ventana: ${recorridoDb.toFixed(1)} dB`);
    if (arranque.recorta || arranque.picoDb > -1) {
      throw new Error(`la interfaz recorta en el arranque (pico ${arranque.picoDb.toFixed(2)} dBFS): `
        + `bajar FADER_DEL_AUXILIAR, que hoy esta en ${FADER_DEL_AUXILIAR}`);
    }
    if (byteArranque > BYTE_TECHO) {
      throw new Error(`el arranque cae en el byte ${byteArranque}, por encima del techo `
        + `${BYTE_TECHO}: los bytes 240..255 informan posiciones mayores que 1`);
    }
    // **M1 — El recorrido que decide es el que los CRUDOS cubren, no el hueco.**
    //
    // `recorridoDb` es la distancia del arranque al piso de la ventana y **no
    // depende de `CRUDOS`**. Como la ley del envio es desconocida para esta corrida
    // --es la que la 94 midio y la que esto pone en duda-- el guion no puede
    // predecir donde caen los crudos: podrian no acercarse al piso y la guarda
    // pasaria igual. Asi que se mide el crudo mas bajo antes de barrer.
    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, CRUDOS[CRUDOS.length - 1]!));
    await new Promise((r) => setTimeout(r, 2500));
    const fondo = await medirPunto('fondo');
    const pisoDeLaVentana = dbDeMedidor(BYTE_PISO * VU_ESCALA);
    const cubierto = arranque.preDb - Math.max(fondo.preDb, pisoDeLaVentana);
    console.log(`   el crudo mas bajo (${CRUDOS[CRUDOS.length - 1]}) deja pre en `
      + `${fondo.preDb.toFixed(2)} dB = byte ${byteDeMedidor(fondo.preDb)}`);
    console.log(`   RECORRIDO QUE LOS CRUDOS CUBREN: ${cubierto.toFixed(1)} dB  <-- el que decide`);
    if (!Number.isFinite(cubierto) || cubierto < RECORRIDO_MINIMO_DB) {
      throw new Error(`${cubierto.toFixed(1)} dB de recorrido cubierto es menos que los `
        + `${RECORRIDO_MINIMO_DB} que hacen falta. La medicion 94 se declaro indecidible `
        + 'sobre 27,87 dB: correr esto seria un control que solo puede confirmar.');
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
        // **Se relee el crudo por HTTP, que es lo que la 102 no hacia.**
        //
        // La 99b midio que el crudo del FADER no se redondea; del ENVIO no se
        // sabe, y un auditor lo marco. Si la consola redondeara, ese error entra
        // en la ley sin tener nada que ver con ella, y `faderADb` se evaluaria en
        // un numero que la consola no tiene. Se evalua en el que devuelve.
        const crudoLeido = await leerUnaClave(maquina, `i.${n}.aux.${a}.value`);
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
          crudo, crudoLeido, sentido, preDb: p.preDb, postDb: p.postDb, byte: b,
          canalDb: p.canalDb,
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
const rango = (xs: number[]) => (xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs));

console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 104 ===');
console.log(`   ${utiles.length} puntos utiles de ${puntos.length} | ${enVentana.length} en la ventana`);
for (const p of puntos.filter((x) => x.anulado !== null)) {
  console.log(`     crudo ${p.crudo} ${p.sentido}: ${p.anulado}`);
}

// L1 — el testigo: el envio es pre-fader
{
  const d = rango(puntos.map((p) => p.canalDb).filter(Number.isFinite));
  const techo = Math.max(...puntos.map((p) => p.canalDb).filter(Number.isFinite));
  console.log('');
  console.log(`L1 deriva del medidor del canal: ${d.toFixed(2)} dB`);
  if (!(techo > -75)) {
    console.log(`   NO DECIDE: el medidor del canal nunca paso de ${techo.toFixed(1)} dB.`);
    console.log('   Sin señal el rango da cero y L1 pasaria sola.');
  } else {
    console.log(d <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. La fuente no se movio en todo el barrido.\n'
        + '   **L1 NO prueba que el envio sea pre-fader**: barrer un envio no mueve el\n'
        + '   medidor del canal del que se deriva, este donde este la derivacion. Que\n'
        + '   `post = 0` se lee del aparato y se exige, no se deduce de aca.'
      : '   FALLA: se movio la fuente y la corrida no vale.');
  }
}

// L2 — la referencia interna
{
  // **Sin datos no se acusa.** `rango([])` es NaN y `NaN <= 0.2` es false, asi que
  // la version anterior imprimia «cambio el nivel que emite la computadora» sin un
  // solo dato. Es el error inerte al reves: falsa alarma en vez de falso PASA.
  const fin = puntos.map((p) => p.referenciaDb).filter(Number.isFinite);
  console.log('');
  if (fin.length < PUNTOS_MINIMOS) {
    console.log(`L2 NO DECIDE: solo ${fin.length} lecturas finitas de la referencia.`);
  } else {
    const d = rango(fin);
    console.log(`L2 deriva de la referencia interna: ${d.toFixed(2)} dB`);
    console.log(d <= 0.2
      ? '   PASA. **Y vigila la computadora, no el camino de captura:** la entrada 3\n'
        + '   es un retorno interno de la interfaz. El camino analogico lo vigila L7.'
      : '   FALLA: cambio el nivel que emite la computadora.');
  }
}

const topePunto = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0]);
// **`process.exitCode` no detiene nada, y con `topeR = NaN` L3 imprime PASA.**
//
// Con la referencia anulada, todo `d` sale NaN, `Math.abs(NaN) > peor` es FALSE,
// `peor` queda en 0, y el veredicto dice «desvio maximo 0.00 dB — PASA, Y ES UNA
// COTA» sobre una referencia que el guion acaba de declarar inservible. Y los 22
// residuos NaN se cuentan como «dentro de 0,02 dB», porque `d > 0.02` y
// `d < -0.02` son los dos false.
//
// Es el mismo patron que este guion ataja en el arranque --`NaN > 239` es false--
// y que no se habia replicado 150 lineas mas abajo.
//
// `process.exit` aca es legitimo: estamos FUERA de `conRestauracion`, que ya
// corrio su `finally`. Adentro del cuerpo seria el error que el propio modulo
// documenta.
if (topePunto === undefined || topePunto.anulado !== null
    || !Number.isFinite(topePunto.realDb) || !Number.isFinite(topePunto.crudoLeido)) {
  console.log('');
  console.log(`EL PUNTO DE REFERENCIA (crudo ${CRUDOS[0]} bajando) NO SIRVE: `
    + `${topePunto?.anulado ?? 'no se midio'}.`);
  console.log('De el cuelgan L3, L3b, L4, L6 y L7, asi que NINGUNA se decide y no se');
  console.log('imprime veredicto. Publicar uno seria publicar una cuenta sobre NaN.');
  await t.desconectar();
  process.exit(1);
}
const topeR = topePunto.realDb;

// L3 — LA PREGUNTA: la salida real contra `faderADb`
{
  const utilesBaja = utiles.filter((p) => p.sentido === 'baja' && Number.isFinite(p.realDb));
  console.log('');
  if (utilesBaja.length < PUNTOS_MINIMOS) {
    console.log(`L3 NO SE PUEDE DECIDIR: ${utilesBaja.length} puntos utiles.`);
  } else {
    let peor = 0; let donde = NaN;
    const difs: number[] = [];
    for (const p of utilesBaja) {
      // En el crudo que la consola DEVUELVE, no en el que se escribio.
      const d = (topeR - p.realDb)
        - (faderADb(topePunto!.crudoLeido) - faderADb(p.crudoLeido));
      difs.push(d);
      if (Math.abs(d) > peor) { peor = Math.abs(d); donde = p.crudo; }
    }
    const tramo = topeR - Math.min(...utilesBaja.map((p) => p.realDb));
    console.log(`L3 la salida real contra faderADb: desvio maximo ${peor.toFixed(2)} dB `
      + `en el crudo ${donde}`);
    console.log(`   ${utilesBaja.length} puntos sobre ${tramo.toFixed(1)} dB de recorrido`);
    const pos = difs.filter((d) => d > 0.02).length;
    const neg = difs.filter((d) => d < -0.02).length;
    console.log(`   signo: ${pos} positivas, ${neg} negativas, `
      + `${difs.length - pos - neg} dentro de 0,02 dB`);
    console.log(peor <= 0.3
      ? '   PASA. **Y un PASA de L3 con el maximo por encima de 0,10 dB no es un\n'
        + '   acuerdo: es el residuo de la 94 dentro de la cota.** Lo que decide es L3b.'
      : '   FALLA. **El envio NO usa la ley del fader**, y eso toca a la 94 y a lo que\n'
        + '   ADR-028 abrio.');

    // **L3b — EL RESIDUO NO ESTA ESTRUCTURADO. La expectativa que de verdad decide.**
    //
    // L3 es una cota de maximo absoluto, y **una cota no ve la estructura**. La
    // medicion 102 habia declarado su B5 independiente de B4 por exactamente este
    // motivo, y la cirugia que produjo este guion se llevo B5 y dejo la cota.
    //
    // Un auditor recalculo los residuos sobre los datos que la 102 ya archivo:
    // **los 22 tienen el mismo signo** --probabilidad ~2⁻²¹ bajo cuantizacion--,
    // **todos superan el error del instrumento**, y **crecen monotonamente desde
    // el crudo 0,30**. Es la firma que la 94 describio como «unilateral y
    // creciente, truncado por el piso», reproducida en un banco **donde ya no hay
    // piso de medidor que la explique**.
    //
    // Sin esto, L3 daria 0,21 dB e imprimiria PASA sobre el hallazgo.
    {
      const conRef = utilesBaja.filter((p) => p !== topePunto);
      if (conRef.length < PUNTOS_MINIMOS) {
        console.log('');
        console.log(`L3b NO SE PUEDE DECIDIR: ${conRef.length} puntos ademas del tope.`);
      } else {
        const xs = conRef.map((p) => faderADb(topePunto.crudoLeido) - faderADb(p.crudoLeido));
        const ys = conRef.map((p) =>
          (topeR - p.realDb) - (faderADb(topePunto.crudoLeido) - faderADb(p.crudoLeido)));
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0);
        const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
        const pendiente = den === 0 ? NaN : num / den;
        // Rachas: cuantas veces cambia el signo. Con 22 residuos independientes se
        // esperan ~11 cambios; cero cambios es un residuo unilateral.
        let cambios = 0;
        for (let i = 1; i < ys.length; i++) {
          if (Math.sign(ys[i]!) !== 0 && Math.sign(ys[i - 1]!) !== 0
              && Math.sign(ys[i]!) !== Math.sign(ys[i - 1]!)) cambios += 1;
        }
        const mismoSigno = ys.filter((y) => y > 0).length === 0
          || ys.filter((y) => y < 0).length === 0;
        console.log('');
        console.log(`L3b el residuo contra faderADb: pendiente ${pendiente.toFixed(5)} dB/dB `
          + `sobre ${conRef.length} puntos`);
        console.log(`   signo: ${ys.filter((y) => y > 0).length} positivos, `
          + `${ys.filter((y) => y < 0).length} negativos, ${cambios} cambios de signo `
          + `(con residuos independientes se esperarian ~${Math.round(conRef.length / 2)})`);
        const estructurado = !(Math.abs(pendiente) <= 0.004) || mismoSigno;
        console.log(!estructurado
          ? '   PASA. El residuo no esta correlacionado con el crudo: lo que queda es\n'
            + '   dispersion, y `faderADb` describe el envio.'
          : '   FALLA. **El residuo ESTA estructurado**, y eso es un hallazgo, no una\n'
            + '   contradiccion con L3: una cota puntual no ve la estructura. Es la firma\n'
            + '   que la medicion 94 declaro indecidible, ahora en un banco sin piso de\n'
            + '   medidor que la explique. **Gana L3b.**');
        console.log('   L3b es INDEPENDIENTE de L3 y se declaro antes de mirar: su modo de');
        console.log('   falla propio es el residuo correlacionado con el crudo, que una cota');
        console.log('   de maximo absoluto no puede ver.');
      }
    }
  }
}

// L4 — el recorrido, que es un control del banco y no una prediccion
{
  const utilesBaja = utiles.filter((p) => p.sentido === 'baja' && Number.isFinite(p.realDb));
  console.log('');
  if (utilesBaja.length === 0) {
    console.log('L4 NO SE PUEDE DECIDIR: sin puntos utiles.');
  } else {
    const tramo = topeR - Math.min(...utilesBaja.map((p) => p.realDb));
    console.log(`L4 recorrido medido: ${tramo.toFixed(1)} dB (la 94 tuvo 27,87)`);
    console.log(tramo > 45
      ? '   PASA.'
      : '   FALLA: no mejora lo suficiente sobre la 94 para valer la corrida.');
    console.log('   **Y L4 casi no puede fallar, declarado aca:** la regla que anula por');
    console.log('   debajo de 45 dB de margen, con el piso del bin de este banco, garantiza');
    console.log('   puntos utiles hasta unos −73 dBFS, o sea unos 60 dB de tramo. L4 no es');
    console.log('   una prediccion sobre la consola: es un control de que el banco no se');
    console.log('   degrado.');
  }
}

// L5 — la consola no redondea el crudo del envio
{
  const conLectura = puntos.filter((p) => Number.isFinite(p.crudoLeido));
  console.log('');
  if (conLectura.length === 0) {
    console.log('L5 NO SE PUEDE DECIDIR: no se releyo ningun crudo.');
  } else {
    let peor = 0; let donde = NaN;
    for (const p of conLectura) {
      const d = Math.abs(p.crudoLeido - p.crudo);
      if (d > peor) { peor = d; donde = p.crudo; }
    }
    // Lo que ese redondeo costaria EN DECIBELES, que es lo que importa.
    const enDb = Math.max(...conLectura.map((p) =>
      Math.abs(faderADb(p.crudoLeido) - faderADb(p.crudo))));
    console.log(`L5 el crudo escrito contra el releido: diferencia maxima ${peor.toExponential(2)} `
      + `en el crudo ${donde}, que son ${enDb.toFixed(4)} dB`);
    // **El veredicto va sobre los DECIBELES, no sobre los bits.** La version
    // anterior comparaba `peor < 1e-9` --igualdad exacta-- e imprimia `enDb` sin
    // usarlo: la cuarta vez en este proyecto que una cuenta se hace y no se usa.
    // Lo que importa no es si redondea sino cuanto cuesta en la unidad de L3.
    console.log(enDb <= 0.03
      ? '   PASA. Si la consola redondea el crudo del envio, redondea menos de\n'
        + '   0,03 dB, que es la decima parte del umbral de L3. **Es una cota, no una\n'
        + '   identidad.**'
      : `   FALLA: ${enDb.toFixed(4)} dB de error entran en L3 sin tener nada que ver\n`
        + '   con la ley.');
    console.log('   Dos de los crudos barridos estan fuera de la rejilla de centesimos a');
    console.log('   proposito: sin ellos esta expectativa no podria fallar.');
  }
}

// L6 — ida y vuelta
{
  let peor = 0; let donde = NaN;
  for (const p of utiles.filter((x) => x.sentido === 'baja')) {
    const v = utiles.find((x) => x.crudo === p.crudo && x.sentido === 'sube');
    if (v === undefined) continue;
    const d = Math.abs(p.realDb - v.realDb);
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`L6 histeresis en la salida real: ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(peor <= 0.3 ? '   PASA.' : '   FALLA: los puntos no estan asentados.');
}

// L7 — el camino de captura
{
  // Sobre `utiles`, no sobre `puntos`: comparar dos puntos anulados da NaN, y
  // `Math.abs(NaN) <= 0.2` es false, o sea otra falsa alarma.
  const ida = utiles.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0]);
  const vuelta = utiles.find((p) => p.sentido === 'sube' && p.crudo === CRUDOS[0]);
  console.log('');
  if (ida === undefined || vuelta === undefined
      || !Number.isFinite(ida.realDb) || !Number.isFinite(vuelta.realDb)) {
    console.log('L7 sin el par de apertura y cierre, no se puede decir.');
  } else {
    const d = Math.abs(ida.realDb - vuelta.realDb);
    console.log(`L7 ganancia analogica de captura: el arranque repetido difiere ${d.toFixed(2)} dB`);
    console.log(d <= 0.2 ? '   PASA.'
      : '   FALLA: se movio la perilla de entrada, el cable o el conversor.');
  }
}

console.log('');
// **Los puntos anulados, con su desvio al lado.** El crudo mas bajo de la 102
// desviaba 1,01 dB con 0,06 de error de instrumento: **esta descartado por margen,
// no por ruido**, y que el veredicto de L3 dependa de si entra o no es parte del
// resultado.
{
  const anulados = puntos.filter((p) => p.sentido === 'baja' && p.anulado !== null
    && Number.isFinite(p.realDb) && Number.isFinite(p.crudoLeido));
  console.log('');
  console.log('=== LOS PUNTOS ANULADOS, QUE NO SE PUNTUAN PERO SE INFORMAN ===');
  if (anulados.length === 0) {
    console.log('   ninguno.');
  } else {
    console.log('crudo  | desvio vs faderADb | error del instrumento | motivo');
    for (const p of anulados) {
      const d = (topeR - p.realDb)
        - (faderADb(topePunto.crudoLeido) - faderADb(p.crudoLeido));
      console.log(`${p.crudo.toFixed(2).padStart(6)} | ${d.toFixed(2).padStart(18)} | `
        + `${errorPorRuido(p.margenDb).toFixed(3).padStart(21)} | ${p.anulado}`);
    }
    console.log('   Si el desvio supera al error del instrumento, el punto esta');
    console.log('   descartado por HIGIENE y no por ruido, y eso es parte del resultado.');
  }
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   **Nada sobre el cero absoluto.** Es una medicion RELATIVA al crudo 1,0, asi');
console.log('   que un error de escala constante es invisible por construccion. Que el crudo');
console.log('   0,7647 sea «0 dB de envio» no se mide aca: la 94 ya habia declarado esa');
console.log('   prediccion infalsable desde el diseño.');
console.log('   Nada sobre la ley INVERSA: esto mide crudo -> dB, y `dbAFader` es lo mismo');
console.log('   invertido SOLO si la funcion es la que se midio.');
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
