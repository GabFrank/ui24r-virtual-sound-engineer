/**
 * El pasa-altos y el pasa-bajos del canal, medidos contra el filtro.
 *
 * **Contrato:** `docs/compromisos/103-el-pasa-altos-y-el-pasa-bajos.md`.
 *
 * **Por qué existe.** `raw-map.ts` declara `lineal('i.N.eq.hpf.freq', 'Hz', 20,
 * 400, 'DESCONOCIDO')` --un número puesto a ojo-- y el manual del fabricante dice
 * **20 Hz a 1 kHz**. Del pasa-bajos no hay entrada. Y hay razón para dudar también
 * de la forma: las otras dos frecuencias del ecualizador estaban declaradas como
 * rectas y la medición 101 las midió exponenciales.
 *
 * Se busca un **cruce** y no un máximo: la frecuencia donde la respuesta cae 3 dB
 * respecto de la banda de paso, que es el codo del filtro.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2b-eq/pasa-altos-y-pasa-bajos.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
// @ts-expect-error -- JavaScript sin tipos
import { frecuenciasPorOctava, escribirMultitono, respuesta, cruceEnNivel, bandaDePaso } from '../../audio/multitono.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');

const FM = 48000;
const SEGUNDOS = 4;
const ANCHO_DEL_BIN = 1 / SEGUNDOS;
/** El mismo que la 101, por el mismo motivo: con −8 la linea base ya recorta. */
const PICO_OBJETIVO_DBFS = -27;
const CAIDA_DEL_CODO_DB = 3;
const MARGEN_MINIMO_DB = 45;
const ATENUACION_MINIMA_DB = 10;

/** Las tres leyes en disputa, las tres escritas para que ninguna se cuele. */
const RECTA_CODIGO = (v: number): number => 20 + v * 380;
const EXP_A_400 = (v: number): number => 20 * Math.pow(20, v);
const EXP_A_1000 = (v: number): number => 20 * Math.pow(50, v);

const CRUDOS_HPF = [0.25, 0.40, 0.55, 0.70, 0.85, 1.0];
/** El pasa-bajos va al reves: su crudo 1 es «fuera del camino». */
const CRUDOS_LPF = [0.0, 0.15, 0.30, 0.45, 0.60];

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const carpeta = mkdtempSync(join(tmpdir(), 'vse-103-'));
const frecuencias: number[] = frecuenciasPorOctava({ anchoDelBinHz: ANCHO_DEL_BIN });

interface Punto { hz: number; db: number; margenDb: number }
type Captura = Punto[] & { picoDbFS: number; recorteExacto: boolean };

let sonando: ReturnType<typeof spawn> | null = null;

async function capturar(etiqueta: string): Promise<Captura> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const r = (await respuesta(wav, frecuencias)) as Captura;
  rmSync(wav, { force: true });
  if (sonando !== null && sonando.exitCode !== null) {
    throw new Error(`el estimulo dejo de sonar: afplay salio con ${sonando.exitCode}`);
  }
  if (r.recorteExacto || r.picoDbFS > -1) {
    throw new Error(`la captura "${etiqueta}" recorta (pico ${r.picoDbFS.toFixed(2)} dBFS)`);
  }
  return r;
}

