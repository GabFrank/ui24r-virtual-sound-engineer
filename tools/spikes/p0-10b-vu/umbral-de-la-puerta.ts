/**
 * El umbral y la profundidad de la puerta, y si tiene histeresis.
 *
 * **Contrato:** `docs/compromisos/120-el-umbral-y-la-profundidad-de-la-puerta.md`,
 * escrito antes de tocar la consola. Deriva del guion del item 119.
 *
 * ## La escalera, por primera vez tambien AL REVES
 *
 * Subiendo, la salida arranca atenuada --la puerta cerrada-- y en algun escalon
 * se abre: ese es el nivel de APERTURA. Bajando, arranca abierta y en algun
 * escalon se cierra: ese es el de CIERRE. **La diferencia es la histeresis**, y
 * si da cero, esta puerta no tiene.
 *
 * Nadie documenta si la tiene: ni el manual del fabricante, ni el cliente de la
 * consola --cero coincidencias de `hyster` en los dos-- ni ninguno de los cuatro
 * proyectos de terceros.
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

/**
 * La escalera: **catorce** escalones de 3 dB, de -48 a -9 dBFS.
 *
 * **Eran doce y la primera corrida mostro por que no alcanzaban.** Con los
 * umbrales altos --0,41 y 0,44-- la rodilla se iba por arriba del ultimo escalon
 * y el ajuste quedaba forzado contra el borde: tres escalones arriba, que es el
 * minimo, y una pendiente de 0,86 donde la relacion fija pedia 0,17. Eso NO es el
 * compresor, es el borde de la escalera.
 *
 * Dos escalones mas de margen separan ese artefacto de la deriva real que la
 * misma corrida mostro en los umbrales bajos, que es lo que se quiere medir.
 */
/**
 * La escalera, **de 1,5 en 1,5 dB** y no de 3 en 3.
 *
 * **La primera corrida mostro por que.** Esta puerta es un INTERRUPTOR: pasa de
 * atenuar 20 dB a no atenuar nada entre dos escalones vecinos, sin nada en el
 * medio. Con una transicion dura, **el escalon de la escalera ES la resolucion**:
 * la apertura medida solo puede tomar un valor cada 3 dB.
 *
 * Y eso arruino el ajuste. Los umbrales 0,36 y 0,39 cayeron en el MISMO escalon,
 * asi que su intervalo dio 0 dB donde los otros cuatro daban 3,0, y la pendiente
 * salio 74,4 cuando los intervalos buenos daban 100. **Ese 74,4 es del
 * instrumento, no de la puerta**, y por eso no se publico.
 *
 * Con 1,5 dB y 0,03 de crudo --unos 2,9 dB si el cliente tiene razon-- cada
 * umbral se corre dos escalones, y dos vecinos ya no pueden confundirse.
 */
const NIVELES_DBFS = [
  -36, -34.5, -33, -31.5, -30, -28.5, -27, -25.5, -24, -22.5,
  -21, -19.5, -18, -16.5, -15, -13.5, -12, -10.5, -9,
] as const;
/** Cuanto dura cada escalon, y desde donde se lee el nivel asentado. */
const SEG_POR_ESCALON = 1.2;
/** El paso de la escalera, en dB. Con transicion dura, ES la resolucion. */
const PASO_DE_LA_ESCALERA_DB = 1.5;
const LECTURA_DESDE_MS = 800;
const LECTURA_HASTA_MS = 1150;
/** Margen minimo del tono sobre el piso, para C1. */
const MARGEN_MINIMO_DB = 45;


/**
 * Los crudos que se barren. **Nueve, no cinco**: con cuatro puntos utiles la forma
 * la decidia el ajuste y no los datos.
 */
