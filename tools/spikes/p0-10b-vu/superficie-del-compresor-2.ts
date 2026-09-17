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
const UMBRAL_DE_LA_SUPERFICIE = 0.35;
/** Las ocho posiciones del control de relacion. */
const RELACIONES = [1.0, 0.75, 0.5, 0.35, 0.25, 0.15, 0.10, 0.05] as const;
/**
 * C3: donde se considera que EMPIEZA el codo, y cuanto puede moverse.
 *
 * **La primera version buscaba «donde la reduccion llega a 2 dB», y eso esta mal
 * por construccion.** Una relacion suave tarda muchisimo exceso en acumular 2 dB:
 * con el control en 0,75 la curva entera llega apenas a 2,0 en el ultimo escalon.
 * Asi que ese nivel no marca el codo, marca la pendiente. El defecto se ve sin
 * mirar ningun dato --sale de la definicion-- y por eso se corrige, igual que el
 * control positivo mal planteado del item 110.
 *
 * El codo es donde la reduccion **se despega de cero**. Se toma 0,3 dB, que esta
 * tres veces por encima del ruido de la envolvente en este banco.
 *
 * **Y el tope sale del instrumento, no del resultado**: la escalera tiene
 * escalones de 3 dB, asi que el codo no se puede ubicar mejor que un escalon.
 * Pedir 1,5 era pedirle al instrumento el doble de lo que puede dar.
 */
const C3_DESPEGUE_DB = 0.3;
const C3_CODO_MAXIMO_DB = 3.0;
/** C4: la invariancia se comprueba OTRA VEZ, con otra relacion y otros umbrales. */
const RELACION_DE_CONTROL = 0.35;
const UMBRALES_DE_CONTROL = [0.30, 0.35, 0.40] as const;
const C4_INVARIANCIA_MAXIMA_DB = 1.0;
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
console.log(`   se barren ${RELACIONES.length} relaciones: ${RELACIONES.join(', ')}`);
console.log(`   umbral fijo en ${UMBRAL_DE_LA_SUPERFICIE} para la superficie`);
console.log(`   y la invariancia se comprueba otra vez con la relacion `
  + `${RELACION_DE_CONTROL} en ${UMBRALES_DE_CONTROL.length} umbrales`);
