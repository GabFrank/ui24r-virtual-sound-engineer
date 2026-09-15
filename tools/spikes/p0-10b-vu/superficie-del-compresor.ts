/**
 * La superficie del compresor: umbral × relación.
 *
 * **Contrato:** `docs/compromisos/98-superficie-del-compresor.md`, segunda
 * versión, reescrito por un auditor de expectativas en contexto fresco. Este
 * guion implementa ese contrato y no otro: si algo de acá no está allá, sobra.
 *
 * **Qué mide y por qué el método es éste.** La 97 refutó el modelo del
 * compresor y dejó dos cortes que no se reconcilian. Acá se mide la reducción
 * como **caída de nivel** —no despejada de una rodilla, que arrastra 1,09 dB de
 * sesgo del piso del medidor de reducción— con una **referencia de `ratio = 1`
 * por cada umbral**. La referencia no es `dyn.bypass` a propósito: puentear saca
 * el bloque con su ganancia de compensación y la diferencia mezclaría reducción
 * con compensación.
 *
 * **La hipótesis que se pone a prueba, y que el auditor construyó antes de
 * medir:** truncando `−20·log₁₀(a)` a la escalera del medidor de reducción, los
 * tres casos de la 97 coinciden exactamente (5,65 · 11,65 · 19,65). O sea que
 * `−20·log₁₀(a)` **es el techo de la reducción**, y las mesetas de la 97 son ese
 * techo.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/superficie-del-compresor.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, dbDeReduccion,
  MEDIDOR_RANGO_DB, VU_ESCALA,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');

const HZ = 1000;
const FM = 48000;

/** Los dos pasos, derivados. Nunca escritos: son la resolución de todo esto. */
const ESCALON_NIVEL_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
const ESCALON_REDUCCION_DB = (dbDeReduccion(240) - dbDeReduccion(246)) / 6;
const PISO_REDUCCION_DB = dbDeReduccion(246);

/**
 * Umbral de comparación cuando las dos cantidades salen del **mismo** medidor.
 *
 * Dos escalones, porque toda reducción de esta corrida es una diferencia de dos
 * lecturas enteras. Cuatro lecturas —una diferencia de diferencias— arrastran
 * `4 × medio escalón`, que da el mismo número; conviene decirlo porque el lector
 * va a sumar mal.
 */
const TOLERANCIA_MISMO_MEDIDOR = 2 * ESCALON_NIVEL_DB;

/**
 * Y cuando se compara una caída de nivel contra una lectura de reducción.
 *
 * Los pasos son distintos: `2 × 0,3334 + 0,6668`. El contrato en su primera
 * versión usaba dos escalones acá, o sea **la mitad**, y eso habría hecho
 * descartar una corrida buena.
 */
const TOLERANCIA_CRUZANDO_MEDIDORES = 2 * ESCALON_NIVEL_DB + ESCALON_REDUCCION_DB;

/** Precondición de montaje: el `pre` de las tres corridas de la 97. */
const PRE_ESPERADO_DB = -37.66;

/** Byte de `entrada` por debajo del cual el punto se anula: tres sobre el piso. */
const BYTE_MINIMO_ENTRADA = 16;

/** La rejilla del contrato. La densidad está en la rampa, entre el cruce y 0,42. */
const UMBRALES = [0.14, 0.26, 0.35, 0.42, 0.4672, 0.50, 0.55];
const RAZONES = [0.9, 0.7, 0.5, 0.35, 0.25, 0.15, 0.10, 0.05];

/** El umbral de control: 0,8 dB **por encima** del cruce medido (0,5414). */
const UMBRAL_DE_CONTROL = 0.55;

/** Los cortes de la 97 que hay que reproducir. S5a, mismo método e instrumento. */
const CORTE_014: ReadonlyMap<number, number> = new Map([
  [0.9, 1.00], [0.7, 3.00], [0.5, 6.00], [0.25, 11.67],
  [0.15, 16.00], [0.10, 19.00], [0.05, 24.34],
]);

/**
 * S5b: el corte de 0,4672 con la conversión de instrumento a la vista.
 *
 * El 2,98 de la 97 es un peldaño truncado **hacia abajo**, así que la reducción
 * real está en `[2,98 ; 3,65)` y la caída que se mida carga la tolerancia
 * encima.
 */