/** Los umbrales de la puerta que se barren. */
const UMBRALES = [0.30, 0.33, 0.36, 0.39, 0.42, 0.45] as const;
/** Las profundidades. El extremo 1,0 tiene que NO atenuar nada: sirve de control. */
const PROFUNDIDADES = [1.0, 0.85, 0.70, 0.55, 0.40, 0.25] as const;
/** La profundidad mientras se barre el umbral: -20 dB segun el cliente. */
const PROFUNDIDAD_DE_TRABAJO = 2 / 3;
/** El umbral mientras se barre la profundidad. */
const UMBRAL_DE_TRABAJO = 0.39;
/** C3: cuanto tiene que atenuar cerrada para que haya transicion que medir. */
const C3_CIERRE_MINIMO_DB = 10;
/** C4: en cuantos escalones tiene que completarse la transicion. */
const C4_ESCALONES_MAXIMOS = 2;
/** L1: residuo maximo del ajuste del umbral contra el crudo. */
const L1_RESIDUO_MAXIMO_DB = 1.5;
/** Lo que el cliente declara: `VtoGATE_THRESH(a) = 96a - 90`. */
const PENDIENTE_DEL_CLIENTE = 96;
/** C2: cuanto puede apartarse de 1 la pendiente con la puerta puenteada. */
const C2_TOLERANCIA = 0.02;
/** Y `VtoGATE_DEPTH(a) = 60a - 60`. */
const profundidadDelCliente = (a: number): number => 60 * a - 60;

const carpeta = mkdtempSync(join(tmpdir(), 'umbral-puerta-'));

/** La escalera completa, en un archivo. Subiendo o bajando. */
function escalera(bajando = false): string {
  const porEscalon = FM * SEG_POR_ESCALON;
  const total = porEscalon * NIVELES_DBFS.length;
  const datos = Buffer.alloc(total * 4);
  let i = 0;
  const orden = bajando ? [...NIVELES_DBFS].reverse() : [...NIVELES_DBFS];
  for (const nivel of orden) {
    const a = Math.pow(10, nivel / 20) * 32767;
    for (let k = 0; k < porEscalon; k++, i++) {
      const v = Math.round(a * Math.sin((2 * Math.PI * HZ * i) / FM));
      datos.writeInt16LE(v, i * 4);
      datos.writeInt16LE(v, i * 4 + 2);
    }
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(carpeta, `escalera-${bajando ? 'baja' : 'sube'}.wav`);
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



let sonando: ReturnType<typeof spawn> | null = null;

/**
 * Los doce niveles asentados de una escalera, en dBFS.
 *
 * **El arranque se busca en la señal**, igual que en los items 114 a 116: entre
 * que `afplay` arranca y que el grabador captura hay una latencia que nadie
 * declaro, y suponerla seria inventar el dato. A partir de ahi cada escalon cae
 * donde tiene que caer.
 */
async function medirEscalera(etiqueta: string, bajando = false): Promise<number[] | null> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 300); });
  const wav = join(carpeta, `${etiqueta}.wav`);
  const segundos = Math.ceil(SEG_POR_ESCALON * NIVELES_DBFS.length) + 1;
  sonando = spawn('afplay', [escalera(bajando)]);
  let fallo: Error | null = null;
  sonando.on('error', (e) => { fallo = e instanceof Error ? e : new Error(String(e)); });
  const hijo = spawn(GRABADOR, [String(segundos), wav, 'Scarlett'],
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

  const piso = Math.min(...env.map((p) => p.db));
  const iArranque = env.findIndex((p) => p.db - piso > 15);
  if (iArranque === -1) return null;
  const msArranque = env[iArranque]!.ms;
  const niveles: number[] = [];
  for (let k = 0; k < NIVELES_DBFS.length; k++) {
    const desde = msArranque + k * SEG_POR_ESCALON * 1000 + LECTURA_DESDE_MS;
    const hasta = msArranque + k * SEG_POR_ESCALON * 1000 + LECTURA_HASTA_MS;
    const trozo = env.filter((p) => p.ms >= desde && p.ms <= hasta).map((p) => p.db);
    if (trozo.length < 20) return null;
    const o = [...trozo].sort((a, b) => a - b);
    niveles.push(o[Math.floor(o.length / 2)]!);
  }
  // **Siempre se devuelve indexado como `NIVELES_DBFS`**, o sea de menor a mayor,
  // venga la escalera como venga. Si no, comparar la de subida con la de bajada
  // seria comparar dos ejes distintos sin que nada avise.
  return bajando ? niveles.reverse() : niveles;
}