const contraLaBase = (curva: Punto[], base: Punto[]): Punto[] =>
  curva.map((p, i) => ({ ...p, db: p.db - base[i]!.db }));

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.eq.hpf.freq`, Number(exigirClave(e0, `i.${n}.eq.hpf.freq`))],
  [`i.${n}.eq.lpf.freq`, Number(exigirClave(e0, `i.${n}.eq.lpf.freq`))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
];

console.log('=== 103 — EL PASA-ALTOS Y EL PASA-BAJOS, MEDIDOS CONTRA EL FILTRO ===');
console.log(`canal ${canal} (i.${n}), multitono de ${frecuencias.length} tonos de `
  + `${frecuencias[0]!.toFixed(1)} a ${frecuencias[frecuencias.length - 1]!.toFixed(0)} Hz`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
for (const k of [
  `i.${n}.eq.hpf.freq`, `i.${n}.eq.hpf.slope`, `i.${n}.eq.lpf.freq`, `i.${n}.eq.lpf.slope`,
  `i.${n}.eq.bypass`, `i.${n}.eq.easy`, `i.${n}.eq.prmod`,
  `i.${n}.eq.b1.gain`, `i.${n}.eq.b2.gain`, `i.${n}.eq.b3.gain`, `i.${n}.eq.b4.gain`,
  `i.${n}.eq.b5.gain`, `i.${n}.mix`, `hw.${n}.gain`, 'm.afs.enabled', 'm.afs.fmode',
]) {
  console.log(`   ${k.padEnd(22)} ${e0.get(k) ?? '(ausente)'}`);
}
// Las cinco bandas tienen que estar en su neutro: si alguna no lo esta, su curva
// entra en la respuesta y el codo se corre.
{
  const fuera = [1, 2, 3, 4, 5]
    .map((b) => [b, Number(e0.get(`i.${n}.eq.b${b}.gain`) ?? 0.5)] as const)
    .filter(([, v]) => Math.abs(v - 0.5) > 1e-9);
  if (fuera.length > 0) {
    throw new Error(`las bandas ${fuera.map(([b]) => b).join(', ')} no estan en su crudo `
      + 'neutro (0,5): su curva entraria en la respuesta y correria el codo.');
  }
  console.log('   las cinco bandas del ecualizador estan en 0,5 (neutro), comprobado');
}

interface Medida { crudo: number; codigo: number | null; bandaDb: number; margenMin: number }
const hpf: Medida[] = [];
const lpf: Medida[] = [];
let planitudBase = NaN;
let dispersionCierre = NaN;
let atenuacionDelControl = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 2000));
    console.log('');
    console.log('neutralizado lo dependiente del nivel: compresor, puerta y de-esser del');
    console.log('canal, compresor del general, y el supresor --que con un tono sostenido');
    console.log('planta filtros, que es su comportamiento declarado en modo FIXED.');

    const estimulo = join(carpeta, 'multitono.wav');
    const info = escribirMultitono(estimulo, {
      frecuencias, fm: FM, segundos: SEGUNDOS,
      picoObjetivoDbFS: PICO_OBJETIVO_DBFS, repeticiones: 150,
    }) as { factorDeCresta: number; nivelPorTonoDbFS: number; segundosTotales: number };
    console.log(`estimulo: pico ${PICO_OBJETIVO_DBFS} dBFS, `
      + `${info.nivelPorTonoDbFS.toFixed(1)} dBFS por tono, dura ${info.segundosTotales} s`);
    sonando = spawn('afplay', [estimulo]);
    await new Promise((r) => setTimeout(r, 3000));

    // --- H1: la linea base, con los dos filtros en su extremo inerte ---------
    t.enviar(codificarSetd(`i.${n}.eq.hpf.freq`, 0));
    t.enviar(codificarSetd(`i.${n}.eq.lpf.freq`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const base = await capturar('base');
    const media = base.reduce((s, p) => s + p.db, 0) / base.length;
    planitudBase = Math.max(...base.map((p) => Math.abs(p.db - media)));
    console.log('');
    console.log(`linea base con los dos filtros en su extremo: se aparta `
      + `${planitudBase.toFixed(2)} dB de su media | pico ${base.picoDbFS.toFixed(1)} dBFS`);
    console.log('   Que esos extremos sean «fuera del camino» es lo que esto comprueba.');

    // --- H2: el control positivo --------------------------------------------
    t.enviar(codificarSetd(`i.${n}.eq.hpf.freq`, 1.0));
    await new Promise((r) => setTimeout(r, 2000));
    const control = contraLaBase(await capturar('control'), base);
    atenuacionDelControl = -control[0]!.db;
    console.log('');
    console.log(`control positivo: con el pasa-altos en su extremo, el tono de `
      + `${frecuencias[0]!.toFixed(0)} Hz cae ${atenuacionDelControl.toFixed(1)} dB`);
    if (!(atenuacionDelControl >= ATENUACION_MINIMA_DB)) {
      throw new Error(`el pasa-altos no atenuo ${ATENUACION_MINIMA_DB} dB: la escritura no `
        + `llego al filtro. Mirar i.${n}.eq.easy = ${e0.get(`i.${n}.eq.easy`)} y `
        + `i.${n}.eq.prmod = ${e0.get(`i.${n}.eq.prmod`)}. Medir igual daria una curva de `
        + 'ruido, y sobre ruido el buscador de cruces devuelve un numero igual.');
    }

    const medir = async (
      clave: string, crudo: number, extremo: 'agudo' | 'grave', destino: Medida[],
    ): Promise<void> => {
      t.enviar(codificarSetd(clave, crudo));
      await new Promise((r) => setTimeout(r, 1800));
      const curva = contraLaBase(await capturar(`${extremo}-${crudo}`), base);
      const banda = bandaDePaso(curva, extremo) as number;
      // Desde el extremo de la banda de paso hacia el otro lado.
      const desde = extremo === 'agudo' ? curva.length - 1 : 0;
      const paso = extremo === 'agudo' ? -1 : +1;
      let codigo = cruceEnNivel(curva, banda - CAIDA_DEL_CODO_DB, desde, paso) as number | null;
      const margenMin = Math.min(...curva.map((p) => p.margenDb));
      // **La guarda de margen, aplicada donde decide.** Si los tonos alrededor del
      // codo estan hundidos en el ruido, el cruce sale de ahi.
      if (codigo !== null) {
        const cerca = curva.filter((p) => Math.abs(Math.log(p.hz / codigo!)) < Math.log(1.2));
        const peor = cerca.length === 0 ? -Infinity : Math.min(...cerca.map((p) => p.margenDb));
        if (peor < MARGEN_MINIMO_DB) {
          console.log(`   crudo ${crudo}: ANULADO, los tonos alrededor del codo tienen `
            + `${peor.toFixed(1)} dB de margen (minimo ${MARGEN_MINIMO_DB})`);
          codigo = null;
        }
      }
      destino.push({ crudo, codigo, bandaDb: banda, margenMin });
      const f = (x: number | null) => (x === null ? 'sin cruce' : `${x.toFixed(0)} Hz`);
      console.log(`${crudo.toFixed(2).padStart(6)} | ${f(codigo).padStart(10)} | `
        + `recta ${RECTA_CODIGO(crudo).toFixed(0).padStart(5)} | exp400 `
        + `${EXP_A_400(crudo).toFixed(0).padStart(5)} | exp1000 `
        + `${EXP_A_1000(crudo).toFixed(0).padStart(5)} | banda `
        + `${banda.toFixed(2).padStart(6)} dB | margen ${margenMin.toFixed(0).padStart(4)}`);
    };

    console.log('');
    console.log('=== EL PASA-ALTOS ===');
    console.log(' crudo |    codo    | las tres leyes en disputa          | banda de paso');
    for (const c of CRUDOS_HPF) await medir(`i.${n}.eq.hpf.freq`, c, 'agudo', hpf);

    console.log('');
    console.log('=== EL PASA-BAJOS ===');
    t.enviar(codificarSetd(`i.${n}.eq.hpf.freq`, 0));
    await new Promise((r) => setTimeout(r, 1500));
    for (const c of CRUDOS_LPF) await medir(`i.${n}.eq.lpf.freq`, c, 'grave', lpf);

    // --- H6: la vuelta -------------------------------------------------------
    console.log('');
    console.log('=== LA VUELTA AL PRIMER PUNTO ===');
    t.enviar(codificarSetd(`i.${n}.eq.lpf.freq`, 1));
    await new Promise((r) => setTimeout(r, 1500));
    await medir(`i.${n}.eq.hpf.freq`, CRUDOS_HPF[0]!, 'agudo', hpf);

    t.enviar(codificarSetd(`i.${n}.eq.hpf.freq`, 0));
    await new Promise((r) => setTimeout(r, 2000));
    const base2 = await capturar('base-cierre');
    const m2 = base2.reduce((s, p) => s + p.db, 0) / base2.length;
    const diffs = base2.map((p, i) => (p.db - m2) - (base[i]!.db - media));
    dispersionCierre = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
    console.log(`la linea base al cerrar: ${Math.max(...diffs.map(Math.abs)).toFixed(2)} dB (max), `
      + `${dispersionCierre.toFixed(3)} dB (rms punto a punto)`);
  },
);

await new Promise((r) => setTimeout(r, 1500));

// ------------------------------------------------------------ veredictos
console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 103 ===');

console.log('');
console.log(`H1 planitud de la linea base: ${planitudBase.toFixed(2)} dB`);
console.log(planitudBase <= 1.0
  ? '   PASA. Los extremos de los dos filtros son «fuera del camino», MEDIDO.'
  : '   FALLA: los extremos no dejan el camino libre y toda la medicion se corre.');

console.log('');
console.log(`H2 el pasa-altos atenua: ${atenuacionDelControl.toFixed(1)} dB en el tono mas grave`);
console.log(atenuacionDelControl >= ATENUACION_MINIMA_DB
  ? '   PASA. La escritura llego al filtro.'
  : '   FALLA.');

const delPrimero = hpf.filter((m) => m.crudo === CRUDOS_HPF[0]);
const utilesHpf = hpf.filter((m) => m.codigo !== null);
const enUno = hpf.find((m) => m.crudo === 1.0 && m.codigo !== null);

console.log('');
if (enUno === undefined) {
  console.log('H3 NO SE PUEDE DECIDIR: el crudo 1,0 no dio cruce.');
} else {
  const aRecta = Math.max(enUno.codigo! / 400, 400 / enUno.codigo!);
  const aManual = Math.max(enUno.codigo! / 1000, 1000 / enUno.codigo!);
  console.log(`H3 el codo en el crudo 1,0: ${enUno.codigo!.toFixed(0)} Hz`);
  console.log(`   contra los 400 del codigo: factor ${aRecta.toFixed(2)}`);
  console.log(`   contra los 1000 del manual: factor ${aManual.toFixed(2)}`);
  const gana = aRecta < aManual ? 'EL CODIGO (400 Hz)' : 'EL MANUAL (1000 Hz)';
  const separacion = Math.max(aRecta, aManual) / Math.min(aRecta, aManual);
  console.log(separacion > 1.5
    ? `   PASA, y gana ${gana}. Los dos se separan por un factor de ${separacion.toFixed(2)}.`
    : '   FALLA: el codo cae en el medio y las dos fuentes son indistinguibles.');
}

console.log('');
{
  const leyes = [
    ['recta 20..400 (el codigo)', RECTA_CODIGO],
    ['exponencial a 400', EXP_A_400],
    ['exponencial a 1000 (el manual)', EXP_A_1000],
  ] as const;
  console.log(`H4 cual ley describe el codo, sobre ${utilesHpf.length} crudos utiles:`);
  let alguna = false;
  for (const [nombre, f] of leyes) {
    const errores = utilesHpf.map((m) => Math.abs(m.codigo! - f(m.crudo)) / f(m.crudo));
    const peor = errores.length === 0 ? NaN : Math.max(...errores);
    const pasa = utilesHpf.length >= 5 && peor <= 0.10;
    if (pasa) alguna = true;
    console.log(`   ${nombre.padEnd(32)} error maximo ${(peor * 100).toFixed(1)} %`
      + (pasa ? '   <-- DESCRIBE' : ''));
  }
  console.log(alguna
    ? '   PASA. Y es una COTA, no una identidad: hay una familia de leyes que\n'
      + '   tambien cae dentro del 10 % en estos crudos.'
    : '   FALLA: ninguna de las tres describe el codo. La ley no es ninguna de las\n'
      + '   tres, y eso tambien es un resultado.');
}

console.log('');
{
  const utilesLpf = lpf.filter((m) => m.codigo !== null);
  if (utilesLpf.length < 2) {
    console.log(`H5 NO SE PUEDE DECIDIR: ${utilesLpf.length} cruces utiles en el pasa-bajos.`);
  } else {
    const enCero = utilesLpf.find((m) => m.crudo === 0);
    const sube = utilesLpf[utilesLpf.length - 1]!.codigo! > utilesLpf[0]!.codigo!;
    console.log(`H5 el pasa-bajos: su codo ${sube ? 'SUBE' : 'BAJA'} cuando el crudo sube`);
    if (enCero !== undefined) {
      console.log(`   en el crudo 0 el codo esta en ${enCero.codigo!.toFixed(0)} Hz `
        + `(el manual dice 1 kHz)`);
      console.log(sube && Math.abs(Math.log(enCero.codigo! / 1000)) < Math.log(3)
        ? '   PASA. El sentido y el extremo son los que el manual declara.'
        : '   FALLA: el sentido o el extremo no son los declarados.');
    }
  }
}

console.log('');
if (delPrimero.length === 2 && delPrimero[0]!.codigo !== null && delPrimero[1]!.codigo !== null) {
  const d = Math.abs(delPrimero[1]!.codigo! - delPrimero[0]!.codigo!) / delPrimero[0]!.codigo!;
  console.log(`H6 la vuelta: el codo difiere ${(d * 100).toFixed(2)} % | la base `
    + `${dispersionCierre.toFixed(3)} dB rms`);
  console.log(d <= 0.02 && dispersionCierre <= 0.05
    ? '   PASA. El banco no se movio.'
    : '   FALLA: algo se movio, o la dispersion deja sin respaldo la resolucion.');
} else {
  console.log('H6 sin el par de apertura y cierre, no se puede decir.');
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada de las pendientes, que el manual declara seleccionables: se midio una.');
console.log('   Nada de los codos que caigan fuera de la ventana del estimulo.');
console.log('   Nada del pasa-altos ni del pasa-bajos de los buses, que son otras claves.');
console.log('   Y un acuerdo dentro del umbral es una COTA, no una identidad.');

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const eFin = await estadoPorHttpExigido(maquina);
  let todo = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(eFin, k));
    const bien = Math.abs(leido - v) < 1e-9;
    if (!bien) todo = false;
    console.log(`   ${k.padEnd(22)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (bien ? '' : '   <-- NO COINCIDE'));
  }
  console.log(todo ? '   Todo restaurado, comprobado por un camino distinto del que escribio.'
    : '   **HAY CLAVES SIN RESTAURAR.** Hay que ponerlas a mano.');
}
await t.desconectar();
