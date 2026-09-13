/**
 * La ley de la ganancia del ecualizador de canal, contra la salida real.
 *
 * **Contrato:** `docs/compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md`.
 *
 * Es la única hoja del ecualizador que la aplicación podría escribir: está en dB,
 * igual que el tope de su `kind`, mientras que la frecuencia y el Q que midió el
 * ítem 101 quedan bloqueadas por el desajuste de unidades.
 *
 * **Lo que se mide es cuántos decibeles cambia el nivel en el centro de la banda
 * como función del crudo**, y no «el parámetro de ganancia del filtro»: la
 * aplicación va a decir «realzá esta banda 3 dB» y lo que importa es que el audio
 * suba 3 dB ahí.
 *
 * **Y el estímulo tiene DOS tonos.** El de 100 Hz es el testigo de que la banda es
 * LOCAL: mientras el de 1 kHz se mueve cuarenta decibeles, ése no se puede mover.
 * Si se mueve, lo que cambió fue algo global y la corrida no mide el ecualizador.
 * Es el control que los barridos de fader no podían tener, porque ahí lo que se
 * movía era global por definición.
 *
 * Derivado del guion del ítem 107, que pasó dos auditorías.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-ganancia-del-eq.ts 10 2 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales,
  dbDeMedidor, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const banda = argIndice(3, 'banda', 2, { desde: 1, hasta: 5 });
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
/** El testigo de que la banda es local. Una década abajo del centro. */
const HZ_TESTIGO = 100;
const FM = 48000;
/** Cada tono. Dos a -18 suman un pico de -12 dBFS. */
const NIVEL_DBFS = -18;
/** C2: cuanto se le permite moverse al testigo mientras el centro mueve 40 dB. */
const C2_TESTIGO_MAXIMO_DB = 0.5;
/** L1: el crudo 0,5 tiene que ser el punto plano. */
const L1_PLANO_MAXIMO_DB = 0.2;
/** L5: la simetria entre el corte y el realce. */
const L5_ASIMETRIA_MAXIMA_DB = 0.5;
/** L3: cuanto se le permite apartarse de una recta. */
const L3_RESIDUO_MAXIMO_DB = 0.3;
/** L6: ida y vuelta. */
const L6_HISTERESIS_MAXIMA_DB = 0.5;
const SEGUNDOS_DE_CAPTURA = 3;

const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;
/** Para una DIFERENCIA de dos lecturas, dos escalones. */
const TOLERANCIA_DIFERENCIA_DB = 2 * ESCALON_DB;

/**
 * El crudo más alto del barrido.
 *
 * **Es una constante fija que se COMPRUEBA contra el previo, no algo que se
 * recalcule.** Si el usuario movió el fader desde que esto se escribió, la
 * comprobación aborta y pide ajustarla a mano — a propósito: recalcularla sola
 * significaría que el guion elige dónde empezar a escribir sobre la sala.
 */
/** El punto plano declarado. Es tambien el arranque del barrido y la referencia. */
const CRUDO_PLANO = 0.5;
/**
 * Lo que el ítem 105 midió en la entrada 1 con el general donde el usuario lo
 * dejó. **Se imprime como referencia y no se compara contra nada.**
 */
const EL_105_DIO_DBFS = -18.00;
/** Un punto vale si está este margen por encima del piso EFECTIVO. */
const MARGEN_MINIMO_DB = 45;
/** L4: por debajo de esto no se distingue ±15 de ±20, que es lo que hay que decidir. */
const RECORRIDO_MINIMO_DB = 30;
/**
 * **Por debajo de esto, ninguna expectativa decide.**
 *
 * Sin un minimo, L3b pasa por construccion con UN punto: el denominador de la
 * pendiente da 0, `Math.abs(NaN) > 0.002` es false, `cambios < 0/3` es false, y se
 * imprime «PASA. Sin estructura que explicar» sobre un punto. Es la expectativa
 * que el contrato llama «la que decide», decidiendo en el vacio.
 */
const PUNTOS_MINIMOS = 10;
/** Menos cuadros VU2 que esto y el promedio no es un promedio. */
const CUADROS_MINIMOS = 20;
/**
 * C1: el tono tiene que estar al menos esto por encima del piso efectivo.
 *
 * **Y el número no es una opinión: es la condición necesaria para que L5 pueda
 * pasar.** Cualquier punto util necesita `MARGEN_MINIMO_DB` sobre el piso, y
 * entre el mejor y el peor tiene que haber `RECORRIDO_MINIMO_DB`. O sea que el
 * tope tiene que estar 45 + 40 = 85 dB arriba. Exigir menos abre una franja
 * donde C1 dice «el tono llega», se barren cinco minutos con el general del
 * usuario en 0, y L5 falla por aritmetica. Lo esperado en este banco son 104 dB.
 */
const C1_SOBRE_EL_PISO_DB = MARGEN_MINIMO_DB + RECORRIDO_MINIMO_DB;
/**
 * L2: la referencia interna de la interfaz no puede derivar mas que esto.
 *
 * **El numero sale de L3b, y hay que recalcularlo para CADA barrido.** L3b declara
 * estructura con una pendiente de 0,002 dB/dB; sobre los 48,06 dB de recorrido de
 * esta corrida eso son 0,096 dB de deriva total. Un tope mas grueso dejaria que el
 * instrumento **fabricara el hallazgo de L3b** sin que este control se entere: el
 * control del instrumento tiene que ser mas fino que la expectativa que vigila.
 *
 * El 106 uso 0,1 sobre un recorrido de 59 dB, donde daba 0,118 y alcanzaba. Aca el
 * barrido es mas corto y ese mismo 0,1 quedaria POR ENCIMA de lo que L3b resuelve,
 * asi que se aprieta a 0,05. Sigue holgado contra lo medido: 0,00 dB de deriva
 * sobre 42 capturas en el 106 y 50 en la 104.
 */
