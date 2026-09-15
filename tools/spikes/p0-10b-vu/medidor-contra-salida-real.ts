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
 * estaba contrastando una tabla contra sí misma.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/medidor-contra-salida-real.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
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
import { analizar, leerWav, amplitudDelTono, dB } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');

const HZ = 1000;
const FM = 48000;

/**
 * El nivel del tono, y **de acá sale todo el recorrido de la medición**.
 *
 * El banco tal como quedó cableado, con el tono a −20 dBFS, deja el medidor en
 * el byte 115 al arrancar y llega al piso —el byte 16— a los **33 dB**. La
 * medición 94 ya se declaró indecidible con 18, así que eso alcanza poco. Subir
 * el tono sube el medidor y el nivel en la interfaz **a la par**, y el tope lo
 * pone el recorte de la interfaz.
 *
 * **La primera versión puso −4 dBFS y la corrida abortó: la interfaz recortaba.**
 * El error fue calcular el recorrido desde `pre`, cuando el barrido arranca en el
 * crudo 1,0 — que son **+10 dB de fader** por encima. El medidor y la interfaz
 * empiezan los dos diez decibeles más arriba de lo que esa cuenta suponía. La
 * guarda de recorte lo paró antes de barrer, que es para lo que estaba.
 *
 * La cuenta buena, sobre datos medidos y no supuestos: en la corrida en seco con
 * el tono a −20 dBFS y el fader en unidad, la interfaz vio el pico en
 * −22,87 dBFS. En el crudo 1,0 eso son −12,87. Con el tono en **−15 dBFS** el
 * pico queda en **−7,9 dBFS** —dentro de la banda de −12 a −6 donde no recorta ni
 * se arrima al ruido— y el medidor arranca en el byte 130, con **38 dB** hasta el
 * piso.
 *
 * **No son los sesenta que el contrato prometía en su primera versión**, y el
 * número está acá y no en la prosa justamente para que no se pueda prometer otra
 * cosa. El medidor es lo que limita: en el punto más bajo que el medidor todavía
 * resuelve, a la interfaz le quedan unos 60 dB sobre el ruido de su bin.
 *
 * Lo que esto cambia: el tono no es el de la 97 ni el de la 98, así que **los
 * niveles absolutos de esta corrida no son comparables con aquéllas**. La
 * ganancia del previo —`hw.N.gain`— no se toca, y se registra, que es lo que
 * permite decir que el banco es el mismo aparato en el mismo estado.
 */
const NIVEL_DBFS = -15;

const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
/** Dos escalones: toda atenuación de acá es diferencia de dos lecturas. */
const TOLERANCIA_MEDIDOR_DB = 2 * ESCALON_DB;

/**
 * La ventana de bytes donde el medidor dice algo.
 *
 * **Abajo, el piso.** Por debajo del byte 16 el medidor está aplastado contra el
 * cero y la salida real sigue viva: la diferencia entre los dos crece sin que
 * nada esté mal, y es exactamente el residuo unilateral que la medición 94
 * confundió con una diferencia de ley.
 *
 * **Arriba, el techo, que no está donde parecía.** Los bytes 240 a 255 informan
 * posiciones **mayores que 1**, de +0,02 a +5,02 dB. Si la lectura de arranque
 * cayera ahí, toda atenuación de la corrida se calcularía contra un número
 * saturado y el barrido entero saldría comprimido.
 */
const BYTE_PISO = 16;
const BYTE_TECHO = 239;
const byteDeMedidor = (db: number): number => Math.round((db + MEDIDOR_RANGO_DB) / ESCALON_DB);

/** Con menos de esto, M4 no se puede decidir y se dice así. */
const PUNTOS_MINIMOS = 10;
/** Y con menos recorrido que esto tampoco: la 94 falló con 18 dB. */
const RECORRIDO_MINIMO_DB = 25;

/**
 * Cuánto tiene que separar el tono del ruido **de su propio bin**.
 *
 * **Cuarenta y cinco decibeles, y el número sale de una cuenta, no de un
 * redondeo.** El error de amplitud que mete el ruido incoherente en el bin es
 * `8,686 × 10^(−margen/20)` dB: con 20 dB de margen son **0,87 dB**, casi el
 * doble del umbral de M3, y el punto entraría como válido midiendo peor que lo
 * que se quiere decidir. Con 45 dB son 0,05 dB, un sexto de escalón.
 *
 * **Y se mide contra el ruido del bin, que no es el que salta a la vista.** El
 * analizador informa las dos cosas: el ruido de banda ancha y el del bin. En
 * este banco están separados por 45,6 dB —el ancho de banda—, así que usar el de
 * banda ancha como criterio anularía casi todo el barrido sin motivo.
 */
const MARGEN_MINIMO_DB = 45;
const errorPorRuido = (margenDb: number): number => 8.686 * Math.pow(10, -margenDb / 20);

