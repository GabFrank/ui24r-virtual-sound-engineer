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
const ANCHO_DEL_BIN = FM / (FM * SEGUNDOS);
const PICO_OBJETIVO_DBFS = -8;

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

/** Los crudos de Q, con la frecuencia fija en el de fábrica de 1 kHz. */
const CRUDOS_Q = [0.35, 0.45, 0.5252185347, 0.62, 0.70];
const CRUDO_FREQ_PARA_Q = 0.5584347738;

/** El crudo de ganancia: el extremo. Cuánto sube es un RESULTADO, no un supuesto. */
const CRUDO_GANANCIA = 1.0;

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const carpeta = mkdtempSync(join(tmpdir(), 'vse-101-'));

const frecuencias: number[] = frecuenciasPorOctava({ anchoDelBinHz: ANCHO_DEL_BIN });

interface Punto { hz: number; db: number; margenDb: number; capturadoDb: number }

async function capturar(etiqueta: string): Promise<Punto[]> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const r = respuesta(wav, frecuencias) as Punto[];
  rmSync(wav, { force: true });
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
const PREVIO = {
  bypass: Number(exigirClave(e0, `i.${n}.eq.bypass`)),
  freq: Number(exigirClave(e0, `i.${n}.eq.b1.freq`)),
  gain: Number(exigirClave(e0, `i.${n}.eq.b1.gain`)),
  q: Number(exigirClave(e0, `i.${n}.eq.b1.q`)),
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
};

