/**
 * Los tiempos de la puerta: abrir, sostener y cerrar.
 *
 * **Contrato:** `docs/compromisos/116-los-tiempos-de-la-puerta.md`, escrito antes
 * de tocar la consola. El instrumento --el escalon, la envolvente, el detector
 * anclado-- es el de los items 114 y 115, que paso sus controles.
 *
 * ## Por que los dos tiempos del cierre salen de UNA captura
 *
 * Con la puerta abierta y el tono bajando de golpe, la salida hace tres cosas en
 * orden: **cae 18 dB de una** --eso es la señal, la puerta todavia esta abierta--,
 * **se queda quieta un rato** --eso es el SOSTENIDO-- y **despues cae otra vez**,
 * ahora hasta la profundidad de la puerta --eso es la RELAJACION--.
 *
 * O sea que el sostenido es *cuando empieza* la segunda caida y la relajacion es
 * *cuanto dura*. Medirlos por separado seria medir dos veces lo mismo. Ahi estan el alcance, los controles, la definicion
 * del tiempo y el trabajo previo.
 *
 * ## Lo que hace, en una linea
 *
 * Manda un tono que **salta de golpe** de bajo a alto, graba lo que sale, y mide
 * cuanto tarda el nivel en asentarse. Eso es el ataque. Al reves, la relajacion.
 *
 * **No usa el medidor de reduccion ni ninguna lectura de la consola**, que es lo
 * que bloqueaba esta medicion desde el item 97: aquella vez se iba a medir con el
 * medidor del aparato, y su escala estaba bajo sospecha.
 *
 * ## Por que 4000 Hz y no 1000
 *
 * Porque lo que se mide es **tiempo**, y la resolucion la fija cuantos ciclos
 * entran en la ventana de analisis. Con 6 ciclos de 4 kHz la ventana dura 1,5 ms;
 * con 6 ciclos de 1 kHz duraria 6. El tono mas agudo compra resolucion temporal
 * sin costar nada.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/tiempos-del-compresor.ts [maquina]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { leerWav, amplitudDelTono, dB } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');
const CANAL = 10;
const n = CANAL - 1;
const ENTRADA = 0;
const FM = 48000;
const GRABADOR = 'tools/audio/bin/grabar';

/** El tono. Agudo a proposito: compra resolucion temporal. Ver el encabezado. */
const HZ = 4000;
/** Ciclos por ventana de envolvente. 6 a 4 kHz son 1,5 ms. */
const CICLOS_POR_VENTANA = 6;
const VENTANA = Math.round((FM * CICLOS_POR_VENTANA) / HZ);
/** Cada cuantas muestras se avanza la ventana. 24 muestras son 0,5 ms. */
const PASO = 24;
/** Por debajo de esto no se publica un numero: es el piso del instrumento. */
const PISO_DEL_INSTRUMENTO_MS = 5;

/** Los dos niveles del escalon, en dBFS del archivo. */
const NIVEL_BAJO_DBFS = -30;
const NIVEL_ALTO_DBFS = -12;
/** Cuanto dura cada tramo. El largo tiene que cubrir la relajacion mas lenta. */
const SEG_BAJO = 3;
const SEG_ALTO = 3;
/** Margen minimo del tono sobre el piso, para C1. */
const MARGEN_MINIMO_DB = 45;
/** L3: cuanto pueden diferir dos escalones seguidos. */
const REPETIBILIDAD = 0.20;

/**
 * Los crudos que se barren. **Nueve, no cinco**: con cuatro puntos utiles la forma
 * la decidia el ajuste y no los datos.
 */
const CRUDOS = [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0] as const;

/**
 * La profundidad de la puerta, fijada en −20 dB. **No es un detalle.**
 *
 * El canal viene con `gate.depth = 0`, que el cliente lee como **−60 dB**: con la
 * puerta cerrada no queda nada y el nivel bajo se hunde en el ruido. Medir un
 * tiempo entre el piso de ruido y la señal no es medir la puerta.
 *
 * `VtoGATE_DEPTH(a) = 60a − 60`, asi que −20 dB es a = 2/3.
 */
