/**
 * Las curvas del ecualizador, medidas contra el filtro.
 *
 * **Contrato:** `docs/compromisos/101-las-curvas-del-ecualizador.md`.
 *
 * **Por qué existe.** `RAW_MAP` tiene la frecuencia y el Q del ecualizador en
 * `INFERIDO`: las funciones están leídas del `mixer.html` de la consola, no
 * medidas. `INFERIDO` no habilita escritura, así que hoy la aplicación no puede
 * tocar un ecualizador.
 *
 * **Y no se le pregunta a la consola dónde puso el filtro: se mide el filtro.**
 * La consola guarda el crudo, no los Hz, así que releer la clave no dice nada.
 * Lo que dice algo es la respuesta en frecuencia del canal, y con el bucle a la
 * interfaz se puede medir.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2b-eq/curvas-del-ecualizador.ts 10 192.168.0.78
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
// Los instrumentos de audio son JavaScript puro y no tienen tipos. El import va
// en una linea porque `@ts-expect-error` aplica a la linea siguiente, y con el
// import partido el error cae en la del `from` y la directiva queda sin usar.
// @ts-expect-error -- JavaScript sin tipos
import { frecuenciasPorOctava, escribirMultitono, respuesta, picoInterpolado, qPorAnchoMitad } from '../../audio/multitono.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');

const FM = 48000;
const SEGUNDOS = 4;
/** El ancho del bin de la ventana del estimulo. `FM` se cancelaba: es 1/segundos. */
const ANCHO_DEL_BIN = 1 / SEGUNDOS;

/**
 * El pico del estimulo, y de aca sale si la corrida sirve o recorta.
 *
 * **La campana sube el pico del multitono mucho mas de lo que sube un tono.**
 * Medido sintetizando los 104 tonos con el filtro encima: con el crudo de
 * ganancia en 1,0 y el Q mas bajo del barrido (V=0,35 -> Q 0,368) el pico sube
 * **+8,6 dB si la ganancia son 15 y +12,0 dB si son 20** — y la ganancia del
 * parametro NO se conoce, es una de las entradas que quedaron sin tocar. Asi que
 * el recorrido se reserva para el peor caso.
 *
 * **Y la cadena no esta a unidad.** La 99b midio en ESTE banco, este canal, con
 * `hw.9.gain = 0,2508445026`: tono a −15 dBFS, pico capturado −6,9. Son **+8,1 dB
 * de ganancia de cadena**. Con el estimulo a −8 dBFS de pico —que es lo que la
 * primera version de este guion tenia— la **linea base** llegaria a +0,1 dBFS:
 * recortaria antes de medir nada.
 *
 * A −27 dBFS de pico cada tono queda en −58,2 dBFS, que contra el piso del bin
 * que la 99b midio en este banco —−114,06— deja 56 dB de margen, once arriba de
 * los 45 que el contrato exige. Bajar el estimulo no cuesta nada; recortar
 * arruina la corrida entera.
 */
const PICO_OBJETIVO_DBFS = -27;
/** Lo que la campana puede subir el pico, medido con +20 dB y Q 0,368. */
const SUBIDA_MAXIMA_DE_LA_CAMPANA_DB = 12;
const MARGEN_DE_RECORTE_DB = 3;
/** Un punto vale con esto de margen sobre el ruido de su propio bin. */
const MARGEN_MINIMO_DB = 45;
/** La campana tiene que bajar esto de los DOS lados para ser una campana. */
const CAIDA_EXIGIDA_DB = 6;
/** Y tiene que subir esto, o la escritura no llego al filtro. */
const ALTURA_MINIMA_DB = 6;

/** Las leyes en disputa, las dos escritas acá para que ninguna se cuele por la prosa. */
const EXPONENCIAL_HZ = (v: number): number => 20 * Math.pow(1102.5, v);
const RECTA_HZ = (v: number): number => 20 + v * 19980;
const EXPONENCIAL_Q = (v: number): number => 0.05 * Math.pow(300, v);
const RECTA_Q = (v: number): number => 0.3 + v * 9.7;

/**
 * Los crudos de frecuencia que se prueban.
 *
 * Acotados por la ventana medida, no por el rango del parámetro: con el multitono
 * de 40 Hz a 15 kHz, un `f0` fuera de eso cae en el borde y lo que se mediría
 * sería el borde y no el filtro. `picoInterpolado` devuelve `null` ahí, así que
 * el punto se anula solo, pero elegirlos adentro evita gastar capturas.
 *
 * Tres son los de fábrica de las bandas 1, 2 y 3 --200 Hz, 1 kHz y 4 kHz con la
 * exponencial--, que sirven de ancla: si la ley es la exponencial, esos tres
 * tienen que dar redondos.
 */
const CRUDOS_FREQ = [
  0.15, 0.25, 0.3286901902, 0.45, 0.5584347738, 0.65, 0.7563259869, 0.90,
];

/**
 * El crudo que se repite al cierre para ver si el banco se movio.
 *
 * **El mejor condicionado, no el primero.** La primera version repetia
 * `CRUDOS_FREQ[0]` = 0,15, que es el peor de los ocho: su campana (f0 en 57 Hz)
 * se sale por abajo de la ventana de 40 Hz, no llega a caer 6 dB de ese lado, y
 * `qPorAnchoMitad` le devuelve null. Repetir ese mediria el borde de la ventana.
 * El de 1 kHz tiene 55 tonos de un lado y 47 del otro.
 */
const CRUDO_QUE_SE_REPITE = 0.5584347738;

/** Los crudos de Q, con la frecuencia fija en el de fábrica de 1 kHz. */
const CRUDOS_Q = [0.35, 0.45, 0.5252185347, 0.62, 0.70];
const CRUDO_FREQ_PARA_Q = 0.5584347738;