const CORTE_04672 = { a: 0.5, min: 2.31, max: 4.31 };

function tono(segundos: number): string {
  const muestras = FM * segundos;
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
  const ruta = join(tmpdir(), 'vse-superficie.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

interface Lectura {
  readonly pre: number;
  readonly entrada: number;
  readonly dinEntrada: number;
  readonly dinSalida: number;
  readonly reduccionDb: number;
  readonly byteEntrada: number;
  /** `false` en algún cuadro = la puerta se cerró y el punto no vale. */
  readonly puertaAbiertaSiempre: boolean;
  readonly cuadros: number;
}

const t = new Ui24rTransport();
let cuadros: {
  pre: number; entrada: number; dinEntrada: number; dinSalida: number;
  reduccionDb: number; puerta: boolean;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  cuadros.push({
    pre: c.pre, entrada: c.entrada,
    dinEntrada: c.dinamicoEntrada, dinSalida: c.dinamicoSalida,
    reduccionDb: c.reduccionDb, puerta: c.indicadorDePuerta,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

/**
 * Una lectura de la ventana, con el estado de la puerta en **todos** los cuadros.
 *
 * **Por qué `puertaAbiertaSiempre` y no un promedio.** La puerta es un booleano:
 * promediarlo daría 0,7 y no significaría nada. Lo que importa es si se cerró
 * **alguna vez** en la ventana, porque en ese cuadro `entrada` trae atenuación
 * de la puerta y esta corrida la contaría como reducción del compresor.
 *
 * Devuelve `NaN` en los niveles si no llegó ningún cuadro, y `cuadros: 0` lo
 * dice. Es deliberado: un promedio de cero cuadros dando 0 sería indistinguible
 * de un nivel de 0, que es el tope de la escala.
 */
async function leer(ms = 2000): Promise<Lectura> {
  cuadros = [];
  await new Promise((r) => setTimeout(r, ms));
  const xs = cuadros;
  const pre = media(xs.map((c) => c.pre));
  const entrada = media(xs.map((c) => c.entrada));
  return {
    pre, entrada,
    dinEntrada: media(xs.map((c) => c.dinEntrada)),
    dinSalida: media(xs.map((c) => c.dinSalida)),
    reduccionDb: media(xs.map((c) => c.reduccionDb)),
    byteEntrada: Number.isNaN(entrada) ? -1 : Math.round(entrada / VU_ESCALA),
    puertaAbiertaSiempre: xs.length > 0 && xs.every((c) => c.puerta),
    cuadros: xs.length,
  };
}

async function escribir(ruta: string, valor: number, esperaMs = 1500): Promise<void> {
  t.enviar(codificarSetd(ruta, valor));
  await new Promise((r) => setTimeout(r, esperaMs));
}

// ---------------------------------------------------------------- montaje

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

// Los previos se **exigen**: una lectura fallida no puede convertirse en una
// restauración inventada.
const PREVIO = {
  threshold: Number(exigirClave(e0, `i.${n}.dyn.threshold`)),
  ratio: Number(exigirClave(e0, `i.${n}.dyn.ratio`)),
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
};

console.log('=== 98 — LA SUPERFICIE DEL COMPRESOR: UMBRAL x RELACION ===');
console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz a -1 dBFS`);
console.log(`escalon del medidor de nivel:     ${ESCALON_NIVEL_DB.toFixed(6)} dB`);
console.log(`escalon del medidor de reduccion: ${ESCALON_REDUCCION_DB.toFixed(6)} dB`);
console.log(`piso del medidor de reduccion:    ${PISO_REDUCCION_DB.toFixed(4)} dB`);
console.log(`tolerancia mismo medidor:   ${TOLERANCIA_MISMO_MEDIDOR.toFixed(4)} dB`);
console.log(`tolerancia cruzando medidores: ${TOLERANCIA_CRUZANDO_MEDIDORES.toFixed(4)} dB`);
console.log('');

console.log('=== ESTADO DEL BANCO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves leidas por HTTP`);
for (const k of [
  `hw.${n}.gain`, `i.${n}.mix`, `i.${n}.mute`, `i.${n}.src`,
  `i.${n}.dyn.threshold`, `i.${n}.dyn.ratio`, `i.${n}.dyn.bypass`,
  `i.${n}.dyn.softknee`, `i.${n}.dyn.gain`, `i.${n}.dyn.outgain`, `i.${n}.dyn.hold`,
  `i.${n}.gate.enabled`, `i.${n}.gate.thresh`, `i.${n}.gate.depth`,
  `i.${n}.deesser.enabled`, `i.${n}.deesser.freq`, `i.${n}.deesser.threshold`,
  'm.afs.enabled', 'm.mix',
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}
// **`hw.N.gain` no se registro nunca en ninguna corrida del proyecto**, y un
// cambio de ganancia del previo mueve el cruce y desplaza los siete umbrales a
// la vez. Queda archivado para que la proxima pueda comparar.
const puertaHabilitada = e0.get(`i.${n}.gate.enabled`) === '1';
if (puertaHabilitada) {
  console.log('   AVISO: la puerta esta HABILITADA en este canal. Su atenuacion se leeria');
  console.log('   como compresion, y el testigo `pre` no la delata. Se vigila el bit 7 de +5.');
}
console.log('');

// ------------------------------------------------------- piso de ruido

console.log('=== PISO DE RUIDO DEL CANAL, con el tono apagado ===');
const piso = await leer(3000);
console.log(`   pre ${dbDeMedidor(piso.pre).toFixed(2)} dB, entrada `
  + `${dbDeMedidor(piso.entrada).toFixed(2)} dB, byte ${piso.byteEntrada}, `
  + `${piso.cuadros} cuadros`);
console.log('   Sin esta cifra, un piso de instrumento es indistinguible de una');
console.log('   saturacion del compresor, que es lo que esta corrida vino a decidir.');
const PISO_RUIDO_DB = dbDeMedidor(piso.entrada);
console.log('');

// ------------------------------------------------------------- la corrida

const sonando = spawn('afplay', [tono(1200)]);

interface Punto {
  readonly umbral: number;
  readonly a: number;
  readonly sentido: 'baja' | 'sube';
  readonly caidaDb: number;
  readonly informadaDb: number;
  readonly preDb: number;
  readonly byteEntrada: number;
  readonly dinEntradaDb: number;
  readonly dinSalidaDb: number;
  readonly puertaOk: boolean;
  readonly anulado: string | null;
  readonly cuadros: number;
}

const puntos: Punto[] = [];
const referencias: { umbral: number; entradaDb: number; preDb: number; cierre: number }[] = [];

await conRestauracion(
  () => {
    // Primero callar la fuente, después deshacer las escrituras: al revés, el
    // tono sigue sonando por el general mientras se escribe.
    sonando.kill();
    t.enviar(codificarSetd(`i.${n}.dyn.threshold`, PREVIO.threshold));
    t.enviar(codificarSetd(`i.${n}.dyn.ratio`, PREVIO.ratio));
    t.enviar(codificarSetd('m.afs.enabled', PREVIO.afs));
  },
  async () => {
    await escribir('m.afs.enabled', 0, 1200);
    console.log(`supresor del general: estaba en ${PREVIO.afs}, se apaga para medir`);
    await new Promise((r) => setTimeout(r, 3000));

    // --- precondición de `pre` -------------------------------------------
    await escribir(`i.${n}.dyn.ratio`, 1);
    const montaje = await leer(2500);
    const preDb = dbDeMedidor(montaje.pre);
    console.log('');
    console.log('=== PRECONDICION DE MONTAJE ===');
    console.log(`   pre = ${preDb.toFixed(2)} dB, esperado ${PRE_ESPERADO_DB} `
      + `+-${ESCALON_NIVEL_DB.toFixed(3)}`);
    if (Math.abs(preDb - PRE_ESPERADO_DB) > ESCALON_NIVEL_DB) {
      // **Se aborta lanzando, no con `process.exit`**: la excepción pasa por la
      // restauración y `process.exit` no. Está dicho en el docblock de
      // `con-restauracion.ts`.
      throw new Error(
        `el montaje no es el de la 97: pre = ${preDb.toFixed(2)} contra ${PRE_ESPERADO_DB}. `
        + 'La rejilla entera depende de este nivel --que 0,55 este sobre el cruce y que '
        + '0,14 de 38 dB de exceso-- asi que no se corre. Ninguna comparacion con la 97 valdria.',
      );
    }
    console.log('   PASA. El montaje es comparable con la 97.');

    // --- asentamiento, comprobado y no asumido ----------------------------
    console.log('');
    console.log('=== ASENTAMIENTO, en un punto profundo (u = 0,14, a = 0,05) ===');
    console.log('   Los tiempos de ataque y relajacion NO se midieron nunca (C5 de la 97),');
    console.log('   asi que los 6 s no tienen respaldo y hay que comprobarlos.');
    await escribir(`i.${n}.dyn.threshold`, 0.14);
    await escribir(`i.${n}.dyn.ratio`, 0.05, 0);
    const t0 = Date.now();
    const asentamiento: { ms: number; entradaDb: number }[] = [];
    for (const objetivo of [2000, 4000, 6000, 10000]) {
      const falta = objetivo - (Date.now() - t0);
      if (falta > 0) await new Promise((r) => setTimeout(r, falta));
      const l = await leer(800);
      asentamiento.push({ ms: Date.now() - t0, entradaDb: dbDeMedidor(l.entrada) });
    }
    for (const a of asentamiento) {
      console.log(`   ${String(a.ms).padStart(6)} ms -> entrada ${a.entradaDb.toFixed(2)} dB`);
    }
    const ultimos = asentamiento.slice(-2);
    const deriva = Math.abs(ultimos[0]!.entradaDb - ultimos[1]!.entradaDb);
    const VENTANA_MS = deriva > TOLERANCIA_MISMO_MEDIDOR ? 6000 : 3000;
    console.log(`   deriva entre 6 y 10 s: ${deriva.toFixed(2)} dB `
      + `-> ventana de asentamiento ${VENTANA_MS} ms`);

    // --- la rejilla, bloque por umbral, en los dos sentidos ---------------
    console.log('');
    console.log('=== LA REJILLA ===');
    console.log('umbral |   a  | sent |  entrada | caida | informada | resid | '
      + 'pre    | dinE   | dinS   | byte | puerta | n');

    for (const u of UMBRALES) {
      await escribir(`i.${n}.dyn.threshold`, u);
      await escribir(`i.${n}.dyn.ratio`, 1, VENTANA_MS);
      const ref = await leer();
      const refDb = dbDeMedidor(ref.entrada);

      for (const sentido of ['baja', 'sube'] as const) {
        const orden = sentido === 'baja' ? RAZONES : [...RAZONES].reverse();
        for (const a of orden) {
          await escribir(`i.${n}.dyn.ratio`, a, VENTANA_MS);
          const l = await leer();
          const caida = refDb - dbDeMedidor(l.entrada);

          // Guardas de rango, decididas antes de medir.
          const anulado = l.cuadros === 0 ? 'sin cuadros'
            : l.byteEntrada < BYTE_MINIMO_ENTRADA ? `byte ${l.byteEntrada} bajo el minimo`
            : l.reduccionDb >= 40 ? 'reduccion en el techo de 40, no es un dato'
            : dbDeMedidor(l.entrada) < PISO_RUIDO_DB + 6 ? 'a menos de 6 dB del piso de ruido'
            : !l.puertaAbiertaSiempre ? 'la puerta se cerro en algun cuadro'
            : null;

          puntos.push({
            umbral: u, a, sentido, caidaDb: caida, informadaDb: l.reduccionDb,
            preDb: dbDeMedidor(l.pre), byteEntrada: l.byteEntrada,
            dinEntradaDb: dbDeMedidor(l.dinEntrada), dinSalidaDb: dbDeMedidor(l.dinSalida),
            puertaOk: l.puertaAbiertaSiempre, anulado, cuadros: l.cuadros,
          });

          console.log(`${u.toFixed(4).padStart(6)} | ${a.toFixed(2)} | ${sentido.padEnd(4)} | `
            + `${dbDeMedidor(l.entrada).toFixed(2).padStart(8)} | ${caida.toFixed(2).padStart(5)} | `
            + `${l.reduccionDb.toFixed(2).padStart(9)} | `
            + `${(l.reduccionDb - caida).toFixed(2).padStart(5)} | `
            + `${dbDeMedidor(l.pre).toFixed(2).padStart(6)} | `
            + `${dbDeMedidor(l.dinEntrada).toFixed(2).padStart(6)} | `
            + `${dbDeMedidor(l.dinSalida).toFixed(2).padStart(6)} | `
            + `${String(l.byteEntrada).padStart(4)} | `
            + `${(l.puertaAbiertaSiempre ? 'ok' : 'CERRO').padEnd(6)} | ${String(l.cuadros).padStart(3)}`
            + (anulado === null ? '' : `   ANULADO: ${anulado}`));
        }
      }

      // La referencia se repite al final del bloque: si se movió, la deriva
      // contaminó todo el bloque y no sólo un punto.
      await escribir(`i.${n}.dyn.ratio`, 1, VENTANA_MS);
      const cierre = await leer();
      referencias.push({
        umbral: u, entradaDb: refDb, preDb: dbDeMedidor(ref.pre),
        cierre: dbDeMedidor(cierre.entrada),
      });
      console.log(`  -> referencia de u=${u}: apertura ${refDb.toFixed(2)} dB, `
        + `cierre ${dbDeMedidor(cierre.entrada).toFixed(2)} dB, `
        + `deriva ${Math.abs(refDb - dbDeMedidor(cierre.entrada)).toFixed(2)} dB`);
    }
  },
);

await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

// ------------------------------------------------------------ veredictos

const utiles = puntos.filter((p) => p.anulado === null);
const anulados = puntos.filter((p) => p.anulado !== null);

console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 98 ===');
console.log(`   ${utiles.length} puntos utiles de ${puntos.length}; ${anulados.length} anulados`);
for (const p of anulados) {
  console.log(`     u=${p.umbral} a=${p.a} ${p.sentido}: ${p.anulado}`);
}
console.log('');

// S1 — las referencias coinciden entre sí
{
  const xs = referencias.map((r) => r.entradaDb);
  const peor = Math.max(...xs) - Math.min(...xs);
  console.log(`S1 referencias de ratio=1 entre si: ${peor.toFixed(2)} dB `
    + `(${(peor / ESCALON_NIVEL_DB).toFixed(2)} escalones)`);
  console.log(peor <= TOLERANCIA_MISMO_MEDIDOR
    ? '   PASA. El umbral por si solo no mueve el nivel.'
    : '   FALLA. El umbral hace algo por si solo: esta corrida mide CAMBIO DE GANANCIA\n'
      + '   del bloque dinamico, no reduccion. No se declara nada sobre la ley.');
  for (const r of referencias) {
    const d = Math.abs(r.entradaDb - r.cierre);
    if (d > ESCALON_NIVEL_DB) {
      console.log(`   AVISO u=${r.umbral}: la referencia se movio ${d.toFixed(2)} dB entre `
        + 'apertura y cierre. El bloque entero queda en duda.');
    }
  }
}

// S2 — el testigo
{
  const xs = puntos.map((p) => p.preDb).filter((v) => !Number.isNaN(v));
  const peor = Math.max(...xs) - Math.min(...xs);
  console.log('');
  console.log(`S2 deriva del testigo pre: ${peor.toFixed(2)} dB `
    + `(${(peor / ESCALON_NIVEL_DB).toFixed(2)} escalones)`);
  console.log(peor <= TOLERANCIA_MISMO_MEDIDOR ? '   PASA.' : '   FALLA: la fuente se movio.');
}

// S3 y S4 — no decrece, y donde deja de crecer
for (const [etiqueta, agrupar, variar] of [
  ['S3 al bajar a, con el umbral fijo', 'umbral', 'a'],
  ['S4 al bajar el umbral, con a fija', 'a', 'umbral'],
] as const) {
  console.log('');
  console.log(`${etiqueta} (la columna u=${UMBRAL_DE_CONTROL} queda excluida):`);
  const claves = [...new Set(utiles
    .filter((p) => p.umbral !== UMBRAL_DE_CONTROL)
    .map((p) => p[agrupar]))];
  for (const k of claves) {
    const serie = utiles
      .filter((p) => p[agrupar] === k && p.umbral !== UMBRAL_DE_CONTROL && p.sentido === 'baja')
      .sort((x, y) => y[variar] - x[variar]);
    if (serie.length < 2) continue;
    let peorRetroceso = 0; let meseta: number | null = null;
    for (let i = 1; i < serie.length; i++) {
      const d = serie[i]!.caidaDb - serie[i - 1]!.caidaDb;
      if (-d > peorRetroceso) peorRetroceso = -d;
      if (meseta === null && Math.abs(d) < TOLERANCIA_MISMO_MEDIDOR) {
        meseta = serie[i]![variar];
      }
    }
    console.log(`   ${agrupar}=${k}: retroceso maximo ${peorRetroceso.toFixed(2)} dB, `
      + `meseta desde ${variar}=${meseta === null ? 'no aparece' : meseta}`
      + (peorRetroceso > TOLERANCIA_MISMO_MEDIDOR ? '   <-- FALLA' : ''));
  }
}

// La columna de control
{
  console.log('');
  const control = puntos.filter((p) => p.umbral === UMBRAL_DE_CONTROL && p.anulado === null);
  const peor = control.length === 0 ? NaN : Math.max(...control.map((p) => Math.abs(p.caidaDb)));
  console.log(`COLUMNA DE CONTROL u=${UMBRAL_DE_CONTROL} (0,8 dB sobre el cruce): `
    + `${control.length} puntos, caida maxima ${peor.toFixed(2)} dB`);
  console.log(peor <= TOLERANCIA_MISMO_MEDIDOR
    ? '   PASA: la relacion por si sola no hace nada por debajo del umbral.'
    : '   FALLA: hay compresion sobre el cruce. Primera sospecha, dyn.softknee, que no\n'
      + '   se barre. Estos puntos no se usan para nada mas.');
}

// S5a — el corte de 0,14
{
  console.log('');
  console.log('S5a el corte de u=0,14 se reproduce (mismo metodo, mismo instrumento):');
  let fuera = 0;
  for (const [a, esperado] of CORTE_014) {
    const p = utiles.find((x) => x.umbral === 0.14 && x.a === a && x.sentido === 'baja');
    if (p === undefined) { console.log(`   a=${a}: sin punto util`); fuera++; continue; }
    const d = Math.abs(p.caidaDb - esperado);
    if (d > TOLERANCIA_MISMO_MEDIDOR) fuera++;
    console.log(`   a=${String(a).padEnd(5)} medido ${p.caidaDb.toFixed(2).padStart(6)} `
      + `contra ${esperado.toFixed(2).padStart(6)} de la 97 -> ${d.toFixed(2)} dB`
      + (d > TOLERANCIA_MISMO_MEDIDOR ? '   FUERA' : ''));
  }
  console.log(fuera <= 1
    ? `   PASA (${fuera} fuera de tolerancia, se admite hasta 1).`
    : `   FALLA: ${fuera} puntos fuera. Ocho puntos no se desvian todos por casualidad:\n`
      + '   ESTO pone en duda la corrida entera.');
}

// S5b — el corte de 0,4672, cruzando instrumentos
{
  console.log('');
  const p = utiles.find((x) => x.umbral === 0.4672 && x.a === CORTE_04672.a && x.sentido === 'baja');
  if (p === undefined) {
    console.log('S5b sin punto util en u=0,4672 a=0,5');
  } else {
    const dentro = p.caidaDb >= CORTE_04672.min && p.caidaDb <= CORTE_04672.max;
    console.log(`S5b el corte de u=0,4672: caida ${p.caidaDb.toFixed(2)} dB, banda honesta `
      + `[${CORTE_04672.min} ; ${CORTE_04672.max}] (valor esperado ~3,31)`);
    console.log(dentro
      ? '   PASA.'
      : '   FALLA. Si S5a paso, lo que cambio NO es el banco: es la correspondencia entre\n'
        + '   los dos medidores en ese umbral. Se informa asi, no como duda sobre la corrida.');
  }
}

// S6 — el signo de los residuos
{
  console.log('');
  const conReduccion = utiles.filter((p) => p.informadaDb > PISO_REDUCCION_DB / 2);
  const resid = conReduccion.map((p) => p.informadaDb - p.caidaDb);
  const positivos = resid.filter((r) => r > ESCALON_NIVEL_DB).length;
  const muyNegativos = resid.filter((r) => r < -TOLERANCIA_CRUZANDO_MEDIDORES).length;
  console.log(`S6 residuos informada-caida en ${resid.length} puntos: `
    + `${positivos} positivos sobre +${ESCALON_NIVEL_DB.toFixed(3)}, `
    + `${muyNegativos} bajo -${TOLERANCIA_CRUZANDO_MEDIDORES.toFixed(3)}`);
  console.log(positivos === 0 && muyNegativos === 0
    ? '   PASA: el medidor informa igual o menos que la caida, como el truncado predice.'
    : '   FALLA. Un residuo positivo contradice el truncado que fijo la 97; uno muy\n'
      + '   negativo contradice la calibracion o delata compensacion que sigue a la relacion.');
}

// S7 — el techo
{
  console.log('');
  console.log('S7 -20log10(a) es el TECHO de la reduccion:');
  let superan = 0;
  for (const a of RAZONES) {
    const techo = -20 * Math.log10(a);
    const serie = utiles.filter((p) => p.a === a && p.umbral !== UMBRAL_DE_CONTROL);
    if (serie.length === 0) { console.log(`   a=${a}: sin puntos utiles`); continue; }
    const maxima = Math.max(...serie.map((p) => p.caidaDb));
    const exceso = maxima - techo;
    if (exceso > TOLERANCIA_MISMO_MEDIDOR) superan++;
    console.log(`   a=${String(a).padEnd(5)} techo ${techo.toFixed(2).padStart(6)} | `
      + `maxima medida ${maxima.toFixed(2).padStart(6)} | exceso ${exceso.toFixed(2).padStart(6)}`
      + (exceso > TOLERANCIA_MISMO_MEDIDOR ? '   SUPERA EL TECHO' : ''));
  }
  console.log(superan === 0
    ? '   Ninguna curva supera su techo. Es una FORMA consistente con la hipotesis,\n'
      + '   no la saturacion probada: para eso hay que repetir con la fuente 10 dB mas baja.'
    : `   ${superan} curva(s) superan su techo: la hipotesis del techo queda refutada.`);
}

// Histéresis: los dos sentidos
{
  console.log('');
  let peor = 0; let donde = '';
  for (const p of utiles.filter((x) => x.sentido === 'baja')) {
    const v = utiles.find((x) => x.umbral === p.umbral && x.a === p.a && x.sentido === 'sube');
    if (v === undefined) continue;
    const d = Math.abs(p.caidaDb - v.caidaDb);
    if (d > peor) { peor = d; donde = `u=${p.umbral} a=${p.a}`; }
  }
  console.log(`HISTERESIS entre los dos sentidos: maxima ${peor.toFixed(2)} dB en ${donde}`);
  console.log(peor <= TOLERANCIA_MISMO_MEDIDOR
    ? '   PASA: los puntos estan asentados.'
    : '   FALLA: lo que se midio es el transitorio. Esos puntos no valen, y sin la\n'
      + '   vuelta esto habria pasado inadvertido fabricando una curva que satura.');
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada de la pendiente del umbral. No se publica ningun dB por unidad de');
console.log('   crudo: la 97 ya saco tres por sustitucion y quedaron retiradas.');
console.log('   Nada de los tiempos, de la rodilla blanda, del umbral de la puerta ni del');
console.log('   de-esser. Un canal, una frecuencia, un nivel de fuente.');
console.log('   Esto es AUTOCONSISTENCIA y no calibracion: dos medidores de la misma');
console.log('   consola, decodificados con constantes del mismo mixer.html. Y todos los dB');
console.log('   son de la escala del medidor, NO dBFS. Ninguna entrada de raw-map.ts sale');
console.log('   de INFERIDO por esta medicion.');
console.log('');
console.log(`restaurado: threshold ${PREVIO.threshold}, ratio ${PREVIO.ratio}, `
  + `m.afs.enabled ${PREVIO.afs}, los tres leidos del aparato antes de empezar.`);
console.log('Por el mismo camino que escribio, asi que la comprobacion por HTTP va aparte.');
