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
/**
 * El pico del estimulo, **doce decibeles mas arriba que en la 101, y se puede**.
 *
 * La 101 tuvo que bajar a −27 porque su campana **sube** el pico hasta 12 dB y
 * desde mas arriba recortaba. **Este filtro solo atenua**: no hay realce que
 * reservar, asi que el estimulo puede ir a −15 dBFS y cada tono gana 12 dB de
 * margen sobre el ruido de su bin --que es justo lo que esta medicion necesita.
 * La guarda de recorte de `capturar` lo comprueba igual en cada captura.
 */
const PICO_OBJETIVO_DBFS = -15;
const CAIDA_DEL_CODO_DB = 3;

/**
 * Cuanto tiene que sobresalir del ruido un tono del codo. **Veinte, no cuarenta y
 * cinco, y el numero se deriva de la geometria de ESTA medicion.**
 *
 * Los 45 de la 101 estaban puestos para el pico de una campana **realzada 20 dB**:
 * alli el punto de interes venia con veinte decibeles de regalo. Aca el codo esta
 * **3 dB por debajo** de la banda de paso, y encima la ventana de factor 1,2
 * abarca siete tonos en vez de tres y se toma el minimo de los siete.
 *
 * Trasplantar el 45 habria anulado los doce puntos: la 101 midio en este mismo
 * banco **8,2 dB** de margen peor en su linea base y ~24 dB alrededor de 470 Hz,
 * que es donde caen casi todos los codos que las tres leyes predicen. La corrida
 * habria durado cuatro minutos sin medir nada.
 *
 * **La derivacion.** Con 3 dB de caida y una pendiente local de unos 6 dB por
 * octava, un margen de `M` dB mueve el cruce unas `(2/M)/6` octavas. Para que eso
 * quede por debajo del 2 % --la resolucion declarada-- hace falta `M ≈ 20`.
 */
const MARGEN_MINIMO_DB = 20;
/**
 * Cuanto puede apartarse de cero la banda de paso antes de que el punto no valga.
 *
 * **El techo del instrumento no es la malla de tonos: es `bandaDePaso`.** Los 20
 * tonos del extremo agudo van de 5120 a 15343 Hz, y con una pendiente suave un
 * codo alto todavia los tiene DENTRO de la transicion: la mediana sale por debajo
 * de cero y el codo se lee bajo. Medido con 6 dB/octava y el codo en 2971 Hz: el
 * instrumento dice 2691 --9,4 % bajo-- y la banda marca −0,47 dB. **Ese numero es
 * la señal delatora**, y la pendiente de este aparato no se midio.
 */