console.log('   el codo sale de donde la reduccion cruza 2 dB, no de ajustar rectas');
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
    t.enviar(codificarSetd(RUTA_UMBRAL, UMBRAL_DE_LA_SUPERFICIE));
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

    // --- el barrido de RELACIONES --------------------------------------------
    t.enviar(codificarSetd(RUTA_PUENTE, 0));
    t.enviar(codificarSetd(RUTA_UMBRAL, UMBRAL_DE_LA_SUPERFICIE));
    await new Promise((r) => { setTimeout(r, 1200); });

    const reduccion = (sal: readonly number[]): number[] =>
      sal.map((v, k) => Math.max(0, sinComp[k]! - v));
    /** El nivel donde la reduccion cruza `objetivo`, interpolando. */
    const cruce = (sal: readonly number[], objetivo: number): number | null => {
      const red = reduccion(sal);
      for (let k = 1; k < entrada.length; k++) {
        if (red[k - 1]! < objetivo && objetivo <= red[k]!) {
          const f = (objetivo - red[k - 1]!) / (red[k]! - red[k - 1]!);
          return entrada[k - 1]! + f * (entrada[k]! - entrada[k - 1]!);
        }
      }
      return null;
    };

    console.log('');
    console.log(`=== LA SUPERFICIE (umbral fijo en ${UMBRAL_DE_LA_SUPERFICIE}) ===`);
    const codos: number[] = [];
    const curvasPorRelacion = new Map<number, number[]>();
    for (const rel of RELACIONES) {
      t.enviar(codificarSetd(RUTA_RELACION, rel));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sal = await medirEscalera(`rel-${rel}`);
      if (sal === null) { console.log(`   relacion ${rel}: no se pudo leer`); continue; }
      const red = reduccion(sal);
      curvasPorRelacion.set(rel, red);
      const codo = cruce(sal, C3_DESPEGUE_DB);
      if (codo !== null) codos.push(codo);
      console.log(`   relacion ${rel.toFixed(2)} | codo(despegue) `
        + `${codo === null ? '  fuera' : `${codo.toFixed(2)} dBFS`} | reduccion: `
        + entrada.map((x, k) => `${x}:${red[k]!.toFixed(1)}`).join('  '));
    }

    // --- C3: el codo no se mueve con la relacion ------------------------------
    console.log('');
    const rangoCodos = codos.length >= 2 ? Math.max(...codos) - Math.min(...codos) : NaN;
    c3 = codos.length >= 5 && rangoCodos <= C3_CODO_MAXIMO_DB;
    console.log(`C3 el codo esta en el mismo sitio para todas: se movio `
      + `${rangoCodos.toFixed(2)} dB entre ${codos.length} relaciones `
      + `(tope ${C3_CODO_MAXIMO_DB}) -> ${c3 ? 'PASA' : 'FALLA'}`);
    if (!c3) {
      throw new Error('C3 FALLA: el codo depende de la relacion, asi que el umbral y la '
        + 'relacion no son dos ejes independientes y la superficie necesita otro.');
    }
    const codoMedio = codos.reduce((a, b) => a + b, 0) / codos.length;

    // --- la superficie, en exceso sobre el codo -------------------------------
    console.log('');
    console.log('=== REDUCCION CONTRA EXCESO SOBRE EL CODO ===');
    console.log('   (el codo medido esta en ' + codoMedio.toFixed(2) + ' dBFS)');
    const excesos = entrada.map((x) => x - codoMedio).filter((x) => x > -1);
    console.log('   exceso dB |' + excesos.map((x) => x.toFixed(1).padStart(7)).join(''));
    for (const [rel, red] of curvasPorRelacion) {
      const desde = entrada.length - excesos.length;
      console.log(`   rel ${rel.toFixed(2)}   |`
        + red.slice(desde).map((v) => v.toFixed(1).padStart(7)).join(''));
    }

    // --- L3: el techo del item 98 --------------------------------------------
    console.log('');
    console.log('=== L3 — LA REDUCCION MAXIMA CONTRA EL TECHO DEL ITEM 98 ===');
    console.log('   relacion | reduccion maxima alcanzada | techo -20*log10(a) | alcanzado');
    for (const [rel, red] of curvasPorRelacion) {
      const maxima = Math.max(...red);
      const techo = rel > 0 ? -20 * Math.log10(rel) : Infinity;
      console.log(`   ${rel.toFixed(2)}     | ${maxima.toFixed(1).padStart(22)} dB | `
        + `${(Number.isFinite(techo) ? techo.toFixed(1) : 'inf').padStart(14)} dB | `
        + `${(maxima / techo * 100).toFixed(0)}%`);
    }
    console.log('   Sin tope: es una comprobacion cruzada con el item 98, que midio esto');
    console.log('   con otro metodo --barriendo el umbral y con el medidor de la consola--.');

    // --- C4: la invariancia contra el umbral, con OTRA relacion ---------------
    console.log('');
    console.log('=== C4 — LA INVARIANCIA CONTRA EL UMBRAL, CON OTRA RELACION ===');
    t.enviar(codificarSetd(RUTA_RELACION, RELACION_DE_CONTROL));
    const curvasPorUmbral: { umbral: number; codo: number; red: number[] }[] = [];
    for (const u of UMBRALES_DE_CONTROL) {
      t.enviar(codificarSetd(RUTA_UMBRAL, u));
      await new Promise((r) => { setTimeout(r, 1200); });
      const sal = await medirEscalera(`inv-${u}`);
      if (sal === null) continue;
      const codo = cruce(sal, C3_DESPEGUE_DB);
      if (codo === null) { console.log(`   umbral ${u}: el codo queda fuera`); continue; }
      curvasPorUmbral.push({ umbral: u, codo, red: reduccion(sal) });
      console.log(`   umbral ${u.toFixed(2)} | codo ${codo.toFixed(2)} dBFS`);
    }
    // Se comparan a igual EXCESO, interpolando la reduccion de cada una.
    let peor = 0;
    if (curvasPorUmbral.length >= 2) {
      const redEnExceso = (c: { codo: number; red: number[] }, ex: number): number | null => {
        const nivel = c.codo + ex;
        for (let k = 1; k < entrada.length; k++) {
          if (entrada[k - 1]! <= nivel && nivel <= entrada[k]!) {
            const f = (nivel - entrada[k - 1]!) / (entrada[k]! - entrada[k - 1]!);
            return c.red[k - 1]! + f * (c.red[k]! - c.red[k - 1]!);
          }
        }
        return null;
      };
      console.log('   exceso | ' + curvasPorUmbral.map((c) => `u=${c.umbral}`).join(' | '));
      for (const ex of [3, 6, 9, 12]) {
        const vs = curvasPorUmbral.map((c) => redEnExceso(c, ex));
        if (vs.some((v) => v === null)) continue;
        const nums = vs as number[];
        peor = Math.max(peor, Math.max(...nums) - Math.min(...nums));
        console.log(`   ${String(ex).padStart(5)}  | `
          + nums.map((v) => v.toFixed(2)).join(' | '));
      }
    }
    c4 = curvasPorUmbral.length >= 2 && peor <= C4_INVARIANCIA_MAXIMA_DB;
    console.log(`   la mayor diferencia a igual exceso: ${peor.toFixed(2)} dB `
      + `(tope ${C4_INVARIANCIA_MAXIMA_DB}) -> ${c4 ? 'PASA' : 'FALLA'}`);
    if (!c4) {
      throw new Error('C4 FALLA: la reduccion NO depende solo del exceso, asi que la '
        + 'superficie necesita un eje mas y esta tabla no se puede usar en otro umbral.');
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
console.log(`   Un tono de ${HZ} Hz, UN umbral (${UMBRAL_DE_LA_SUPERFICIE}) para la`);
console.log(`   superficie, ${RELACIONES.length} relaciones, un canal, un dia.`);
console.log('   La superficie se publica en EXCESO sobre el codo, y eso vale porque C4');
console.log('   comprueba que la reduccion dependa solo del exceso. Sin C4, esta tabla');
console.log('   no se podria usar en otro umbral.');
console.log('   Nada del CERO del umbral, que sigue sin ancla. Nada de los tiempos: la');
console.log('   escalera se lee asentada. Nada de la rodilla blanda. Nada con señal real,');
console.log('   y con la curva doblada esa diferencia importa mas que antes: un tono se');
console.log('   queda en un nivel y una voz no.');
if (!(c1 && c2 && c3 && c4)) {
  console.log('');
  console.log('NO SE PUBLICA NINGUNA PENDIENTE: fallo algun control.');
  process.exitCode = 1;
}
