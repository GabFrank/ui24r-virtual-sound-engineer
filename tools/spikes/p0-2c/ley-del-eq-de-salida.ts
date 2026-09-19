/**
 * La ley de la ganancia del ecualizador gráfico de salida, contra el bus real.
 *
 * Contrato: `docs/compromisos/109-la-ley-del-ecualizador-de-salida.md`, escrito
 * **antes** de tocar la consola. Ahí están el porqué, el alcance y el trabajo
 * previo —que dio **cero precedente**: ninguno de los cuatro proyectos de
 * terceros expone el ecualizador de salida—.
 *
 * **Se mide en el auxiliar 5 y no en el general**, y el contrato explica por qué:
 * el auxiliar no está en el camino de nada del usuario y el general sí. Que las
 * dos superficies compartan la ley es suposición razonable, no resultado.
 *
 * ## Las dos preguntas, en orden
 *
 * **Primero cuál frecuencia es la banda.** El cliente trae 32 etiquetas para 31
 * bandas y a qué apunta cada `peak.K` no está establecido. Se realza la banda a
 * su máximo y se compara contra plano en **cinco frecuencias candidatas** —la que
 * predice la etiqueta y sus dos vecinas de cada lado—. Gana la que más se mueva.
 * Si el bulto no aparece, se detiene: una ley de una banda desconocida no sirve.
 *
 * **Después la ley**, barriendo el crudo en la frecuencia que ganó.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2c/ley-del-eq-de-salida.ts 17 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const banda = argIndice(2, 'banda', 17, { desde: 0, hasta: 30 });
const maquina = argTexto(3, '192.168.0.78');

/** Canal del banco y auxiliar de retorno. El contrato los fija. */
const CANAL = 10;
const n = CANAL - 1;
const AUX = 5;
const m = AUX - 1;
/** La entrada de la Scarlett donde vuelve el auxiliar. Base cero. */
const ENTRADA = 1;

/**
 * Las etiquetas del cliente, tal cual las trae: **32 para 31 bandas**.
 *
 * Se usan sólo para **proponer candidatas**, nunca para afirmar. Cuál corresponde
 * a cuál clave es justamente lo que la corrida mide.
 */
const ETIQUETAS_HZ = [
  20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
  12500, 16000, 20000, 22000,
];

const FM = 48000;
const NIVEL_DBFS = -18;
const SEGUNDOS_DE_CAPTURA = 3;
const GRABADOR = 'tools/audio/bin/grabar';
/** Dónde tiene que caer el nivel plano para que un realce no recorte. */
const VENTANA_DE_TRABAJO_DB: readonly [number, number] = [-40, -18];
/** Margen mínimo del tono sobre el piso, para que la lectura signifique algo. */
const MARGEN_MINIMO_DB = 45;
/** C2: cuánto puede moverse un testigo lejano. El contrato explica el 1,0. */
const TESTIGO_MAXIMO_DB = 1.0;
/** L2: residuo máximo del ajuste lineal. */
const RESIDUO_MAXIMO_DB = 0.3;
/** L3: recorrido mínimo para poder publicar. */
const RECORRIDO_MINIMO_DB = 24;

const carpeta = mkdtempSync(join(tmpdir(), 'eq-salida-'));

/**
 * El estimulo: el tono de la banda y, si se pide, **el del testigo**.
 *
 * **La primera version ponia un solo tono, y C2 fallo por eso.** El testigo se
 * leia en una frecuencia donde no habia nada, asi que lo que se medio fue el
 * ruido de fondo: dio 16,73 dB de recorrido contra un tope de 1,0 y la corrida se
 * nego a publicar la ley --bien negada, con la premisa rota--. El item 108 usa
 * DOS tonos exactamente por esto, y ese precedente estaba a la vista.
 *
 * Es la misma familia de error que este proyecto repite: medir sobre silencio y
 * leerlo como una lectura. Acá ni siquiera hubo que descubrirla, habia que copiar
 * al guion hermano.
 */