const BANDA_DE_PASO_MAXIMA_DB = 0.5;
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
  // **La puerta del general, que la 101 al menos imprimia y este guion perdio.**
  // Es no lineal y NO se cancela en la resta, y el pasa-altos --al quitar los
  // graves-- baja el nivel total, que es justo la condicion que la haria cerrar.
  ['m.gate.enabled', Number(exigirClave(e0, 'm.gate.enabled'))],
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
  `i.${n}.eq.b5.gain`, `i.${n}.mix`, `hw.${n}.gain`, `i.${n}.gate.thresh`,
  // El general entero: lo que se cancela en la resta se registra igual, y lo que
  // no se cancela --la puerta-- se puentea.
  'm.mix', 'm.gate.enabled', 'm.dyn.bypass', 'm.eq.bypass',
  'm.eq.hpf.l', 'm.eq.lpf.l', 'm.delayL', 'm.afs.enabled', 'm.afs.fmode',
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
    t.enviar(codificarSetd('m.gate.enabled', 0));
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
    // **H1 aborta, no se informa al final.** Todas las cifras de abajo se miden
    // contra esta base. Si los extremos no dejan el camino libre, la base lleva un
    // filtro adentro, TODOS los codos salen corridos, y el guion imprimiria «FALLA»
    // en H1 y «PASA» en H3 --con H1 impreso despues, cuando H3 ya publico.
    //
    // Es distinto de la E1 de la 101, que explicitamente NO invalidaba el resto:
    // alli lo que se cancelaba era una irregularidad estatica del banco. Aca no.
    if (!(planitudBase <= 1.0)) {
      throw new Error(`H1 FALLA: la linea base se aparta ${planitudBase.toFixed(2)} dB de su `
        + 'media. Los extremos de los dos filtros NO son «fuera del camino», asi que la '
        + 'base lleva un filtro adentro y todos los codos saldrian corridos. No se sigue.');
    }

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
      conLeyes: boolean,
    ): Promise<void> => {
      t.enviar(codificarSetd(clave, crudo));
      await new Promise((r) => setTimeout(r, 1800));
      const curva = contraLaBase(await capturar(`${extremo}-${crudo}`), base);
      const banda = bandaDePaso(curva, extremo) as {
        db: number; dispersionDb: number; margenPeorDb: number;
      };
      const desde = extremo === 'agudo' ? curva.length - 1 : 0;
      const paso = extremo === 'agudo' ? -1 : +1;
      let codigo = cruceEnNivel(curva, banda.db - CAIDA_DEL_CODO_DB, desde, paso) as number | null;
      const margenMin = Math.min(...curva.map((p) => p.margenDb));
      let anuladoPor: string | null = null;

      // **La banda de paso es el punto de referencia de este punto, y puede estar
      // mal.** Si se aparta de cero, el extremo del estimulo esta dentro de la
      // transicion y el codo sale sesgado; si su peor tono esta hundido en el
      // ruido, la mediana de la que cuelga el nivel del cruce no vale.
      if (Math.abs(banda.db) > BANDA_DE_PASO_MAXIMA_DB) {
        anuladoPor = `la banda de paso mide ${banda.db.toFixed(2)} dB: el extremo del `
          + 'estimulo esta dentro de la transicion y el codo saldria sesgado';
      } else if (banda.margenPeorDb < MARGEN_MINIMO_DB) {
        anuladoPor = `la banda de paso tiene ${banda.margenPeorDb.toFixed(1)} dB de margen: `
          + 'el nivel del cruce cuelga de una mediana hundida en el ruido';
      } else if (codigo !== null) {
        const cerca = curva.filter((p) => Math.abs(Math.log(p.hz / codigo!)) < Math.log(1.2));
        const peor = cerca.length === 0 ? -Infinity : Math.min(...cerca.map((p) => p.margenDb));
        if (peor < MARGEN_MINIMO_DB) {
          anuladoPor = `los tonos alrededor del codo tienen ${peor.toFixed(1)} dB de margen `
            + `(minimo ${MARGEN_MINIMO_DB})`;
        }
      }
      if (anuladoPor !== null) {
        console.log(`   crudo ${crudo}: ANULADO, ${anuladoPor}`);
        codigo = null;
      }

      destino.push({ crudo, codigo, bandaDb: banda.db, margenMin });
      const f = (x: number | null) => (x === null ? 'sin cruce' : `${x.toFixed(0)} Hz`);
      // **Las tres leyes son del PASA-ALTOS.** Imprimirlas en la tabla del
      // pasa-bajos seria poner al lado de su codo tres numeros que no significan
      // nada ahi, y quien lea la evidencia dentro de seis meses los va a comparar.
      const leyes = conLeyes
        ? `recta ${RECTA_CODIGO(crudo).toFixed(0).padStart(5)} | exp400 `
          + `${EXP_A_400(crudo).toFixed(0).padStart(5)} | exp1000 `
          + `${EXP_A_1000(crudo).toFixed(0).padStart(5)} | `
        : '';
      console.log(`${crudo.toFixed(2).padStart(6)} | ${f(codigo).padStart(10)} | ${leyes}`
        + `banda ${banda.db.toFixed(2).padStart(6)} dB (disp ${banda.dispersionDb.toFixed(3)}, `
        + `margen ${banda.margenPeorDb.toFixed(0)}) | margen del codo `
        + `${margenMin.toFixed(0).padStart(4)}`);
    };

    console.log('');
    console.log('=== EL PASA-ALTOS ===');
    console.log(' crudo |    codo    | las tres leyes en disputa          | banda de paso');
    for (const c of CRUDOS_HPF) await medir(`i.${n}.eq.hpf.freq`, c, 'agudo', hpf, true);

    console.log('');
    console.log('=== EL PASA-BAJOS ===');
    t.enviar(codificarSetd(`i.${n}.eq.hpf.freq`, 0));
    await new Promise((r) => setTimeout(r, 1500));
    for (const c of CRUDOS_LPF) await medir(`i.${n}.eq.lpf.freq`, c, 'grave', lpf, false);

    // --- H6: la vuelta -------------------------------------------------------
    console.log('');
    console.log('=== LA VUELTA AL PRIMER PUNTO ===');
    t.enviar(codificarSetd(`i.${n}.eq.lpf.freq`, 1));
    await new Promise((r) => setTimeout(r, 1500));
    await medir(`i.${n}.eq.hpf.freq`, CRUDOS_HPF[0]!, 'agudo', hpf, true);

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
// **Un crudo por medida, y la repeticion del cierre no cuenta.** Se mide dos
// veces el primer crudo --la ida y la vuelta-- y las dos entran al mismo arreglo:
// contarlas como dos haria que H4 pudiera pasar con cuatro crudos distintos mas
// uno repetido, cuando el contrato pide cinco. Y ademas H4 y H6 compartirian un
// dato sin declararlo.
const utilesHpf = [...new Map(
  hpf.filter((m) => m.codigo !== null).map((m) => [m.crudo, m]),
).values()];
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
  // **La separacion entre las dos hipotesis NO es una medida: es 1000/400.**
  //
  // La primera version comparaba `max/min` de los dos factores, y eso vale
  // **exactamente 2,50 para cualquier codo por debajo de 400 o por encima de
  // 1000**, porque los dos factores comparten el codo y se cancela. Con el codo en
  // 150 Hz --que esta a factor 2,67 de los 400 del codigo-- imprimia «PASA, y gana
  // EL CODIGO. Los dos se separan por un factor de 2.50». H3 solo podia fallar si
  // el codo caia entre 517 y 774 Hz.
  //
  // Lo que decide es **cuan cerca esta el codo de una fuente y cuan lejos de la
  // otra**, que si son medidas.
  const cerca = Math.min(aRecta, aManual);
  const lejos = Math.max(aRecta, aManual);
  if (cerca <= 1.25 && lejos >= 1.9) {
    console.log(`   PASA, y gana ${gana}: el codo esta a un factor ${cerca.toFixed(2)} de esa `
      + `fuente y ${lejos.toFixed(2)} de la otra.`);
  } else if (cerca > 1.25) {
    console.log(`   NO DECIDE: el codo esta a un factor ${cerca.toFixed(2)} de la fuente mas `
      + 'cercana. **No es ninguna de las dos**, y eso tambien es un resultado.');
  } else {
    console.log('   FALLA: el codo cae en el medio y las dos fuentes son indistinguibles.');
  }
}