/** Un promedio de tres cuadros no es un promedio. */
const CUADROS_MINIMOS = 20;

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
  reduccionGeneral: number; preGeneral: number; postGeneral: number;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const c = decodificarVuCanales(carga)[n];
  const g = decodificarVuBuses(carga).general;
  if (c === undefined || g === null || g === undefined) return;
  cuadros.push({
    pre: c.pre, entrada: c.entrada, salida: c.salida,
    // **Los medidores del general llegan en el mismo cuadro y no cuestan nada.**
    // Sin ellos la comparación es de dos puntos y una divergencia queda en «el
    // medidor no predice». Con ellos es una cadena de cuatro y la divergencia
    // queda LOCALIZADA: si `post` del general sigue a `salida` del canal escalón
    // por escalón, queda medido que el general es una ganancia estática en vez de
    // supuesto. Y el byte de reducción delata al compresor del general, que es lo
    // único dependiente del nivel en todo el camino.
    reduccionGeneral: g.izquierdo.reduccionDb,
    preGeneral: g.izquierdo.pre,
    postGeneral: g.izquierdo.post,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

const carpeta = mkdtempSync(join(tmpdir(), 'vse-99b-'));

interface Medida {
  preDb: number; entradaDb: number; salidaDb: number;
  preGeneralDb: number; postGeneralDb: number;
  reduccionGeneralMax: number; cuadros: number;
  realDb: number; referenciaDb: number;
  margenEnBinDb: number; ruidoEnBinDb: number; picoDb: number; recorta: boolean;
}

/**
 * Un punto: se graba el audio y se leen los medidores **en la misma ventana**.
 *
 * El grabador corre como subproceso y las tramas del WebSocket se juntan
 * mientras tanto. No es una sincronización a la muestra —no hace falta— pero sí
 * garantiza que los dos instrumentos miran el mismo tramo de señal, que es lo
 * que una prueba suelta de hoy no hizo: el auxiliar se abrió a mitad de la
 * grabación y el resultado parecía distorsión.
 *
 * **La captura dura lo mismo en todos los puntos**, porque el ancho del bin
 * depende de eso y comparar bins de distinto ancho sería comparar dos filtros.
 */
const SEGUNDOS_DE_CAPTURA = 3;

async function medirPunto(etiqueta: string): Promise<Medida> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  cuadros = [];
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const xs = cuadros;
  const a = analizar(wav, HZ) as {
    canales: {
      tonoDb: number; picoDb: number; margenEnBinDb: number; ruidoEnBinDb: number;
      recorteExacto: boolean;
    }[];
  };
  // El archivo se borra en cuanto se leyó: cuarenta y ocho capturas de tres
  // segundos son doscientos megabytes que no aportan nada una vez medidos.
  rmSync(wav, { force: true });
  const g = a.canales[ENTRADA_GENERAL]!;
  return {
    preDb: dbDeMedidor(media(xs.map((c) => c.pre))),
    entradaDb: dbDeMedidor(media(xs.map((c) => c.entrada))),
    salidaDb: dbDeMedidor(media(xs.map((c) => c.salida))),
    preGeneralDb: dbDeMedidor(media(xs.map((c) => c.preGeneral))),
    postGeneralDb: dbDeMedidor(media(xs.map((c) => c.postGeneral))),
    reduccionGeneralMax: xs.length === 0 ? NaN
      : xs.reduce((m, c) => Math.max(m, c.reduccionGeneral), 0),
    cuadros: xs.length,
    realDb: g.tonoDb,
    picoDb: g.picoDb,
    margenEnBinDb: g.margenEnBinDb,
    ruidoEnBinDb: g.ruidoEnBinDb,
    recorta: g.recorteExacto,
    referenciaDb: a.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

/**
 * Que el tono grabado caiga en 1000,000 Hz y no al lado.
 *
 * Con la ventana de Hann, medio bin de desalineación cuesta **1,42 dB**, y se
 * cancela en las atenuaciones sólo si el desplazamiento es el mismo en todos los
 * puntos. Con el **mismo** aparato generando y capturando, el desvío de reloj se
 * cancela exactamente: la ida multiplica por `1+δ` y la vuelta divide por `1+δ`.
 * El riesgo no es la consola, es que el tono salga por otro dispositivo — y eso
 * no puede cambiar a mitad de corrida porque `afplay` retiene el suyo, así que
 * alcanza con mirarlo al abrir y al cerrar.
 *
 * **M2 no cubre esto**: los canales 3 y 4 son el retorno interno de la interfaz,
 * generados y capturados por los mismos relojes, así que leen bien igual.
 */
function alineacion(wav: string): { desvioHz: number; perdidaDb: number } {
  const w = leerWav(wav) as { canales: Float32Array[]; frecuencia: number };
  const x = w.canales[ENTRADA_GENERAL]!;
  let mejor = HZ; let mejorA = -Infinity;
  for (let f = HZ - 0.5; f <= HZ + 0.5 + 1e-9; f += 0.25) {
    const a = amplitudDelTono(x, f, w.frecuencia) as number;
    if (a > mejorA) { mejorA = a; mejor = f; }
  }
  const enCentro = amplitudDelTono(x, HZ, w.frecuencia) as number;
  return { desvioHz: mejor - HZ, perdidaDb: (dB(mejorA) as number) - (dB(enCentro) as number) };
}

// ---------------------------------------------------------------- montaje

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

/**
 * Todo lo que hay entre el fader del canal y el conector, leído del aparato.
 *
 * El ecualizador, el fader del general y el supresor apagado son **ganancias
 * estáticas** y se cancelan en una atenuación relativa al arranque. El compresor
 * del general **no**: depende del nivel, y el barrido mueve el nivel cuarenta
 * decibeles. Por eso se puentea, y por eso el puenteo va acá y no en la prosa.
 */
const PREVIO = {
  fader: Number(exigirClave(e0, `i.${n}.mix`)),
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
  dynBypass: Number(exigirClave(e0, 'm.dyn.bypass')),
};

console.log('=== 99b — EL MEDIDOR DE LA CONSOLA CONTRA LA SALIDA REAL ===');
console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a ${NIVEL_DBFS} dBFS`);
console.log(`escalon del medidor: ${ESCALON_DB.toFixed(6)} dB | tolerancia ${TOLERANCIA_MEDIDOR_DB.toFixed(4)} dB`);
console.log(`ventana util del medidor: bytes ${BYTE_PISO}..${BYTE_TECHO} = `
  + `${dbDeMedidor(BYTE_PISO * VU_ESCALA).toFixed(2)} .. ${dbDeMedidor(BYTE_TECHO * VU_ESCALA).toFixed(2)} dB`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.mix`, `i.${n}.mute`, `hw.${n}.gain`, `i.${n}.dyn.ratio`, `i.${n}.dyn.bypass`,
  `i.${n}.gate.enabled`, `i.${n}.gate.thresh`,
  `i.${n}.eq.bypass`, `i.${n}.deesser.enabled`, `i.${n}.subgroup`, `i.${n}.pan`,
  'm.mix', 'm.dyn.bypass', 'm.dyn.l.ratio', 'm.dyn.l.threshold', 'm.dyn.linked',
  'm.gate.enabled', 'm.eq.bypass', 'm.delayL', 'm.delayR',
  'm.afs.enabled', 'm.afs.fmode', 'm.afs.numfixed', 'm.afs.numtotal',
]) {
  console.log(`   ${k.padEnd(22)} ${e0.get(k) ?? '(ausente)'}`);
}
console.log('');
console.log('   La puerta y el dinamico del canal estan AGUAS ARRIBA del fader, asi que');
console.log('   su accion no cambia al moverlo y M1 los delata si actuaran. Queda dicho');
console.log('   para que se sepa que estan cubiertos y no ignorados.');
console.log('');

interface Punto {
  readonly crudo: number;
  readonly sentido: 'baja' | 'sube';
  readonly preDb: number;
  readonly entradaDb: number;
  readonly salidaDb: number;
  readonly byte: number;
  readonly preGeneralDb: number;
  readonly postGeneralDb: number;
  readonly realDb: number;
  readonly referenciaDb: number;
  readonly margenDb: number;
  readonly picoDb: number;
  readonly reduccionGeneralMax: number;
  readonly cuadros: number;
  readonly anulado: string | null;
  readonly fueraDeVentana: boolean;
}

const puntos: Punto[] = [];
let pisoDelBinDb = NaN;
let recorridoDb = NaN;
/**
 * Las dos alineaciones viven en un objeto y no en dos variables sueltas porque
 * se asignan dentro del cierre de `conRestauracion`: el verificador de tipos no
 * sigue esas asignaciones, narra las variables a `null`, y el uso de mas abajo
 * sale `never`. Un campo de objeto no se narra.
 */
const alineaciones: {
  apertura: { desvioHz: number; perdidaDb: number } | null;
  cierre: { desvioHz: number; perdidaDb: number } | null;
} = { apertura: null, cierre: null };
const crudoRedondeado: { escrito: number; leido: number }[] = [];

// El tono arranca DESPUES de medir el silencio, que es lo que fija el piso.
let sonando: ReturnType<typeof spawn> | null = null;

await conRestauracion(
  () => {
    sonando?.kill();
    t.enviar(codificarSetd(`i.${n}.mix`, PREVIO.fader));
    t.enviar(codificarSetd('m.afs.enabled', PREVIO.afs));
    t.enviar(codificarSetd('m.dyn.bypass', PREVIO.dynBypass));
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // --- El piso del bin, medido y no heredado --------------------------
    //
    // El criterio de 45 dB necesita un denominador de ESTA corrida. El
    // analizador ya informa el ruido del bin en cada captura, pero con el tono
    // sonando ese numero puede estar contaminado por la falda del propio tono;
    // con el tono apagado es el piso limpio.
    console.log('midiendo el piso del banco con el tono apagado...');
    const silencio = await medirPunto('silencio');
    pisoDelBinDb = silencio.ruidoEnBinDb;
    console.log(`   piso del bin alrededor de ${HZ} Hz: ${pisoDelBinDb.toFixed(2)} dBFS `
      + `(promediado sobre 40 bins; pico de banda ancha ${silencio.picoDb.toFixed(1)})`);
    console.log('   Queda archivado como caracterizacion del banco. **No es el');
    console.log('   denominador de la guarda**: cada punto se juzga contra el ruido de su');
    console.log('   propia captura, porque un piso medido cinco minutos antes describe');
    console.log('   otro momento --dos tomas del mismo silencio dieron -106,70 y -136,12.');
    console.log('');

    t.enviar(codificarSetd('m.afs.enabled', 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`supresor del general: estaba en ${PREVIO.afs}, se apaga para medir`);
    console.log(`compresor del general: bypass estaba en ${PREVIO.dynBypass}, se puentea.`);
    console.log('   Es lo UNICO del camino que no es una ganancia estatica: depende del');
    console.log('   nivel, y el barrido mueve el nivel cuarenta decibeles. Se puentea y no');
    console.log('   se pone en 1:1 porque lo que se compara son diferencias contra el');
    console.log('   arranque, y una compensacion constante se cancela.');

    sonando = spawn('afplay', [tono(900)]);
    await new Promise((r) => setTimeout(r, 3000));

    // --- Lo que el aparato devuelve cuando se le escribe un crudo --------
    //
    // `faderADb` se evalua en el valor que LA CONSOLA devuelve, no en el que se
    // escribio. Cerca del fondo la pendiente de la ley es de 0,22 dB por
    // milesima de crudo, asi que un redondeo ahi cuesta decimas de dB sin que
    // nada este mal. Se comprueba en tres valores y no en los cuarenta y ocho:
    // una lectura por HTTP son seis mil claves.
    for (const c of [1.0, 0.40, 0.05]) {
      t.enviar(codificarSetd(`i.${n}.mix`, c));
      await new Promise((r) => setTimeout(r, 1200));
      const e = await estadoPorHttpExigido(maquina);
      crudoRedondeado.push({ escrito: c, leido: Number(exigirClave(e, `i.${n}.mix`)) });
    }
    console.log('');
    console.log('crudo escrito -> crudo que devuelve la consola:');
    for (const r of crudoRedondeado) {
      const dDb = Math.abs(faderADb(r.escrito) - faderADb(r.leido));
      console.log(`   ${r.escrito} -> ${r.leido}  (${dDb.toFixed(4)} dB de diferencia)`);
    }

    // --- El recorrido, CALCULADO antes del primer punto ------------------
    t.enviar(codificarSetd(`i.${n}.mix`, CRUDOS[0]!));
    await new Promise((r) => setTimeout(r, 2500));
    const arranque = await medirPunto('arranque');
    const byteArranque = byteDeMedidor(arranque.salidaDb);
    recorridoDb = arranque.salidaDb - dbDeMedidor(BYTE_PISO * VU_ESCALA);
    console.log('');
    console.log('=== EL RECORRIDO, CALCULADO ANTES DE BARRER ===');
    console.log(`   arranque: medidor ${arranque.salidaDb.toFixed(2)} dB = byte ${byteArranque}`);
    console.log(`   interfaz: ${arranque.realDb.toFixed(2)} dBFS, pico ${arranque.picoDb.toFixed(2)}, `
      + `margen en bin ${arranque.margenEnBinDb.toFixed(1)} dB`);
    console.log(`   RECORRIDO DEL MEDIDOR: ${recorridoDb.toFixed(1)} dB`);
    console.log('   No son sesenta. Los sesenta de la primera version del contrato eran');
    console.log('   del FADER, no del medidor: el medidor tiene piso y la salida real no.');
    if (byteArranque > BYTE_TECHO) {
      console.log(`   ABORTA: el arranque cae en ${byteArranque}, por encima del techo ${BYTE_TECHO}.`);
      console.log('   Los bytes 240..255 informan posiciones mayores que 1 y toda atenuacion');
      console.log('   de la corrida se calcularia contra un numero saturado.');
      throw new Error('arranque saturado');
    }
    if (arranque.recorta || arranque.picoDb > -1) {
      console.log(`   ABORTA: la interfaz recorta en el arranque (pico ${arranque.picoDb.toFixed(2)} dBFS).`);
      throw new Error('interfaz recortando');
    }
    if (recorridoDb < RECORRIDO_MINIMO_DB) {
      console.log(`   ABORTA: ${recorridoDb.toFixed(1)} dB es menos que los ${RECORRIDO_MINIMO_DB} `
        + 'que hacen falta.');
      console.log('   La medicion 94 ya se declaro indecidible con 18 dB. Correr esto seria');
      console.log('   un control que solo puede confirmar.');
      throw new Error('recorrido insuficiente');
    }

    {
      const wav = join(carpeta, 'alineacion-apertura.wav');
      const h = spawn(GRABADOR, ['2', wav, 'Scarlett'], { stdio: 'ignore' });
      await new Promise<void>((r) => { h.on('close', () => r()); });
      const a = alineacion(wav);
      alineaciones.apertura = a;
      rmSync(wav, { force: true });
      console.log(`   alineacion: el maximo cae ${a.desvioHz.toFixed(2)} Hz del centro `
        + `(${a.perdidaDb.toFixed(3)} dB de perdida de ventana)`);
    }

    console.log('');
    console.log('crudo      | medidor | byte | real   | ref    | segun ley | med-ley | real-ley | '
      + 'med-real | genPre  | genPost | margen | pre    | n');

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
        const b = byteDeMedidor(p.salidaDb);
        const atenuacionMedidor = topeMedidor - p.salidaDb;
        const atenuacionReal = topeReal - p.realDb;
        const segunLey = faderADb(CRUDOS[0]!) - faderADb(crudo);
        // **El margen se mide en la MISMA captura**, no contra un piso de hace
        // cinco minutos. Dos tomas del mismo silencio dieron −106,70 y −136,12
        // dBFS: un bin aislado de ruido es una variable aleatoria con cola larga,
        // y comparar contra un numero asi decide mal en las dos direcciones.
        // `margenEnBinDb` promedia cuarenta bins alrededor del tono en el mismo
        // archivo, asi que ademas refleja las condiciones DE ESE PUNTO.
        const margen = p.margenEnBinDb;
        const fueraDeVentana = b < BYTE_PISO || b > BYTE_TECHO;

        const anulado = p.cuadros < CUADROS_MINIMOS
            ? `solo ${p.cuadros} cuadros de la consola (minimo ${CUADROS_MINIMOS})`
          : !Number.isFinite(p.realDb) ? 'sin tono en la captura'
          : p.recorta || p.picoDb > -1 ? `la interfaz recorta (pico ${p.picoDb.toFixed(2)} dBFS)`
          : p.reduccionGeneralMax > 0 ? `el compresor del general actuo (${p.reduccionGeneralMax.toFixed(2)} dB)`
          : margen < MARGEN_MINIMO_DB
            ? `margen de ${margen.toFixed(1)} dB sobre el ruido de su propia captura: `
              + `el instrumento externo erraria `
              + `${errorPorRuido(margen).toFixed(2)} dB`
          : null;

        puntos.push({
          crudo, sentido,
          preDb: p.preDb, entradaDb: p.entradaDb, salidaDb: p.salidaDb, byte: b,
          preGeneralDb: p.preGeneralDb, postGeneralDb: p.postGeneralDb,
          realDb: p.realDb, referenciaDb: p.referenciaDb, margenDb: margen,
          picoDb: p.picoDb,
          reduccionGeneralMax: p.reduccionGeneralMax, cuadros: p.cuadros,
          anulado, fueraDeVentana,
        });

        console.log(`${crudo.toFixed(4).padStart(10)} | ${p.salidaDb.toFixed(2).padStart(7)} | `
          + `${String(b).padStart(4)} | `
          + `${p.realDb.toFixed(2).padStart(6)} | ${p.referenciaDb.toFixed(2).padStart(6)} | `
          + `${segunLey.toFixed(2).padStart(9)} | `
          + `${(atenuacionMedidor - segunLey).toFixed(2).padStart(7)} | `
          + `${(atenuacionReal - segunLey).toFixed(2).padStart(8)} | `
          + `${(atenuacionMedidor - atenuacionReal).toFixed(2).padStart(8)} | `
          + `${p.preGeneralDb.toFixed(2).padStart(7)} | ${p.postGeneralDb.toFixed(2).padStart(7)} | `
          + `${margen.toFixed(1).padStart(6)} | ${p.preDb.toFixed(2).padStart(6)} | `
          + `${String(p.cuadros).padStart(3)}`
          + (fueraDeVentana ? '  [fuera de ventana]' : '')
          + (anulado === null ? '' : `   ANULADO: ${anulado}`));
      }
    }

    {
      const wav = join(carpeta, 'alineacion-cierre.wav');
      const h = spawn(GRABADOR, ['2', wav, 'Scarlett'], { stdio: 'ignore' });
      await new Promise<void>((r) => { h.on('close', () => r()); });
      alineaciones.cierre = alineacion(wav);
      rmSync(wav, { force: true });
    }
  },
);

