/**
 * La curva de entrada y salida del compresor.
 *
 * **Contrato:** `docs/compromisos/117-la-curva-del-compresor.md`, escrito antes de
 * tocar la consola. Ahi estan el metodo --que lo prescribio el item 98, no yo--,
 * los controles y el trabajo previo.
 *
 * ## Una escalera, y toda la curva en una captura
 *
 * El tono sube de tres en tres decibeles, doce escalones. Por debajo del umbral
 * la salida sube uno a uno; por encima sube menos. **La pendiente de esa segunda
 * parte ES la relacion.**
 *
 * **Se mueve LA FUENTE, no el umbral**, que es lo que el item 98 dejo exigido
 * despues de que la 97 sacara tres pendientes por sustitucion que hubo que
 * retirar. Y se barren DOCE excesos, no dos, que es lo que la 97 pedia para que
 * «la reduccion es proporcional a (1−a)» y «la relacion es 1/a» dejen de ser
 * indistinguibles. Ahi estan el alcance, los controles, la definicion
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
const NIVELES_DBFS = [-48, -45, -42, -39, -36, -33, -30, -27, -24, -21, -18, -15, -12, -9] as const;
/** Cuanto dura cada escalon, y desde donde se lee el nivel asentado. */
const SEG_POR_ESCALON = 1.2;
const LECTURA_DESDE_MS = 800;
const LECTURA_HASTA_MS = 1150;
/** Margen minimo del tono sobre el piso, para C1. */
const MARGEN_MINIMO_DB = 45;


/**
 * Los crudos que se barren. **Nueve, no cinco**: con cuatro puntos utiles la forma
 * la decidia el ajuste y no los datos.
 */
/**
 * Los umbrales que se barren.
 *
 * **El rango no es libre.** Si el cliente tiene razon son 96 dB por unidad, y la
 * rodilla tiene que quedar dentro de la escalera con tres escalones de cada lado,
 * o sea entre -39 y -24 dBFS de fuente: 15 dB, que son 0,156 de crudo. Se barre
 * un poco menos, centrado en el 0,35 donde el 117 encontro la rodilla.
 */
const UMBRALES = [0.29, 0.32, 0.35, 0.38, 0.41, 0.44] as const;
/**
 * La relacion, fija y fuerte, para que la rodilla sea nitida.
 *
 * Con el crudo 0,10 el item 117 midio 5,85:1, o sea pendiente 0,171 arriba contra
 * 1,000 abajo. Cuanto mas se separan las dos rectas, mejor determinado queda su
 * cruce.
 */
const RELACION = 0.10;
/**
 * Los niveles de reduccion a los que se lee el cruce, en dB.
 *
 * **Este es el metodo, y reemplaza al de la rodilla por dos rectas.** La primera
 * corrida mostro que la curva de este compresor NO son dos rectas: la pendiente
 * por encima del codo sube con el nivel --de casi cero pegada al codo hasta 0,5
 * veinte decibeles mas arriba--. Con la curva doblada, «donde se cruzan las dos
 * rectas» depende de con cuantos puntos se ajuste cada una, y no es el umbral.
 *
 * Lo que la misma corrida mostro que SI es invariante es la **reduccion como
 * funcion del exceso**: los seis umbrales dan la misma serie corrida. Asi que el
 * umbral se lee alineando esas curvas: **a que nivel de entrada la reduccion
 * llega a N dB**. Eso no supone ninguna forma.
 */
const REDUCCIONES_DE_LECTURA = [2.0, 3.0, 6.0] as const;
/** C4: cuanto pueden diferir entre si las pendientes que salen de cada lectura. */
const C4_DISPERSION_MAXIMA = 0.03;
/** L1: residuo maximo del ajuste de la rodilla contra el crudo. */
const L1_RESIDUO_MAXIMO_DB = 1.5;
/** L2: la pendiente del cliente, y cuanto se le acepta. */
const PENDIENTE_DEL_CLIENTE = 96;
const L2_TOLERANCIA = 0.10;
/** C2: cuanto puede apartarse de 1 la pendiente con el compresor puenteado. */
const C2_TOLERANCIA = 0.02;
/** C3: al menos un crudo tiene que dar pendiente por debajo de esto. */
const C3_PENDIENTE_MAXIMA = 0.9;
/** C4: cuantos escalones hacen falta de cada lado de la rodilla. */
/**
 * Cuantos escalones hacen falta de cada lado de la rodilla.
 *
 * **Subio de 3 a 4 despues de la primera corrida.** Con tres, el ajuste de arriba
 * se apoyaba en los dos puntos pegados a la rodilla y devolvia la pendiente del
 * codo en vez de la de la recta.
 */
const C4_MINIMO_POR_LADO = 4;


const carpeta = mkdtempSync(join(tmpdir(), 'tiempos-comp-'));

