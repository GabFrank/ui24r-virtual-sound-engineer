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

/**
 * El auxiliar de **control cruzado**: el que la medicion 94 leyo de verdad.
 *
 * **La 94 leyo `auxiliares[2].pre`, o sea el auxiliar 3, y esta corrida mide el
 * 5** — porque el 5 es el unico cableado a la interfaz. Medir `a.4` no mide
 * `a.2`, y la propia 94 escribio que no prueba nada sobre los otros nueve
 * auxiliares. Sin cerrar ese salto, esta corrida no rescata a la 94: lo
 * extrapola.
 *
 * El cierre no necesita la interfaz y cuesta dos minutos: se barre tambien el
 * envio al auxiliar 3 por los mismos crudos y se comprueba que su byte `pre` de
 * **el mismo** que el del 5. Si coinciden byte a byte, la escala de `a.2` queda
 * anclada por transitividad al instrumento externo, y ahi si la 94 queda en pie.
 */
const AUX_DE_CONTROL = 2;

/** Los crudos del envío que se barren. */
const CRUDOS = [
  1.0, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60,
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
  // Dentro de `carpeta`, que la restauracion borra: 900 s son 173 MB y quedarse
  // en el temporal del sistema para siempre no es gratis.
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: {
  pre: number; post: number; reduccion: number; puerta: boolean;
  canalSalida: number; preControl: number;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const buses = decodificarVuBuses(carga).auxiliares;
  const bus = buses[a];
  const control = buses[AUX_DE_CONTROL];
  const c = decodificarVuCanales(carga)[n];
  if (bus === undefined || c === undefined || control === undefined) return;
  cuadros.push({
    pre: bus.pre, post: bus.post, reduccion: bus.reduccionDb,
    puerta: bus.indicadorDePuerta, canalSalida: c.salida,
    // El byte `pre` del auxiliar que la 94 leyo de verdad. Ver AUX_DE_CONTROL.
    preControl: control.pre,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

interface Medida {
  preDb: number; postDb: number; canalDb: number; preControlDb: number;
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
    preControlDb: dbDeMedidor(media(xs.map((c) => c.preControl))),
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
  // El auxiliar de control cruzado: se barre en paralelo para anclar la escala
  // del bus que la 94 leyo de verdad. Ver AUX_DE_CONTROL.
  [`i.${n}.aux.${AUX_DE_CONTROL}.value`,
    Number(exigirClave(e0, `i.${n}.aux.${AUX_DE_CONTROL}.value`))],
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
// **A5 — Quien mas alimenta el auxiliar, que la 94 ya sufrio.**
//
// La 94 encontro TRES canales mas mandando al auxiliar 3 --uno casi en unidad-- y
// escribio: «con señal en ellos, el piso del barrido es la suma y no el envio».
//
// Y aca la asimetria es venenosa: `pre` es un medidor de BANDA ANCHA y suma todo
// lo que entre al bus, mientras `realDb` es el bin de 1 kHz y solo ve el tono. Una
// contribucion ajena a otra frecuencia **infla `pre` y no toca `realDb`**, lo que
// produce un residuo unilateral y creciente hacia abajo: exactamente la firma que
// B4 leeria como «el paso del bloque de auxiliar es distinto».
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
  if (otros.some(([, v]) => v > 0.05)) {
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

console.log('');
console.log(`   El envio es PRE-FADER (i.${n}.aux.${a}.post = ${e0.get(`i.${n}.aux.${a}.post`)}),`);
console.log('   asi que el fader del canal no lo toca y el medidor del canal sirve de');
console.log('   testigo: tiene que quedarse quieto durante todo el barrido.');

interface Punto {
  crudo: number; sentido: 'baja' | 'sube';
  preDb: number; postDb: number; byte: number; canalDb: number; preControlDb: number;
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
        // **El mismo crudo al auxiliar que la 94 leyo.** Si los dos buses usan la
        // misma escala, sus bytes `pre` tienen que dar iguales en cada punto.
        t.enviar(codificarSetd(`i.${n}.aux.${AUX_DE_CONTROL}.value`, crudo));
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
          preControlDb: p.preControlDb,
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
  // **Y un piso absoluto, porque si la fuente muere B1 pasa sola.** Con el tono
  // apagado el medidor del canal cae a −80 y se queda ahi en todos los puntos, el
  // rango da cero, y B1 diria PASA sobre una corrida sin señal.
  const techo = Math.max(...puntos.map((p) => p.canalDb).filter(Number.isFinite));
  if (!(techo > -75)) {
    console.log(`   NO DECIDE: el medidor del canal nunca paso de ${techo.toFixed(1)} dB.`);
    console.log('   Sin señal el rango da cero y B1 pasaria sola.');
  } else {
    console.log(d <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. El envio es pre-fader y no toca el canal, como el aparato declara.'
      : '   FALLA: o se movio la fuente, o el envio no esta donde este proyecto cree.');
  }
}

// B2 — la referencia interna
{
  const d = rango(puntos.map((p) => p.referenciaDb).filter(Number.isFinite));
  console.log('');
  console.log(`B2 deriva de la referencia interna: ${d.toFixed(2)} dB`);
  console.log(d <= 0.2 ? '   PASA.' : '   FALLA: cambio el nivel que emite la computadora.');
}

// B3 — post sigue a pre, DONDE LOS DOS BYTES ESTAN EN LA VENTANA
//
// **`post` toca su piso mucho antes que `pre`, por construccion.** Entre los dos
// esta el fader del auxiliar, puesto como atenuador fijo: `post = pre +
// faderADb(FADER_DEL_AUXILIAR)`, o sea unos 14,7 dB mas abajo. Asi que `post` se
// acaba 14,7 dB antes, y comparar ahi no mide el fader: mide el piso del medidor.
//
// Sin esta ventana el guion imprimiria «hay algo entre pre y post que no es una
// ganancia estatica» sobre un banco donde lo unico que paso es que el medidor se
// termino --y desmentiria, sin motivo, la unica evidencia que el contrato invoca
// para decir que el atenuador se comporta.
{
  const enVentanaAmbos = utiles.filter((p) => !p.fueraDeVentana
    && Number.isFinite(p.postDb)
    && byteDeMedidor(p.postDb) >= BYTE_PISO && byteDeMedidor(p.postDb) <= BYTE_TECHO);
  console.log('');
  if (enVentanaAmbos.length < 3) {
    console.log(`B3 NO SE PUEDE DECIDIR: ${enVentanaAmbos.length} puntos con los dos bytes `
      + 'en la ventana.');
  } else {
    // **El RANGO de `pre − post`, no la distancia a un punto elegido.** Con una
    // referencia fija, un desvio repartido a los dos lados se informa a mitad de
    // precio, y ademas la referencia cambiaba en silencio si el primero se anulaba.
    const ds = enVentanaAmbos.map((p) => p.preDb - p.postDb);
    const peor = Math.max(...ds) - Math.min(...ds);
    const tramo = Math.max(...enVentanaAmbos.map((p) => p.preDb))
      - Math.min(...enVentanaAmbos.map((p) => p.preDb));
    console.log(`B3 post sigue a pre: el rango de (pre - post) es ${peor.toFixed(2)} dB`);
    console.log(`   ${enVentanaAmbos.length} puntos de ${enVentana.length}, sobre `
      + `${tramo.toFixed(1)} dB de los ${(Math.max(...enVentana.map((p) => p.preDb))
        - Math.min(...enVentana.map((p) => p.preDb))).toFixed(1)} que cubre la ventana de pre`);
    console.log(peor <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. Entre pre y post solo hay ganancia estatica, MEDIDO.'
      : '   FALLA: hay algo entre pre y post que no es una ganancia estatica.');
    console.log('   **Y B3 no puede hablar de todo el barrido.** `post` esta unos 14,7 dB');
    console.log('   por debajo de `pre` --es el atenuador fijo-- asi que toca su piso 14,7 dB');
    console.log('   antes. La parte de abajo de la ventana queda sin control de `post`, y eso');
    console.log('   es una limitacion del banco y no un resultado: bajar mas el fader recorta');
    console.log('   menos pero ciega mas a B3, y subirlo recorta.');
  }
}

/**
 * **El punto de referencia no puede estar anulado.**
 *
 * Toda atenuacion de B4 y B5 se mide contra el. La primera version lo buscaba con
 * un `find` que no miraba `anulado`, asi que un arranque recortado o sin cuadros
 * corria TODAS las atenuaciones en bloque sin que nada se quejara. Es el hallazgo
 * textual de la 101: la anulacion se calculaba y no se usaba donde mas importa.
 *
 * Y la guarda del arranque no alcanza: mide un punto **distinto**
 * --`medirPunto('arranque')`-- que puede pasar limpio mientras el primero del
 * barrido se anula.
 */
const topePunto = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0]);
if (topePunto === undefined || topePunto.anulado !== null) {
  console.log('');
  console.log(`EL PUNTO DE REFERENCIA (crudo ${CRUDOS[0]} bajando) NO SIRVE: `
    + `${topePunto?.anulado ?? 'no se midio'}.`);
  console.log('Toda atenuacion de B4 y B5 cuelga de el, asi que no se puntua nada.');
  await t.desconectar();
  process.exitCode = 1;
}
const topeP = topePunto?.preDb ?? NaN;
const topeR = topePunto?.realDb ?? NaN;

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
  // **Sin redondear a byte entero.** `p.byte` vuelve a cuantizar lo que promediar
  // ~68 cuadros habia ganado, y ademas dejaria a B4 y B5 hablando del mismo dato
  // en dos ejes distintos: B4 usa `preDb` directo.
  const xs = bajando.map((p) => (p.preDb + MEDIDOR_RANGO_DB) / ESCALON_DB);
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
    // **B5 NO es subordinada a B4, y la primera version de este contrato decia
    // que si.** La cuenta: si B4 pasa, cada punto queda a menos de 0,667 dB de la
    // recta exacta, y por minimos cuadrados eso todavia admite un error de
    // pendiente de `0,667 * Σ|x−x̄| / Σ(x−x̄)²`. Con este barrido son unos 5 %,
    // cinco veces el 1 % que B5 exige. Para que la subordinacion fuera cierta
    // harian falta ~560 bytes de rango --187 dB-- y la ventana entera son 223.
    const desvios = xs.map((x) => Math.abs(x - mx));
    const holgura = TOLERANCIA_MEDIDOR_DB * desvios.reduce((s2, d) => s2 + d, 0) / den;
    console.log(`   B5 es INDEPENDIENTE de B4: con B4 pasando, la pendiente todavia puede`);
    console.log(`   errar ${(holgura / ESCALON_DB * 100).toFixed(2)} % y B5 exige 1 %.`);
    console.log('   Su modo de falla propio es el residuo CORRELACIONADO con el byte, que es');
    console.log('   justo el que la 94 midio: catorce residuos del mismo signo creciendo hacia');
    console.log('   el piso. Si B4 pasa y B5 falla, hay un residuo estructurado y eso es un');
    console.log('   hallazgo, no una contradiccion.');
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

// B7 — el auxiliar que la 94 leyo de verdad
{
  console.log('');
  const conAmbos = enVentana.filter((p) => p.sentido === 'baja'
    && Number.isFinite(p.preDb) && Number.isFinite(p.preControlDb));
  if (conAmbos.length < PUNTOS_MINIMOS) {
    console.log(`B7 NO SE PUEDE DECIDIR: ${conAmbos.length} puntos con los dos buses.`);
  } else {
    const ds = conAmbos.map((p) => p.preDb - p.preControlDb);
    const peor = Math.max(...ds.map(Math.abs));
    const rangoD = Math.max(...ds) - Math.min(...ds);
    console.log(`B7 el auxiliar ${AUX_DE_CONTROL + 1} --el que la 94 leyo-- contra el `
      + `${auxiliar}: diferencia maxima ${peor.toFixed(2)} dB, rango ${rangoD.toFixed(2)} dB`);
    console.log(`   sobre ${conAmbos.length} puntos, con el MISMO crudo de envio a los dos`);
    console.log(rangoD <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. Los dos buses dan el mismo byte para el mismo envio, asi que la\n'
        + '   escala anclada en el auxiliar 5 vale tambien para el 3 **por transitividad**,\n'
        + '   y ahi si las cifras en dB de la 94 quedan en pie.'
      : '   FALLA: los dos auxiliares NO comparten escala, y lo medido en el 5 no dice\n'
        + '   nada del 3. La 94 sigue sin rescatarse.');
  }
}

// B8 — el camino de captura, con su propio umbral
//
// La 99b lo dejo escrito: «el camino de captura no lo vigila nadie; su unico
// control es repetir el punto de arranque al cierre, dentro de 0,2 dB». B6 no
// sirve para esto: usa 0,667, toma el maximo sobre todos los crudos --asi que el
// arranque queda diluido entre los ruidosos de abajo-- y compara solo `realDb`.
{
  const ida = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0]);
  const vuelta = puntos.find((p) => p.sentido === 'sube' && p.crudo === CRUDOS[0]);
  console.log('');
  if (ida === undefined || vuelta === undefined) {
    console.log('B8 sin el par de apertura y cierre, no se puede decir.');
  } else {
    const d = Math.abs(ida.realDb - vuelta.realDb);
    const dMedidor = Math.abs(ida.preDb - vuelta.preDb);
    console.log(`B8 ganancia analogica de captura: el arranque repetido difiere `
      + `${d.toFixed(2)} dB | y el MEDIDOR, ${dMedidor.toFixed(2)} dB`);
    console.log(d <= 0.2 && dMedidor <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA.'
      : '   FALLA: se movio la perilla de entrada, el cable, el conversor, o el\n'
        + '   propio medidor tiene histeresis --que seria un hallazgo sobre el\n'
        + '   instrumento bajo prueba.');
  }
}

// Lo que pasa DEBAJO de la ventana, informado y no puntuado
{
  const debajo = puntos.filter((p) => p.sentido === 'baja' && p.fueraDeVentana
    && p.anulado === null && Number.isFinite(p.realDb));
  console.log('');
  console.log('=== DEBAJO DE LA VENTANA: lo que la 94 no pudo decidir ===');
  if (debajo.length === 0) {
    console.log('   ningun punto util cayo debajo del byte 16.');
  } else {
    console.log('   La 94 vio ahi un residuo unilateral y creciente y no pudo decir si era');
    console.log('   el piso del medidor o una diferencia de ley. Con la interfaz mirando, el');
    console.log('   byte se aplasta y la salida real sigue: **si el residuo es el piso, tiene**');
    console.log('   **que crecer exactamente lo que el byte deja de bajar.** Se informa sin');
    console.log('   umbral porque no estaba declarado antes de medir.');
    console.log('   crudo  | pre    | byte | real   | at.pre | at.real | pre-real');
    for (const p of debajo) {
      console.log(`   ${p.crudo.toFixed(2).padStart(6)} | ${p.preDb.toFixed(2).padStart(6)} | `
        + `${String(p.byte).padStart(4)} | ${p.realDb.toFixed(2).padStart(6)} | `
        + `${(topeP - p.preDb).toFixed(2).padStart(6)} | ${(topeR - p.realDb).toFixed(2).padStart(7)} | `
        + `${((topeP - p.preDb) - (topeR - p.realDb)).toFixed(2).padStart(8)}`);
    }
  }
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