await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();

// ------------------------------------------------------------ veredictos

/**
 * **M1 es un testigo POR PUNTO, no un veredicto de la corrida.**
 *
 * La primera version comparaba el rango de `pre` sobre todos los puntos contra la
 * tolerancia, y con eso **un solo punto anomalo tumbaba el barrido entero**. La
 * corrida del 2026-09-13 lo mostro: `pre` dio −46,66 en 47 de 48 puntos y −45,85
 * en uno, y M1 fallaba por 0,81 dB.
 *
 * Lo que el contrato quiere decir es otra cosa: si la fuente se movio, **ese
 * punto** no mide el fader. Asi que se compara cada punto contra la **mediana**
 * --que un outlier no mueve-- y el punto se anula. Una deriva de verdad anula
 * muchos puntos y se ve igual; una excursion suelta se saca sola.
 *
 * Se informa el rango global igual, porque distinguir «un punto raro» de «se fue
 * moviendo todo» es justamente lo que hay que poder leer.
 */
const mediana = (xs: number[]): number => {
  const ys = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (ys.length === 0) return NaN;
  const m = Math.floor(ys.length / 2);
  return ys.length % 2 === 1 ? ys[m]! : (ys[m - 1]! + ys[m]!) / 2;
};
const preMediano = mediana(puntos.map((p) => p.preDb));
const testigoFuera = (p: Punto): boolean =>
  Number.isFinite(p.preDb) && Math.abs(p.preDb - preMediano) > TOLERANCIA_MEDIDOR_DB;