/** La escalera completa, en un archivo. */
function escalera(): string {
  const porEscalon = FM * SEG_POR_ESCALON;
  const total = porEscalon * NIVELES_DBFS.length;
  const datos = Buffer.alloc(total * 4);
  let i = 0;
  for (const nivel of NIVELES_DBFS) {
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
  const ruta = join(carpeta, 'escalera.wav');
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
async function medirEscalera(etiqueta: string): Promise<number[] | null> {
  sonando?.kill();
  await new Promise((r) => { setTimeout(r, 300); });
  const wav = join(carpeta, `${etiqueta}.wav`);
  const segundos = Math.ceil(SEG_POR_ESCALON * NIVELES_DBFS.length) + 1;
  sonando = spawn('afplay', [escalera()]);
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
  return niveles;
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
 * Parte la curva en dos tramos buscando la rodilla, y devuelve las dos pendientes.
 *
 * **La rodilla se BUSCA, no se calcula del umbral escrito.** Calcularla con
 * `VtoTHRESH` seria el error circular que el item 97 documento: un error del 20 %
 * en la pendiente da una recta igual de recta con el cero en el mismo lugar.
 *
 * Se prueba cada corte posible y se queda con el que menos residuo deja.
 */
function partirEnLaRodilla(entrada: readonly number[], salida: readonly number[]): {
  iRodilla: number; abajo: number; arriba: number; residuo: number; cruceDbfs: number;
} | null {
  let mejor:
    { iRodilla: number; abajo: number; arriba: number; residuo: number; cruceDbfs: number }
    | null = null;
  for (let corte = C4_MINIMO_POR_LADO; corte <= entrada.length - C4_MINIMO_POR_LADO; corte++) {
    const xa = entrada.slice(0, corte);
    const ya = salida.slice(0, corte);
    const xb = entrada.slice(corte);
    const yb = salida.slice(corte);
    const pa = pendiente(xa, ya);
    const pb = pendiente(xb, yb);
    if (!Number.isFinite(pa) || !Number.isFinite(pb)) continue;
    const resid = (xs: readonly number[], ys: readonly number[], m: number): number => {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      return xs.reduce((acc, x, i) => acc + (ys[i]! - (my + m * (x - mx))) ** 2, 0);
    };
    const total = resid(xa, ya, pa) + resid(xb, yb, pb);
    if (mejor === null || total < mejor.residuo) {
      // **El cruce de las dos rectas, que es el umbral.** Cada recta se escribe
      // por su centro de gravedad --`y = my + m(x − mx)`-- y se igualan.
      const mxa = xa.reduce((q, w) => q + w, 0) / xa.length;
      const mya = ya.reduce((q, w) => q + w, 0) / ya.length;
      const mxb = xb.reduce((q, w) => q + w, 0) / xb.length;
      const myb = yb.reduce((q, w) => q + w, 0) / yb.length;
      const cruceDbfs = (pa - pb) === 0 ? NaN
        : ((myb - pb * mxb) - (mya - pa * mxa)) / (pa - pb);
      mejor = { iRodilla: corte, abajo: pa, arriba: pb, residuo: total, cruceDbfs };
    }
  }
  return mejor;
}

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const RUTA_RELACION = `i.${n}.dyn.ratio`;
const RUTA_UMBRAL = `i.${n}.dyn.threshold`;
const RUTA_PUENTE = `i.${n}.dyn.bypass`;

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  [RUTA_RELACION, Number(exigirClave(e0, `i.${n}.dyn.ratio`))],
  [RUTA_UMBRAL, Number(exigirClave(e0, `i.${n}.dyn.threshold`))],
  [RUTA_PUENTE, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.dyn.attack`, Number(exigirClave(e0, `i.${n}.dyn.attack`))],
  [`i.${n}.dyn.release`, Number(exigirClave(e0, `i.${n}.dyn.release`))],
  [`i.${n}.dyn.outgain`, Number(exigirClave(e0, `i.${n}.dyn.outgain`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  [`i.${n}.mix`, Number(exigirClave(e0, `i.${n}.mix`))],
];
const softknee = Number(exigirClave(e0, `i.${n}.dyn.softknee`));

console.log('=== 117 — LA CURVA DEL COMPRESOR, CONTRA EL AUDIO ===');
console.log(`   canal ${CANAL} -> general -> entrada ${ENTRADA + 1} de la interfaz`);
console.log(`   escalera de ${NIVELES_DBFS.length} escalones: ${NIVELES_DBFS[0]} a `
  + `${NIVELES_DBFS[NIVELES_DBFS.length - 1]} dBFS de 3 en 3, ${SEG_POR_ESCALON} s cada uno`);
console.log(`   se barren ${UMBRALES.length} umbrales: ${UMBRALES.join(', ')}`);
console.log(`   relacion fija en ${RELACION} (el item 117 la midio en 5,85:1)`);
console.log('   la rodilla sale del CRUCE de las dos rectas, no del escalon');
console.log(`   rodilla (softknee) = ${softknee}: se lee y NO se toca`);
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

    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    // La compensacion neutralizada: el item 110 se comio una corrida por esto.
    t.enviar(codificarSetd(`i.${n}.dyn.outgain`, 0.3334960938));
    // Tiempos al minimo: cada escalon tiene que llegar asentado.
    t.enviar(codificarSetd(`i.${n}.dyn.attack`, 0));
    t.enviar(codificarSetd(`i.${n}.dyn.release`, 0));
    t.enviar(codificarSetd(RUTA_UMBRAL, UMBRALES[Math.floor(UMBRALES.length / 2)]!));
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

    // --- el barrido de UMBRALES ----------------------------------------------
    t.enviar(codificarSetd(RUTA_PUENTE, 0));
    t.enviar(codificarSetd(RUTA_RELACION, RELACION));
    await new Promise((r) => { setTimeout(r, 1200); });
    console.log('');
    console.log(`=== LA RODILLA, UMBRAL POR UMBRAL (relacion fija en ${RELACION}) ===`);
    console.log('  crudo | pend. abajo | pend. arriba | RODILLA (cruce) | escalones a cada lado');
    const crudos: number[] = [];
    const rodillas: number[] = [];
    const pendientesArriba: number[] = [];
    const curvas: number[][] = [];
    for (const u of UMBRALES) {
      t.enviar(codificarSetd(RUTA_UMBRAL, u));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sal = await medirEscalera(`u-${u}`);
      if (sal === null) { console.log(`  ${u} -> no se pudo leer la escalera`); continue; }
      const p = partirEnLaRodilla(entrada, sal);
      if (p === null) { console.log(`  ${u} -> no se encontro rodilla`); continue; }
      const abajoN = p.iRodilla;
      const arribaN = entrada.length - p.iRodilla;
      const dentro = abajoN >= C4_MINIMO_POR_LADO && arribaN >= C4_MINIMO_POR_LADO;
      console.log(`  ${u.toFixed(2)}  | ${p.abajo.toFixed(3).padStart(11)} | `
        + `${p.arriba.toFixed(3).padStart(12)} | ${p.cruceDbfs.toFixed(2).padStart(10)} dBFS | `
        + `${abajoN} abajo / ${arribaN} arriba${dentro ? '' : '   <- FUERA, se descarta'}`);
      console.log(`         entrada->salida: ${entrada.map((x, k) =>
        `${x}:${sal[k]!.toFixed(1)}`).join('  ')}`);
      if (!dentro || !Number.isFinite(p.cruceDbfs)) continue;
      crudos.push(u); rodillas.push(p.cruceDbfs); pendientesArriba.push(p.arriba);
      curvas.push(sal);
    }

    c3 = crudos.length >= 4;
    console.log('');
    console.log(`C3 la rodilla cae dentro de la escalera: ${crudos.length} de `
      + `${UMBRALES.length} umbrales utiles -> ${c3 ? 'PASA' : 'FALLA'}`);
    if (!c3) throw new Error('C3 FALLA: quedan menos de cuatro umbrales utiles.');

    // --- LO QUE LA CURVA DOBLADA OBLIGA A INFORMAR ---------------------------
    console.log('');
    console.log('=== LA CURVA NO SON DOS RECTAS, Y HAY QUE DECIRLO ===');
    console.log('   pendiente LOCAL cada 3 dB, por encima del codo:');
    for (let u = 0; u < crudos.length; u++) {
      const sal = curvas[u]!;
      const locales: string[] = [];
      for (let k = 6; k + 1 < entrada.length; k++) {
        locales.push(((sal[k + 1]! - sal[k]!) / 3).toFixed(2));
      }
      console.log(`   umbral ${crudos[u]!.toFixed(2)}: ${locales.join('  ')}`);
    }
    console.log('   La pendiente SUBE con el nivel: comprime mas fuerte pegado al codo');
    console.log('   y cada vez menos a medida que la señal crece. Por eso el ajuste por');
    console.log('   dos rectas no aisla el umbral, y por eso se mide alineando.');

    // --- el umbral, alineando las curvas de reduccion ------------------------
    const cruce = (sal: readonly number[], objetivo: number): number | null => {
      for (let k = 1; k < entrada.length; k++) {
        const antes = sinComp[k - 1]! - sal[k - 1]!;
        const ahora = sinComp[k]! - sal[k]!;
        if (antes < objetivo && objetivo <= ahora) {
          const f = (objetivo - antes) / (ahora - antes);
          return entrada[k - 1]! + f * (entrada[k]! - entrada[k - 1]!);
        }
      }
      return null;
    };

    console.log('');
    console.log('=== EL UMBRAL, ALINEANDO LAS CURVAS DE REDUCCION ===');
    const pendientes: number[] = [];
    for (const objetivo of REDUCCIONES_DE_LECTURA) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let u = 0; u < crudos.length; u++) {
        const c = cruce(curvas[u]!, objetivo);
        if (c === null) continue;
        xs.push(crudos[u]!); ys.push(c);
      }
      if (xs.length < 4) {
        console.log(`   reduccion ${objetivo} dB: solo ${xs.length} puntos, se descarta`);
        continue;
      }
      const m = pendiente(xs, ys);
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const res = Math.max(...xs.map((x, k) => Math.abs(ys[k]! - (my + m * (x - mx)))));
      pendientes.push(m);
      console.log(`   --- el nivel al que la reduccion llega a ${objetivo} dB ---`);
      for (let k = 0; k < xs.length; k++) {
        console.log(`      crudo ${xs[k]!.toFixed(2)} -> ${ys[k]!.toFixed(2)} dBFS`);
      }
      console.log(`      pendiente ${m.toFixed(1)} dB por unidad | residuo max `
        + `${res.toFixed(2)} dB | ${xs.length} puntos | cociente contra el cliente `
        + `${(m / PENDIENTE_DEL_CLIENTE).toFixed(3)}`);
      if (res > L1_RESIDUO_MAXIMO_DB) {
        console.log(`      L1 FALLA: residuo ${res.toFixed(2)} sobre el tope `
          + `${L1_RESIDUO_MAXIMO_DB}`);
      }
    }

    // --- C4: el metodo no depende de a que reduccion se lea ------------------
    console.log('');
    const maxP = Math.max(...pendientes);
    const minP = Math.min(...pendientes);
    const dispersion = (maxP - minP) / ((maxP + minP) / 2);
    c4 = pendientes.length >= 2 && dispersion <= C4_DISPERSION_MAXIMA;
    console.log(`C4 el metodo no depende de la lectura: las ${pendientes.length} pendientes `
      + `van de ${minP.toFixed(1)} a ${maxP.toFixed(1)}, dispersion `
      + `${(dispersion * 100).toFixed(1)}% (tope ${(C4_DISPERSION_MAXIMA * 100).toFixed(0)}%) `
      + `-> ${c4 ? 'PASA' : 'FALLA'}`);
    if (!c4) {
      throw new Error('C4 FALLA: la pendiente depende de a que reduccion se lea, asi que la '
        + 'curva de reduccion NO es invariante y alinearlas no mide el umbral.');
    }

    const m = pendientes.reduce((a, b) => a + b, 0) / pendientes.length;
    console.log('');
    console.log('=== LA PENDIENTE DEL UMBRAL ===');
    console.log(`   MEDIDA: ${m.toFixed(1)} dB por unidad de crudo`);
    console.log(`   el cliente dice ${PENDIENTE_DEL_CLIENTE} (VtoTHRESH = −90 + 96a)`);
    console.log(`   cociente ${(m / PENDIENTE_DEL_CLIENTE).toFixed(3)}`);
    console.log('');
    if (Math.abs(m - PENDIENTE_DEL_CLIENTE) <= PENDIENTE_DEL_CLIENTE * L2_TOLERANCIA) {
      console.log('   L2 PASA: la pendiente del cliente queda CONFIRMADA.');
      console.log('');
      console.log('   Y conviene decir lo que eso significa. `VtoTHRESH` figura como');
      console.log('   REFUTADA en la tabla de conversion, pero el item 97 refuto la');
      console.log('   CONJUNCION --umbral + relacion + rodilla dura--, y el 117 midio que');
      console.log('   el error estaba en la relacion. El umbral nunca se habia probado');
      console.log('   solo. Esta corrida lo prueba solo, y aguanta.');
      console.log('');
      console.log('   Lo que NO se confirma es el CERO de la escala: este banco no tiene');
      console.log('   con que anclar la escala interna de la consola, y el contrato lo');
      console.log('   dice desde antes de medir.');
    } else {
      console.log('   L2 NO PASA: la pendiente medida se aparta de la del cliente, y esta');
      console.log('   vez la refutacion SI seria del umbral solo.');
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
console.log(`   Un tono de ${HZ} Hz, UNA relacion (${RELACION}), un canal, un dia.`);
console.log('   Se mide LA PENDIENTE del umbral, no su cero: este banco no tiene con');
console.log('   que anclar la escala interna de la consola, y el contrato lo dice desde');
console.log('   antes de medir. Nada de la rodilla blanda. Nada del umbral de la puerta,');
console.log('   que usa la misma funcion del cliente y no se prueba aca.');
if (!(c1 && c2 && c3 && c4)) {
  console.log('');
  console.log('NO SE PUBLICA NINGUNA PENDIENTE: fallo algun control.');
  process.exitCode = 1;
}