const PROFUNDIDAD_CRUDA = 2 / 3;
const PROFUNDIDAD_NOMINAL_DB = -20;
/** C3: cuanto tiene que atenuar la puerta cerrada para que haya algo que medir. */
const CIERRE_MINIMO_DB = 10;
/** Cuanto tiene que caer del pico para considerar que EMPEZO a cerrar. */
const ARRANQUE_DEL_CIERRE_DB = 2;
/** Por donde arranca la busqueda del umbral que deja la puerta en el medio. */
const UMBRAL_INICIAL = 0.5;

const carpeta = mkdtempSync(join(tmpdir(), 'tiempos-comp-'));

/** Un tono con un escalon: `SEG_BAJO` abajo y `SEG_ALTO` arriba, o al reves. */
function tonoConEscalon(subiendo: boolean): string {
  const nBajo = FM * SEG_BAJO;
  const nAlto = FM * SEG_ALTO;
  const total = nBajo + nAlto;
  const aBajo = Math.pow(10, NIVEL_BAJO_DBFS / 20) * 32767;
  const aAlto = Math.pow(10, NIVEL_ALTO_DBFS / 20) * 32767;
  const datos = Buffer.alloc(total * 4);
  for (let i = 0; i < total; i++) {
    const primerTramo = i < (subiendo ? nBajo : nAlto);
    const a = subiendo ? (primerTramo ? aBajo : aAlto) : (primerTramo ? aAlto : aBajo);
    const v = Math.round(a * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(carpeta, `escalon-${subiendo ? 'sube' : 'baja'}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

interface Punto { ms: number; db: number }

/** La envolvente del tono, en dBFS, muestreada cada `PASO`. */
function envolvente(x: Float64Array | number[]): Punto[] {
  const p: Punto[] = [];
  for (let i = 0; i + VENTANA <= x.length; i += PASO) {
    const trozo = (x as number[]).slice(i, i + VENTANA);
    p.push({ ms: ((i + VENTANA / 2) / FM) * 1000, db: dB(amplitudDelTono(trozo, HZ, FM)) });
  }
  return p;
}


/**
 * El instante del escalon de ENTRADA, anclado a donde tiene que estar.
 *
 * Es el mismo detector que paso los controles de los items 114 y 115, y por los
 * mismos motivos: el mayor salto de la grabacion es el arranque del tono, no el
 * escalon; el arranque es una rampa cuyos tramos se le parecen; y el escalon se
 * reparte entre varias ventanas de analisis, asi que se compara **a traves del
 * borron** y no contra el punto de al lado.
 */
function instanteDelEscalon(env: Punto[], subiendo: boolean): number {
  if (env.length < 40) return -1;
  const piso = Math.min(...env.map((p) => p.db));
  const ESPERADO = Math.abs(NIVEL_ALTO_DBFS - NIVEL_BAJO_DBFS);
  const iArranque = env.findIndex((p) => p.db - piso > 20);
  if (iArranque === -1) return -1;
  const msEscalon = env[iArranque]!.ms + (subiendo ? SEG_BAJO : SEG_ALTO) * 1000;
  const ANCHO = Math.ceil(VENTANA / PASO);
  let iSalto = -1;
  let distancia = Infinity;
  for (let i = 1; i + ANCHO < env.length; i++) {
    if (Math.abs(env[i]!.ms - msEscalon) > 400) continue;
    const d = env[i + ANCHO]!.db - env[i - 1]!.db;
    const m = subiendo ? d : -d;
    if (m < 6) continue;
    const dist = Math.abs(m - ESPERADO);
    if (dist < distancia) { distancia = dist; iSalto = i; }
  }
  return iSalto;
}

const ANCHO_BORRON = Math.ceil(VENTANA / PASO);
const mediana = (xs: number[]): number => {
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)]!;
};

/**
 * La APERTURA: cuanto tarda la salida en subir hasta su valor final.
 *
 * **No se mide desde un pico**, como en el compresor: acá la salida sube y se
 * queda, sin sobrepasarse. Se mide desde el punto inmediatamente posterior al
 * escalon de entrada --cuando la señal ya subio pero la puerta todavia no-- hasta
 * el valor asentado.
 */
function medirApertura(env: Punto[]): {
  t63: number; t90: number; desdeDb: number; hastaDb: number; recorridoDb: number;
} | null {
  const i = instanteDelEscalon(env, true);
  if (i === -1) return null;
  const iDesde = Math.min(i + ANCHO_BORRON, env.length - 1);
  const desdeDb = env[iDesde]!.db;
  const cola = env.slice(Math.floor(iDesde + (env.length - iDesde) * 0.66));
  if (cola.length < 5) return null;
  const hastaDb = mediana(cola.map((p) => p.db));
  const recorridoDb = hastaDb - desdeDb;
  if (recorridoDb < 3) {
    return { t63: 0, t90: 0, desdeDb, hastaDb, recorridoDb };
  }
  const cruce = (f: number): number => {
    const objetivo = desdeDb + recorridoDb * f;
    for (let k = iDesde; k < env.length; k++) {
      if (env[k]!.db >= objetivo) return env[k]!.ms - env[iDesde]!.ms;
    }
    return NaN;
  };
  return { t63: cruce(0.63), t90: cruce(0.90), desdeDb, hastaDb, recorridoDb };
}

/**
 * El CIERRE: el sostenido y la relajacion, de la misma captura.
 *
 * Despues del escalon hacia abajo la salida se queda en una meseta --la puerta
 * sigue abierta-- y recien despues cae. El sostenido es **cuando empieza** esa
 * segunda caida; la relajacion es **cuanto dura**.
 */
function medirCierre(env: Punto[]): {
  sostenidoMs: number; t63: number; t90: number; mesetaDb: number; cerradoDb: number;
  caidaDb: number;
} | null {
  const i = instanteDelEscalon(env, false);
  if (i === -1) return null;
  const iMeseta = Math.min(i + ANCHO_BORRON, env.length - 1);
  // La meseta: la mediana de los primeros 30 ms despues del escalon, que es
  // menos que el sostenido mas corto que el fabricante declara.
  const finMeseta = Math.min(iMeseta + Math.round(30 / (PASO / FM * 1000)), env.length);
  if (finMeseta - iMeseta < 3) return null;
  const mesetaDb = mediana(env.slice(iMeseta, finMeseta).map((p) => p.db));
  const cola = env.slice(Math.floor(iMeseta + (env.length - iMeseta) * 0.75));
  if (cola.length < 5) return null;
  const cerradoDb = mediana(cola.map((p) => p.db));
  const caidaDb = mesetaDb - cerradoDb;
  if (caidaDb < 3) {
    return { sostenidoMs: NaN, t63: 0, t90: 0, mesetaDb, cerradoDb, caidaDb };
  }
  // El arranque del cierre: primer punto que baja ARRANQUE_DEL_CIERRE_DB de la meseta.
  let iArranqueCierre = -1;
  for (let k = iMeseta; k < env.length; k++) {
    if (env[k]!.db <= mesetaDb - ARRANQUE_DEL_CIERRE_DB) { iArranqueCierre = k; break; }
  }
  if (iArranqueCierre === -1) return null;
  const sostenidoMs = env[iArranqueCierre]!.ms - env[iMeseta]!.ms;
  const cruce = (f: number): number => {
    const objetivo = mesetaDb - caidaDb * f;
    for (let k = iArranqueCierre; k < env.length; k++) {
      if (env[k]!.db <= objetivo) return env[k]!.ms - env[iArranqueCierre]!.ms;
    }
    return NaN;
  };
  return { sostenidoMs, t63: cruce(0.63), t90: cruce(0.90), mesetaDb, cerradoDb, caidaDb };
}

let sonando: ReturnType<typeof spawn> | null = null;

async function capturar(etiqueta: string, subiendo: boolean): Promise<Punto[]> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 300); });
  const wav = join(carpeta, `${etiqueta}.wav`);
  sonando = spawn('afplay', [tonoConEscalon(subiendo)]);
  let fallo: Error | null = null;
  sonando.on('error', (e) => { fallo = e instanceof Error ? e : new Error(String(e)); });
  const hijo = spawn(GRABADOR, [String(SEG_BAJO + SEG_ALTO), wav, 'Scarlett'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  hijo.stderr?.on('data', (b: Buffer) => { err += b.toString(); });
  const codigo = await new Promise<number | null>((res, rej) => {
    hijo.on('error', rej); hijo.on('close', (c) => res(c));
  });
  if (fallo !== null) throw fallo;
  if (codigo !== 0) throw new Error(`el grabador salio con ${codigo}: ${err.trim()}`);
  const w = leerWav(wav) as { canales: number[][] };
  const env = envolvente(w.canales[ENTRADA]!);
  rmSync(wav, { force: true });
  return env;
}

const fmt = (ms: number): string =>
  !Number.isFinite(ms) ? 'no cruza'
    : ms < PISO_DEL_INSTRUMENTO_MS ? `<${PISO_DEL_INSTRUMENTO_MS} (piso)` : `${ms.toFixed(1)} ms`;

const desqr = (a: number): number => 1 - (1 - a) * (1 - a);
const cliAtaque = (a: number): number => Math.pow(400, desqr(a));
const cliSostenido = (a: number): number => Math.pow(2000, desqr(a));
const cliRelajacion = (a: number): number => 5 * Math.pow(400, desqr(a));

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const RUTA_ATAQUE = `i.${n}.gate.attack`;
const RUTA_SOSTENIDO = `i.${n}.gate.hold`;
const RUTA_RELAJACION = `i.${n}.gate.release`;
const RUTA_UMBRAL = `i.${n}.gate.thresh`;
const RUTA_PROFUNDIDAD = `i.${n}.gate.depth`;
const RUTA_PUENTE = `i.${n}.gate.bypass`;

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [RUTA_PUENTE, Number(exigirClave(e0, `i.${n}.gate.bypass`))],
  [RUTA_ATAQUE, Number(exigirClave(e0, `i.${n}.gate.attack`))],
  [RUTA_SOSTENIDO, Number(exigirClave(e0, `i.${n}.gate.hold`))],
  [RUTA_RELAJACION, Number(exigirClave(e0, `i.${n}.gate.release`))],
  [RUTA_UMBRAL, Number(exigirClave(e0, `i.${n}.gate.thresh`))],
  [RUTA_PROFUNDIDAD, Number(exigirClave(e0, `i.${n}.gate.depth`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  [`i.${n}.mix`, Number(exigirClave(e0, `i.${n}.mix`))],
];

console.log('=== 116 — LOS TIEMPOS DE LA PUERTA, CONTRA EL AUDIO ===');
console.log(`   canal ${CANAL} -> general -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   tono ${HZ} Hz, escalon de ${NIVEL_BAJO_DBFS} a ${NIVEL_ALTO_DBFS} dBFS`);
console.log(`   profundidad fijada en ${PROFUNDIDAD_NOMINAL_DB} dB `
  + `(crudo ${PROFUNDIDAD_CRUDA.toFixed(4)}), y el motivo esta en el contrato`);
console.log('');
for (const [k, v] of PREVIO) console.log(`   ${k.padEnd(22)} ${v}`);
console.log('');

anotarPendiente('tiempos-de-la-puerta.ts', maquina, PREVIO);

let c1 = false; let c2 = false; let c3 = false; let c4 = false;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1200); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const afs = await leerUnaClave(maquina, 'm.afs.enabled');
    if (afs !== 0) {
      throw new Error(`m.afs.enabled quedo en ${afs}: no se mete un tono sostenido con el `
        + 'supresor encendido.');
    }
    console.log('   supresor apagado y COMPROBADO por HTTP');

    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 1));
    t.enviar(codificarSetd(RUTA_PROFUNDIDAD, PROFUNDIDAD_CRUDA));
    await new Promise((r) => { setTimeout(r, 1500); });

    // --- C2: el escalon es limpio con la puerta PUENTEADA --------------------
    console.log('');
    console.log('=== C2 — EL ESCALON CON LA PUERTA PUENTEADA ===');
    t.enviar(codificarSetd(RUTA_PUENTE, 1));
    await new Promise((r) => { setTimeout(r, 1200); });
    const envSin = await capturar('c2', true);
    const sin = medirApertura(envSin);
    if (sin === null) {
      console.log('   NO SE ENCONTRO EL ESCALON. La envolvente, cada 100 ms:');
      for (let i = 0; i < envSin.length; i += Math.round(100 / (PASO / FM * 1000))) {
        const p = envSin[i]!;
        console.log(`      ${p.ms.toFixed(0).padStart(5)} ms  ${p.db.toFixed(1).padStart(7)} dBFS`);
      }
      throw new Error('C2 FALLA: sin escalon no hay nada que cronometrar.');
    }
    const altoSinPuerta = sin.hastaDb;
    console.log(`   asentado ${altoSinPuerta.toFixed(2)} dBFS, `
      + `recorrido posterior al escalon ${sin.recorridoDb.toFixed(2)} dB`);
    console.log(`   apertura: t63 ${fmt(sin.t63)}, t90 ${fmt(sin.t90)}`);
    c2 = !(sin.t63 >= PISO_DEL_INSTRUMENTO_MS);
    console.log(`   ${c2 ? 'PASA: sin puerta el escalon salta y ya.'
      : 'FALLA: con la puerta puenteada YA sale una curva.'}`);
    if (!c2) throw new Error('C2 FALLA: el banco introduce su propio asentamiento.');

    const piso = Math.min(...envSin.map((p) => p.db));
    const bajoSinPuerta = altoSinPuerta - Math.abs(NIVEL_ALTO_DBFS - NIVEL_BAJO_DBFS);
    c1 = altoSinPuerta - piso >= MARGEN_MINIMO_DB;
    console.log('');
    console.log(`C1 el tono llega: ${(altoSinPuerta - piso).toFixed(1)} dB `
      + `(minimo ${MARGEN_MINIMO_DB})`);
    if (!c1) throw new Error('C1 FALLA: el tono no llega con margen.');

    // --- calibrar el umbral: la puerta cerrada abajo y abierta arriba --------
    console.log('');
    console.log('=== CALIBRACION DEL UMBRAL ===');
    console.log(`   sin puerta, el nivel bajo esta en ~${bajoSinPuerta.toFixed(1)} dBFS `
      + `y el alto en ${altoSinPuerta.toFixed(1)}`);
    t.enviar(codificarSetd(RUTA_PUENTE, 0));
    t.enviar(codificarSetd(RUTA_ATAQUE, 0));
    t.enviar(codificarSetd(RUTA_SOSTENIDO, 0));
    t.enviar(codificarSetd(RUTA_RELAJACION, 0));
    let umbral = UMBRAL_INICIAL;
    let cierre = NaN;
    let abierta = NaN;
    for (let intento = 1; intento <= 8; intento++) {
      t.enviar(codificarSetd(RUTA_UMBRAL, umbral));
      await new Promise((r) => { setTimeout(r, 1200); });
      const m = medirApertura(await capturar(`cal-${intento}`, true));
      if (m === null) throw new Error('la calibracion no encontro el escalon.');
      // Con la puerta cerrada abajo, el punto justo posterior al escalon todavia
      // esta atenuado: el recorrido posterior ES lo que abre la puerta.
      cierre = m.recorridoDb;
      abierta = m.hastaDb;
      console.log(`   umbral ${umbral.toFixed(3)} -> la puerta abre ${cierre.toFixed(2)} dB `
        + `y deja el alto en ${abierta.toFixed(2)} dBFS`);
      const abreBien = Math.abs(abierta - altoSinPuerta) < 2;
      if (cierre >= CIERRE_MINIMO_DB && abreBien) break;
      // Poca apertura: la puerta no cierra abajo -> subir el umbral.
      // El alto no llega: la puerta tampoco abre arriba -> bajarlo.
      umbral += abreBien ? 0.04 : -0.04;
      umbral = Math.min(0.95, Math.max(0.02, umbral));
    }

    c3 = cierre >= CIERRE_MINIMO_DB;
    c4 = Math.abs(abierta - altoSinPuerta) < 2;
    console.log('');
    console.log(`C3 la puerta cierra: atenua ${cierre.toFixed(2)} dB con el nivel bajo `
      + `(minimo ${CIERRE_MINIMO_DB}) -> ${c3 ? 'PASA' : 'FALLA'}`);
    console.log(`C4 el umbral quedo EN EL MEDIO: con el nivel alto la salida da `
      + `${abierta.toFixed(2)} contra ${altoSinPuerta.toFixed(2)} sin puerta `
      + `-> ${c4 ? 'PASA' : 'FALLA'}`);
    if (!c3) throw new Error('C3 FALLA: la puerta no cierra con el nivel bajo.');
    if (!c4) throw new Error('C4 FALLA: la puerta tampoco abre del todo con el nivel alto.');
    console.log('');
    console.log(`   profundidad MEDIDA: ${cierre.toFixed(2)} dB, el cliente predice `
      + `${(60 * PROFUNDIDAD_CRUDA - 60).toFixed(1)} (L5)`);

    // --- la apertura ---------------------------------------------------------
    console.log('');
    console.log('=== LA APERTURA (attack) ===');
    console.log('   crudo |   t63    |   t90    | el cliente predice | medido/predicho');
    t.enviar(codificarSetd(RUTA_SOSTENIDO, 0));
    t.enviar(codificarSetd(RUTA_RELAJACION, 0));
    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(RUTA_ATAQUE, crudo));
      await new Promise((r) => { setTimeout(r, 900); });
      const a = medirApertura(await capturar(`ap-${crudo}`, true));
      const b = medirApertura(await capturar(`ap-${crudo}-b`, true));
      const pred = cliAtaque(crudo);
      const coc = a === null ? NaN : a.t63 / pred;
      const rep = (a === null || b === null) ? NaN : Math.abs(a.t63 - b.t63) / Math.max(a.t63, 1);
      console.log(`   ${crudo.toFixed(3)} | ${fmt(a?.t63 ?? NaN).padStart(8)} | `
        + `${fmt(a?.t90 ?? NaN).padStart(8)} | ${pred.toFixed(1).padStart(14)} ms | `
        + `${Number.isFinite(coc) ? coc.toFixed(2) : '—'}`
        + `${Number.isFinite(rep) ? `   (repite ${(rep * 100).toFixed(0)}%)` : ''}`);
    }

    // --- el sostenido y la relajacion, de la misma captura -------------------
    console.log('');
    console.log('=== EL SOSTENIDO (hold) ===');
    console.log('   crudo | sostenido | el cliente predice | medido/predicho');
    t.enviar(codificarSetd(RUTA_ATAQUE, 0));
    t.enviar(codificarSetd(RUTA_RELAJACION, 0));
    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(RUTA_SOSTENIDO, crudo));
      await new Promise((r) => { setTimeout(r, 900); });
      const a = medirCierre(await capturar(`so-${crudo}`, false));
      const pred = cliSostenido(crudo);
      const coc = a === null ? NaN : a.sostenidoMs / pred;
      console.log(`   ${crudo.toFixed(3)} | ${fmt(a?.sostenidoMs ?? NaN).padStart(9)} | `
        + `${pred.toFixed(1).padStart(14)} ms | ${Number.isFinite(coc) ? coc.toFixed(2) : '—'}`);
    }

    console.log('');
    console.log('=== LA RELAJACION (release) ===');
    console.log('   crudo |   t63    |   t90    | el cliente predice | medido/predicho');
    t.enviar(codificarSetd(RUTA_SOSTENIDO, 0));
    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(RUTA_RELAJACION, crudo));
      await new Promise((r) => { setTimeout(r, 900); });
      const a = medirCierre(await capturar(`re-${crudo}`, false));
      const b = medirCierre(await capturar(`re-${crudo}-b`, false));
      const pred = cliRelajacion(crudo);
      const coc = a === null ? NaN : a.t63 / pred;
      const rep = (a === null || b === null) ? NaN : Math.abs(a.t63 - b.t63) / Math.max(a.t63, 1);
      console.log(`   ${crudo.toFixed(3)} | ${fmt(a?.t63 ?? NaN).padStart(8)} | `
        + `${fmt(a?.t90 ?? NaN).padStart(8)} | ${pred.toFixed(1).padStart(14)} ms | `
        + `${Number.isFinite(coc) ? coc.toFixed(2) : '—'}`
        + `${Number.isFinite(rep) ? `   (repite ${(rep * 100).toFixed(0)}%)` : ''}`);
    }
  },
);

const e1 = await estadoPorHttpExigido(maquina);
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
let bien = true;
for (const [k, v] of PREVIO) {
  const leido = Number(exigirClave(e1, k));
  const ok = leido === v;
  if (!ok) bien = false;
  console.log(`   ${ok ? 'OK  ' : 'MAL '} ${k.padEnd(22)} esperado ${v}  leido ${leido}`);
}
await t.desconectar();
if (bien) cerrarPendiente(); else process.exitCode = 1;

console.log('');
console.log('=== ALCANCE ===');
console.log(`   Un tono de ${HZ} Hz, un umbral, una profundidad, un canal, un dia.`);
console.log('   Nada de la ley del umbral: se calibro y se informa el crudo usado.');
console.log('   Nada con señal real. Nada de la puerta de los buses de salida.');
if (!(c1 && c2 && c3 && c4)) {
  console.log('');
  console.log('NO SE PUBLICAN TIEMPOS: fallo algun control.');
  process.exitCode = 1;
}