const utiles = puntos.filter((p) => p.anulado === null && !testigoFuera(p));
/** La ventana de M4 y M5: donde el medidor dice algo. */
const enVentana = utiles.filter((p) => !p.fueraDeVentana);

console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 99b ===');
console.log(`   ${utiles.length} puntos utiles de ${puntos.length}`);
console.log(`   ${enVentana.length} dentro de la ventana del medidor (bytes ${BYTE_PISO}..${BYTE_TECHO})`);
for (const p of puntos.filter((x) => x.anulado !== null)) {
  console.log(`     crudo ${p.crudo} ${p.sentido}: ${p.anulado}`);
}

const rango = (xs: number[]) =>
  (xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs));

// M1 — el testigo de la fuente, punto por punto
{
  const dPre = rango(puntos.map((p) => p.preDb).filter(Number.isFinite));
  const dEnt = rango(puntos.map((p) => p.entradaDb).filter(Number.isFinite));
  const fuera = puntos.filter(testigoFuera);
  console.log('');
  console.log(`M1 pre mediano ${preMediano.toFixed(2)} dB | rango de pre ${dPre.toFixed(2)} dB | `
    + `de entrada ${dEnt.toFixed(2)} dB`);
  console.log(`   ${fuera.length} puntos de ${puntos.length} con la fuente fuera de tolerancia`);
  for (const p of fuera) {
    // **Y se dice si el audio REAL acompano.** Es la unica pregunta que
    // importa: si los medidores de la consola se movieron y la salida no, el
    // que se movio fue el medidor, y eso es un hallazgo, no un punto sucio.
    const par = puntos.find((x) => x.crudo === p.crudo && x.sentido !== p.sentido);
    const dReal = par === undefined ? NaN : p.realDb - par.realDb;
    console.log(`     crudo ${p.crudo} ${p.sentido}: pre ${p.preDb.toFixed(2)} `
      + `(${(p.preDb - preMediano).toFixed(2)} de la mediana) | la salida REAL se movio `
      + `${Number.isFinite(dReal) ? `${dReal.toFixed(2)} dB` : '(sin par para comparar)'}`);
    if (Number.isFinite(dReal) && Math.abs(dReal) < TOLERANCIA_MEDIDOR_DB / 2) {
      console.log('       LOS MEDIDORES DE LA CONSOLA SE MOVIERON Y EL AUDIO NO. Sin el');
      console.log('       segundo instrumento esto habria parecido un evento real.');
    }
  }
  console.log(fuera.length === 0
    ? '   PASA. El fader esta aguas abajo de los dos, como el proyecto cree, y el\n'
      + '   camino ANALOGICO de reproduccion tampoco se movio: es el testigo fuerte.'
    : '   Esos puntos quedan ANULADOS y el resto de la corrida sigue valiendo. Una\n'
      + '   deriva de verdad anularia muchos; una excursion suelta se saca sola.');
}

