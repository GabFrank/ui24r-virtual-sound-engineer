/**
 * Los tiempos del compresor de canal, contra el audio real.
 *
 * **Contrato:** `docs/compromisos/114-los-tiempos-del-compresor.md`, escrito
 * antes de tocar la consola. Ahi estan el alcance, los controles, la definicion
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
/** C3: cuanta reduccion hace falta para que un tiempo signifique algo. */
const REDUCCION_MINIMA_DB = 6;
/** L3: cuanto pueden diferir dos escalones seguidos. */
const REPETIBILIDAD = 0.20;

/** Los crudos que se barren. Pocos y separados: cada uno cuesta dos escalones. */
const CRUDOS = [0.0, 0.25, 0.5, 0.75, 1.0] as const;
/** El punto de trabajo: relacion y umbral fijos para que la reduccion sea grande. */
const RATIO_DE_TRABAJO = 0.1;
const UMBRAL_DE_TRABAJO = 0.25;

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
 * Busca el escalon y mide cuanto tarda la salida en asentarse.
 *
 * **El instante del escalon se busca en la señal, no se supone del archivo.** Entre
 * que `afplay` arranca y que el grabador captura hay una latencia que nadie
 * declaro, y suponerla seria inventar el dato que se esta midiendo.
 *
 * Devuelve `null` si no encuentra un escalon claro: es mejor no publicar que
 * publicar el tiempo de un escalon imaginario.
 */
function medirAsentamiento(env: Punto[], subiendo: boolean): {
  t63: number; t90: number; saltoDb: number; asentadoDb: number; picoDb: number;
  cuandoMs: number;
} | null {
  if (env.length < 40) return null;
  // **El escalon NO es el mayor salto, y suponerlo costo la primera corrida.**
  //
  // El mayor salto de la grabacion es el ARRANQUE DEL TONO --del silencio a
  // -30 dBFS-- que es mucho mas grande que el escalon de 18 dB que se busca. Con
  // el maximo, el detector se paraba en el arranque y medía «asentamiento» sobre
  // los seis segundos enteros: C2 dio 2999 ms y freno la corrida, con razon.
  //
  // El escalon se reconoce por DOS cosas a la vez: que el tono ya estuviera
  // sonando antes --el nivel previo bien por encima del piso-- y que el salto se
  // parezca al que se pidio.
  const piso = Math.min(...env.map((p) => p.db));
  const ESPERADO = Math.abs(NIVEL_ALTO_DBFS - NIVEL_BAJO_DBFS);

  // **Primero el ARRANQUE del tono, y recien despues el escalon.** Buscar el
  // salto mas parecido a 18 dB tampoco alcanzo: el arranque no es un salto solo,
  // es una rampa de varias ventanas, y alguno de sus tramos se parece bastante al
  // escalon. La segunda corrida se paro en un salto de 15,5 dB a los 40 ms.
  //
  // Lo que si se sabe es **donde cae el escalon dentro del archivo**: a los
  // `SEG_BAJO` segundos del arranque del tono. El arranque se encuentra en la
  // señal --primer punto bien por encima del piso-- y el escalon se busca SOLO en
  // una ventana alrededor de donde tiene que estar. Si ahi no hay salto, se
  // devuelve null en vez de agarrar cualquier otro.
  const iArranque = env.findIndex((p) => p.db - piso > 20);
  if (iArranque === -1) return null;
  const msEscalon = env[iArranque]!.ms + (subiendo ? SEG_BAJO : SEG_ALTO) * 1000;
  const VENTANA_BUSQUEDA_MS = 400;

  // **El salto se reparte entre ventanas, y compararlo con el punto de al lado
  // no lo ve.** La ventana dura 1,5 ms y el paso 0,5, asi que un escalon
  // instantaneo tarda tres puntos en completarse: 18 dB repartidos en tres saltos
  // de seis. Con el filtro en «mas de 6 dB entre puntos consecutivos» ninguno
  // llegaba, y el detector devolvia «no hay escalon» sobre una grabacion donde el
  // escalon estaba perfecto. Se compara **a traves del borron**, no al lado.
  const ANCHO = Math.ceil(VENTANA / PASO);
  let iSalto = -1;
  let mejor = 0;
  let distancia = Infinity;
  for (let i = 1; i + ANCHO < env.length; i++) {
    if (Math.abs(env[i]!.ms - msEscalon) > VENTANA_BUSQUEDA_MS) continue;
    const d = env[i + ANCHO]!.db - env[i - 1]!.db;
    const m = subiendo ? d : -d;
    if (m < 6) continue;
    const dist = Math.abs(m - ESPERADO);
    if (dist < distancia) { distancia = dist; mejor = m; iSalto = i; }
  }
  if (iSalto === -1) return null;

  // El pico: el extremo que alcanza justo despues del escalon, antes de asentarse.
  const ventanaPico = env.slice(iSalto, Math.min(iSalto + 20, env.length));
  const picoDb = subiendo
    ? Math.max(...ventanaPico.map((p) => p.db))
    : Math.min(...ventanaPico.map((p) => p.db));
  const iPico = env.findIndex((p, i) => i >= iSalto && p.db === picoDb);

  // El asentado: la mediana del ultimo tercio del tramo posterior.
  const cola = env.slice(Math.floor(iPico + (env.length - iPico) * 0.66));
  if (cola.length < 5) return null;
  const orden = cola.map((p) => p.db).sort((a, b) => a - b);
  const asentadoDb = orden[Math.floor(orden.length / 2)]!;

  const recorrido = asentadoDb - picoDb;

  // **«No se asienta» NO es «no encontre el escalon», y confundirlos rompia C2.**
  //
  // Con el compresor puenteado el escalon sube y se queda: no hay asentamiento
  // que cronometrar, y eso es exactamente lo que C2 quiere ver. La version
  // anterior devolvia `null` en ese caso, o sea el mismo valor que cuando no
  // encuentra nada -- y C2 no podia distinguir su exito de su fracaso.
  //
  // Ahora un asentamiento por debajo de 1 dB se informa como tiempo CERO, que es
  // lo que significa: el aparato llego de una.
  if (Math.abs(recorrido) < 1) {
    return { t63: 0, t90: 0, saltoDb: mejor, asentadoDb, picoDb, cuandoMs: env[iSalto]!.ms };
  }

  const cruce = (fraccion: number): number => {
    const objetivo = picoDb + recorrido * fraccion;
    for (let i = iPico; i < env.length; i++) {
      const pasó = recorrido < 0 ? env[i]!.db <= objetivo : env[i]!.db >= objetivo;
      if (pasó) return env[i]!.ms - env[iPico]!.ms;
    }
    return NaN;
  };
  return {
    t63: cruce(0.63), t90: cruce(0.90),
    saltoDb: mejor, asentadoDb, picoDb, cuandoMs: env[iSalto]!.ms,
  };
}