console.log('=== 101 — LAS CURVAS DEL ECUALIZADOR, MEDIDAS CONTRA EL FILTRO ===');
console.log(`canal ${canal} (i.${n}), multitono de ${frecuencias.length} tonos`);
console.log(`   de ${frecuencias[0]!.toFixed(1)} a ${frecuencias[frecuencias.length - 1]!.toFixed(0)} Hz, `
  + `bin de ${ANCHO_DEL_BIN} Hz, captura de ${SEGUNDOS} s`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.eq.bypass`, `i.${n}.eq.b1.freq`, `i.${n}.eq.b1.q`, `i.${n}.eq.b1.gain`,
  `i.${n}.eq.hpf.freq`, `i.${n}.eq.lpf.freq`, `i.${n}.eq.easy`, `i.${n}.eq.prmod`,
  `i.${n}.mix`, `hw.${n}.gain`, 'm.mix', 'm.eq.bypass', 'm.afs.enabled',
]) {
  console.log(`   ${k.padEnd(20)} ${e0.get(k) ?? '(ausente)'}`);
}
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
}
const porFrecuencia: Medida[] = [];
const porQ: Medida[] = [];
let planitudBase = NaN;
let planitudBaseCierre = NaN;
let sonando: ReturnType<typeof spawn> | null = null;
let nivelPorTono = NaN;

await conRestauracion(
  () => {
    sonando?.kill();
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, PREVIO.bypass));
    t.enviar(codificarSetd(`i.${n}.eq.b1.freq`, PREVIO.freq));
    t.enviar(codificarSetd(`i.${n}.eq.b1.gain`, PREVIO.gain));
    t.enviar(codificarSetd(`i.${n}.eq.b1.q`, PREVIO.q));
    t.enviar(codificarSetd('m.afs.enabled', PREVIO.afs));
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 1500));
    console.log('');
    console.log(`supresor del general: estaba en ${PREVIO.afs}, se apaga para medir`);

    const estimulo = join(carpeta, 'multitono.wav');
    const info = escribirMultitono(estimulo, {
      frecuencias, fm: FM, segundos: SEGUNDOS,
      picoObjetivoDbFS: PICO_OBJETIVO_DBFS, repeticiones: 90,
    }) as { factorDeCresta: number; nivelPorTonoDbFS: number; segundosTotales: number };
    nivelPorTono = info.nivelPorTonoDbFS;
    console.log(`estimulo: pico ${PICO_OBJETIVO_DBFS} dBFS, cresta ${info.factorDeCresta.toFixed(2)}, `
      + `${info.nivelPorTonoDbFS.toFixed(1)} dBFS por tono, dura ${info.segundosTotales} s`);
    sonando = spawn('afplay', [estimulo]);
    await new Promise((r) => setTimeout(r, 3000));

    // --- E1: la linea base -----------------------------------------------
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const base = await capturar('base');
    const medias = base.reduce((s, p) => s + p.db, 0) / base.length;
    planitudBase = Math.max(...base.map((p) => Math.abs(p.db - medias)));
    const margenPeor = Math.min(...base.map((p) => p.margenDb));
    console.log('');
    console.log(`linea base con el ecualizador puenteado: se aparta ${planitudBase.toFixed(2)} dB `
      + `de su media | margen peor ${margenPeor.toFixed(1)} dB`);
    console.log('   No hace falta que el banco sea plano: todo lo que sigue se mide como');
    console.log('   DIFERENCIA contra esta linea, y lo que no sea plano se cancela.');

    // --- La banda 1 con la ganancia al maximo -----------------------------
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 0));
    t.enviar(codificarSetd(`i.${n}.eq.b1.gain`, CRUDO_GANANCIA));
    t.enviar(codificarSetd(`i.${n}.eq.b1.q`, PREVIO.q));
    await new Promise((r) => setTimeout(r, 2000));

    console.log('');
    console.log('=== E3/E4: LA LEY DE LA FRECUENCIA ===');
    console.log('crudo        | f0 medido | exponencial | recta     | error exp | factor recta | '
      + 'altura | Q    | margen');

    const medirEnFrecuencia = async (crudo: number, repetida = false): Promise<void> => {
      t.enviar(codificarSetd(`i.${n}.eq.b1.freq`, crudo));
      await new Promise((r) => setTimeout(r, 1800));
      const curva = contraLaBase(await capturar(`f-${crudo}${repetida ? '-bis' : ''}`), base);
      const pico = picoInterpolado(curva) as { hz: number; alturaDb: number; indice: number } | null;
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
        + `${(m.q === null ? '-' : m.q.toFixed(2)).padStart(4)} | ${margenMinimo.toFixed(0).padStart(6)}`
        + (repetida ? '   (repeticion del primero)' : ''));
    };

    for (const c of CRUDOS_FREQ) await medirEnFrecuencia(c);

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
        q: q?.q ?? null, margenMinimo: Math.min(...curva.map((p) => p.margenDb)), repetida: false,
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
    await medirEnFrecuencia(CRUDOS_FREQ[0]!, true);

    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const base2 = await capturar('base-cierre');
    const m2 = base2.reduce((s, p) => s + p.db, 0) / base2.length;
    planitudBaseCierre = Math.max(...base2.map((p, i) => Math.abs((p.db - m2) - (base[i]!.db - medias))));
    console.log(`la linea base al cerrar difiere ${planitudBaseCierre.toFixed(2)} dB de la de apertura`);
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
  ? '   PASA. El banco sirve de referencia.'
  : '   FALLA. El banco no es plano; todo lo demas seria la suma del banco y el\n'
    + '   filtro. Las curvas de abajo siguen valiendo porque son DIFERENCIAS, pero\n'
    + '   la planitud declarada no se cumple y hay que decirlo.');

// E2
{
  const conPico = porFrecuencia.filter((m) => m.f0 !== null);
  console.log('');
  console.log(`E2 la banda 1 es una campana: ${conPico.length} de ${porFrecuencia.length} `
    + 'curvas tienen un maximo con dos lados');
  console.log(conPico.length === porFrecuencia.length
    ? '   PASA. Sube, llega a un maximo y vuelve a bajar. «Frecuencia central»\n'
      + '   quiere decir lo que se supone.'
    : '   Los que no, o son un estante o el pico cayo fuera de la ventana medida.\n'
      + '   Se informan y no se puntuan.');
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
    console.log(peor <= 0.05
      ? '   PASA. La funcion del `mixer.html` describe el filtro, MEDIDO contra la\n'
        + '   respuesta del canal y no contra lo que la consola dice guardar.'
      : '   FALLA. La funcion del `mixer.html` no describe el filtro.');
  }

  const factores = utiles.map((m) => Math.max(RECTA_HZ(m.crudo) / m.f0!, m.f0! / RECTA_HZ(m.crudo)));
  const mejorFactor = factores.length === 0 ? NaN : Math.max(...factores);
  console.log('');
  console.log(`E4 la recta queda excluida: se aparta hasta un factor de ${mejorFactor.toFixed(1)}`);
  console.log(mejorFactor > 2
    ? '   PASA. Los dos modelos son distinguibles con este instrumento, asi que el\n'
      + '   acuerdo de E3 dice algo.'
    : '   FALLA: los dos modelos no se distinguen y esta corrida no decide nada.');
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
}

// E6
{
  const primero = porFrecuencia.find((m) => m.crudo === CRUDOS_FREQ[0] && !m.repetida);
  const bis = porFrecuencia.find((m) => m.repetida);
  console.log('');
  if (primero?.f0 == null || bis?.f0 == null) {
    console.log('E6 sin el par de apertura y cierre, no se puede decir.');
  } else {
    const d = Math.abs(bis.f0 - primero.f0) / primero.f0;
    console.log(`E6 la vuelta: f0 difiere ${(d * 100).toFixed(2)} % | la linea base `
      + `${planitudBaseCierre.toFixed(2)} dB`);
    console.log(d <= 0.015 && planitudBaseCierre <= 0.5
      ? '   PASA. El banco no se movio durante la corrida.'
      : '   FALLA: algo se movio y la corrida no vale.');
  }
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
console.log(`restaurado: i.${n}.eq.bypass ${PREVIO.bypass}, b1.freq ${PREVIO.freq}, `
  + `b1.gain ${PREVIO.gain}, b1.q ${PREVIO.q}, m.afs.enabled ${PREVIO.afs}.`);
console.log('Por el mismo camino que escribio, asi que la comprobacion por HTTP va aparte.');