// M2 — la referencia interna de la interfaz
{
  const d = rango(puntos.map((p) => p.referenciaDb).filter(Number.isFinite));
  console.log('');
  console.log(`M2 deriva de la referencia interna: ${d.toFixed(2)} dB`);
  console.log(d <= 0.2
    ? '   PASA. La computadora siguio emitiendo el mismo nivel digital, Y NADA MAS:\n'
      + '   es un retorno interno de la interfaz. El camino analogico de reproduccion\n'
      + '   lo vigila M1. El de CAPTURA --salida de la consola, cable, perilla de\n'
      + '   entrada, conversor-- no lo vigila nadie, y su unico control es la vuelta.'
    : '   FALLA: cambio el nivel que emite la computadora.');
}

// El control del camino de captura: la vuelta al punto de arranque.
{
  const ida = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0]);
  const vuelta = puntos.find((p) => p.sentido === 'sube' && p.crudo === CRUDOS[0]);
  console.log('');
  if (ida === undefined || vuelta === undefined) {
    console.log('camino de captura: sin el par de apertura y cierre, no se puede decir.');
  } else {
    const d = Math.abs(ida.realDb - vuelta.realDb);
    console.log(`camino de captura: el arranque repetido al cierre difiere ${d.toFixed(2)} dB`);
    console.log(d <= 0.2
      ? '   PASA. La ganancia analogica de captura no se movio durante la corrida.'
      : '   FALLA: algo del camino de captura se movio y la corrida no vale.');
  }
  const { apertura, cierre } = alineaciones;
  if (apertura !== null && cierre !== null) {
    console.log(`alineacion: apertura ${apertura.desvioHz.toFixed(2)} Hz `
      + `(${apertura.perdidaDb.toFixed(3)} dB), cierre `
      + `${cierre.desvioHz.toFixed(2)} Hz (${cierre.perdidaDb.toFixed(3)} dB)`);
    console.log('   Con el mismo aparato en las dos puntas el desvio de reloj se cancela');
    console.log('   exactamente. Esto vigila que el tono no haya salido por otro.');
  }
}