console.log('');
{
  const leyes = [
    ['recta 20..400 (el codigo)', RECTA_CODIGO],
    ['exponencial a 400', EXP_A_400],
    ['exponencial a 1000 (el manual)', EXP_A_1000],
  ] as const;
  if (utilesHpf.length < 5) {
    // **Sin puntos no se concluye nada, y menos lo mas fuerte.**
    //
    // La primera version imprimia «la ley no es ninguna de las tres» cuando los
    // tres errores eran NaN por falta de datos: la conclusion mas fuerte y mas
    // equivocada disponible, sacada de cero mediciones. Es el mismo defecto que la
    // 101 habia declarado en su propio control positivo.
    console.log(`H4 NO SE PUEDE DECIDIR: ${utilesHpf.length} crudos utiles de `
      + `${CRUDOS_HPF.length} barridos, y el contrato pide 5.`);
    console.log('   Esto NO dice nada sobre la ley: dice que las guardas se comieron los');
    console.log('   puntos. Mirar los motivos de anulacion de arriba.');
  } else {
    console.log(`H4 cual ley describe el codo, sobre ${utilesHpf.length} crudos utiles:`);
    let alguna: string | null = null;
    for (const [nombre, f] of leyes) {
      const errores = utilesHpf.map((m) => Math.abs(m.codigo! - f(m.crudo)) / f(m.crudo));
      const peor = Math.max(...errores);
      const pasa = peor <= 0.10;
      if (pasa) alguna = nombre;
      console.log(`   ${nombre.padEnd(32)} error maximo ${(peor * 100).toFixed(1)} %`
        + (pasa ? '   <-- DESCRIBE' : ''));
    }
    if (alguna === null) {
      console.log('   FALLA: ninguna de las tres describe el codo dentro del 10 %. La ley no');
      console.log('   es ninguna de las tres, y eso tambien es un resultado.');
    } else {
      console.log(`   PASA con ${alguna}. **Y es una COTA, no una identidad.**`);
      // **La familia que tambien cae dentro del umbral**, que el contrato promete
      // publicar. Se busca la base `B` con `A` clavado en 20, que es lo que las
      // tres leyes candidatas suponen y esta corrida NO mide: el crudo 0 es la
      // linea base, asi que su codo es irrecuperable con este metodo.
      let bMin = Infinity; let bMax = -Infinity;
      for (let i = 0; i <= 4000; i++) {
        const b = Math.exp(Math.log(2) + (i / 4000) * (Math.log(200) - Math.log(2)));
        const peor = Math.max(...utilesHpf.map((m) =>
          Math.abs(20 * Math.pow(b, m.crudo) - m.codigo!) / m.codigo!));
        if (peor <= 0.10) { bMin = Math.min(bMin, b); bMax = Math.max(bMax, b); }
      }
      if (Number.isFinite(bMin)) {
        console.log(`   La familia 20*B^V que tambien cae dentro del 10 % tiene B entre `
          + `${bMin.toFixed(1)} y ${bMax.toFixed(1)}, o sea que en el crudo 1,0 el codo`);
        console.log(`   queda entre ${(20 * bMin).toFixed(0)} y ${(20 * bMax).toFixed(0)} Hz.`);
        console.log('   Y con A clavado en 20, que esta corrida no mide: el crudo 0 es la');
        console.log('   linea base, asi que su codo es irrecuperable con este metodo.');
      }
    }
  }
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
    } else {
      console.log('   NO SE PUEDE DECIDIR: el crudo 0 se anulo, y el extremo es la mitad de H5.');
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