/** El crudo de ganancia: el extremo. Cuánto sube es un RESULTADO, no un supuesto. */
const CRUDO_GANANCIA = 1.0;

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const carpeta = mkdtempSync(join(tmpdir(), 'vse-101-'));

const frecuencias: number[] = frecuenciasPorOctava({ anchoDelBinHz: ANCHO_DEL_BIN });

/** El proceso del estimulo. `capturar` lo mira para no medir sobre el silencio. */
let sonando: ReturnType<typeof spawn> | null = null;

interface Punto { hz: number; db: number; margenDb: number; capturadoDb: number }
/** La captura entera: los puntos, mas el pico y el recorte del archivo. */
type Captura = Punto[] & { picoDbFS: number; recorteExacto: boolean };

async function capturar(etiqueta: string): Promise<Captura> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const r = (await respuesta(wav, frecuencias)) as Captura;
  rmSync(wav, { force: true });
  // **Si el estimulo dejo de sonar, todo lo que sigue es ruido con forma de
  // curva.** `afplay` termina cuando el archivo se acaba, y sin esta guarda
  // `respuesta` devolveria NaN en todos los puntos, `picoInterpolado` daria null
  // en todos lados, y la corrida degradaria a «sin pico» sin decir por que.
  if (sonando !== null && sonando.exitCode !== null) {
    throw new Error(`el estimulo dejo de sonar: afplay salio con ${sonando.exitCode}. `
      + 'Subir `repeticiones` en escribirMultitono.');
  }
  if (r.recorteExacto || r.picoDbFS > -1) {
    throw new Error(`la captura "${etiqueta}" recorta (pico ${r.picoDbFS.toFixed(2)} dBFS). `
      + 'Publicar una curva medida sobre una captura recortada seria publicar la curva '
      + 'del limitador de la interfaz, que tambien sube, se aplana arriba y baja.');
  }
  return r;
}

/**
 * La curva del filtro: la captura menos la línea base, tono por tono.
 *
 * **Es lo que hace que el banco no tenga que ser plano.** Cualquier irregularidad
 * del camino --la interfaz, el cable, el previo, el general-- está en las dos
 * capturas y se cancela en la resta. Lo que queda es el filtro.
 */
const contraLaBase = (curva: Punto[], base: Punto[]): Punto[] =>
  curva.map((p, i) => ({ ...p, db: p.db - base[i]!.db }));

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
/**
 * Todo lo que se escribe, leido del aparato con `exigirClave`.
 *
 * **Y lo que se puentea, que es la doctrina que la 99b tuvo que aprender.** Una
 * ganancia estatica se cancela en la resta contra la linea base; una NO LINEAL
 * no. Y aca el riesgo es peor que en la 99b: aquella movia el nivel de forma
 * uniforme, esta mete **+15 a +20 dB concentrados en una banda**, con el pico
 * subiendo hasta 12. Un compresor o un limitador aplasta exactamente la punta de
 * la campana, y de la punta salen `f0`, la altura y el Q.
 *
 * El de-esser es el mas incomodo de todos: es un compresor de banda, y actua
 * justo donde la campana esta levantando.
 */
const PREVIO = {
  bypass: Number(exigirClave(e0, `i.${n}.eq.bypass`)),
  freq: Number(exigirClave(e0, `i.${n}.eq.b1.freq`)),
  gain: Number(exigirClave(e0, `i.${n}.eq.b1.gain`)),
  q: Number(exigirClave(e0, `i.${n}.eq.b1.q`)),
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
  dynCanal: Number(exigirClave(e0, `i.${n}.dyn.bypass`)),
  deesser: Number(exigirClave(e0, `i.${n}.deesser.enabled`)),
  gate: Number(exigirClave(e0, `i.${n}.gate.enabled`)),
  dynGeneral: Number(exigirClave(e0, 'm.dyn.bypass')),
};