const bajando = enVentana.filter((p) => p.sentido === 'baja');
const topeM = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.salidaDb ?? NaN;
const topeR = puntos.find((p) => p.sentido === 'baja' && p.crudo === CRUDOS[0])?.realDb ?? NaN;
const ley = (c: number) => faderADb(CRUDOS[0]!) - faderADb(c);

// M3 — la salida real contra faderADb
//
// **M3 no tiene la ventana del medidor**: no pasa por el medidor. Su limite es
// el del instrumento externo, que es el margen en el bin, y ese filtro ya lo
// aplico `anulado`.
{
  const suyos = utiles.filter((p) => p.sentido === 'baja');
  let peor = 0; let donde = NaN;
  for (const p of suyos) {
    const d = Math.abs((topeR - p.realDb) - ley(p.crudo));
    if (d > peor) { peor = d; donde = p.crudo; }
  }
  console.log('');
  console.log(`M3 salida real contra faderADb: desvio maximo ${peor.toFixed(2)} dB en el crudo ${donde}`);
  console.log(`   sobre ${suyos.length} puntos, ninguno de los cuales pasa por el medidor`);
  console.log(peor <= 0.5
    ? '   PASA, Y ES UNA COTA, NO UNA IDENTIDAD. Dice que si `faderADb` se aparta\n'
      + '   del fader real, se aparta menos que 0,5 dB EN LOS PUNTOS MEDIDOS. NO dice\n'
      + '   que sea la ley del fader: la 94 declaro exactamente eso indecidible, y\n'
      + '   esta corrida tiene mejor instrumento pero la misma logica.'
    : '   FALLA. Primera evidencia medida AFUERA de que `faderADb` no describe el\n'
      + '   fader. Toca todo lo que la usa.');
}