/** Pendiente por minimos cuadrados de `ys` contra `xs`. */
function pendiente(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2; }
  return den === 0 ? NaN : num / den;
}

/**
 * El nivel donde la atenuacion cruza `objetivo`.
 *
 * **Sin parametro de direccion, y ese parametro era un defecto.** La primera
 * version preguntaba si la escalera subia o bajaba y cambiaba la condicion del
 * cruce. Pero `medirEscalera` ya devuelve el arreglo **indexado por nivel
 * creciente** venga como venga, asi que la atenuacion siempre va de mucha
 * --puerta cerrada, nivel bajo-- a poca. La condicion es una sola.
 *
 * Con la otra, el cruce de la escalera descendente nunca matcheaba y la
 * histeresis salia «fuera» en las tres pruebas. No era que no hubiera: era que no
 * se estaba buscando.
 */
function cruceDeAtenuacion(
  entrada: readonly number[], aten: readonly number[], objetivo: number,
): number | null {
  for (let k = 1; k < entrada.length; k++) {
    const a = aten[k - 1]!;
    const b = aten[k]!;
    if (!(a > objetivo && objetivo >= b)) continue;
    const f = (objetivo - a) / (b - a);
    return entrada[k - 1]! + f * (entrada[k]! - entrada[k - 1]!);
  }
  return null;
}