console.log('=== 101 — LAS CURVAS DEL ECUALIZADOR, MEDIDAS CONTRA EL FILTRO ===');
console.log(`canal ${canal} (i.${n}), multitono de ${frecuencias.length} tonos`);
console.log(`   de ${frecuencias[0]!.toFixed(1)} a ${frecuencias[frecuencias.length - 1]!.toFixed(0)} Hz, `
  + `bin de ${ANCHO_DEL_BIN} Hz, captura de ${SEGUNDOS} s`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.eq.bypass`, `i.${n}.eq.easy`, `i.${n}.eq.prmod`,
  `i.${n}.eq.b1.freq`, `i.${n}.eq.b1.q`, `i.${n}.eq.b1.gain`,
  `i.${n}.eq.b2.gain`, `i.${n}.eq.b3.gain`, `i.${n}.eq.b4.gain`, `i.${n}.eq.b5.gain`,
  `i.${n}.eq.hpf.freq`, `i.${n}.eq.hpf.slope`, `i.${n}.eq.lpf.freq`, `i.${n}.eq.lpf.slope`,
  `i.${n}.dyn.bypass`, `i.${n}.dyn.ratio`, `i.${n}.gate.enabled`, `i.${n}.gate.thresh`,
  `i.${n}.deesser.enabled`, `i.${n}.mix`, `hw.${n}.gain`,
  'm.mix', 'm.dyn.bypass', 'm.dyn.l.ratio', 'm.gate.enabled', 'm.eq.bypass',
  'm.delayL', 'm.delayR', 'm.afs.enabled',
]) {
  console.log(`   ${k.padEnd(22)} ${e0.get(k) ?? '(ausente)'}`);
}
console.log('');
console.log('   El ecualizador del general, su fader y el supresor apagado son ganancias');
console.log('   ESTATICAS: estan en las dos capturas y se cancelan en la resta. Lo que no');
console.log('   se cancela es lo dependiente del nivel, y eso se puentea abajo.');
console.log('');
console.log('Los crudos de FABRICA, evaluados con las dos leyes en disputa:');
for (const [b, v] of [['b1', 0.3286901902], ['b2', 0.5584347738], ['b3', 0.7563259869],
  ['b4', 0.887124964], ['b5', 0.9542171999]] as const) {
  console.log(`   ${b} crudo ${v}: exponencial ${EXPONENCIAL_HZ(v).toFixed(0).padStart(6)} Hz | `
    + `recta ${RECTA_HZ(v).toFixed(0).padStart(6)} Hz`);
}
console.log('   Es evidencia sobre la CODIFICACION, no sobre el filtro: dice que numeros');
console.log('   muestra el cliente, no a que frecuencia filtra el DSP. Eso se mide abajo.');

interface Medida {
  crudo: number;
  f0: number | null;
  alturaDb: number;
  q: number | null;
  margenMinimo: number;
  repetida: boolean;
  /** Los dos extremos de la curva: sin ellos E2 no se puede medir. */
  dbPrimero: number;
  dbUltimo: number;
}
const porFrecuencia: Medida[] = [];
const porQ: Medida[] = [];
let planitudBase = NaN;
let planitudBaseCierre = NaN;
let derivaUniformeDb = NaN;
let dispersionPuntoAPunto = NaN;
let nivelPorTono = NaN;
let alturaDelControl = NaN;
let contribucionDelResto = NaN;

/**
 * Lo que hay que devolver, leido del aparato antes de empezar.
 *
 * Va por `restaurarClaves`, que **reconecta si el transporte se cayo**. La
 * primera corrida de esta medicion perdio el WebSocket a mitad de camino y la
 * restauracion fallo con «transporte no conectado», dejando la consola con cinco
 * claves cambiadas.
 */
const A_RESTAURAR: readonly (readonly [string, number])[] = [
  [`i.${n}.eq.bypass`, PREVIO.bypass],
  [`i.${n}.eq.b1.freq`, PREVIO.freq],
  [`i.${n}.eq.b1.gain`, PREVIO.gain],
  [`i.${n}.eq.b1.q`, PREVIO.q],
  [`i.${n}.dyn.bypass`, PREVIO.dynCanal],
  [`i.${n}.deesser.enabled`, PREVIO.deesser],
  [`i.${n}.gate.enabled`, PREVIO.gate],
  ['m.dyn.bypass', PREVIO.dynGeneral],
  ['m.afs.enabled', PREVIO.afs],
];

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, A_RESTAURAR);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // **Se puentea lo que depende del nivel, y nada mas.**
    t.enviar(codificarSetd('m.afs.enabled', 0));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    await new Promise((r) => setTimeout(r, 2000));
    console.log('');
    console.log('=== LO QUE SE NEUTRALIZA, Y POR QUE ===');
    console.log(`   supresor del general: estaba en ${PREVIO.afs}, se apaga`);
    console.log(`   compresor del canal:  bypass estaba en ${PREVIO.dynCanal}, se puentea`);
    console.log(`   de-esser del canal:   estaba en ${PREVIO.deesser}, se apaga`);
    console.log(`   puerta del canal:     estaba en ${PREVIO.gate}, se apaga`);
    console.log(`   compresor del general: bypass estaba en ${PREVIO.dynGeneral}, se puentea`);
    console.log('   Todos dependen del NIVEL, y el barrido levanta el pico hasta 12 dB en');
    console.log('   una banda. Lo que aplastarian es justo la punta de la campana, de');
    console.log('   donde salen f0, la altura y el Q. Una ganancia estatica se cancela en');
    console.log('   la resta; una no lineal no.');

    const estimulo = join(carpeta, 'multitono.wav');
    const info = escribirMultitono(estimulo, {
      frecuencias, fm: FM, segundos: SEGUNDOS,
      picoObjetivoDbFS: PICO_OBJETIVO_DBFS, repeticiones: 150,
    }) as { factorDeCresta: number; nivelPorTonoDbFS: number; segundosTotales: number };
    nivelPorTono = info.nivelPorTonoDbFS;
    console.log('');
    console.log(`estimulo: pico ${PICO_OBJETIVO_DBFS} dBFS, cresta ${info.factorDeCresta.toFixed(2)} `
      + `(${(20 * Math.log10(info.factorDeCresta)).toFixed(1)} dB), `
      + `${info.nivelPorTonoDbFS.toFixed(1)} dBFS por tono, dura ${info.segundosTotales} s`);
    sonando = spawn('afplay', [estimulo]);
    await new Promise((r) => setTimeout(r, 3000));

    // --- E1: la linea base, y el recorrido antes del recorte --------------
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const basePuenteada = await capturar('base-puenteada');
    const mediaP = basePuenteada.reduce((s2, p) => s2 + p.db, 0) / basePuenteada.length;
    planitudBase = Math.max(...basePuenteada.map((p) => Math.abs(p.db - mediaP)));
    const margenPeor = Math.min(...basePuenteada.map((p) => p.margenDb));
    console.log('');
    console.log(`linea base con el ecualizador PUENTEADO: se aparta ${planitudBase.toFixed(2)} dB `
      + `de su media | pico ${basePuenteada.picoDbFS.toFixed(1)} dBFS | `
      + `margen peor ${margenPeor.toFixed(1)} dB`);

    const recorrido = -basePuenteada.picoDbFS - SUBIDA_MAXIMA_DE_LA_CAMPANA_DB - MARGEN_DE_RECORTE_DB;
    console.log(`recorrido antes del recorte: ${recorrido.toFixed(1)} dB `
      + `(base en ${basePuenteada.picoDbFS.toFixed(1)}, la campana sube hasta `
      + `${SUBIDA_MAXIMA_DE_LA_CAMPANA_DB}, ${MARGEN_DE_RECORTE_DB} de margen)`);
    if (recorrido < 0) {
      throw new Error(`la campana va a recortar: el estimulo tiene que bajar `
        + `${(-recorrido).toFixed(1)} dB. Publicar una curva recortada seria publicar la `
        + 'curva del limitador de la interfaz.');
    }

    // --- La linea base que de verdad aisla b1 -----------------------------
    //
    // **Puentear el ecualizador entero y despues meterlo entero hace que la resta
    // entregue b1 x b2 x b3 x b4 x b5 x pasa-altos x pasa-bajos, no b1.** Con el
    // ecualizador ADENTRO y b1 en su ganancia neutra, las otras cuatro bandas y
    // los dos filtros estan en las DOS capturas y se cancelan igual que se cancela
    // la interfaz, el cable y el previo.
    //
    // Y que la ganancia previa de b1 sea neutra no se supone: si lo es, esta
    // captura tiene que coincidir con la puenteada, y la diferencia es la
    // contribucion del resto del ecualizador. Se mide y se publica.
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 0));
    t.enviar(codificarSetd(`i.${n}.eq.b1.gain`, PREVIO.gain));
    await new Promise((r) => setTimeout(r, 2000));
    const base = await capturar('base-dentro');
    const mediaD = base.reduce((s2, p) => s2 + p.db, 0) / base.length;
    contribucionDelResto = Math.max(...base.map((p, i) =>
      Math.abs((p.db - mediaD) - (basePuenteada[i]!.db - mediaP))));
    console.log('');
    console.log(`linea base con el ecualizador ADENTRO y b1 en su ganancia previa `
      + `(${PREVIO.gain}): difiere ${contribucionDelResto.toFixed(2)} dB de la puenteada`);
    console.log('   Esa diferencia es la contribucion de b2..b5, del pasa-altos y del');
    console.log('   pasa-bajos. Sea la que sea, esta en las dos capturas de abajo y se');
    console.log('   cancela: por eso la base que se usa es ESTA y no la puenteada.');

    // --- El control positivo ----------------------------------------------
    t.enviar(codificarSetd(`i.${n}.eq.b1.gain`, CRUDO_GANANCIA));
    t.enviar(codificarSetd(`i.${n}.eq.b1.freq`, CRUDO_FREQ_PARA_Q));
    t.enviar(codificarSetd(`i.${n}.eq.b1.q`, PREVIO.q));
    await new Promise((r) => setTimeout(r, 2000));
    const control = contraLaBase(await capturar('control'), base);
    const picoControl = picoInterpolado(control) as { alturaDb: number } | null;
    alturaDelControl = picoControl?.alturaDb ?? NaN;
    console.log('');
    console.log(`=== CONTROL POSITIVO: la escritura llego al filtro? ===`);
    console.log(`   con el crudo de ganancia en ${CRUDO_GANANCIA} la campana sube `
      + `${Number.isFinite(alturaDelControl) ? alturaDelControl.toFixed(1) : '-'} dB`);
    if (!(alturaDelControl >= ALTURA_MINIMA_DB)) {
      throw new Error(`la curva no subio ${ALTURA_MINIMA_DB} dB: la escritura no llego al `
        + `filtro. Mirar i.${n}.eq.easy = ${e0.get(`i.${n}.eq.easy`)} y `
        + `i.${n}.eq.prmod = ${e0.get(`i.${n}.eq.prmod`)}. Medir igual daria una curva de `
        + 'ruido, y sobre ruido puro picoInterpolado devuelve un pico el 98 % de las '
        + 'veces y qPorAnchoMitad un Q de mediana 15,5: la corrida cerraria diciendo '
        + '«el mixer.html no describe el filtro», que es la conclusion mas fuerte y mas '
        + 'equivocada que puede emitir.');
    }

    // Y que crudo guardo de verdad la consola, releido por un camino distinto.
    const eCtrl = await estadoPorHttpExigido(maquina);
    const crudoLeido = Number(exigirClave(eCtrl, `i.${n}.eq.b1.freq`));
    console.log(`   crudo escrito ${CRUDO_FREQ_PARA_Q}, releido por HTTP ${crudoLeido}`);
    console.log('   La 99b midio que el crudo del FADER no se redondea. Del ecualizador no');
    console.log('   se sabia nada, y una cuantizacion se comeria el 5 % de E3 sin tener');
    console.log('   nada que ver con la ley.');

    console.log('');
    console.log('=== E3/E4: LA LEY DE LA FRECUENCIA ===');
    console.log('crudo        | f0 medido | exponencial | recta     | error exp | factor recta | '
      + 'altura | Q    | margen');

    const medirEnFrecuencia = async (crudo: number, repetida = false): Promise<void> => {
      t.enviar(codificarSetd(`i.${n}.eq.b1.freq`, crudo));
      await new Promise((r) => setTimeout(r, 1800));
      const curva = contraLaBase(await capturar(`f-${crudo}${repetida ? '-bis' : ''}`), base);
      let pico = picoInterpolado(curva) as { hz: number; alturaDb: number; indice: number } | null;
      // **La guarda de margen, aplicada donde importa.** El contrato exige 45 dB
      // sobre el ruido del bin y la primera version calculaba el numero sin usarlo
      // nunca. No se pueden sacar puntos del medio de la curva --los indices de la
      // interpolacion se correrian--, asi que se exige el margen EN LOS TRES
      // PUNTOS QUE DECIDEN EL PICO: el maximo y sus dos vecinos. Si alguno esta
      // hundido en el ruido, el vertice de la parabola sale de ahi.
      if (pico !== null) {
        const cerca = [pico.indice - 1, pico.indice, pico.indice + 1]
          .map((k) => curva[k]?.margenDb ?? -Infinity);
        if (Math.min(...cerca) < MARGEN_MINIMO_DB) {
          console.log(`   crudo ${crudo}: ANULADO, el pico y sus vecinos tienen `
            + `${Math.min(...cerca).toFixed(1)} dB de margen sobre el ruido del bin `
            + `(minimo ${MARGEN_MINIMO_DB})`);
          pico = null;
        }
      }
      const q = pico === null ? null
        : (qPorAnchoMitad(curva, pico) as { q: number } | null);
      const margenMinimo = Math.min(...curva.map((p) => p.margenDb));
      const m: Medida = {
        crudo,
        f0: pico?.hz ?? null,
        alturaDb: pico?.alturaDb ?? NaN,
        q: q?.q ?? null,
        margenMinimo,
        repetida,
        dbPrimero: curva[0]!.db,
        dbUltimo: curva[curva.length - 1]!.db,
      };
      porFrecuencia.push(m);
      const esperadoExp = EXPONENCIAL_HZ(crudo);
      const esperadoRecta = RECTA_HZ(crudo);
      console.log(`${crudo.toFixed(10).padStart(12)} | `
        + `${(m.f0 === null ? 'sin pico' : m.f0.toFixed(0)).padStart(9)} | `
        + `${esperadoExp.toFixed(0).padStart(11)} | ${esperadoRecta.toFixed(0).padStart(9)} | `
        + `${(m.f0 === null ? '-' : `${(((m.f0 - esperadoExp) / esperadoExp) * 100).toFixed(1)} %`).padStart(9)} | `
        + `${(m.f0 === null ? '-' : `x${(esperadoRecta / m.f0).toFixed(2)}`).padStart(12)} | `
        + `${(Number.isFinite(m.alturaDb) ? m.alturaDb.toFixed(1) : '-').padStart(6)} | `
        + `${(m.q === null ? '-' : m.q.toFixed(2) + (m.f0 !== null && m.f0 > 3000 ? '*' : '')).padStart(5)} | `
        + `${margenMinimo.toFixed(0).padStart(6)}`
        + (repetida ? '   (repeticion del primero)' : ''));
    };

    for (const c of CRUDOS_FREQ) await medirEnFrecuencia(c);
    console.log('   (*) Arriba de ~3 kHz el ancho medido y el parametro Q dejan de coincidir:');
    console.log('   el biquad digital se deforma al acercarse a Nyquist y la campana es de');
    console.log('   verdad mas angosta que lo que su Q nominal diria. Medido contra el biquad');
    console.log('   del recetario: a 10,9 kHz un Q nominal de 1,00 se mide como 1,55. Por eso');
    console.log('   E5 se barre con la frecuencia fija en 1 kHz, y estos Q NO se puntuan.');

    // --- E5: la ley del Q -------------------------------------------------
    console.log('');
    console.log('=== E5: LA LEY DEL Q, con la frecuencia fija en el de fabrica de 1 kHz ===');
    console.log('crudo        | Q medido | exponencial | recta | factor exp | factor recta | f0    | altura');
    t.enviar(codificarSetd(`i.${n}.eq.b1.freq`, CRUDO_FREQ_PARA_Q));
    await new Promise((r) => setTimeout(r, 1500));
    for (const crudo of CRUDOS_Q) {
      t.enviar(codificarSetd(`i.${n}.eq.b1.q`, crudo));
      await new Promise((r) => setTimeout(r, 1800));
      const curva = contraLaBase(await capturar(`q-${crudo}`), base);
      const pico = picoInterpolado(curva) as { hz: number; alturaDb: number; indice: number } | null;
      const q = pico === null ? null : (qPorAnchoMitad(curva, pico) as { q: number } | null);
      const m: Medida = {
        crudo, f0: pico?.hz ?? null, alturaDb: pico?.alturaDb ?? NaN,
        q: q?.q ?? null, margenMinimo: Math.min(...curva.map((p) => p.margenDb)),
        repetida: false, dbPrimero: curva[0]!.db, dbUltimo: curva[curva.length - 1]!.db,
      };
      porQ.push(m);
      const eExp = EXPONENCIAL_Q(crudo);
      const eRec = RECTA_Q(crudo);
      console.log(`${crudo.toFixed(10).padStart(12)} | `
        + `${(m.q === null ? 'sin ancho' : m.q.toFixed(3)).padStart(8)} | `
        + `${eExp.toFixed(3).padStart(11)} | ${eRec.toFixed(2).padStart(5)} | `
        + `${(m.q === null ? '-' : `x${(m.q / eExp).toFixed(2)}`).padStart(10)} | `
        + `${(m.q === null ? '-' : `x${(m.q / eRec).toFixed(2)}`).padStart(12)} | `
        + `${(m.f0 === null ? '-' : m.f0.toFixed(0)).padStart(5)} | `
        + `${(Number.isFinite(m.alturaDb) ? m.alturaDb.toFixed(1) : '-').padStart(6)}`);
    }

    // --- E6: la vuelta ----------------------------------------------------
    console.log('');
    console.log('=== E6: LA VUELTA AL PRIMER PUNTO ===');
    t.enviar(codificarSetd(`i.${n}.eq.b1.q`, PREVIO.q));
    await new Promise((r) => setTimeout(r, 1200));
    await medirEnFrecuencia(CRUDO_QUE_SE_REPITE, true);

    t.enviar(codificarSetd(`i.${n}.eq.b1.gain`, PREVIO.gain));
    await new Promise((r) => setTimeout(r, 2000));
    const base2 = await capturar('base-cierre');
    const m2 = base2.reduce((s2, p) => s2 + p.db, 0) / base2.length;
    const mediaBase = base.reduce((s2, p) => s2 + p.db, 0) / base.length;

    // **Tres numeros distintos, y cada uno dice otra cosa.**
    const diffs = base2.map((p, i) => (p.db - m2) - (base[i]!.db - mediaBase));
    planitudBaseCierre = Math.max(...diffs.map(Math.abs));
    dispersionPuntoAPunto = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length);
    // La deriva UNIFORME de nivel, que la resta de medias hace invisible. Es la
    // que sesga todas las alturas --las curvas se miden contra la base de
    // apertura-- y por tanto todos los Q. La 99b la vigilaba explicitamente.
    derivaUniformeDb = m2 - mediaBase;
    console.log('');
    console.log(`la linea base al cerrar: forma ${planitudBaseCierre.toFixed(2)} dB (max), `
      + `${dispersionPuntoAPunto.toFixed(3)} dB (rms punto a punto), `
      + `nivel ${derivaUniformeDb >= 0 ? '+' : ''}${derivaUniformeDb.toFixed(3)} dB`);
  },
);

await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();

// ------------------------------------------------------------ veredictos
console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 101 ===');

// E1
console.log('');
console.log(`E1 planitud de la linea base: ${planitudBase.toFixed(2)} dB`);
console.log(planitudBase <= 1.0
  ? '   PASA. El banco es plano.'
  : '   FALLA, y NO invalida el resto. Todo lo que sigue se mide como diferencia\n'
    + '   contra la linea base, y una irregularidad ESTATICA del camino se cancela\n'
    + '   ahi. Lo que falsa es la afirmacion «el banco es plano», que es un dato\n'
    + '   sobre el banco y se publica como tal.');
console.log(`   contribucion de b2..b5, pasa-altos y pasa-bajos: ${contribucionDelResto.toFixed(2)} dB`);
console.log('   Sea la que sea, esta en las dos capturas y se cancela: la base que se usa');
console.log('   es la del ecualizador ADENTRO con b1 en su ganancia neutra, no la puenteada.');

// E2 — la campana, con sus dos lados MEDIDOS.
//
// **«El maximo no cayo en un extremo» NO es «es una campana».** Sobre ruido puro
// `picoInterpolado` devuelve un pico en el 98 % de los sorteos, y sobre un
// ESTANTE con 0,05 dB de ruido por punto, en 17 de 20 --con «f0» repartidos al
// azar por la meseta. Lo que separa una campana de un estante es que BAJE de los
// dos lados, que es lo que el contrato declaro y lo que la primera version de
// este guion no media.
{
  const lados = porFrecuencia.filter((m) => !m.repetida).map((m) => (
    m.f0 === null || !Number.isFinite(m.alturaDb) ? null
      : { crudo: m.crudo, f0: m.f0, izq: m.alturaDb - m.dbPrimero, der: m.alturaDb - m.dbUltimo }
  ));
  const medibles = lados.filter((l) => l !== null);
  const campanas = medibles.filter((l) => l!.izq >= CAIDA_EXIGIDA_DB && l!.der >= CAIDA_EXIGIDA_DB);
  console.log('');
  console.log(`E2 la banda 1 es una campana: ${campanas.length} de ${medibles.length} `
    + `curvas bajan ${CAIDA_EXIGIDA_DB} dB de los DOS lados dentro de la ventana`);
  for (const l of medibles) {
    const corto = l!.izq < CAIDA_EXIGIDA_DB || l!.der < CAIDA_EXIGIDA_DB;
    console.log(`   crudo ${l!.crudo.toFixed(4)} (f0 ${l!.f0.toFixed(0)} Hz): cae `
      + `${l!.izq.toFixed(2)} dB abajo, ${l!.der.toFixed(2)} dB arriba`
      + (corto ? '   <-- no baja lo exigido' : ''));
  }
  console.log('   Ojo con los crudos de los extremos: una campana con f0 en 57 Hz solo');
  console.log('   puede caer unos 5,6 dB antes de los 40 Hz donde empieza el estimulo. Que');
  console.log('   no llegue a 6 ahi es la VENTANA y no el filtro, y se informa como tal.');
  console.log(campanas.length === medibles.length
    ? '   PASA en todas. «Frecuencia central» quiere decir lo que se supone.'
    : '   Las que no llegan se informan y NO se puntuan si el lado corto es el que da\n'
      + '   contra el borde del estimulo. Si el lado corto es el de ADENTRO, es un\n'
      + '   estante y «frecuencia central» quiere decir otra cosa.');
}

/**
 * Que familia de `A*B^V` cae dentro del umbral en los crudos medidos.
 *
 * **Pasar E3 no fija la base en 1102,5.** Con ocho crudos y un 5 % de tolerancia
 * hay toda una familia de exponenciales que tambien pasa, y decir «la funcion del
 * mixer.html describe el filtro» es mas fuerte de lo que los datos soportan. La
 * 99b ya habia aprendido a escribir esto: «un acuerdo dentro del umbral es una
 * cota, no una identidad».
 *
 * Se busca por barrido: el rango de `B` para el que existe algun `A` que deja
 * todos los puntos dentro del umbral relativo.
 */
function familiaCompatible(
  puntos: { crudo: number; valor: number }[], umbralRelativo: number,
): { bMin: number; bMax: number; aMin: number; aMax: number } | null {
  let bMin = Infinity; let bMax = -Infinity; let aMin = Infinity; let aMax = -Infinity;
  for (let i = 0; i <= 2000; i++) {
    // Barrido logaritmico de B entre dos ordenes de magnitud alrededor del centro.
    const b = Math.exp(Math.log(10) * (0.5 + (i / 2000) * 4.5));
    // Para cada B, el mejor A es el que centra el error en escala logaritmica.
    let suma = 0;
    for (const p of puntos) suma += Math.log(p.valor) - p.crudo * Math.log(b);
    const a = Math.exp(suma / puntos.length);
    const peor = Math.max(...puntos.map((p) =>
      Math.abs(a * Math.pow(b, p.crudo) - p.valor) / p.valor));
    if (peor <= umbralRelativo) {
      bMin = Math.min(bMin, b); bMax = Math.max(bMax, b);
      aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
    }
  }
  return Number.isFinite(bMin) ? { bMin, bMax, aMin, aMax } : null;
}

// E3 y E4
{
  const utiles = porFrecuencia.filter((m) => m.f0 !== null && !m.repetida);
  const errores = utiles.map((m) => Math.abs(m.f0! - EXPONENCIAL_HZ(m.crudo)) / EXPONENCIAL_HZ(m.crudo));
  const peor = errores.length === 0 ? NaN : Math.max(...errores);
  console.log('');
  console.log(`E3 f0 contra 20*1102,5^V: error maximo ${(peor * 100).toFixed(2)} % `
    + `sobre ${utiles.length} crudos`);
  if (utiles.length < 6) {
    console.log(`   NO SE PUEDE DECIDIR: hacen falta 6 crudos con pico y hay ${utiles.length}.`);
  } else {
    if (peor <= 0.05) {
      console.log('   PASA, Y ES UNA COTA, NO UNA IDENTIDAD. Dice que si el filtro se aparta');
      console.log('   de 20*1102,5^V se aparta menos del 5 % EN LOS CRUDOS MEDIDOS, y eso');
      console.log('   esta MEDIDO contra la respuesta del canal, no contra lo que la consola');
      console.log('   dice guardar.');
      const fam = familiaCompatible(utiles.map((m) => ({ crudo: m.crudo, valor: m.f0! })), 0.05);
      if (fam !== null) {
        console.log(`   La familia A*B^V que tambien cae dentro del 5 % en estos crudos tiene`);
        console.log(`   B entre ${fam.bMin.toFixed(0)} y ${fam.bMax.toFixed(0)} (declarada 1102,5) `
          + `y A entre ${fam.aMin.toFixed(1)} y ${fam.aMax.toFixed(1)} (declarada 20).`);
        console.log(`   En el crudo 1,0 eso es una frecuencia entre `
          + `${(fam.aMin * fam.bMin).toFixed(0)} y ${(fam.aMax * fam.bMax).toFixed(0)} Hz, `
          + `contra los 22050 que el mixer.html declara.`);
        console.log('   **El tope del recorrido NO queda medido**: cae fuera de la ventana.');
      }
    } else {
      console.log('   FALLA. La funcion del `mixer.html` no describe el filtro.');
    }
  }

  const factores = utiles.map((m) => Math.max(RECTA_HZ(m.crudo) / m.f0!, m.f0! / RECTA_HZ(m.crudo)));
  const mejorFactor = factores.length === 0 ? NaN : Math.max(...factores);
  console.log('');
  console.log(`E4 la recta queda excluida: se aparta hasta un factor de ${mejorFactor.toFixed(1)}`);
  console.log(mejorFactor > 2
    ? '   PASA. Los dos modelos son distinguibles con este instrumento, asi que el\n'
      + '   acuerdo de E3 dice algo.'
    : '   FALLA: los dos modelos no se distinguen y esta corrida no decide nada.');
  console.log('   **SUBORDINADA, y queda declarado para que nadie la lea como confirmacion');
  console.log('   independiente:** el factor entre las dos leyes en los ocho crudos va de');
  console.log('   1,64 a 52,75, asi que SI E3 PASA, E4 PASA NECESARIAMENTE. Su valor es el');
  console.log('   otro: si E3 falla, E4 dice si fallo porque la ley es la recta (factor');
  console.log('   cerca de 1) o porque no es ninguna de las dos (factor grande).');
}

// E5
{
  const utiles = porQ.filter((m) => m.q !== null);
  const factores = utiles.map((m) => {
    const e = EXPONENCIAL_Q(m.crudo);
    return Math.max(m.q! / e, e / m.q!);
  });
  const peor = factores.length === 0 ? NaN : Math.max(...factores);
  console.log('');
  console.log(`E5 Q contra 0,05*300^V: se aparta hasta un factor de ${peor.toFixed(2)} `
    + `sobre ${utiles.length} crudos`);
  console.log('   El ancho se midio a MITAD DE LA GANANCIA EN DECIBELES. La definicion de Q');
  console.log('   de una campana varia entre fabricantes, asi que esto separa un Q de 1 de');
  console.log('   uno de 5; no publica una cifra fina.');
  if (utiles.length < 3) {
    console.log(`   NO SE PUEDE DECIDIR: ${utiles.length} crudos con ancho medible.`);
  } else {
    console.log(peor <= 1.3
      ? '   PASA.'
      : '   FALLA con el umbral declarado. Ver si la recta le queda mas cerca.');
  }
  const factoresRecta = utiles.map((m) => {
    const e = RECTA_Q(m.crudo);
    return Math.max(m.q! / e, e / m.q!);
  });
  if (factoresRecta.length > 0) {
    console.log(`   Y contra la recta 0,3..10: se aparta hasta un factor de `
      + `${Math.max(...factoresRecta).toFixed(2)}`);
  }
  if (utiles.length >= 3) {
    const fam = familiaCompatible(utiles.map((m) => ({ crudo: m.crudo, valor: m.q! })), 0.3);
    if (fam !== null) {
      console.log(`   Y TAMPOCO fija la base en 300: la familia A*B^V que cae dentro del`);
      console.log(`   factor 1,3 tiene B entre ${fam.bMin.toFixed(0)} y ${fam.bMax.toFixed(0)}. `
        + 'E5 separa la exponencial de la recta y no mucho mas, que es lo que el');
      console.log('   contrato ya declaraba.');
    }
  }
}

// E6 — la vuelta, con los tres numeros que dicen cosas distintas
{
  const primero = porFrecuencia.find((m) => m.crudo === CRUDO_QUE_SE_REPITE && !m.repetida);
  const bis = porFrecuencia.find((m) => m.repetida);
  console.log('');
  if (primero?.f0 == null || bis?.f0 == null) {
    console.log('E6 sin el par de apertura y cierre, no se puede decir.');
  } else {
    const d = Math.abs(bis.f0 - primero.f0) / primero.f0;
    console.log(`E6 la vuelta: f0 difiere ${(d * 100).toFixed(2)} % | la forma de la base `
      + `${planitudBaseCierre.toFixed(2)} dB | su NIVEL `
      + `${derivaUniformeDb >= 0 ? '+' : ''}${derivaUniformeDb.toFixed(3)} dB`);
    console.log(d <= 0.015 && planitudBaseCierre <= 0.5
      ? '   PASA. El banco no se movio durante la corrida.'
      : '   FALLA: algo se movio y la corrida no vale.');
    console.log('   **El nivel va aparte porque la comparacion de formas lo esconde:** a las');
    console.log('   dos lineas base se les resta su propia media, asi que una deriva uniforme');
    console.log('   del camino de captura es invisible ahi. Y es la que sesga TODAS las');
    console.log('   alturas --las curvas se miden contra la base de apertura-- y por tanto');
    console.log('   todos los Q: medido, 0,5 dB de deriva mueve un Q de 1,004 a 0,963.');
  }
}

// La resolucion declarada, que cuelga de un numero que esta corrida mide
{
  console.log('');
  console.log(`dispersion punto a punto entre las dos lineas base: `
    + `${dispersionPuntoAPunto.toFixed(3)} dB (rms)`);
  console.log('   **De aca cuelga el +-1,5 % de resolucion del pico.** Sobre una campana');
  console.log('   limpia la interpolacion parabolica ubica f0 dentro del 0,9 % aun con Q=8,');
  console.log('   medido contra el biquad del recetario. Pero eso es SIN ruido: con 0,05 dB');
  console.log('   rms de dispersion por punto el error de f0 tiene p95 de 1,02 %, y con');
  console.log('   0,10 dB, de 1,89 % --ya afuera de lo declarado.');
  console.log(dispersionPuntoAPunto <= 0.05
    ? '   La resolucion declarada se sostiene.'
    : '   AVISO: por encima de 0,05 dB el +-1,5 % queda SIN RESPALDO. La cifra de\n'
      + '   resolucion que vale es la que sale de este numero, no la declarada.');
}

console.log('');
console.log('=== LO QUE SE INFORMA Y NO SE PUNTUA ===');
{
  const alturas = porFrecuencia.filter((m) => Number.isFinite(m.alturaDb)).map((m) => m.alturaDb);
  if (alturas.length > 0) {
    console.log(`   Altura de la campana con el crudo de ganancia en ${CRUDO_GANANCIA}: `
      + `${Math.min(...alturas).toFixed(1)} a ${Math.max(...alturas).toFixed(1)} dB`);
    console.log('   El manual dice +-20 dB y el codigo +-15. Pero el pico de una campana NO');
    console.log('   es la ganancia del parametro salvo que el filtro este normalizado de');
    console.log('   cierta manera, y eso no se sabe. NO se toca la entrada de la ganancia.');
    console.log('   **Y la DISPERSION de estas alturas no es una no-linealidad de la');
    console.log('   ganancia.** En los crudos bajos la campana se sale por abajo de la');
    console.log('   ventana de 40 Hz, y en los altos el biquad se deforma cerca de Nyquist.');
    console.log('   Los dos extremos miden la VENTANA. Si hace falta una cifra de ganancia,');
    console.log(`   es la del control positivo a 1 kHz y sola: ${Number.isFinite(alturaDelControl) ? alturaDelControl.toFixed(1) : '-'} dB.`);
  }
  console.log(`   Nivel por tono del estimulo: ${nivelPorTono.toFixed(1)} dBFS`);
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada de las otras cuatro bandas: se midio b1. Que b2..b5 usen la misma');
console.log('   ley es lo mas probable y NO esta medido.');
console.log('   Nada del pasa-altos ni del pasa-bajos: otros parametros y otra forma.');
console.log('   Nada de la ganancia del ecualizador, por lo dicho arriba.');
console.log('   Y medir la curva no la vuelve PROBADO en las dos direcciones: esto mide');
console.log('   crudo -> Hz. Que `toRaw` acierte es lo mismo invertido SOLO si la funcion');
console.log('   es la que se midio.');
console.log('   Un canal, una banda, un nivel de estimulo.');
console.log('');
// **La restauracion, COMPROBADA y no solo anunciada.**
//
// El contrato dice «se comprueba releyendo por HTTP, que es un camino distinto
// del que escribio», y la primera version de este guion imprimia los valores que
// PRETENDIA haber escrito y cerraba diciendo que la comprobacion iba aparte. Son
// cinco lineas y cierran la brecha entre lo que el contrato promete y lo que la
// corrida hace.
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const esperado: Record<string, number> = {
    [`i.${n}.eq.bypass`]: PREVIO.bypass,
    [`i.${n}.eq.b1.freq`]: PREVIO.freq,
    [`i.${n}.eq.b1.gain`]: PREVIO.gain,
    [`i.${n}.eq.b1.q`]: PREVIO.q,
    [`i.${n}.dyn.bypass`]: PREVIO.dynCanal,
    [`i.${n}.deesser.enabled`]: PREVIO.deesser,
    [`i.${n}.gate.enabled`]: PREVIO.gate,
    'm.dyn.bypass': PREVIO.dynGeneral,
    'm.afs.enabled': PREVIO.afs,
  };
  const eFin = await estadoPorHttpExigido(maquina);
  let todo = true;
  for (const [k, v] of Object.entries(esperado)) {
    const leido = Number(exigirClave(eFin, k));
    const bien = Math.abs(leido - v) < 1e-9;
    if (!bien) todo = false;
    console.log(`   ${k.padEnd(22)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (bien ? '' : '   <-- NO COINCIDE'));
  }
  console.log(todo
    ? '   Todo restaurado, comprobado por un camino distinto del que escribio.'
    : '   **HAY CLAVES SIN RESTAURAR.** Anotar cuales y dejarlas escritas: la consola\n'
      + '   quedo distinta de como estaba y el usuario tiene que saberlo.');
}