// M4 — el medidor contra la salida real: la pregunta central
{
  console.log('');
  if (bajando.length < PUNTOS_MINIMOS) {
    console.log(`M4 NO SE PUEDE DECIDIR: ${bajando.length} puntos en la ventana, `
      + `hacen falta ${PUNTOS_MINIMOS}.`);
    console.log('   Se informa y no se puntua. La medicion 94 termino asi por lo mismo.');
  } else {
    let peor = 0; let donde = NaN;
    const difs: number[] = [];
    for (const p of bajando) {
      const d = (topeM - p.salidaDb) - (topeR - p.realDb);
      difs.push(d);
      if (Math.abs(d) > peor) { peor = Math.abs(d); donde = p.crudo; }
    }
    const tramo = Math.max(...bajando.map((p) => p.salidaDb)) - Math.min(...bajando.map((p) => p.salidaDb));
    console.log(`M4 medidor contra salida real: desvio maximo ${peor.toFixed(2)} dB en el crudo ${donde}`);
    console.log(`   ${bajando.length} puntos sobre un tramo de ${tramo.toFixed(1)} dB`);
    const positivos = difs.filter((d) => d > ESCALON_DB / 2).length;
    const negativos = difs.filter((d) => d < -ESCALON_DB / 2).length;
    console.log(`   signo de las diferencias: ${positivos} positivas, ${negativos} negativas, `
      + `${difs.length - positivos - negativos} dentro de medio escalon`);
    console.log(peor <= TOLERANCIA_MEDIDOR_DB
      ? '   PASA. **El medidor predice la salida real** en la ventana medida.\n'
        + '   Calculado o medido, sirve para lo que la aplicacion lo usa. Esto NO\n'
        + '   distingue «medido» de «calculado y correcto»: ninguna comparacion\n'
        + '   estacionaria puede, y el control de balistica tampoco (ver abajo).'
      : '   FALLA. El medidor no predice la salida.');
  }
  // La localizacion, que es lo que los medidores del general compran.
  const conGen = bajando.filter((p) => Number.isFinite(p.postGeneralDb));
  if (conGen.length >= 3) {
    const tope = conGen[0]!;
    let peorCanalGen = 0; let peorGenGen = 0;
    for (const p of conGen) {
      peorCanalGen = Math.max(peorCanalGen,
        Math.abs((tope.salidaDb - p.salidaDb) - (tope.preGeneralDb - p.preGeneralDb)));
      peorGenGen = Math.max(peorGenGen,
        Math.abs((tope.preGeneralDb - p.preGeneralDb) - (tope.postGeneralDb - p.postGeneralDb)));
    }
    console.log(`   localizacion: salida del canal -> pre del general difiere hasta `
      + `${peorCanalGen.toFixed(2)} dB; pre -> post del general, ${peorGenGen.toFixed(2)} dB.`);
    console.log(peorGenGen <= TOLERANCIA_MEDIDOR_DB
      ? '   El general es una ganancia estatica: MEDIDO, no supuesto.'
      : '   El general NO es una ganancia estatica, y eso explica una divergencia de M4.');
  }
  const reduccion = Math.max(0, ...puntos.map((p) => p.reduccionGeneralMax).filter(Number.isFinite));
  console.log(`   reduccion del general en toda la corrida: ${reduccion.toFixed(2)} dB `
    + '(puenteado; si no es cero, el puenteo no hizo lo que dice)');
}