const L2_DERIVA_MAXIMA_DB = 0.05;

/**
 * **Tres** crudos deliberadamente FUERA de la rejilla de centésimos: el tope
 * —que es el valor del usuario— más `0,6741` y `0,5237`.
 * Sin ellos L6 no puede fallar: `0,95` sobrevive exacto a un cuantizador a
 * centésimos, a vigésimos o a cualquier divisor.
 */
const CRUDOS = [
  CRUDO_PLANO, 0.55, 0.60, 0.65, 0.7037, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00,
  0.45, 0.40, 0.35, 0.2963, 0.25, 0.20, 0.15, 0.10, 0.05, 0.00,
];

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const ENTRADA_GENERAL_MEDIDA = 0;
const ENTRADA_REFERENCIA = 2;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-107-'));

/**
 * Estimulo de DOS tonos: el centro de la banda y el testigo una decada abajo.
 *
 * Cada uno a `NIVEL_DBFS`, asi que la suma tiene un pico de 6 dB mas en el peor
 * caso. Las dos frecuencias completan un numero entero de ciclos en cada segundo
 * --1000 y 100 a 48 kHz-- asi que no hay discontinuidad en el bucle del archivo.
 */
function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, NIVEL_DBFS / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(
      amplitud * Math.sin((2 * Math.PI * HZ * i) / FM)
      + amplitud * Math.sin((2 * Math.PI * HZ_TESTIGO * i) / FM),
    );
    datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
// **Sólo el medidor del canal.** Acá no hay bus auxiliar que mirar: el testigo
// de que la fuente no se movió es la tira, que está aguas ARRIBA del fader del
// general y por lo tanto tiene que quedarse quieta durante todo el barrido.
let cuadros: { canalSalida: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  cuadros.push({ canalSalida: c.salida });
});

type Medida = {
  canalDb: number; cuadros: number;
  /** El bin del centro de la banda: lo que se mide. */
  centroDb: number;
  /** El bin del testigo, una decada abajo: lo que NO se puede mover. */
  testigoDb: number;
  referenciaDb: number; ruidoDb: number; margenDb: number; recorta: boolean;
};

let sonando: ReturnType<typeof spawn> | null = null;
let falloDelTono: Error | null = null;
const media = (xs: number[]): number => (xs.length === 0 ? NaN : xs.reduce((s, x) => s + x, 0) / xs.length);