/** En cuantos escalones se completa la transicion, del 90% al 10% de la atenuacion. */
function anchoDeTransicion(
  entrada: readonly number[], aten: readonly number[], prof: number,
): number {
  const alto = cruceDeAtenuacion(entrada, aten, prof * 0.9);
  const bajo = cruceDeAtenuacion(entrada, aten, prof * 0.1);
  if (alto === null || bajo === null) return NaN;
  return Math.abs(bajo - alto) / PASO_DE_LA_ESCALERA_DB;
}

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const RUTA_UMBRAL = `i.${n}.gate.thresh`;
const RUTA_PROFUNDIDAD = `i.${n}.gate.depth`;
const RUTA_PUENTE = `i.${n}.gate.bypass`;
const RUTA_ATAQUE = `i.${n}.gate.attack`;
const RUTA_SOSTENIDO = `i.${n}.gate.hold`;
const RUTA_RELAJACION = `i.${n}.gate.release`;

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  [RUTA_UMBRAL, Number(exigirClave(e0, `i.${n}.gate.thresh`))],
  [RUTA_PROFUNDIDAD, Number(exigirClave(e0, `i.${n}.gate.depth`))],
  [RUTA_PUENTE, Number(exigirClave(e0, `i.${n}.gate.bypass`))],
  [RUTA_ATAQUE, Number(exigirClave(e0, `i.${n}.gate.attack`))],
  [RUTA_SOSTENIDO, Number(exigirClave(e0, `i.${n}.gate.hold`))],
  [RUTA_RELAJACION, Number(exigirClave(e0, `i.${n}.gate.release`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  [`i.${n}.mix`, Number(exigirClave(e0, `i.${n}.mix`))],
];
console.log('=== 120 — EL UMBRAL Y LA PROFUNDIDAD DE LA PUERTA ===');
console.log(`   canal ${CANAL} -> general -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   escalera de ${NIVELES_DBFS.length} escalones, ${NIVELES_DBFS[0]} a `
  + `${NIVELES_DBFS[NIVELES_DBFS.length - 1]} dBFS, y por primera vez tambien AL REVES`);
console.log(`   ${UMBRALES.length} umbrales y ${PROFUNDIDADES.length} profundidades`);
console.log('   los tiempos de la puerta van a su MINIMO para que cada escalon asiente,');
console.log('   asi que la histeresis que sale es la del detector, no la que se percibe');
console.log('   con el sostenido puesto. El contrato lo dice.');
console.log('');
for (const [k, v] of PREVIO) console.log(`   ${k.padEnd(22)} ${v}`);
console.log('');

anotarPendiente('curva-del-compresor.ts', maquina, PREVIO);

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

    // **La puerta ENCENDIDA, que es lo que se mide.** Heredado del item 119 venia
    // en 0 --alla la puerta estorbaba-- y aca seria medir una puerta apagada. C3
    // lo habria cazado, pero con una corrida entera gastada; ninguna guarda
    // estatica puede ver esto, porque la clave se lee y se restaura igual: lo que
    // esta mal es el VALOR, y eso es semantica del experimento.
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 1));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // El compresor del canal y el del general, fuera del camino.
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    // La compensacion neutralizada: el item 110 se comio una corrida por esto.
    // **Al compresor se lo PUENTEA y no se lo toca.** Este guion heredo del item
    // 119 tres escrituras --`dyn.outgain`, `dyn.attack` y `dyn.release`-- que aca
    // no hacen falta: con `dyn.bypass` en 1 el compresor esta fuera del camino y
    // sus parametros dan igual.
    //
    // Las cazaron las dos guardas de restauracion ANTES de correr el guion, no
    // despues: quedaban escritas y sin devolver, porque PREVIO ya no las lleva.
    // Es exactamente el defecto para el que se escribio `restaurar-lo-que-se-
    // escribe` esta misma tarde, y esta vez aviso a tiempo.
    t.enviar(codificarSetd(RUTA_UMBRAL, UMBRAL_DE_TRABAJO));
    await new Promise((r) => { setTimeout(r, 1500); });

    // --- C2: la cadena es LINEAL con el compresor puenteado ------------------
    console.log('');
    console.log('=== C2 — LA ESCALERA CON EL COMPRESOR PUENTEADO ===');
    t.enviar(codificarSetd(RUTA_PUENTE, 1));
    await new Promise((r) => { setTimeout(r, 1200); });
    const sinComp = await medirEscalera('c2');
    if (sinComp === null) throw new Error('C2 FALLA: no se pudo leer la escalera puenteada.');
    const entrada = [...NIVELES_DBFS];
    for (let k = 0; k < entrada.length; k++) {
      console.log(`   entrada ${String(entrada[k]).padStart(4)} dBFS -> `
        + `salida ${sinComp[k]!.toFixed(2).padStart(8)} dBFS`);
    }
    const pendSin = pendiente(entrada, sinComp);
    c2 = Math.abs(pendSin - 1) <= C2_TOLERANCIA;
    console.log(`   pendiente ${pendSin.toFixed(4)} (tiene que ser 1,000 +- ${C2_TOLERANCIA})`);
    console.log(`   ${c2 ? 'PASA: la cadena es lineal, asi que lo que se doble despues es del '
      + 'compresor.' : 'FALLA: la cadena no es lineal y cualquier pendiente posterior es suya.'}`);
    if (!c2) throw new Error('C2 FALLA: la cadena no es lineal.');

    const piso = -130;
    c1 = sinComp[0]! - piso >= 40;
    console.log('');
    console.log(`C1 el escalon mas bajo llega: ${sinComp[0]!.toFixed(1)} dBFS`);
    if (!c1) throw new Error('C1 FALLA: el escalon mas bajo no llega con margen.');

    // --- la puerta en su punto de trabajo ------------------------------------
    t.enviar(codificarSetd(RUTA_PUENTE, 0));
    t.enviar(codificarSetd(RUTA_ATAQUE, 0));
    t.enviar(codificarSetd(RUTA_SOSTENIDO, 0));
    t.enviar(codificarSetd(RUTA_RELAJACION, 0));
    t.enviar(codificarSetd(RUTA_PROFUNDIDAD, PROFUNDIDAD_DE_TRABAJO));
    await new Promise((r) => { setTimeout(r, 1200); });

    const atenuacion = (sal: readonly number[]): number[] =>
      sal.map((v, k) => Math.max(0, sinComp[k]! - v));

    // --- el umbral -----------------------------------------------------------
    console.log('');
    console.log(`=== EL UMBRAL (profundidad fija en ${PROFUNDIDAD_DE_TRABAJO.toFixed(4)}) ===`);
    console.log('   crudo | cierre abajo | apertura (dBFS) | ancho de la transicion');
    const xs: number[] = [];
    const ys: number[] = [];
    let peorAncho = 0;
    let peorCierre = Infinity;
    for (const u of UMBRALES) {
      t.enviar(codificarSetd(RUTA_UMBRAL, u));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sal = await medirEscalera(`u-${u}`);
      if (sal === null) { console.log(`   ${u}: no se pudo leer`); continue; }
      const at = atenuacion(sal);
      const cierre = at[0]!;
      peorCierre = Math.min(peorCierre, cierre);
      const apertura = cruceDeAtenuacion(entrada, at, cierre / 2);
      const ancho = anchoDeTransicion(entrada, at, cierre);
      if (Number.isFinite(ancho)) peorAncho = Math.max(peorAncho, ancho);
      console.log(`   ${u.toFixed(2)}  | ${cierre.toFixed(1).padStart(9)} dB | `
        + `${apertura === null ? '   fuera' : `${apertura.toFixed(2)} dBFS`} | `
        + `${Number.isFinite(ancho) ? `${ancho.toFixed(1)} escalones` : '—'}`);
      console.log(`         atenuacion: ${entrada.map((x, k) =>
        `${x}:${at[k]!.toFixed(1)}`).join('  ')}`);
      if (apertura !== null) { xs.push(u); ys.push(apertura); }
    }

    c3 = peorCierre >= C3_CIERRE_MINIMO_DB;
    console.log('');
    console.log(`C3 la puerta cierra: la menor atenuacion en el escalon mas bajo fue `
      + `${peorCierre.toFixed(1)} dB (minimo ${C3_CIERRE_MINIMO_DB}) -> ${c3 ? 'PASA' : 'FALLA'}`);
    if (!c3) throw new Error('C3 FALLA: la puerta no cierra con el nivel mas bajo.');
    c4 = peorAncho > 0 && peorAncho <= C4_ESCALONES_MAXIMOS;
    console.log(`C4 la transicion es nitida: la mas ancha tardo ${peorAncho.toFixed(1)} `
      + `escalones (tope ${C4_ESCALONES_MAXIMOS}) -> ${c4 ? 'PASA' : 'FALLA'}`);
    if (!c4) {
      throw new Error('C4 FALLA: la transicion no se completa en dos escalones, asi que no '
        + 'hay «un nivel de apertura» y la histeresis no se puede leer como una diferencia.');
    }

    if (xs.length >= 4) {
      const m = pendiente(xs, ys);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const res = Math.max(...xs.map((x, k) => Math.abs(ys[k]! - (my + m * (x - mx)))));
      console.log('');
      console.log(`L1 el umbral es lineal: residuo maximo ${res.toFixed(2)} dB `
        + `(tope ${L1_RESIDUO_MAXIMO_DB}) -> ${res <= L1_RESIDUO_MAXIMO_DB ? 'PASA' : 'FALLA'}`);
      console.log(`   PENDIENTE MEDIDA: ${m.toFixed(1)} dB por unidad de crudo`);
      console.log(`   el cliente dice ${PENDIENTE_DEL_CLIENTE} (VtoGATE_THRESH = 96a - 90)`);
      console.log(`   cociente ${(m / PENDIENTE_DEL_CLIENTE).toFixed(3)}`);
    } else {
      console.log('   sin puntos suficientes para ajustar el umbral.');
    }

    // --- la profundidad ------------------------------------------------------
    console.log('');
    console.log(`=== LA PROFUNDIDAD (umbral fijo en ${UMBRAL_DE_TRABAJO}) ===`);
    console.log('   crudo | atenuacion medida | el cliente dice | diferencia');
    t.enviar(codificarSetd(RUTA_UMBRAL, UMBRAL_DE_TRABAJO));
    for (const d of PROFUNDIDADES) {
      t.enviar(codificarSetd(RUTA_PROFUNDIDAD, d));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sal = await medirEscalera(`d-${d}`);
      if (sal === null) { console.log(`   ${d}: no se pudo leer`); continue; }
      const at = atenuacion(sal)[0]!;
      const pred = -profundidadDelCliente(d);
      console.log(`   ${d.toFixed(2)}  | ${at.toFixed(1).padStart(14)} dB | `
        + `${pred.toFixed(1).padStart(12)} dB | ${(at - pred >= 0 ? '+' : '')}`
        + `${(at - pred).toFixed(1)} dB`);
    }

    // --- la histeresis -------------------------------------------------------
    console.log('');
    console.log('=== LA HISTERESIS: ¿ABRE Y CIERRA EN EL MISMO NIVEL? ===');
    t.enviar(codificarSetd(RUTA_PROFUNDIDAD, PROFUNDIDAD_DE_TRABAJO));
    for (const u of [0.33, 0.39, 0.45]) {
      t.enviar(codificarSetd(RUTA_UMBRAL, u));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sube = await medirEscalera(`h-sube-${u}`, false);
      const baja = await medirEscalera(`h-baja-${u}`, true);
      if (sube === null || baja === null) { console.log(`   ${u}: no se pudo leer`); continue; }
      const atS = atenuacion(sube);
      const atB = atenuacion(baja);
      const apertura = cruceDeAtenuacion(entrada, atS, atS[0]! / 2);
      const cierre = cruceDeAtenuacion(entrada, atB, atB[0]! / 2);
      const h = (apertura !== null && cierre !== null) ? apertura - cierre : NaN;
      console.log(`   umbral ${u.toFixed(2)}: abre en `
        + `${apertura === null ? 'fuera' : `${apertura.toFixed(2)}`} dBFS, cierra en `
        + `${cierre === null ? 'fuera' : `${cierre.toFixed(2)}`} dBFS -> histeresis `
        + `${Number.isFinite(h) ? `${h.toFixed(2)} dB` : '—'}`);
      console.log(`      subiendo: ${entrada.map((x, k) => `${x}:${atS[k]!.toFixed(1)}`).join('  ')}`);
      console.log(`      bajando:  ${entrada.map((x, k) => `${x}:${atB[k]!.toFixed(1)}`).join('  ')}`);
    }
    console.log('');
    console.log('   Sin expectativa declarada: no habia base para predecir ni que exista');
    console.log('   ni que no. Y con el sostenido en su minimo, esta es la histeresis del');
    console.log('   DETECTOR, no la que se percibe con el sostenido puesto.');
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
console.log(`   Un tono de ${HZ} Hz, un canal, un dia.`);
console.log('   Se mide LA PENDIENTE del umbral, no su cero: este banco no tiene con');
console.log('   que anclar la escala interna de la consola.');
console.log('   Nada de la relajacion de la puerta, cuya forma el item 116 refuto y que');
console.log('   sigue sin ley: eso necesita un modelo nuevo, no otra corrida de esta.');
console.log('   Nada con el sostenido puesto. Nada con señal real.');
if (!(c1 && c2 && c3 && c4)) {
  console.log('');
  console.log('NO SE PUBLICA NINGUNA PENDIENTE: fallo algun control.');
  process.exitCode = 1;
}