// M5 — el escalon del medidor contra el instrumento externo
{
  console.log('');
  const xs = bajando.map((p) => p.byte);
  const ys = bajando.map((p) => p.realDb);
  if (xs.length < PUNTOS_MINIMOS) {
    console.log(`M5 NO SE PUEDE DECIDIR: ${xs.length} puntos en la ventana.`);
  } else {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i]! - my), 0);
    const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0);
    const pendiente = den === 0 ? NaN : num / den;
    const error = Math.abs(pendiente - ESCALON_DB) / ESCALON_DB;
    // El rango implicado: el medidor vale `RANGO * (byte * VU_ESCALA - 1)`, asi
    // que su pendiente es `RANGO * VU_ESCALA` dB por byte. Despejando el rango
    // de la pendiente medida sale la cifra que se contrasta contra el 80 --y
    // contra el 84,5 que este proyecto tuvo que retirar.
    const rangoImplicado = pendiente / VU_ESCALA;
    const tramo = Math.max(...ys) - Math.min(...ys);
    console.log(`M5 escalon del medidor, contra el instrumento externo: `
      + `${pendiente.toFixed(6)} dB por byte`);
    console.log(`   declarado ${ESCALON_DB.toFixed(6)} | error ${(error * 100).toFixed(2)} % | `
      + `${xs.length} puntos sobre ${tramo.toFixed(1)} dB`);
    console.log(`   RANGO IMPLICADO: ${rangoImplicado.toFixed(2)} dB `
      + `(declarado ${MEDIDOR_RANGO_DB}; la hipotesis que este proyecto retiro era 84,5)`);
    console.log(error <= 0.01
      ? '   PASA. `MEDIDOR_RANGO_DB` y `VU_ESCALA` quedan contrastadas AFUERA.'
      : '   FALLA: el escalon del medidor no es el declarado, y eso toca TODAS las\n'
        + '   mediciones de este proyecto.');
    if (tramo > 33.4) {
      console.log(`   SUBORDINADA: con ${tramo.toFixed(1)} dB de tramo (mas de 33,4), M5 no puede`);
      console.log('   fallar si M4 paso. Es un resumen de M4 en una cifra y sirve para nombrar');
      console.log('   el rango, no como prueba independiente. Queda declarado, y se declaro');
      console.log('   antes de mirar los datos.');
    }
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
console.log('   camino que no se toca. Y nada sobre un error de escala CONSTANTE:');
console.log('   es invisible por construccion en una medicion relativa al arranque.');
console.log('   No distingue «medido» de «calculado y correcto». Y el control de');
console.log('   balistica TAMPOCO, en las dos direcciones: `protocol-spec` §4.3 ya');
console.log('   midio la caida de este medidor en 37 ms contra una cadencia de cuadro');
console.log('   de 44 ms, o sea que «cae de un cuadro al siguiente» es el resultado');
console.log('   esperado midiendo o calculando. Por eso el control se saco de esta');
console.log('   corrida en vez de informarse: estaba garantizado a dar el resultado');
console.log('   que se iba a leer como «es un calculo».');
console.log('');
console.log('   **ESTO NO RESCATA A LA 94 NI A LA 96b, y la asimetria es real.** Si el');
console.log('   medidor difiere, las dos quedan tocadas. Si COINCIDE, no quedan');
console.log('   salvadas: esta corrida mide el byte +2 de la seccion de ENTRADAS, y la');
console.log('   94 leyo el bloque de AUXILIAR y la 96b el de EFECTOS, que estan en la');
console.log('   cola de la trama, tienen otro paso, y cuya escala en dB el');
console.log('   `protocol-spec` §4.4 declara NO MEDIDA sobre esos bloques. Cerrar esa');
console.log('   mitad es otra corrida: el mismo metodo con el general recibiendo de un');
console.log('   auxiliar.');
console.log('');
console.log('   Un canal, una frecuencia, UN SOLO NIVEL DE FUENTE, un fader. Si el');
console.log('   acuerdo aparece es una forma consistente, no una escala probada: para');
console.log('   eso hay que repetir con la fuente 10 dB mas abajo, donde las');
console.log('   atenuaciones en dB tienen que dar iguales y las absolutas no.');
console.log('   Nada sobre el fader del general ni el de un bus: lo que se barre es');
console.log(`   i.${n}.mix, y el general se atraviesa como ganancia estatica --que se`);
console.log('   comprueba con sus medidores, no se supone.');
console.log('   Nada sobre la ley inversa: la 94 la escribio y la tuvo que retirar.');
console.log('');
console.log(`restaurado: i.${n}.mix ${PREVIO.fader}, m.afs.enabled ${PREVIO.afs}, `
  + `m.dyn.bypass ${PREVIO.dynBypass}, los tres leidos del aparato antes de empezar.`);
console.log('Por el mismo camino que escribio, asi que la comprobacion por HTTP va aparte.');