async function medir(etiqueta: string, exigeTono: boolean): Promise<Medida> {
  const vivo = (cuando: string): void => {
    if (!exigeTono) return;
    if (falloDelTono !== null) throw falloDelTono;
    if (sonando !== null && sonando.exitCode !== null) {
      throw new Error(`el tono dejo de sonar ${cuando} ${etiqueta}: afplay salio con `
        + `${sonando.exitCode}. Sin tono la lectura es el piso y se leeria como atenuacion.`);
    }
  };
  vivo('antes de');
  const wav = join(carpeta, `${etiqueta}.wav`);
  cuadros = [];
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((resolver, rechazar) => {
    hijo.on('error', rechazar);
    hijo.on('close', () => resolver());
  });
  const xs = cuadros;
  // **Dos analisis sobre la MISMA captura**, no dos capturas: si fueran dos, el
  // testigo y el centro no se medirian en el mismo instante y C2 compararia
  // momentos distintos.
  const tipo = (a: unknown): {
    canales: {
      tonoDb: number; margenEnBinDb: number; ruidoEnBinDb: number; recorteExacto: boolean;
    }[];
  } => a as never;
  const anCentro = tipo(analizar(wav, HZ));
  const anTestigo = tipo(analizar(wav, HZ_TESTIGO));
  rmSync(wav, { force: true });
  vivo('durante');
  const c = anCentro.canales[ENTRADA_GENERAL_MEDIDA]!;
  const tg = anTestigo.canales[ENTRADA_GENERAL_MEDIDA]!;
  return {
    canalDb: dbDeMedidor(media(xs.map((x) => x.canalSalida))),
    cuadros: xs.length,
    centroDb: c.tonoDb,
    testigoDb: tg.tonoDb,
    margenDb: c.margenEnBinDb,
    ruidoDb: c.ruidoEnBinDb,
    recorta: c.recorteExacto,
    referenciaDb: anCentro.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

// ---------------------------------------------------------------- montaje
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const RUTA_GANANCIA = `i.${n}.eq.b${banda}.gain`;
/** Fader del canal bajado para hacer lugar al realce. Ver el contrato. */
const FADER_PARA_HACER_LUGAR = 0.5;

const PREVIO: readonly (readonly [string, number])[] = [
  [RUTA_GANANCIA, Number(exigirClave(e0, RUTA_GANANCIA))],
  [`i.${n}.dyn.bypass`, Number(exigirClave(e0, `i.${n}.dyn.bypass`))],
  [`i.${n}.gate.enabled`, Number(exigirClave(e0, `i.${n}.gate.enabled`))],
  [`i.${n}.deesser.enabled`, Number(exigirClave(e0, `i.${n}.deesser.enabled`))],
  // **Los dos que los controles positivos escriben.** C0 mutea el canal para medir
  // el piso y C1 puentea el ecualizador para tener el punto plano; los dos vuelven
  // en seguida, pero **una corrida que muera ahi los dejaria escritos**. Van a
  // `PREVIO` para que vuelvan por el camino garantizado y no por una escritura
  // literal de mi cabeza — que es lo que el trinquete `escribir-sin-leer` acaba de
  // cazar, con razon.
  [`i.${n}.mute`, Number(exigirClave(e0, `i.${n}.mute`))],
  [`i.${n}.eq.bypass`, Number(exigirClave(e0, `i.${n}.eq.bypass`))],
  ['m.afs.enabled', Number(exigirClave(e0, 'm.afs.enabled'))],
  // El fader del canal va ultimo por el mismo motivo que `m.mix` en el 107: no se
  // devuelve el nivel antes de devolver lo que lo protege.
  [`i.${n}.mix`, Number(exigirClave(e0, `i.${n}.mix`))],
];
const previo = (clave: string): number => {
  const x = PREVIO.find(([k]) => k === clave);
  if (x === undefined) throw new Error(`${clave} no esta en PREVIO`);
  return x[1];
};

const VACIA = '1000.0000000000,116';
/**
 * **Con `exigirClave` y no con `?? ''`.** Si el volcado no trajera las doce claves,
 * la version tolerante devolvia dos listas vacias, que coinciden, y se imprimia
 * «Sin cambios: el supresor no planto nada» habiendo comparado nada con nada —
 * sobre la unica clave cuya perdida le cuesta al usuario una notch de −18 dB que
 * solo `clearall` borra.
 */
const filtrosDelSupresor = (e: Map<string, string>): string[] => {
  const xs: string[] = [];
  for (let i = 0; i < 12; i++) {
    const f = String(exigirClave(e, `m.afs.eq.${i}`));
    if (!f.startsWith(VACIA)) xs.push(`eq.${i}: ${f}`);
  }
  return xs;
};

// **Las doce del supresor se validan ACA y no al final.** `filtrosDelSupresor`
// usa `exigirClave`, y llamarlo recien despues de los cinco minutos de medicion
// convertia una clave faltante en un reventon tardio: se media todo, se imprimian
// los veredictos, y despues lanzaba sin llegar a comparar la pila --que es lo
// unico que protege al usuario de quedarse con una notch de -18 dB--.
const FILTROS_AL_EMPEZAR = filtrosDelSupresor(e0);

console.log('=== 108 — LA LEY DE LA GANANCIA DEL ECUALIZADOR, CONTRA LA SALIDA REAL ===');
console.log(`canal ${canal} (i.${n}) -> general -> entrada 1 de la interfaz`);
console.log(`se barre ${RUTA_GANANCIA} | tonos de ${HZ} Hz y ${HZ_TESTIGO} Hz a ${NIVEL_DBFS} dBFS`);
console.log(`escalon del medidor: ${ESCALON_DB.toFixed(6)} dB | tolerancia de diferencia ${TOLERANCIA_DIFERENCIA_DB.toFixed(4)} dB`);
console.log('');
console.log('=== ESTADO, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves por HTTP`);
for (const k of [
  `i.${n}.mute`, `i.${n}.mix`, `hw.${n}.gain`,
  `i.${n}.eq.bypass`, `i.${n}.eq.b${banda}.freq`, `i.${n}.eq.b${banda}.q`, RUTA_GANANCIA,
  `i.${n}.eq.hpf.freq`, `i.${n}.eq.lpf.freq`, `i.${n}.dyn.bypass`, `i.${n}.gate.enabled`,
  'm.mix', 'm.afs.enabled', 'm.afs.fmode',
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}

{
  const exigir = (clave: string, esperado: string, porque: string): void => {
    const v = String(e0.get(clave) ?? '(ausente)');
    if (v !== esperado) throw new Error(`${clave} = ${v}, y esta medicion exige ${esperado}: ${porque}`);
  };
  exigir(`i.${n}.mute`, '0', 'un canal muteado no alimenta el general');
  exigir(`i.${n}.eq.bypass`, '0', 'con el ecualizador puenteado la banda no hace nada');
  exigir(`i.${n}.eq.prmod`, '0', 'un preset cargado cambia las cinco bandas de golpe');
  exigir(`i.${n}.eq.easy`, '0', 'el modo facil reinterpreta los controles');

  // **Las CINCO bandas planas, la que se barre incluida.** Si otra estuviera
  // torcida, su falda podria tocar 1 kHz o 100 Hz y lo que se mediria seria la
  // suma. Y la que se barre tiene que ARRANCAR plana: de ahi sale la referencia.
  {
    const torcidas: string[] = [];
    for (let b = 1; b <= 5; b++) {
      const k = `i.${n}.eq.b${b}.gain`;
      const v = Number(exigirClave(e0, k));
      if (Math.abs(v - CRUDO_PLANO) > 1e-9) torcidas.push(`${k} = ${v}`);
    }
    if (torcidas.length > 0) {
      throw new Error(`${torcidas.length} banda(s) fuera del centro: ${torcidas.join(', ')}. `
        + 'La falda de una banda torcida podria tocar 1 kHz o 100 Hz.');
    }
    console.log(`   las cinco bandas del canal en ${CRUDO_PLANO}, comprobado`);
  }

  // **La banda que se barre tiene que estar en 1000 Hz**, que es donde esta el
  // tono. Se EXIGE y no se escribe: el crudo de hoy ya es el que la ley medida por
  // el 101 da para 1 kHz, asi que es una clave menos que tocar y que restaurar.
  {
    const crudoFreq = Number(exigirClave(e0, `i.${n}.eq.b${banda}.freq`));
    const hz = 20 * Math.pow(1102.5, crudoFreq);
    if (Math.abs(hz - HZ) > 1) {
      throw new Error(`i.${n}.eq.b${banda}.freq = ${crudoFreq}, que son ${hz.toFixed(1)} Hz `
        + `y el tono esta en ${HZ}. Fuera del centro la altura medida no es la ganancia.`);
    }
    const crudoQ = Number(exigirClave(e0, `i.${n}.eq.b${banda}.q`));
    console.log(`   banda ${banda} en ${hz.toFixed(1)} Hz, Q crudo ${crudoQ} `
      + `(${(0.05 * Math.pow(300, crudoQ)).toFixed(2)}), se registran y NO se tocan`);
  }

  // Los filtros de corte no pueden estar comiendo ninguno de los dos tonos.
  {
    const hpf = Math.min(20 * Math.pow(1102.5, Number(exigirClave(e0, `i.${n}.eq.hpf.freq`))), 1000);
    const lpf = Math.max(20 * Math.pow(1102.5, Number(exigirClave(e0, `i.${n}.eq.lpf.freq`))), 1000);
    if (hpf > HZ_TESTIGO / 2 || lpf < HZ * 2) {
      throw new Error(`los filtros de corte estan en ${hpf.toFixed(0)} y ${lpf.toFixed(0)} Hz, `
        + `y los tonos en ${HZ_TESTIGO} y ${HZ}: uno de los dos esta en la falda.`);
    }
    console.log(`   corte en ${hpf.toFixed(0)} y ${lpf.toFixed(0)} Hz: los dos tonos libres`);
  }
  console.log('');
  console.log('   exigido sin escribir: canal sin mutear, ecualizador activo y sin');
  console.log('   preset, cinco bandas planas, la banda barrida en 1 kHz, cortes libres');
}

type Punto = {
  crudo: number; crudoLeido: number; sentido: 'baja' | 'sube';
  m: Medida; atenuacion: number; prediccion: number; anulado: string | null;
};
const puntos: Punto[] = [];
let pisoEfectivo = NaN;
/** El nivel en el centro con el ecualizador PUENTEADO: la referencia de L1. */
let puenteadoDb = NaN;
/** El nivel con el ecualizador activo y la banda en el crudo plano. */
let planoDb = NaN;

/**
 * **Una excepcion del cuerpo NO puede saltearse el control de la consola.**
 *
 * `conRestauracion` restaura y **relanza**, asi que sin este `try` cualquier
 * aborto legitimo --C1, el tono que se murio, un `leerUnaClave` que excede su
 * tope-- mataba el modulo antes de la relectura por HTTP y de la comparacion de la
 * pila del supresor.
 *
 * Es el MISMO defecto que este guion documenta como arreglado para el caso del
 * `process.exit`: se cerro la puerta rara y quedo abierta la frecuente. Y el caso
 * en que dispara es una corrida que salio mal, que es justo cuando mas falta hace
 * saber si la consola volvio limpia — sobre todo porque `restaurarClaves` tiene
 * camino de reconexion precisamente porque ya fallo una vez.
 */
let falloDelCuerpo: Error | null = null;
try {
await conRestauracion(
  async () => {
    // **Se espera a que el tono muera antes de restaurar.** `m.afs.enabled` vuelve
    // a 1 al final de `restaurarClaves`, y reencender el supresor con el tono
    // todavia sonando es exactamente como se planto la notch de la 104.
    sonando?.kill();
    await new Promise((r) => setTimeout(r, 1500));
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // **El fader del canal, para hacer lugar al realce.** Con el fader donde
    // estaba, un realce de +20 dB pondria la entrada en -9,6 dBFS y la suma de los
    // dos tonos recortaria. El fader esta DESPUES del ecualizador, asi que bajarlo
    // no cambia el nivel al que el filtro trabaja.
    t.enviar(codificarSetd(`i.${n}.mix`, FADER_PARA_HACER_LUGAR));
    await new Promise((r) => setTimeout(r, 2500));
    {
      const leido = await leerUnaClave(maquina, `i.${n}.mix`);
      if (Math.abs(leido - FADER_PARA_HACER_LUGAR) > 1e-9) {
        throw new Error(`i.${n}.mix quedo en ${leido} y hace falta ${FADER_PARA_HACER_LUGAR}: `
          + 'sin ese margen el realce recorta y la ley se mide contra un techo.');
      }
      const bypass = await leerUnaClave(maquina, `i.${n}.dyn.bypass`);
      if (bypass !== 1) {
        throw new Error(`i.${n}.dyn.bypass quedo en ${bypass}: el compresor del canal sigue `
          + 'activo y depende del nivel, que es lo que el barrido mueve cuarenta decibeles.');
      }
    }
    console.log('');
    console.log('=== LO QUE SE NEUTRALIZA ===');
    console.log('   compresor, puerta y de-esser del canal: dependen del nivel y el');
    console.log('   barrido mueve cuarenta decibeles.');
    console.log(`   fader del canal: estaba en ${previo(`i.${n}.mix`)}, a `
      + `${FADER_PARA_HACER_LUGAR} para hacer lugar al realce. Esta DESPUES del`);
    console.log('   ecualizador, asi que no cambia el nivel al que el filtro trabaja.');
    console.log(`   supresor del general: estaba en ${previo('m.afs.enabled')}, apagado mientras suene`);
    console.log('   NO se tocan: la frecuencia ni el Q de la banda, ni las otras cuatro.');

    // **El estimulo.** 900 s: el barrido son 42 puntos a ~7 s, mas el montaje.
    sonando = spawn('afplay', [tono(900)]);
    sonando.on('error', (e) => { falloDelTono = e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => setTimeout(r, 3000));

    console.log('');
    console.log('=== LOS CONTROLES POSITIVOS ===');

    // **El piso, con el canal muteado.** Lo que quede de 1 kHz en la entrada 1 con
    // el canal callado entra por otro lado, y `pisoDelBin` no lo puede ver: saltea
    // los bins de guarda, asi que una fuga coherente en la frecuencia del tono le
    // es invisible. Por eso se mide aparte y por eso el piso efectivo es el mayor
    // de los dos.
    t.enviar(codificarSetd(`i.${n}.mute`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const mPiso = await medir('C0', true);
    pisoEfectivo = Math.max(mPiso.centroDb, mPiso.ruidoDb);
    console.log(`C0 con el canal muteado: ${mPiso.centroDb.toFixed(2)} dBFS en ${HZ} Hz`);
    console.log(`   ruido del bin en esa captura: ${mPiso.ruidoDb.toFixed(2)} dBFS`);
    if (!Number.isFinite(pisoEfectivo)) {
      throw new Error(`el piso efectivo dio ${pisoEfectivo}: sin un piso finito la regla `
        + 'de anulacion no puede anular nada y se publicarian puntos hundidos en el ruido.');
    }
    console.log(`   PISO EFECTIVO = ${pisoEfectivo.toFixed(2)} dBFS, el mayor de los dos.`);
    t.enviar(codificarSetd(`i.${n}.mute`, previo(`i.${n}.mute`)));
    await new Promise((r) => setTimeout(r, 2000));

    // **El punto plano contra el ecualizador PUENTEADO.** De aca sale L1: si el
    // crudo 0,5 no es el punto plano, toda la tabla que lo supone esta mal.
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, 1));
    await new Promise((r) => setTimeout(r, 2000));
    const mPuenteado = await medir('C1-puenteado', true);
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, previo(`i.${n}.eq.bypass`)));
    await new Promise((r) => setTimeout(r, 2000));
    const mPlano = await medir('C1-plano', true);
    puenteadoDb = mPuenteado.centroDb;
    planoDb = mPlano.centroDb;
    const sobreElPiso = planoDb - pisoEfectivo;
    console.log(`C1 con el ecualizador ACTIVO y la banda en ${CRUDO_PLANO}: `
      + `${planoDb.toFixed(2)} dBFS, ${sobreElPiso.toFixed(1)} dB sobre el piso`);
    console.log(`   con el ecualizador PUENTEADO: ${puenteadoDb.toFixed(2)} dBFS`);
    if (!(sobreElPiso >= C1_SOBRE_EL_PISO_DB)) {
      const pisoAlto = pisoEfectivo > -100;
      throw new Error(`C1: el tono esta solo ${sobreElPiso.toFixed(1)} dB sobre el piso `
        + `(minimo ${C1_SOBRE_EL_PISO_DB}, que es lo que L4 necesita para ser posible). `
        + (pisoAlto
          ? `El tono ENTRA bien pero el piso quedo en ${pisoEfectivo.toFixed(2)}.`
          : 'El tono no esta entrando: la salida por omision de la Mac puede no ser la interfaz.'));
    }

    console.log('');
    console.log('=== EL BARRIDO ===');
    console.log('crudo  | leido    | centro   | testigo  | canal    | margen');

    for (const sentido of ['baja', 'sube'] as const) {
      const orden = sentido === 'baja' ? CRUDOS : [...CRUDOS].reverse();
      for (const crudo of orden) {
        t.enviar(codificarSetd(RUTA_GANANCIA, crudo));
        await new Promise((r) => setTimeout(r, 1200));
        const m = await medir(`${sentido}-${crudo}`, true);
        const crudoLeido = await leerUnaClave(maquina, RUTA_GANANCIA);
        puntos.push({
          crudo, crudoLeido, sentido, m, atenuacion: NaN, prediccion: NaN, anulado: null,
        });
        console.log(`${crudo.toFixed(4).padStart(6)} | ${crudoLeido.toFixed(4).padStart(8)} | `
          + `${m.centroDb.toFixed(2).padStart(8)} | ${m.testigoDb.toFixed(2).padStart(8)} | `
          + `${m.canalDb.toFixed(2).padStart(8)} | ${(m.centroDb - pisoEfectivo).toFixed(0).padStart(6)}`
          + (m.recorta ? '  <-- RECORTA' : ''));
      }
    }
  },
);
} catch (e) {
  falloDelCuerpo = e instanceof Error ? e : new Error(String(e));
  console.log('');
  console.log('=== LA CORRIDA FALLO ===');
  console.log(`   ${falloDelCuerpo.message}`);
  console.log('   La consola ya se restauro: `conRestauracion` corrio su finally antes de');
  console.log('   relanzar. Se sigue hasta la relectura por HTTP y la pila del supresor,');
  console.log('   que son lo que mas falta hace justo cuando una corrida sale mal.');
  process.exitCode = 1;
  // **Los puntos medidos NO se tiran.** Una version anterior hacia `puntos.length = 0`
  // aca, y eso borraba el informe de anulados y los datos de L6 de todo lo que SI se
  // midio. Ademas era redundante: la vuelta del barrido termina en `CRUDOS[0]`, asi
  // que cualquier fallo previo ya deja el tope de «sube» inexistente y la guarda del
  // punto de referencia corta sola. Se pagaba un informe por una guarda que no hacia
  // falta, y contradecia el comentario de mas abajo que dice que los anulados se
  // informan SIEMPRE.
}

await new Promise((r) => setTimeout(r, 1000));

// ------------------------------------------------------------------ veredictos
const d = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));
const problemas: string[] = [];

// La atenuacion se mide contra el tope del barrido, del mismo sentido.
/**
 * **El punto de referencia tiene que servir, y esto nunca se comprobaba.**
 *
 * De él cuelgan TODAS las atenuaciones y TODAS las predicciones: si el tope está
 * anulado, los 41 puntos salen sesgados **la misma cantidad y en el mismo
 * sentido**. Y el daño no es un PASA tranquilizador: un tope recortado lee bajo,
 * el residuo sale constante, L3 falla y L3b ve 40 residuos del mismo signo con
 * cero cambios. O sea que la corrida publicaría **un hallazgo falso contra la
 * consola, con la firma exacta que la 94 dejó indecidible y que la 104 pagó por
 * poder nombrar** — mientras el motivo verdadero, una captura que el propio guion
 * marcó inservible, está impreso cuarenta líneas más abajo sin relación declarada.
 *
 * Ninguna guarda de `NaN` puede ver esto, porque con un tope anulado todos los
 * números son finitos. La 104 tiene esta comprobación; el 106 no la tuvo en tres
 * rondas de auditoría.
 */
// **PRIMERA PASADA: quien vale.** La anulacion no depende de la referencia, asi
// que se decide antes y sobre todos los puntos.
for (const p of puntos) {
  const margen = p.m.centroDb - pisoEfectivo;
  if (!(margen >= MARGEN_MINIMO_DB)) {
    p.anulado = `margen de ${margen.toFixed(2)} dB sobre el piso efectivo`;
  }
  if (p.m.recorta && p.anulado === null) p.anulado = 'la captura recorta';
  if (p.m.cuadros < CUADROS_MINIMOS && p.anulado === null) {
    p.anulado = `solo ${p.m.cuadros} cuadros VU2: el promedio no es un promedio`;
  }
}

// **SEGUNDA: el punto de referencia.** Aca es el crudo plano, y de el cuelga TODA
// la ley: la ganancia de cada punto es su nivel menos el del plano.
const referenciaInservible: string[] = [];
const planos = new Map<'baja' | 'sube', Punto>();
for (const sentido of ['baja', 'sube'] as const) {
  const ref = puntos.find((p) => p.sentido === sentido && p.crudo === CRUDO_PLANO);
  if (ref === undefined || ref.anulado !== null
    || !Number.isFinite(ref.m.centroDb) || !Number.isFinite(ref.crudoLeido)) {
    referenciaInservible.push(`${sentido}: ${ref === undefined ? 'no existe'
      : ref.anulado ?? 'lectura no finita'}`);
    continue;
  }
  planos.set(sentido, ref);
}
const referenciaSirve = referenciaInservible.length === 0;
if (!referenciaSirve) {
  console.log('');
  console.log(falloDelCuerpo === null
    ? '=== EL PUNTO DE REFERENCIA NO SIRVE ==='
    : '=== SIN VEREDICTOS: la corrida fallo antes de terminar el barrido ===');
  for (const x of referenciaInservible) console.log(`   ${x}`);
  console.log('   De el cuelga TODA la ley: la ganancia de cada punto es su nivel menos');
  console.log('   el del plano. Con la referencia mala, los veintitantos puntos salen');
  console.log('   sesgados lo mismo y en el mismo sentido, y eso se leeria como una ley');
  console.log('   corrida, no como un error. Se sigue hasta la restauracion.');
  process.exitCode = 1;
}

// **TERCERA: la ganancia de cada punto, contra un plano ya validado.**
for (const p of referenciaSirve ? puntos : []) {
  const ref = planos.get(p.sentido)!;
  p.atenuacion = p.m.centroDb - ref.m.centroDb;   // positivo = realce
}

const utiles = puntos.filter((p) => p.anulado === null);

console.log('');
if (!referenciaSirve) {
  console.log('=== NO SE IMPRIMEN VEREDICTOS ===');
} else {
console.log('=== VEREDICTOS, contra el contrato del item 108 ===');
const d = (x: number): string => (Number.isFinite(x) ? x.toFixed(2) : String(x));

{
  const dif = Math.abs(planoDb - puenteadoDb);
  const ok = dif <= L1_PLANO_MAXIMO_DB;
  console.log(`\nL1 el crudo ${CRUDO_PLANO} es el punto plano: activo ${d(planoDb)} dBFS `
    + `contra puenteado ${d(puenteadoDb)} (difiere ${d(dif)}, tope ${L1_PLANO_MAXIMO_DB})`);
  console.log(ok ? '   PASA. El crudo del centro no agrega ni saca nada.'
    : `   FALLA. El crudo ${CRUDO_PLANO} NO es «0 dB», y toda la tabla que lo supone `
      + 'esta mal. Es un hallazgo por si solo.');
  if (!ok) problemas.push('L1');
}
{
  const refs = puntos.map((p) => p.m.referenciaDb).filter(Number.isFinite);
  console.log(`\nL2 la referencia interna de la interfaz: ${refs.length} capturas finitas`);
  if (refs.length < PUNTOS_MINIMOS) {
    console.log(`   NO DECIDE: con menos de ${PUNTOS_MINIMOS} lecturas la deriva da cero.`);
    problemas.push('L2 sin lecturas');
  } else {
    const deriva = Math.max(...refs) - Math.min(...refs);
    const ok = deriva <= L2_DERIVA_MAXIMA_DB;
    console.log(`   deriva ${d(deriva)} dB (tope ${L2_DERIVA_MAXIMA_DB})`);
    console.log(ok ? '   PASA. El instrumento no se movio.'
      : '   FALLA. Se movio la computadora o el conversor, no la consola.');
    if (!ok) problemas.push('L2');
  }
}
{
  // **C2: la banda es LOCAL.** Es lo que hace honesta a la medicion: si el testigo
  // se mueve, lo que cambio no fue la banda sino algo global, y la corrida no mide
  // la ley del ecualizador sino otra cosa.
  const tg = utiles.map((p) => p.m.testigoDb).filter(Number.isFinite);
  console.log(`\nC2 la banda es LOCAL: ${tg.length} lecturas del testigo en ${HZ_TESTIGO} Hz`);
  if (tg.length < PUNTOS_MINIMOS) {
    console.log(`   NO DECIDE: hacen falta ${PUNTOS_MINIMOS} lecturas.`);
    problemas.push('C2 sin lecturas');
  } else {
    const rango = Math.max(...tg) - Math.min(...tg);
    const ok = rango <= C2_TESTIGO_MAXIMO_DB;
    console.log(`   rango ${d(rango)} dB mientras el centro se mueve `
      + `${d(Math.max(...utiles.map((p) => p.atenuacion)) - Math.min(...utiles.map((p) => p.atenuacion)))} dB `
      + `(tope ${C2_TESTIGO_MAXIMO_DB})`);
    console.log(ok ? '   PASA. Lo que se movio fue la banda y no el camino entero.'
      : '   FALLA. Se movio algo global: esta corrida NO mide la ley del ecualizador.');
    if (!ok) problemas.push('C2');
  }
}
{
  const ats = utiles.map((p) => p.atenuacion).filter(Number.isFinite);
  const recorrido = ats.length === 0 ? NaN : Math.max(...ats) - Math.min(...ats);
  const ok = recorrido >= RECORRIDO_MINIMO_DB;
  console.log(`\nL4 el recorrido total: ${d(recorrido)} dB sobre ${utiles.length} puntos `
    + `(minimo ${RECORRIDO_MINIMO_DB})`);
  console.log(`   maximo realce ${d(Math.max(...ats))} dB, maximo corte ${d(Math.min(...ats))} dB`);
  console.log('   La tabla declara ±15 —30 de recorrido— y el item 101 vio +20 en el');
  console.log('   extremo, que serian 40. Los dos no pueden ser ciertos: esto lo dice.');
  if (!ok) { console.log('   FALLA.'); problemas.push('L4'); } else console.log('   PASA.');
}

if (problemas.length > 0) {
  console.log('');
  console.log(`=== NO SE IMPRIME LEY: fallaron ${problemas.join(', ')} ===`);
  process.exitCode = 1;
} else {
  {
    // **L3: la ley es lineal en el crudo.** Se ajusta una recta por minimos
    // cuadrados y se mira el residuo. Si la ley fuera lineal en la ganancia LINEAL
    // en vez de en decibeles, el residuo lo diria.
    const pts = utiles.filter((p) => Number.isFinite(p.atenuacion))
      .map((p) => ({ x: p.crudoLeido, y: p.atenuacion, crudo: p.crudo }));
    if (pts.length < PUNTOS_MINIMOS) {
      console.log(`\nL3 y L3b NO DECIDEN: quedaron ${pts.length} puntos y hacen falta ${PUNTOS_MINIMOS}.`);
      problemas.push('L3/L3b sin puntos');
    } else {
      const nn = pts.length;
      const sx = pts.reduce((a, p) => a + p.x, 0);
      const sy = pts.reduce((a, p) => a + p.y, 0);
      const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
      const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
      const pend = (nn * sxy - sx * sy) / (nn * sxx - sx * sx);
      const orden = (sy - pend * sx) / nn;
      const res = pts.map((p) => ({ ...p, r: p.y - (pend * p.x + orden) }));
      const peor = res.reduce((m, x) => (Math.abs(x.r) > Math.abs(m.r) ? x : m), res[0]!);
      const ok = Math.abs(peor.r) <= L3_RESIDUO_MAXIMO_DB;
      console.log(`\nL3 la ley es lineal en el crudo: ${pend.toFixed(3)} dB por unidad de `
        + `crudo, ordenada ${orden.toFixed(3)} dB`);
      console.log(`   residuo maximo ${d(peor.r)} dB en el crudo ${peor.crudo} `
        + `(tope ${L3_RESIDUO_MAXIMO_DB})`);
      console.log(ok ? '   PASA. Y es una COTA, no una identidad.' : '   FALLA: la ley NO es lineal en el crudo.');
      if (!ok) problemas.push('L3');

      const signos = res.map((x) => Math.sign(x.r)).filter((x) => x !== 0);
      let cambios = 0;
      for (let k = 1; k < signos.length; k++) if (signos[k] !== signos[k - 1]) cambios++;
      const esperados = (signos.length - 1) / 2;
      const sxr = res.reduce((a, x) => a + x.x * x.r, 0);
      const pendR = (nn * sxr - sx * res.reduce((a, x) => a + x.r, 0)) / (nn * sxx - sx * sx);
      const estructurado = cambios < esperados / 3;
      console.log(`\nL3b el residuo no tiene estructura: ${cambios} cambios de signo sobre `
        + `${signos.length} (con residuos independientes se esperarian ~${esperados.toFixed(0)}), `
        + `pendiente del residuo ${pendR.toFixed(5)}`);
      console.log(estructurado ? '   FALLA. El residuo ESTA estructurado, y eso es un hallazgo.'
        : '   PASA. Sin estructura que explicar.');
      if (estructurado) problemas.push('L3b');
    }
  }
  {
    let peor = { dif: 0, crudo: NaN };
    let pares = 0;
    for (const c of CRUDOS) {
      const b = utiles.find((p) => p.sentido === 'baja' && p.crudo === c);
      const u = utiles.find((p) => p.sentido === 'sube' && p.crudo === c);
      if (b === undefined || u === undefined) continue;
      const dif = Math.abs(b.atenuacion - u.atenuacion);
      if (!Number.isFinite(dif)) continue;
      pares += 1;
      if (dif > peor.dif) peor = { dif, crudo: c };
    }
    console.log(`\nL6 ida y vuelta: ${pares} pares comparados`);
    if (pares === 0) {
      console.log('   NO DECIDE: ningun crudo sobrevivio en los dos sentidos.');
      problemas.push('L6 sin pares');
    } else {
      const ok = peor.dif <= L6_HISTERESIS_MAXIMA_DB;
      console.log(`   diferencia maxima ${d(peor.dif)} dB en el crudo ${peor.crudo}`);
      console.log(ok ? '   PASA.' : '   FALLA. Hay histeresis o falta de asentamiento.');
      if (!ok) problemas.push('L6');
    }
  }
  {
    const extremoAlto = utiles.find((p) => p.sentido === 'baja' && p.crudo === 1);
    const extremoBajo = utiles.find((p) => p.sentido === 'baja' && p.crudo === 0);
    console.log('');
    if (extremoAlto === undefined || extremoBajo === undefined) {
      console.log('L5 NO DECIDE: falta alguno de los dos extremos del crudo.');
      problemas.push('L5 sin extremos');
    } else {
      const asimetria = Math.abs(extremoAlto.atenuacion) - Math.abs(extremoBajo.atenuacion);
      const ok = Math.abs(asimetria) <= L5_ASIMETRIA_MAXIMA_DB;
      console.log(`L5 la simetria: realce ${d(extremoAlto.atenuacion)} dB, corte `
        + `${d(extremoBajo.atenuacion)} dB, asimetria ${d(asimetria)} (tope ${L5_ASIMETRIA_MAXIMA_DB})`);
      console.log(ok ? '   PASA.' : '   FALLA. El ecualizador corta y realza distinto, y la '
        + 'tabla no lo contempla. Es un hallazgo.');
      if (!ok) problemas.push('L5');
    }
  }
  {
    let peor = 0;
    let comparados = 0;
    for (const p of puntos) {
      const dif = Math.abs(p.crudoLeido - p.crudo);
      if (!Number.isFinite(dif)) continue;
      comparados += 1;
      if (dif > peor) peor = dif;
    }
    console.log(`\nL7 el crudo escrito contra el releido: ${comparados} comparados`);
    if (comparados === 0) {
      console.log('   NO DECIDE: no se releyo ningun crudo.');
      problemas.push('L7 sin datos');
    } else {
      console.log(`   diferencia maxima ${peor.toExponential(1)}`);
      console.log(peor < 1e-6 ? '   PASA. Y es una COTA, no una identidad.'
        : '   FALLA: la consola redondea el crudo de la ganancia.');
      if (!(peor < 1e-6)) problemas.push('L7');
    }
    console.log('   Dos de los crudos barridos estan fuera de la rejilla de centesimos a');
    console.log('   proposito: sin ellos esta expectativa no podria fallar.');
  }
  if (problemas.length > 0) process.exitCode = 1;
}
}

const anulados = puntos.filter((p) => p.anulado !== null);
if (anulados.length > 0) {
  console.log('');
  console.log('=== LOS PUNTOS ANULADOS, QUE NO SE PUNTUAN PERO SE INFORMAN ===');
  for (const p of anulados) console.log(`   ${p.sentido} ${p.crudo}: ${p.anulado}`);
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada sobre la FORMA de la campana: se mide la altura en el centro.');
console.log('   Nada sobre el parametro interno del filtro: se mide el efecto en el audio.');
console.log('   Nada sobre la ley INVERSA: esto mide crudo -> dB.');
console.log('   Una banda de cinco, un canal de veinticuatro, una frecuencia, un Q.');
console.log('   Nada sobre las otras cuatro bandas, ni sobre el ecualizador de salida.');
console.log('   Un dia, una frecuencia, un nivel de fuente.');

console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const fin = await estadoPorHttpExigido(maquina);
  let bien = true;
  for (const [k, v] of PREVIO) {
    const leido = Number(exigirClave(fin, k));
    const ok = Math.abs(leido - v) < 1e-9;
    if (!ok) bien = false;
    console.log(`   ${k.padEnd(24)} esperado ${String(v).padEnd(14)} leido ${leido}`
      + (ok ? '' : '   <-- NO COINCIDE'));
  }
  console.log(bien ? `   Las ${PREVIO.length} claves volvieron, por un camino distinto del que escribio.`
    : '   HAY CLAVES SIN RESTAURAR. Revisar la consola antes de seguir.');
  if (!bien) process.exitCode = 1;

  const antes = FILTROS_AL_EMPEZAR;
  const despues = filtrosDelSupresor(fin);
  console.log('');
  console.log(`   filtros del supresor: ${antes.length} antes, ${despues.length} despues`);
  for (const f of despues) console.log(`      ${f}`);
  if (despues.length !== antes.length || despues.some((f, i) => f !== antes[i])) {
    console.log('   LA PILA CAMBIO: el supresor planto algo. Es una notch REAL sobre el');
    console.log('   general del usuario, y borrarla exige `clearall`, que se lleva todo.');
    process.exitCode = 1;
  } else {
    console.log('   Sin cambios: el supresor no planto nada.');
  }
}
await t.desconectar();