function tono(segundos: number, hz: number, testigoHz?: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, NIVEL_DBFS / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    let v = amplitud * Math.sin((2 * Math.PI * hz * i) / FM);
    if (testigoHz !== undefined) v += amplitud * Math.sin((2 * Math.PI * testigoHz * i) / FM);
    datos.writeInt16LE(Math.round(v), i * 4); datos.writeInt16LE(Math.round(v), i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(carpeta, `tono-${hz}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

let sonando: ReturnType<typeof spawn> | null = null;

/**
 * Arranca un tono y deja el anterior muerto. Devuelve cuando ya suena.
 *
 * **La duracion se pide, y no es un detalle.** La primera version generaba
 * siempre 30 s: el barrido tarda mas de dos minutos --catorce crudos por dos
 * capturas-- asi que el tono se moria a mitad y la guarda de `medir` abortaba la
 * corrida. Habria fallado seguro, pero gastando una corrida entera con el
 * supresor apagado sobre la consola del usuario.
 */
async function poneleTono(hz: number, segundos: number, testigoHz?: number): Promise<void> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 400); });
  sonando = spawn('afplay', [tono(segundos, hz, testigoHz)]);
  let fallo: Error | null = null;
  sonando.on('error', (e) => { fallo = e instanceof Error ? e : new Error(String(e)); });
  await new Promise((r) => { setTimeout(r, 1500); });
  if (fallo !== null) throw fallo;
  if (sonando.exitCode !== null) {
    throw new Error(`afplay salio con ${sonando.exitCode}: el tono de ${hz} Hz no suena.`);
  }
}

interface Lectura { tonoDb: number; ruidoDb: number; margenDb: number; recorta: boolean }

/** Una captura, analizada en la frecuencia que se pida. */
async function medir(etiqueta: string, hz: number): Promise<Lectura> {
  if (sonando === null || sonando.exitCode !== null) {
    throw new Error(`el tono dejo de sonar antes de «${etiqueta}». Sin tono la lectura es el `
      + `piso y se leeria como atenuacion.`);
  }
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  hijo.stderr?.on('data', (b: Buffer) => { err += b.toString(); });
  const codigo = await new Promise<number | null>((res, rej) => {
    hijo.on('error', rej); hijo.on('close', (c) => res(c));
  });
  if (codigo !== 0) {
    throw new Error(`el grabador salio con ${codigo} en «${etiqueta}»: ${err.trim() || '(nada)'}`);
  }
  const an = analizar(wav, hz) as {
    canales: { tonoDb: number; ruidoEnBinDb: number; margenEnBinDb: number;
      recorteExacto: boolean }[];
  };
  rmSync(wav, { force: true });
  const c = an.canales[ENTRADA]!;
  return {
    tonoDb: c.tonoDb, ruidoDb: c.ruidoEnBinDb, margenDb: c.margenEnBinDb,
    recorta: c.recorteExacto,
  };
}

const RUTA_BANDA = `a.${m}.eq.peak.${banda}`;
const RUTA_ENVIO = `i.${n}.aux.${m}.value`;
const RUTA_NIVEL = `a.${m}.mix`;

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

/**
 * Lo que se va a escribir, con su valor previo **leido del aparato**.
 *
 * **Cada clave aparece escrita entera en su `exigirClave`, y eso es a proposito.**
 * La primera version armaba una lista y hacia `CLAVES.map(k => exigirClave(e0, k))`,
 * que es mas corto y **le esconde la lectura a la guarda**
 * `escribir-sin-leer.test.ts`: ese trinquete busca la clave escrita literalmente
 * en un `exigirClave`, y con la indireccion veia las escrituras sin las lecturas.
 *
 * El guion siempre leyo todo lo que escribe; lo que faltaba era que se pudiera
 * comprobar. Una guarda estatica que se esquiva sin querer, con codigo mas
 * elegante, es una guarda que un dia no avisa.
 */
const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  [RUTA_BANDA, Number(exigirClave(e0, `a.${m}.eq.peak.${banda}`))],
  [RUTA_ENVIO, Number(exigirClave(e0, `i.${n}.aux.${m}.value`))],
  [RUTA_NIVEL, Number(exigirClave(e0, `a.${m}.mix`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
];

console.log(`=== 109 — LA LEY DEL ECUALIZADOR DE SALIDA ===`);
console.log(`   canal ${CANAL} -> auxiliar ${AUX} -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   se barre ${RUTA_BANDA}`);
console.log('');
for (const [k, v] of PREVIO) console.log(`   ${k.padEnd(24)} ${v}`);
console.log('');

anotarPendiente('ley-del-eq-de-salida.ts', maquina, PREVIO);

let centroHz = NaN;
let planoDb = NaN;
const puntos: { crudo: number; db: number }[] = [];
let testigoRecorrido = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1500); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // La guarda del supresor, comprobada por HTTP antes de que suene nada.
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const afs = await leerUnaClave(maquina, 'm.afs.enabled');
    if (afs !== 0) {
      throw new Error(`m.afs.enabled quedo en ${afs}: no se mete un tono sostenido con el `
        + `supresor encendido.`);
    }
    console.log('   supresor apagado y COMPROBADO por HTTP');

    // El proceso del canal, que depende del nivel.
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // La banda, plana, antes de calibrar.
    t.enviar(codificarSetd(`a.${m}.eq.peak.${banda}`, 0.5));
    await new Promise((r) => { setTimeout(r, 1500); });

    const hzEtiqueta = ETIQUETAS_HZ[banda]!;
    await poneleTono(hzEtiqueta, 120);

    // --- calibración del nivel de trabajo ---------------------------------
    console.log('');
    console.log('=== CALIBRACION DEL NIVEL ===');
    let nivel = 0.75;
    let plano: Lectura | null = null;
    for (let intento = 1; intento <= 6; intento++) {
      t.enviar(codificarSetd(`i.${n}.aux.${m}.value`, 0.75));
      t.enviar(codificarSetd(`a.${m}.mix`, nivel));
      await new Promise((r) => { setTimeout(r, 1200); });
      const l = await medir(`cal-${intento}`, hzEtiqueta);
      console.log(`   nivel del auxiliar ${nivel.toFixed(3)} -> ${l.tonoDb.toFixed(2)} dBFS`);
      if (l.tonoDb >= VENTANA_DE_TRABAJO_DB[0] && l.tonoDb <= VENTANA_DE_TRABAJO_DB[1]) {
        plano = l; break;
      }
      // Demasiado caliente baja; demasiado frio sube. Sin pasarse de los extremos.
      nivel = l.tonoDb > VENTANA_DE_TRABAJO_DB[1]
        ? Math.max(0.05, nivel - 0.12) : Math.min(1, nivel + 0.12);
    }
    if (plano === null) {
      throw new Error(`no se pudo dejar el nivel plano dentro de `
        + `${VENTANA_DE_TRABAJO_DB[0]}..${VENTANA_DE_TRABAJO_DB[1]} dBFS en 6 intentos. `
        + `Sin un punto de partida sano, un realce recorta el conversor y la ley sale aplanada.`);
    }
    if (!(plano.margenDb >= MARGEN_MINIMO_DB)) {
      throw new Error(`C1 FALLA: el tono esta a ${plano.margenDb.toFixed(1)} dB del piso y hacen `
        + `falta ${MARGEN_MINIMO_DB}.`);
    }
    console.log(`   C1 PASA: ${plano.margenDb.toFixed(1)} dB sobre el piso`);

    // --- fase A: cuál frecuencia es esta banda ----------------------------
    console.log('');
    console.log('=== QUE FRECUENCIA ES LA BANDA ===');
    console.log('   (no se supone del orden de las etiquetas: se mide)');
    const candidatas = [banda - 2, banda - 1, banda, banda + 1, banda + 2]
      .filter((i) => i >= 0 && i < ETIQUETAS_HZ.length)
      .map((i) => ETIQUETAS_HZ[i]!);
    let mejorHz = NaN;
    let mejorSalto = -Infinity;
    for (const hz of candidatas) {
      await poneleTono(hz, 60);
      t.enviar(codificarSetd(`a.${m}.eq.peak.${banda}`, 0.5));
      await new Promise((r) => { setTimeout(r, 1200); });
      const llano = await medir(`A-plano-${hz}`, hz);
      t.enviar(codificarSetd(`a.${m}.eq.peak.${banda}`, 1));
      await new Promise((r) => { setTimeout(r, 1200); });
      const alto = await medir(`A-alto-${hz}`, hz);
      const salto = alto.tonoDb - llano.tonoDb;
      console.log(`   ${String(hz).padStart(6)} Hz: realce de ${salto.toFixed(2)} dB`);
      if (salto > mejorSalto) { mejorSalto = salto; mejorHz = hz; }
    }
    if (!(mejorSalto > 3)) {
      throw new Error(`el realce maximo en las candidatas fue ${mejorSalto.toFixed(2)} dB. `
        + `El bulto no aparece, asi que no se sabe que frecuencia mide esta banda y una ley `
        + `de una banda desconocida no sirve de nada.`);
    }
    centroHz = mejorHz;
    console.log(`   -> la banda ${banda} responde en ${centroHz} Hz `
      + `(la etiqueta decia ${hzEtiqueta})`);

    // --- fase B: la ley ---------------------------------------------------
    console.log('');
    console.log('=== EL BARRIDO ===');
    /**
     * El testigo, **a seis bandas de distancia y con su propio tono**.
     *
     * Seis y no dos: la fase A midio la falda de esta banda y con el realce al
     * maximo mueve **1,96 dB dos bandas mas abajo**, o sea mas que el tope de C2.
     * Dos bandas era demasiado cerca. Con la caida observada --14,99, 5,3, 1,95--
     * seis bandas dejan la falda por debajo de una decima de decibel.
     */
    const testigoHz = centroHz >= 2000 ? centroHz / 4 : centroHz * 4;
    await poneleTono(centroHz, 600, testigoHz);
    const testigo: number[] = [];
    const crudos = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0.25, 0.75, 0.5];
    for (const crudo of crudos) {
      t.enviar(codificarSetd(`a.${m}.eq.peak.${banda}`, crudo));
      await new Promise((r) => { setTimeout(r, 1200); });
      const l = await medir(`B-${crudo}`, centroHz);
      if (l.recorta) throw new Error(`la captura del crudo ${crudo} recorta: el nivel de `
        + `trabajo quedo alto y la ley saldria aplanada arriba.`);
      puntos.push({ crudo, db: l.tonoDb });
      const tg = await medir(`T-${crudo}`, testigoHz);
      testigo.push(tg.tonoDb);
      console.log(`   crudo ${crudo.toFixed(2)} -> ${l.tonoDb.toFixed(2)} dBFS`
        + `   (testigo ${testigoHz} Hz: ${tg.tonoDb.toFixed(2)})`);
    }
    testigoRecorrido = Math.max(...testigo) - Math.min(...testigo);
    planoDb = puntos.find((p) => p.crudo === 0.5)!.db;
  },
);

const despues = await estadoPorHttpExigido(maquina);
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
let bien = true;
for (const [k, v] of PREVIO) {
  const leido = Number(exigirClave(despues, k));
  const ok = Math.abs(leido - v) < 1e-9;
  if (!ok) bien = false;
  console.log(`   ${ok ? 'OK  ' : 'MAL '} ${k.padEnd(24)} esperado ${v}  leido ${leido}`);
}
if (bien) cerrarPendiente(); else process.exitCode = 1;

console.log('');
console.log('=== VEREDICTOS ===');
console.log(`C2 la banda es LOCAL: el testigo se movio ${testigoRecorrido.toFixed(2)} dB `
  + `(tope ${TESTIGO_MAXIMO_DB})`);
const c2 = testigoRecorrido <= TESTIGO_MAXIMO_DB;
console.log(`   ${c2 ? 'PASA' : 'NO PASA: lo que se movio fue algo global, no la banda'}`);

const unicos = puntos.filter((p, i) => puntos.findIndex((q) => q.crudo === p.crudo) === i);
const xs = unicos.map((p) => p.crudo);
const ys = unicos.map((p) => p.db - planoDb);
const nP = xs.length;
const sx = xs.reduce((a, b) => a + b, 0);
const sy = ys.reduce((a, b) => a + b, 0);
const sxy = xs.reduce((a, x, i) => a + x * ys[i]!, 0);
const sxx = xs.reduce((a, x) => a + x * x, 0);
const pend = (nP * sxy - sx * sy) / (nP * sxx - sx * sx);
const ord = (sy - pend * sx) / nP;
const residuo = Math.max(...xs.map((x, i) => Math.abs(ys[i]! - (pend * x + ord))));
const recorrido = Math.max(...ys) - Math.min(...ys);

console.log('');
console.log(`L2 la ley es lineal: ${pend.toFixed(3)} dB por unidad de crudo, `
  + `ordenada ${ord.toFixed(3)}`);
console.log(`   residuo maximo ${residuo.toFixed(3)} dB (tope ${RESIDUO_MAXIMO_DB})`);
console.log(`   ${residuo <= RESIDUO_MAXIMO_DB ? 'PASA. Y es una COTA, no una identidad.' : 'NO PASA'}`);
console.log('');
console.log(`L3 el recorrido total: ${recorrido.toFixed(2)} dB (minimo ${RECORRIDO_MINIMO_DB})`);
console.log(`   ${recorrido >= RECORRIDO_MINIMO_DB ? 'PASA' : 'NO PASA'}`);

const enCero = ys[xs.indexOf(0)]!;
const enUno = ys[xs.indexOf(1)]!;
console.log('');
console.log(`L4 la simetria: corte ${enCero.toFixed(2)} dB, realce ${enUno.toFixed(2)} dB, `
  + `asimetria ${Math.abs(Math.abs(enCero) - Math.abs(enUno)).toFixed(2)}`);

console.log('');
if (c2 && residuo <= RESIDUO_MAXIMO_DB && recorrido >= RECORRIDO_MINIMO_DB) {
  console.log(`LA LEY: dB = ${pend.toFixed(2)}·V ${ord >= 0 ? '+' : '−'} ${Math.abs(ord).toFixed(2)}`);
  console.log(`   medida en la banda ${banda} del auxiliar ${AUX}, en ${centroHz} Hz.`);
  console.log(`   La hipotesis del cliente era 30·V − 15.`);
} else {
  console.log('NO SE IMPRIME LEY: fallo al menos un control.');
  process.exitCode = 1;
}
console.log('');
console.log('Alcance: UNA banda de treinta y una, en UN auxiliar. Nada del general,');
console.log('nada del ancho de banda, nada de como interactuan las bandas entre si.');

await t.desconectar();