let sonando: ReturnType<typeof spawn> | null = null;

async function capturar(etiqueta: string, subiendo: boolean): Promise<Punto[]> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 300); });
  const wav = join(carpeta, `${etiqueta}.wav`);
  sonando = spawn('afplay', [tonoConEscalon(subiendo)]);
  let fallo: Error | null = null;
  sonando.on('error', (e) => { fallo = e instanceof Error ? e : new Error(String(e)); });
  // Se empieza a grabar en seguida: el escalon se busca en la señal.
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
const clienteAtaque = (a: number): number => Math.pow(400, desqr(a));
const clienteRelajacion = (a: number): number => 10 * Math.pow(200, desqr(a));

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  [`i.${n}.dyn.attack`, Number(exigirClave(e0, `i.${n}.dyn.attack`))],
  [`i.${n}.dyn.release`, Number(exigirClave(e0, `i.${n}.dyn.release`))],
  [`i.${n}.dyn.threshold`, Number(exigirClave(e0, `i.${n}.dyn.threshold`))],
  [`i.${n}.dyn.ratio`, Number(exigirClave(e0, `i.${n}.dyn.ratio`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  // **La compensacion, que el item 110 se comio una corrida entera por no
  // neutralizar.** Con `outgain` puesto, lo que se mide es compensacion pura.
  [`i.${n}.dyn.outgain`, Number(exigirClave(e0, `i.${n}.dyn.outgain`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  [`i.${n}.mix`, Number(exigirClave(e0, `i.${n}.mix`))],
];
const softknee = Number(exigirClave(e0, `i.${n}.dyn.softknee`));

console.log('=== 114 — LOS TIEMPOS DEL COMPRESOR, CONTRA EL AUDIO ===');
console.log(`   canal ${CANAL} -> general -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   tono ${HZ} Hz, escalon de ${NIVEL_BAJO_DBFS} a ${NIVEL_ALTO_DBFS} dBFS`);
console.log(`   ventana ${CICLOS_POR_VENTANA} ciclos = ${(VENTANA / FM * 1000).toFixed(2)} ms, `
  + `paso ${(PASO / FM * 1000).toFixed(2)} ms -> piso del instrumento ${PISO_DEL_INSTRUMENTO_MS} ms`);
console.log(`   rodilla (softknee) = ${softknee}: se lee y NO se toca`);
console.log('');
for (const [k, v] of PREVIO) console.log(`   ${k.padEnd(22)} ${v}`);
console.log('');

anotarPendiente('tiempos-del-compresor.ts', maquina, PREVIO);

const filas: string[] = [];
let c1 = false;
let c2 = false;
let c3 = false;

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

    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    t.enviar(codificarSetd(`i.${n}.dyn.outgain`, 0.3334960938));
    t.enviar(codificarSetd(`i.${n}.dyn.ratio`, RATIO_DE_TRABAJO));
    t.enviar(codificarSetd(`i.${n}.dyn.threshold`, UMBRAL_DE_TRABAJO));
    await new Promise((r) => { setTimeout(r, 1500); });

    // --- C2: el escalon es limpio con el compresor PUENTEADO ------------------
    console.log('');
    console.log('=== C2 — EL ESCALON CON EL COMPRESOR PUENTEADO ===');
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    await new Promise((r) => { setTimeout(r, 1200); });
    const envSinComp = await capturar('c2', true);
    const sinComp = medirAsentamiento(envSinComp, true);
    if (sinComp === null) {
      // **Cuando no encuentra el escalon, muestra la envolvente.** Un «no lo
      // encontre» sin datos obliga a adivinar, y adivinar ya costo dos corridas.
      // Con el perfil impreso, la evidencia archivada dice por que fallo.
      console.log('   NO SE ENCONTRO EL ESCALON. La envolvente, cada 100 ms:');
      for (let i = 0; i < envSinComp.length; i += Math.round(100 / (PASO / FM * 1000))) {
        const p = envSinComp[i]!;
        console.log(`      ${p.ms.toFixed(0).padStart(5)} ms  ${p.db.toFixed(1).padStart(7)} dBFS`);
      }
      throw new Error('C2 FALLA: no se encontro un escalon claro con el compresor puenteado. '
        + 'Sin escalon no hay nada que cronometrar.');
    }
    const altoSinComp = sinComp.asentadoDb;
    console.log(`   escalon detectado a los ${sinComp.cuandoMs.toFixed(0)} ms de la captura, `
      + `de ${sinComp.saltoDb.toFixed(1)} dB (se pidieron `
      + `${Math.abs(NIVEL_ALTO_DBFS - NIVEL_BAJO_DBFS)})`);
    console.log(`   asentado ${altoSinComp.toFixed(2)} dBFS`);
    console.log(`   asentamiento: t63 ${fmt(sinComp.t63)}, t90 ${fmt(sinComp.t90)}`);
    c2 = !(sinComp.t63 >= PISO_DEL_INSTRUMENTO_MS);
    console.log(`   ${c2 ? 'PASA: sin compresor el escalon no se asienta, salta y ya.'
      : 'FALLA: con el compresor puenteado YA sale una curva. Lo que se mediria '
        + 'seria el archivo, el conversor o la ventana, no el compresor.'}`);
    if (!c2) throw new Error('C2 FALLA: el banco introduce su propio asentamiento.');

    // --- C1: el tono llega ---------------------------------------------------
    const piso = Math.min(...envSinComp.map((p) => p.db));
    c1 = altoSinComp - piso >= MARGEN_MINIMO_DB;
    console.log('');
    console.log(`C1 el tono llega: ${(altoSinComp - piso).toFixed(1)} dB de recorrido en la `
      + `captura (minimo ${MARGEN_MINIMO_DB})`);
    if (!c1) throw new Error('C1 FALLA: el tono no llega con margen.');

    // --- C3: el compresor actua ----------------------------------------------
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 0));
    t.enviar(codificarSetd(`i.${n}.dyn.attack`, 0));
    t.enviar(codificarSetd(`i.${n}.dyn.release`, 0));
    await new Promise((r) => { setTimeout(r, 1200); });
    const envRapido = await capturar('c3', true);
    const rapido = medirAsentamiento(envRapido, true);
    if (rapido === null) throw new Error('C3 FALLA: no se encontro escalon con el compresor.');
    const reduccion = altoSinComp - rapido.asentadoDb;
    console.log('');
    console.log(`C3 el compresor actua: reduccion asentada ${reduccion.toFixed(2)} dB `
      + `(minimo ${REDUCCION_MINIMA_DB})`);
    c3 = reduccion >= REDUCCION_MINIMA_DB;
    if (!c3) {
      throw new Error(`C3 FALLA: solo ${reduccion.toFixed(2)} dB de reduccion. Un tiempo medido `
        + 'sobre un efecto que casi no existe lo domina el ruido.');
    }

    // --- el barrido ----------------------------------------------------------
    console.log('');
    console.log('=== EL ATAQUE ===');
    console.log('   crudo |   t63    |   t90    | el cliente predice | medido/predicho');
    t.enviar(codificarSetd(`i.${n}.dyn.release`, 0.5));
    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(`i.${n}.dyn.attack`, crudo));
      await new Promise((r) => { setTimeout(r, 1000); });
      const a = medirAsentamiento(await capturar(`at-${crudo}`, true), true);
      const b = medirAsentamiento(await capturar(`at-${crudo}-b`, true), true);
      const pred = clienteAtaque(crudo);
      const coc = a === null ? NaN : a.t63 / pred;
      const rep = (a === null || b === null) ? NaN : Math.abs(a.t63 - b.t63) / Math.max(a.t63, 1);
      const fila = `   ${crudo.toFixed(2)}  | ${fmt(a?.t63 ?? NaN).padStart(8)} | `
        + `${fmt(a?.t90 ?? NaN).padStart(8)} | ${pred.toFixed(1).padStart(14)} ms | `
        + `${Number.isFinite(coc) ? coc.toFixed(2) : '—'}   (repite ${
          Number.isFinite(rep) ? `${(rep * 100).toFixed(0)}%` : '—'})`;
      console.log(fila);
      filas.push(`ataque ${crudo} t63=${a?.t63 ?? NaN} t90=${a?.t90 ?? NaN} pred=${pred} rep=${rep}`);
    }

    console.log('');
    console.log('=== LA RELAJACION ===');
    console.log('   crudo |   t63    |   t90    | el cliente predice | medido/predicho');
    t.enviar(codificarSetd(`i.${n}.dyn.attack`, 0));
    for (const crudo of CRUDOS) {
      t.enviar(codificarSetd(`i.${n}.dyn.release`, crudo));
      await new Promise((r) => { setTimeout(r, 1000); });
      const a = medirAsentamiento(await capturar(`re-${crudo}`, false), false);
      const b = medirAsentamiento(await capturar(`re-${crudo}-b`, false), false);
      const pred = clienteRelajacion(crudo);
      const coc = a === null ? NaN : a.t63 / pred;
      const rep = (a === null || b === null) ? NaN : Math.abs(a.t63 - b.t63) / Math.max(a.t63, 1);
      console.log(`   ${crudo.toFixed(2)}  | ${fmt(a?.t63 ?? NaN).padStart(8)} | `
        + `${fmt(a?.t90 ?? NaN).padStart(8)} | ${pred.toFixed(1).padStart(14)} ms | `
        + `${Number.isFinite(coc) ? coc.toFixed(2) : '—'}   (repite ${
          Number.isFinite(rep) ? `${(rep * 100).toFixed(0)}%` : '—'})`);
      filas.push(`relajacion ${crudo} t63=${a?.t63 ?? NaN} t90=${a?.t90 ?? NaN} pred=${pred} rep=${rep}`);
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
console.log(`   Un tono de ${HZ} Hz, un umbral, una relacion, un canal, un dia.`);
console.log('   El tiempo se define como t63 y t90 del asentamiento; el fabricante');
console.log('   no dice cual usa, asi que una diferencia puede ser de definicion.');
console.log('   Nada de la puerta, ni de la forma de la curva, ni de señal real.');
if (!(c1 && c2 && c3)) {
  console.log('');
  console.log('NO SE PUBLICAN TIEMPOS: fallo algun control.');
  process.exitCode = 1;
}
