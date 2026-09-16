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
 * **Y el estímulo tiene DOS tonos.** El segundo es el testigo de que la banda es
 * LOCAL: mientras el de 1 kHz se mueve cuarenta decibeles, ése no se puede mover
 * más que la falda calculada de la propia campana.
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
  dbDeMedidor, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const banda = argIndice(3, 'banda', 2, { desde: 1, hasta: 5 });
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
/**
 * El testigo de que la banda es local.
 *
 * **37 Hz y no 100, y el motivo es fisica.** Con la campana en 1 kHz y el Q de
 * fabrica --que el item 101 midio en 1,010-- la falda a 100 Hz mueve ese bin
 * 0,41 dB con +20 de realce y -0,41 con -20: un rango de **0,82 dB**. Con un tope
 * de 0,5, C2 habria fallado **justo en el escenario que esta corrida sale a
 * encontrar** --la ley de ±20-- y el mensaje habria acusado a la consola por la
 * falda del propio filtro que se esta midiendo. A 37 Hz la falda es **0,059 dB
 * por lado**, o sea 0,117 de rango: la mitad del tope que C2 usa.
 *
 * **Y es inarmonico a proposito**, que el de 100 Hz no era: 1000/100 = 10, asi que
 * el decimo armonico del testigo caia EXACTAMENTE en el bin que se mide --y con el
 * corte maximo el centro baja a -52 dBFS mientras el testigo se queda en -32--; y
 * 100 Hz es el segundo armonico de una red de 50, asi que un zumbido coherente
 * ahi, invisible para `pisoDelBin` porque saltea los bins de guarda, movia la
 * lectura. 37 no divide a 1000 ni se relaciona con 50 ni con 60.
 */
const HZ_TESTIGO = 37;
const FM = 48000;
/** Cada tono. Dos a -18 suman un pico de -12 dBFS. */
const NIVEL_DBFS = -18;
/**
 * C2: cuanto se le permite al testigo APARTE de la falda de la campana.
 *
 * **El tope no es un numero elegido: se calcula.** La falda esperada sale del Q
 * que la consola declara y del realce y el corte que esta corrida midio, con la
 * formula de una campana estandar; esto es lo que se le suma por ruido del
 * instrumento. Un tope redondo era lo que hacia imposible a C2 con el testigo en
 * 100 Hz.
 */
const C2_HOLGURA_DB = 0.15;

/**
 * El coeficiente cuadratico de un ajuste de segundo orden, por minimos cuadrados.
 *
 * Es lo que mide si la ley se aparta de una recta. La pendiente del residuo no
 * puede: los residuos de un ajuste lineal son ortogonales a la x del ajuste, asi
 * que su pendiente es cero por construccion.
 */
function ajusteCuadratico(xs: readonly number[], ys: readonly number[]): number {
  const N = 3;
  const A: number[][] = Array.from({ length: N }, () => Array.from({ length: N + 1 }, () => 0));
  for (let i = 0; i < xs.length; i++) {
    const base = [1, xs[i]!, xs[i]! * xs[i]!];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) A[r]![c]! += base[r]! * base[c]!;
      A[r]![N]! += base[r]! * ys[i]!;
    }
  }
  for (let i = 0; i < N; i++) {
    const piv = A[i]![i]!;
    if (piv === 0) return NaN;
    for (let j = i; j <= N; j++) A[i]![j]! /= piv;
    for (let k = 0; k < N; k++) {
      if (k === i) continue;
      const f = A[k]![i]!;
      for (let j = i; j <= N; j++) A[k]![j]! -= f * A[i]![j]!;
    }
  }
  return A[2]![N]!;
}

/** La falda de una campana estandar en `f`, con centro `f0`, Q y ganancia `G` dB. */
function faldaDb(f: number, f0: number, Q: number, G: number): number {
  const A = Math.pow(10, G / 40);
  const x = f / f0;
  const num = Math.hypot(1 - x * x, (x * A) / Q);
  const den = Math.hypot(1 - x * x, x / (A * Q));
  return 20 * Math.log10(num / den);
}
/** L1: el crudo 0,5 tiene que ser el punto plano. */
const L1_PLANO_MAXIMO_DB = 0.2;
/** L5: la simetria entre el corte y el realce. */
const L5_ASIMETRIA_MAXIMA_DB = 0.5;
/** L3: cuanto se le permite apartarse de una recta. */
const L3_RESIDUO_MAXIMO_DB = 0.3;
/**
 * L3b: cuanto puede aportar la curvatura en el borde del recorrido.
 *
 * La mitad de lo que L3 tolera: una cota de maximo no ve la estructura, asi que el
 * control que la busca tiene que ser mas fino que el que la acota.
 */
const L3B_CURVATURA_MAXIMA_DB = 0.15;
/** L6: ida y vuelta. */
const L6_HISTERESIS_MAXIMA_DB = 0.5;
/**
 * L8: cuanto puede apartarse el medidor del canal del realce medido.
 *
 * El escalon del medidor es 0,333 dB y son dos lecturas, asi que 0,667 es la
 * cuantizacion sola. Con 1,5 hay lugar para eso y para la dispersion del promedio,
 * y sigue siendo mucho mas chico que el aplanamiento que produciria un recorte.
 */
const L8_DESVIO_MAXIMO_DB = 1.5;
const SEGUNDOS_DE_CAPTURA = 3;

/**
 * El punto plano declarado: el arranque del barrido y la referencia de toda la ley.
 *
 * **La ganancia de cada punto es su nivel menos el de este crudo**, asi que de el
 * cuelga todo. L1 lo pone a prueba contra el ecualizador puenteado: si `0,5` no es
 * el punto plano, la tabla que lo supone esta mal.
 */
const CRUDO_PLANO = 0.5;
/** Un punto vale si esta este margen por encima del piso EFECTIVO. */
const MARGEN_MINIMO_DB = 45;
/**
 * **L4: cuanto recorrido hace falta para que el ajuste signifique algo.**
 *
 * **Valia 30, y 30 es exactamente la respuesta +-15.** Una auditoria lo midio y es
 * el peor lugar donde puede estar este numero: el item existe para decidir entre
 * +-15 --que la tabla declara-- y +-20 --que el item 101 vio--, y el piso estaba
 * puesto en el recorrido de la primera. Con +-15 y una corrida perfecta el
 * recorrido da 30,00 y pasa por CERO margen, asi que cualquier ruido la tumba; y
 * basta perder un crudo por punta --recorte, margen, un tartamudeo del
 * reproductor-- para quedarse en 27 y no publicar nada. Con +-20 sobrevive
 * perdiendo dos. El item 101, mismo instrumento y mismo banco, anulo 2 de 8.
 *
 * O sea que la corrida estaba armada para no poder contestar una de sus dos
 * respuestas.
 *
 * **El razonamiento que sostenia el 30 era circular**: «por debajo de esto no se
 * distingue +-15 de +-20». No hace falta medir 30 dB de recorrido para
 * distinguirlas: las distingue la PENDIENTE del ajuste de L3, que con 27 dB de
 * recorrido sale igual de determinada. El numero confundia «datos suficientes para
 * ajustar» con «la respuesta misma».
 *
 * Ahora son 24: deja a +-15 sobreviviendo dos crudos perdidos por lado, lo mismo
 * que +-20, y sigue siendo mucho mas que lo que un ajuste necesita. Quien decide
 * entre las dos hipotesis es la pendiente, y L4 solo cuida que haya con que
 * ajustar.
 */
const RECORRIDO_MINIMO_DB = 24;

/**
 * **Lo que C1 dimensiona, que NO es lo mismo y por eso es otro numero.**
 *
 * C1 comprueba ANTES de barrer que el centro tenga margen de sobra, y para eso usa
 * una cota superior de cuanto va a bajar el punto mas hondo. Hasta ahora compartia
 * constante con el piso de L4 --eran el mismo 30-- y bajar el piso habria aflojado
 * tambien la precondicion, que es la direccion insegura: menos margen exigido
 * significa puntos cayendose al piso a mitad del barrido.
 *
 * Asi que se queda en 30, con el comportamiento de hoy intacto. Es conservador
 * para las dos hipotesis --el punto mas hondo baja 15 o 20, no 30-- y esa holgura
 * es deliberada.
 */
const EXCURSION_PREVISTA_DB = 30;
/**
 * **Por debajo de esto, ninguna expectativa decide.**
 *
 * Sin un minimo, una expectativa decide en el vacio: con un punto la recta de L3
 * pasa exacto, la prueba de rachas no tiene rachas y la curvatura no esta
 * determinada.
 */
const PUNTOS_MINIMOS = 10;
/**
 * El piso de cuadros VU2 por captura, y **por que ya no son 20**.
 *
 * **La premisa vieja estaba dada vuelta para este estimulo.** El criterio era 20
 * cuadros, con el argumento «menos que esto y el promedio no es un promedio»,
 * que supone cuadros como muestras ruidosas a promediar. Medido el 2026-09-15:
 * la consola emite `VU2` cuando el nivel CAMBIA, no a cadencia fija --138
 * cuadros en 6 s con 13 valores distintos en silencio, contra 12 cuadros con UN
 * valor distinto con un tono sostenido--. Ver
 * `docs/backlog/hallazgo-el-medidor-se-emite-por-cambio.md`.
 *
 * Este item mide con un tono sostenido a proposito, o sea con el medidor quieto,
 * o sea en la condicion que menos cuadros produce. El criterio castigaba a la
 * corrida por hacer bien lo que el contrato le pide, y la castigaba MAS cuanto
 * mas estable estuviera el banco. Las tres capturas de la segunda corrida
 * juntaron 8, 8 y 5 cuadros: no faltaba informacion, sobraba exigencia.
 *
 * **Tres es un piso, no una muestra**: con menos no hay con que comparar. Lo que
 * de verdad protege el promedio es el acuerdo entre las lecturas, y de eso se
 * ocupa `RECORRIDO_MAXIMO_DEL_MEDIDOR_DB`.
 */
const CUADROS_MINIMOS = 3;
/**
 * Cuanto pueden separarse entre si las lecturas del medidor dentro de UNA captura.
 *
 * **Sale del aparato, no de una preferencia.** El medidor tiene
 * `MEDIDOR_RANGO_DB` = 80 dB repartidos en 255 escalones, o sea **0,3137 dB por
 * escalon**. Este tope son **dos escalones**: el minimo que tolera el ruido de
 * cuantizacion sin dejar pasar un medidor que se mueve de verdad.
 *
 * Dentro de una captura la ganancia esta fija y el tono es sostenido, asi que el
 * medidor deberia estar quieto; las corridas medidas dan **un** valor distinto
 * por captura, o sea recorrido cero, con los dos escalones enteros de margen.
 *
 * **Es mas exigente que el criterio viejo donde importa.** Veinte cuadros
 * moviendose cinco decibeles pasaban el anterior y son basura; tres cuadros
 * identicos lo fallaban y son una medicion perfecta. Este invierte los dos.
 */
const RECORRIDO_MAXIMO_DEL_MEDIDOR_DB = 2 * (MEDIDOR_RANGO_DB / 255);
/**
 * Cuanto se espera de mas, por captura, a que el medidor junte sus tres cuadros.
 *
 * Con 42 puntos, el peor caso agrega poco mas de dos minutos a una corrida de
 * seis. Es barato comparado con volver a correrla entera porque una captura se
 * quedo callada.
 */
const ESPERA_EXTRA_MAXIMA_MS = 3000;
/**
 * C1: el plano tiene que estar al menos esto por encima del piso efectivo.
 *
 * **Es la condicion necesaria para que L4 pueda pasar, y es conservadora a
 * proposito.** Cualquier punto util necesita `MARGEN_MINIMO_DB` sobre el piso, y
 * el punto mas bajo esta, como mucho, todo el recorrido por debajo del plano — que
 * es la cota que se puede afirmar ANTES de medir cuanto corta. Si el corte real
 * fuera la mitad del recorrido, exigir esto pide mas de lo necesario, y esa es la
 * direccion segura: aborta a los treinta segundos en vez de barrer cinco minutos
 * para no publicar nada.
 *
 * (La primera version tenia tres numeros distintos: 75 en el codigo, 85 en el
 * contrato, y un docblock que decia «45 + 40 = 85» sobre un `RECORRIDO_MINIMO_DB`
 * que vale 30. Los dos ultimos eran del item 107, de donde se copio la formula.)
 */
const C1_SOBRE_EL_PISO_DB = MARGEN_MINIMO_DB + EXCURSION_PREVISTA_DB;

/**
 * L2: la referencia interna de la interfaz no puede derivar mas que esto.
 *
 * **El numero sale de lo que L3b puede resolver.** L3b declara estructura cuando la
 * curvatura aporta 0,15 dB en el borde del recorrido; un control del instrumento
 * mas grueso que eso dejaria que la computadora fabricara ese hallazgo. 0,05 es
 * holgado contra lo medido: 0,00 dB de deriva sobre 42 capturas en el 106 y 50 en
 * la 104.
 */
const L2_DERIVA_MAXIMA_DB = 0.05;

/**
 * **Dos** crudos deliberadamente FUERA de la rejilla de centesimos: `0,7037` y
 * `0,2963`, uno de cada lado del plano.
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
const carpeta = mkdtempSync(join(tmpdir(), 'vse-108-'));

/**
 * Estimulo de DOS tonos: el centro de la banda y el testigo, bien debajo de ella.
 *
 * Cada uno a `NIVEL_DBFS`, asi que la suma tiene un pico de 6 dB mas en el peor
 * caso. Las dos frecuencias completan un numero entero de ciclos en cada segundo
 * --las dos son enteras-- asi que no hay discontinuidad en el bucle del archivo.
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
// **El medidor de SALIDA del canal, que esta aguas ABAJO del ecualizador.**
//
// Aca no es un testigo de que la fuente no se movio --se va a mover cuarenta
// decibeles, que es lo que el barrido hace--. Es otra cosa, y hace falta: **es el
// unico instrumento que puede ver un recorte ADENTRO de la consola**.
//
// Bajar el fader del canal protege al conversor de la interfaz, pero el fader esta
// DESPUES del ecualizador, asi que no protege de que el canal sature con +20 dB de
// realce. Ese recorte llegaria a la Scarlett a un nivel comodo, sin marca, y se
// leeria como una ley que se aplana arriba: un hallazgo falso contra la consola.
// De eso se ocupa L8.
/**
 * Los cuadros del medidor, **con la hora a la que llegaron**.
 *
 * **La marca de tiempo no es adorno: sin ella el promedio es de otro punto.**
 * `analizar()` es sincrono y bloquea el bucle de eventos unos 2,5 s por captura
 * --medido el 2026-09-15--. Los cuadros que la consola manda durante ese bloqueo
 * no se pierden: Node los encola y los entrega cuando el bucle se libera, que es
 * **despues** de que la captura siguiente hizo su `cuadros = []`. Resultado: la
 * captura N+1 contaba tambien los cuadros del analisis de la N, medidos con la
 * ganancia ANTERIOR.
 *
 * Comprobado midiendo: una ventana de 3,9 s que deberia traer 89 cuadros traia
 * 149 --37,7/s contra los 22,5/s reales del flujo--, y el exceso era justo el
 * atraso de la ventana previa.
 *
 * De ese promedio cuelga L8, que compara el medidor del canal contra el realce
 * pedido. Contaminarlo con el punto anterior corre la lectura hacia el punto
 * anterior, o sea **aplana la curva que L8 vigila**: exactamente la direccion en
 * la que L8 deja de ver un recorte interno.
 */
let cuadros: { canalSalida: number; llegada: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  cuadros.push({ canalSalida: c.salida, llegada: Date.now() });
});

type Medida = {
  canalDb: number; cuadros: number;
  /** Cuanto duro de verdad la ventana de grabacion, en ms. */
  ventanaMs: number;
  /** Cuadros que llegaron FUERA de la ventana y no entraron al promedio. */
  descartados: number;
  /**
   * Cuanto se separan entre si las lecturas del medidor de esta captura.
   *
   * Con la ganancia fija y el tono sostenido deberia ser cero. Es lo que decide
   * si el promedio significa algo, en lugar de cuantas lecturas hubo.
   */
  recorridoDelMedidor: number;
  /** El bin del centro de la banda: lo que se mide. */
  centroDb: number;
  /** El ruido del bin del testigo. Sin esto, un C2 en rojo no se diagnostica. */
  ruidoTestigoDb: number;
  /** El bin del testigo: lo que NO se puede mover mas que la falda. */
  testigoDb: number;
  referenciaDb: number; ruidoDb: number; margenDb: number; recorta: boolean;
};

let sonando: ReturnType<typeof spawn> | null = null;
let falloDelTono: Error | null = null;
/** El recorrido en dB de un conjunto de posiciones de medidor. Iguales => 0. */
const recorridoEnDb = (posiciones: number[]): number => {
  if (posiciones.length === 0) return NaN;
  const alto = Math.max(...posiciones);
  const bajo = Math.min(...posiciones);
  return alto === bajo ? 0 : dbDeMedidor(alto) - dbDeMedidor(bajo);
};
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
  // **El grabador ya no es mudo, y su codigo de salida se mira.**
  //
  // Estaba con `stdio: 'ignore'` y resolviendo en `close` sin leer el codigo: un
  // grabador que muriera diciendo por que --dispositivo ocupado, permiso de
  // microfono, la Scarlett desenchufada-- quedaba indistinguible de uno que
  // grabo bien, y lo que fallaba despues era el analisis, acusando a otra cosa.
  // Es la misma familia que el mensaje que se equivoca sobre si mismo.
  const t0 = Date.now();
  const hijo = spawn(GRABADOR, [String(SEGUNDOS_DE_CAPTURA), wav, 'Scarlett'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let errorDelGrabador = '';
  hijo.stderr?.on('data', (b: Buffer) => { errorDelGrabador += b.toString(); });
  const codigo = await new Promise<number | null>((resolver, rechazar) => {
    hijo.on('error', rechazar);
    hijo.on('close', (c) => resolver(c));
  });
  if (codigo !== 0) {
    throw new Error(`el grabador salio con ${codigo} en la captura «${etiqueta}» tras `
      + `${Date.now() - t0} ms (se pidieron ${SEGUNDOS_DE_CAPTURA} s). Lo que dijo: `
      + `${errorDelGrabador.trim() === '' ? '(nada)' : errorDelGrabador.trim()}`);
  }
  // **La ventana se ALARGA si el medidor no hablo, en vez de anular la captura.**
  //
  // La corrida del 2026-09-16 se freno con CERO cuadros en la captura «plano».
  // No era falta de senal --el tono estaba y el bin lo confirmaba-- sino lo
  // contrario: el nivel estaba tan quieto que la consola no tuvo nada que
  // informar. Con un flujo que se emite por cambio, un medidor perfectamente
  // estable puede callarse una ventana entera.
  //
  // **Alargar es legitimo, y conviene decir por que.** Durante todo el punto la
  // ganancia esta fija y el tono es sostenido, asi que el nivel del canal es una
  // propiedad del estado y no de esos 3,5 s en particular: un cuadro que llega
  // medio segundo despues describe el mismo estado. Lo que NO se alarga es el
  // audio --el bin del centro y el del testigo siguen saliendo de la misma
  // captura, que es lo que C2 necesita para comparar el mismo instante--.
  //
  // Se espera de a poco y con tope. Si el tope se agota, la captura se queda con
  // lo que junto y la guarda decide: es preferible informar «no hablo» a inventar
  // una espera infinita en el medio de un barrido con el tono sonando.
  let t1 = Date.now();
  const topeDeEspera = t1 + ESPERA_EXTRA_MAXIMA_MS;
  while (cuadros.filter((x) => x.llegada >= t0).length < CUADROS_MINIMOS
    && Date.now() < topeDeEspera) {
    await new Promise((r) => { setTimeout(r, 400); });
    t1 = Date.now();
  }
  const xs = cuadros.filter((x) => x.llegada >= t0 && x.llegada <= t1);
  const ventanaMs = t1 - t0;
  const descartados = cuadros.length - xs.length;
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
  // **Toda captura deja dicho cuantos cuadros junto.** La corrida del
  // 2026-09-15 fallo con «2 cuadros» en la primera captura con tono, y no se
  // pudo saber si C0 --la anterior-- habia estado sana, porque nadie lo
  // imprimia. Un numero que solo aparece cuando ya es tarde no sirve para
  // diagnosticar: hace falta la serie, no el caso que fallo.
  console.log(`   [captura ${etiqueta}] ${xs.length} cuadros VU2 en ${ventanaMs} ms`
    + ` = ${(xs.length / (ventanaMs / 1000)).toFixed(1)}/s`
    + (descartados > 0 ? `, ${descartados} fuera de ventana descartado(s)` : '')
    + `, se separan ${xs.length === 0 ? '(sin datos)'
      : `${recorridoEnDb(xs.map((x) => x.canalSalida)).toFixed(2)} dB`}`);
  const c = anCentro.canales[ENTRADA_GENERAL_MEDIDA]!;
  const tg = anTestigo.canales[ENTRADA_GENERAL_MEDIDA]!;
  return {
    canalDb: dbDeMedidor(media(xs.map((x) => x.canalSalida))),
    cuadros: xs.length,
    // **Con todas las lecturas iguales el recorrido es CERO, aunque sean
    // -Infinity.** Con el canal muteado el medidor da posicion 0, que
    // `dbDeMedidor` manda a -Infinity, y la resta daba `NaN` --que despues
    // fallaba toda comparacion y se leia como «el medidor se movio»--. Un
    // conjunto de valores identicos no tiene dispersion, y el caso mudo es el
    // mas identico de todos.
    recorridoDelMedidor: recorridoEnDb(xs.map((x) => x.canalSalida)),
    ventanaMs,
    descartados,
    centroDb: c.tonoDb,
    testigoDb: tg.tonoDb,
    ruidoTestigoDb: tg.ruidoEnBinDb,
    margenDb: c.margenEnBinDb,
    ruidoDb: c.ruidoEnBinDb,
    recorta: c.recorteExacto,
    referenciaDb: anCentro.canales[ENTRADA_REFERENCIA]!.tonoDb,
  };
}

/** El Q de la banda, leido del aparato en el montaje. De el sale el tope de C2. */
let qDeLaBanda = NaN;

// ---------------------------------------------------------------- montaje
avisarSiHayPendiente();
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
  // **El compresor del GENERAL, que tambien esta en el camino.** El 107 lo
  // neutralizaba y este guion se llevo el del canal y dejo el del general: lo que
  // se mediria seria la ley del ecualizador MAS la compresion del general, y el
  // barrido mueve cuarenta decibeles. C2 lo cazaria --un compresor es ganancia de
  // banda ancha y moveria tambien el testigo-- pero recien despues de gastar la
  // corrida y con un mensaje que no lo nombra.
  ['m.dyn.bypass', Number(exigirClave(e0, 'm.dyn.bypass'))],
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
  // La puerta del general tambien depende del nivel. Se exige apagada en vez de
  // apagarla: es una escritura menos sobre el general del usuario.
  exigir('m.gate.enabled', '0', 'una puerta en el general depende del nivel y el barrido '
    + 'mueve cuarenta decibeles');
  exigir('m.dim', '0', 'un dim cambia el nivel y su profundidad no esta medida');

  // **Las CINCO bandas planas, la que se barre incluida.** Si otra estuviera
  // torcida, su falda podria tocar el centro o el testigo y lo que se mediria seria la
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
        + 'La falda de una banda torcida podria tocar el centro o el testigo.');
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
    // **El Q sale del aparato y alimenta el tope de C2.** La ley `0,05·300^v` la
    // midio el item 101 contra el filtro real.
    qDeLaBanda = 0.05 * Math.pow(300, crudoQ);
    // Sin esto, un crudo no numerico dejaba `qDeLaBanda` en NaN, el tope de C2 en
    // NaN, y C2 fallaba cinco minutos despues acusando a la consola de «se movio
    // algo global». Aca es gratis.
    if (!Number.isFinite(qDeLaBanda)) {
      throw new Error(`el Q de la banda dio ${qDeLaBanda} desde el crudo ${crudoQ}: sin Q `
        + 'no se puede calcular la falda, y el tope de C2 sale de ahi.');
    }
    console.log(`   banda ${banda} en ${hz.toFixed(1)} Hz, Q crudo ${crudoQ} `
      + `(${qDeLaBanda.toFixed(3)}), se registran y NO se tocan`);
    console.log(`   falda de esa campana en el testigo de ${HZ_TESTIGO} Hz: `
      + `${Math.abs(faldaDb(HZ_TESTIGO, HZ, qDeLaBanda, 20)).toFixed(3)} dB por lado con ±20, `
      + `o sea ${(2 * Math.abs(faldaDb(HZ_TESTIGO, HZ, qDeLaBanda, 20))).toFixed(3)} de RANGO`);
  }

  // Los filtros de corte no pueden estar comiendo ninguno de los dos tonos.
  {
    const hpf = Math.min(20 * Math.pow(1102.5, Number(exigirClave(e0, `i.${n}.eq.hpf.freq`))), 1000);
    const lpf = Math.max(20 * Math.pow(1102.5, Number(exigirClave(e0, `i.${n}.eq.lpf.freq`))), 1000);
    // **`hpf < HZ_TESTIGO`, y no `HZ_TESTIGO / 2`.** Con el testigo en 100 Hz la
    // mitad daba 50 y el pasa-altos del usuario en 20 pasaba; al bajar el testigo a
    // 37, la mitad quedo en 18,5 y **la corrida abortaba en el montaje sobre una
    // consola sana**. Mover el testigo cruzo una guarda que se dejo con la formula
    // vieja.
    //
    // Y en sustancia la mitad pedia de mas: un pasa-altos de 20 Hz atenua el bin de
    // 37 unos 0,3 dB, pero eso es **estatico**, y C2 mide el RANGO del testigo a lo
    // largo del barrido, donde una atenuacion fija se cancela. Lo que si importa es
    // que el testigo conserve margen sobre su piso, y de eso se ocupa la anulacion.
    if (hpf >= HZ_TESTIGO || lpf < HZ * 2) {
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
  m: Medida; atenuacion: number; anulado: string | null;
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
// **El papelito, ANTES de la primera escritura.** Si a este proceso lo matan de
// golpe --SIGKILL, corte de energia--, `conRestauracion` no llega a correr y lo
// unico que sabe que hay que restaurar muere con el. El papelito sobrevive.
anotarPendiente('ley-ganancia-del-eq.ts', maquina, PREVIO);

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
    t.enviar(codificarSetd('m.dyn.bypass', 1));
    t.enviar(codificarSetd(`i.${n}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.gate.enabled`, 0));
    t.enviar(codificarSetd(`i.${n}.deesser.enabled`, 0));
    // **El fader del canal, para hacer lugar al realce.** Con el fader donde
    // estaba, un realce de +20 dB dejaria el PICO capturado en -0,18 dBFS segun la
    // cadena que midio el item 107, o sea al borde del recorte del conversor. El fader esta DESPUES del ecualizador, asi que bajarlo
    // no cambia el nivel al que el filtro trabaja.
    t.enviar(codificarSetd(`i.${n}.mix`, FADER_PARA_HACER_LUGAR));
    await new Promise((r) => setTimeout(r, 2500));
    {
      const leido = await leerUnaClave(maquina, `i.${n}.mix`);
      if (Math.abs(leido - FADER_PARA_HACER_LUGAR) > 1e-9) {
        throw new Error(`i.${n}.mix quedo en ${leido} y hace falta ${FADER_PARA_HACER_LUGAR}: `
          + 'sin ese margen el realce recorta y la ley se mide contra un techo.');
      }
      for (const k of [`i.${n}.dyn.bypass`, 'm.dyn.bypass']) {
        const bypass = await leerUnaClave(maquina, k);
        if (bypass !== 1) {
          throw new Error(`${k} quedo en ${bypass}: ese compresor sigue activo y depende `
            + 'del nivel, que es lo que el barrido mueve cuarenta decibeles.');
        }
      }
      // **La unica cuya perdida le cuesta algo AL USUARIO y no a la medicion.**
      //
      // Las tres de arriba se releen porque si se pierden, la ley sale mal. Esta
      // se relee por otra cosa: si el `setd` no llega, el supresor del general
      // aprende de los 900 s de tono a 1 kHz que estan por empezar y **planta una
      // notch de -18 dB con Q 7 en el general del usuario**. Sacarla exige
      // `clearall`, que se lleva la pila entera incluido su ring-out.
      //
      // No es hipotetico: el guion hermano lo dice --«ya paso dos veces; la
      // segunda le costo tres filtros»-- y esa es la regla del 2026-09-13.
      //
      // La comparacion de la pila que este guion hace al final DETECTA el dano y
      // no lo PREVIENE, y para entonces ya no se puede deshacer. Una comprobacion
      // que llega despues del hecho es un reproche, no una guarda.
      {
        const afs = await leerUnaClave(maquina, 'm.afs.enabled');
        if (afs !== 0) {
          throw new Error('m.afs.enabled quedo en ' + afs + ': el supresor del general sigue '
            + 'encendido y el estimulo son 900 s de tono sostenido a 1 kHz. Abortar aca cuesta '
            + 'una corrida; seguir cuesta una notch permanente en la consola del usuario.');
        }
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
    // **Que el puenteo haya llegado se comprueba, no se supone.** Si no llega,
    // `mPuenteado` y `mPlano` son dos capturas de la MISMA condicion, la diferencia
    // da cero, y L1 imprime «PASA, el crudo del centro no agrega ni saca nada»
    // habiendo comparado una cosa consigo misma. L1 es uno de los gates que
    // habilitan la ley, asi que el fallo seria en la direccion peligrosa.
    {
      const leido = await leerUnaClave(maquina, `i.${n}.eq.bypass`);
      if (leido !== 1) {
        throw new Error(`i.${n}.eq.bypass quedo en ${leido} y L1 lo necesita en 1: sin el `
          + 'puenteo, las dos capturas son la misma condicion y L1 pasaria comparando '
          + 'una cosa consigo misma.');
      }
    }
    const mPuenteado = await medir('C1-puenteado', true);
    t.enviar(codificarSetd(`i.${n}.eq.bypass`, previo(`i.${n}.eq.bypass`)));
    await new Promise((r) => setTimeout(r, 2000));
    const mPlano = await medir('C1-plano', true);
    // **Las dos capturas de las que sale L1 no pasaban por la anulacion**, y L1 es
    // uno de los gates que habilitan la ley. Era la unica data de la corrida sin
    // control de calidad.
    for (const [nombre, m] of [['puenteado', mPuenteado], ['plano', mPlano]] as const) {
      if (m.recorta) throw new Error(`la captura «${nombre}» de L1 recorta`);
      if (m.cuadros < CUADROS_MINIMOS) {
        throw new Error(`la captura «${nombre}» de L1 tiene ${m.cuadros} cuadros VU2 y hacen `
          + `falta ${CUADROS_MINIMOS}: con menos de tres no hay con que comparar. OJO: pocos `
          + `cuadros NO significa que falte senal --el flujo se emite por cambio y un tono `
          + `sostenido casi no lo mueve--; si son cero, la consola no emitio nada en la `
          + `ventana y hay que alargarla, no bajar el piso.`);
      }
      if (!(m.recorridoDelMedidor <= RECORRIDO_MAXIMO_DEL_MEDIDOR_DB)) {
        throw new Error(`las lecturas del medidor en la captura «${nombre}» de L1 se separan `
          + `${m.recorridoDelMedidor.toFixed(2)} dB y el tope es `
          + `${RECORRIDO_MAXIMO_DEL_MEDIDOR_DB.toFixed(2)} (dos escalones del medidor). Con la `
          + `ganancia fija y el tono sostenido el medidor deberia estar quieto: que se mueva `
          + `dice que la fuente no es estable, y el promedio no representa a ningun momento.`);
      }
      if (!(m.centroDb - pisoEfectivo >= MARGEN_MINIMO_DB)) {
        throw new Error(`la captura «${nombre}» de L1 esta a `
          + `${(m.centroDb - pisoEfectivo).toFixed(1)} dB del piso, y hacen falta ${MARGEN_MINIMO_DB}.`);
      }
    }
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
          crudo, crudoLeido, sentido, m, atenuacion: NaN, anulado: null,
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

/**
 * **Lo que L8 vio en el extremo de realce, con signo, para que L3 lo lea.**
 *
 * Una auditoria midio que los dos topes **no componen**, y es el defecto de diseno
 * mas caro que quedaba: L8 existe para que L3 no acuse en falso a la consola, pero
 * L8 tolera 1,5 dB y L3 tolera 0,3. Simulado sobre este mismo banco, con un
 * aplastamiento interno de entre **0,6 y 1,5 dB** L8 PASA y L3 FALLA diciendo «la
 * ley NO es lineal en el crudo» --que es justamente la acusacion falsa que L8 vino
 * a evitar, ocurriendo igual--. Cada tope tenia su justificacion propia y nunca se
 * compararon entre si.
 *
 * La salida no fue mover ningun tope --bajar el de L8 lo haria fallar en falso por
 * cuantizacion-- sino **hacer que L3 lea lo que L8 vio**. Si el medidor del canal
 * se aparto hacia ARRIBA de lo que la atenuacion medida predice, la explicacion
 * «algo aplasto aguas abajo del medidor» esta viva, y L3 no puede atribuir su
 * residuo a la ley.
 *
 * Y la comparacion es cuantitativa, no un «si vio algo»: un aplastamiento de Δ dB
 * produce en L3 un residuo de ~0,52·Δ y en L8 un desvio de ~0,99·Δ, asi que la
 * explicacion solo es consistente si **el desvio de L8 alcanza al residuo de L3**.
 */
let l8DesvioArriba: number | undefined;

// **PRIMERA PASADA: quien vale.**
//
// **Esta pasada se perdio en una edicion y una auditoria lo encontro.** Sin ella
// `anulado` nacia en `null` y moria en `null`: `utiles` era `puntos`, un punto
// hundido en el ruido o una captura que recorto puntuaban igual, el piso de cuadros
// quedaba muerto, el detector de recorte pasaba de guarda a adorno, y **la guarda
// del punto de referencia quedaba vestigial** --su `ref.anulado !== null` no podia
// ser verdadero nunca--. El fosil que lo delataba era el rotulo «TERCERA» sin
// primera ni segunda.
//
// Y el daño no era un PASA tranquilizador: un tartamudeo de `afplay` en una
// captura la hundia al piso y L3 imprimia «la ley NO es lineal», un hallazgo falso
// contra la consola por un hueco de reproduccion que el guion ya no podia marcar.
for (const p of puntos) {
  const margen = p.m.centroDb - pisoEfectivo;
  if (!(margen >= MARGEN_MINIMO_DB)) {
    p.anulado = `margen de ${margen.toFixed(2)} dB sobre el piso efectivo`;
  }
  if (p.m.recorta && p.anulado === null) p.anulado = 'la captura recorta';
  if (p.m.cuadros < CUADROS_MINIMOS && p.anulado === null) {
    p.anulado = `solo ${p.m.cuadros} cuadros VU2: con menos de tres no hay con que comparar`;
  }
  if (!(p.m.recorridoDelMedidor <= RECORRIDO_MAXIMO_DEL_MEDIDOR_DB) && p.anulado === null) {
    p.anulado = `el medidor se movio ${p.m.recorridoDelMedidor.toFixed(2)} dB dentro de la `
      + `captura, y el tope son ${RECORRIDO_MAXIMO_DEL_MEDIDOR_DB.toFixed(2)}`;
  }
  // **Y el testigo tambien tiene que estar sobre SU piso.** C2 se decide sobre el
  // bin de 37 Hz, que es zona de retumbe y de la falda del pasa-altos; sin esto,
  // un C2 en rojo no se puede diagnosticar. El dato ya se estaba calculando y
  // tirando: `anTestigo` devuelve su propio ruido.
  const margenT = p.m.testigoDb - p.m.ruidoTestigoDb;
  if (!(margenT >= MARGEN_MINIMO_DB) && p.anulado === null) {
    p.anulado = `el TESTIGO esta a ${margenT.toFixed(2)} dB de su piso`;
  }
}

/**
 * **El punto de referencia tiene que servir, y aca es el crudo plano.**
 *
 * De el cuelga TODA la ley: la ganancia de cada punto es su nivel menos el del
 * plano. Con la referencia mala, los veintitantos puntos salen sesgados lo mismo y
 * en el mismo sentido, y eso no se lee como un error sino **como una ley corrida**
 * --una ordenada al origen que no es cero-- que es justo lo que L1 mira.
 *
 * Ninguna guarda de `NaN` puede ver esto: con la referencia anulada todos los
 * numeros son finitos.
 */
// **SEGUNDA PASADA: el punto de referencia, ya con las anulaciones decididas.**
//
// **El orden importa y se rompio dos veces.** Al restaurar la pasada de anulacion
// quedo DESPUES de este bloque, asi que `ref.anulado` seguia siendo `null` cuando
// se lo miraba y la guarda seguia siendo vestigial — el mismo defecto que el item
// 106 tuvo y que este guion copio de su arreglo. Lo encontro
// `tools/spikes/restos-de-edicion.mjs` en su primera corrida, por el rotulo
// «TERCERA» sin «SEGUNDA».
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
    const ats = utiles.map((x) => x.atenuacion).filter(Number.isFinite);
    // **El tope se CALCULA de la falda**, con el Q que la consola declara y el
    // realce y el corte que esta corrida midio. Un numero redondo era lo que hacia
    // imposible a C2 con el testigo en 100 Hz.
    // **La falda se calcula con el recorrido ACOTADO, no con el medido a secas.**
    // Si algo que quedo vivo aplastara el canal en el corte, `min(ats)` se iria a
    // -60, la falda daria 3,75 dB y el tope 3,96: C2 daria PASA sobre un testigo
    // que se movio tres decibeles enteros. El control que el contrato llama «lo que
    // hace honesta a la medicion» se volveria auto-cumplido en el unico caso en que
    // hace falta.
    const TOPE_DE_LEY_DB = 25;
    const acotar = (g: number): number => {
      const v = Math.max(-TOPE_DE_LEY_DB, Math.min(TOPE_DE_LEY_DB, g));
      // **Y se dice cuando muerde.** El caso en que muerde es exactamente el
      // interesante: o la ley es mas grande de lo que nadie cree, o algo quedo vivo
      // aplastando el canal. Los dos son hallazgos y los dos eran invisibles.
      if (v !== g) {
        console.log(`   AVISO: el recorrido medido llego a ${g.toFixed(1)} dB y la falda se `
          + `calcula acotando a ${v} — o la ley es mayor que ±${TOPE_DE_LEY_DB}, o algo `
          + 'quedo vivo aplastando el canal.');
      }
      return v;
    };
    const falda = Math.abs(faldaDb(HZ_TESTIGO, HZ, qDeLaBanda, acotar(Math.max(...ats))))
      + Math.abs(faldaDb(HZ_TESTIGO, HZ, qDeLaBanda, acotar(Math.min(...ats))));
    const tope = falda + C2_HOLGURA_DB;
    // **`Number.isFinite` acá NO protege de nada, y se deja dicho.** Con `ats` vacio
    // `Math.max(...[])` da -Infinity, pero `acotar` lo lleva a -25 y el tope sale
    // finito igual. La proteccion la da el minimo de lecturas de arriba. Queda la
    // comprobacion porque es barata, sin el comentario que afirmaba lo contrario.
    const ok = Number.isFinite(tope) && rango <= tope;
    console.log(`   rango ${d(rango)} dB mientras el centro se mueve `
      + `${d(Math.max(...ats) - Math.min(...ats))} dB`);
    console.log(`   tope ${d(tope)} = ${d(falda)} de falda de la campana (Q ${qDeLaBanda.toFixed(3)}) `
      + `+ ${C2_HOLGURA_DB} de holgura`);
    console.log(ok ? '   PASA. Lo que se movio fue la banda y no el camino entero.'
      : '   FALLA. Se movio algo global: esta corrida NO mide la ley del ecualizador.');
    if (!ok) problemas.push('C2');
  }
}
{
  // **L8 — el medidor del canal sigue al realce, o hubo recorte adentro.**
  // Se compara el CAMBIO del medidor contra el cambio medido en la interfaz, y solo
  // donde el medidor esta lejos de su fondo de escala: abajo se aplasta por el piso
  // del medidor y no por la consola.
  const conMedidor = utiles.filter((p) => Number.isFinite(p.m.canalDb) && p.m.canalDb > -70
    && Number.isFinite(p.atenuacion));
  // **El plano de SU MISMO sentido**, como hace `planos`. Con el de 'baja' para los
  // dos, cualquier deriva entre pasadas entraba como sesgo fijo en la mitad de los
  // puntos.
  const planoDe = (sentido: 'baja' | 'sube'): Punto | undefined =>
    conMedidor.find((p) => p.sentido === sentido && p.crudo === CRUDO_PLANO);
  const refM = planoDe('baja');
  // **Los dos sentidos, porque el bucle usa los dos.** El guarda miraba solo el
  // plano de «baja» --era lo correcto cuando todos los puntos se comparaban contra
  // el, antes de que la quinta ronda hiciera que cada punto use el plano de SU
  // sentido--. Con el guarda viejo, si el plano de «sube» quedaba fuera del filtro,
  // sus 21 puntos se salteaban en silencio, `conMedidor.length` los seguia contando
  // y L8 decidia sobre la mitad de los datos diciendo que uso todos.
  const conPlano = conMedidor.filter((p) => planoDe(p.sentido) !== undefined);
  console.log(`\nL8 el medidor del canal sigue al realce: ${conPlano.length} puntos por `
    + `encima del fondo de escala y con su plano${conPlano.length === conMedidor.length ? ''
      : ` (${conMedidor.length - conPlano.length} quedaron sin plano de su sentido)`}`);
  if (refM === undefined || conPlano.length < PUNTOS_MINIMOS) {
    console.log('   NO DECIDE: sin el plano o con menos de '
      + `${PUNTOS_MINIMOS} puntos utiles no hay con que comparar.`);
    problemas.push('L8 sin puntos');
  } else {
    // **El medidor es de BANDA ANCHA y `atenuacion` es un bin.** Comparar uno con
    // otro era imposible por aritmetica: con dos tonos de igual amplitud, en el
    // corte maximo el testigo DOMINA el medidor --baja 3 dB mientras el bin baja
    // 20-- y L8 habria fallado siempre, con el mensaje «hubo recorte ADENTRO», que
    // es falso. Lo encontro una auditoria calculandolo.
    //
    // Lo que el medidor tiene que seguir es la suma de los dos tonos: si uno se
    // mueve `g` dB y el otro no, la potencia total cambia
    // `10·log10((10^(g/10) + 1) / 2)`. Con eso el desvio esperado es cero en todo
    // el recorrido, y lo que quede es lo que L8 vino a buscar.
    // **¿El medidor de la consola es de potencia o de pico? No se sabe, asi que se
    // miden las dos y se dice cual ajusta.**
    //
    // Con dos tonos iguales la prediccion depende de eso: potencia da
    // `10·log10((10^(g/10)+1)/2)` y pico `20·log10((10^(g/20)+1)/2)`, y en los
    // extremos difieren **2,23 dB** contra un tope de 1,5. Suponer una de las dos
    // habria producido, si era la otra, la misma acusacion falsa de recorte que esta
    // expectativa vino a evitar.
    //
    // El 99b calibro la escala del medidor con UN seno, donde pico y eficaz se
    // diferencian en una constante que se absorbe en la calibracion y se cancela en
    // toda diferencia. **El estimulo de dos tonos es la primera vez en este proyecto
    // que la distincion importa**, asi que L8 la mide de paso.
    //
    // El veredicto es sobre la hipotesis COMPUESTA --el medidor es una de las dos--
    // y por eso alcanza con que una ajuste. Si ninguna ajusta, eso si es el recorte
    // que se busca.
    const modelos = [
      ['potencia', (g: number) => 10 * Math.log10((Math.pow(10, g / 10) + 1) / 2)],
      ['pico', (g: number) => 20 * Math.log10((Math.pow(10, g / 20) + 1) / 2)],
    ] as const;
    const ajustes = modelos.map(([nombre, f]) => {
      let peor = 0;
      // **Y el desvio CON SIGNO en el extremo de realce**, que es lo que L3 necesita
      // saber y el maximo absoluto pierde. Ver el bloque de L3.
      let arriba = 0;
      let atArriba = -Infinity;
      for (const p of conPlano) {
        const r = planoDe(p.sentido)!;
        const crudoDesvio = (p.m.canalDb - r.m.canalDb) - f(p.atenuacion);
        const dif = Math.abs(crudoDesvio);
        if (dif > peor) peor = dif;
        if (p.atenuacion > atArriba) { atArriba = p.atenuacion; arriba = crudoDesvio; }
      }
      return { nombre, peor, arriba };
    });
    for (const a of ajustes) {
      console.log(`   si el medidor fuera de ${a.nombre.padEnd(9)}: desvio maximo `
        + `${a.peor.toFixed(2)} dB`);
    }
    const mejor = ajustes.reduce((m, a) => (a.peor < m.peor ? a : m), ajustes[0]!);
    const ok = mejor.peor <= L8_DESVIO_MAXIMO_DB;
    // **Si las DOS ajustan, no se nombra ninguna.** El veredicto es sobre la
    // hipotesis compuesta --el medidor es una de las dos-- y eso sigue valiendo,
    // pero decir cual seria elegir por un margen que no separa nada. Una auditoria
    // lo midio: las dos predicciones se separan 1,5 dB recien en |g| = 13,1, asi que
    // si el barrido pierde los crudos extremos las dos entran y el ganador se
    // decide por centesimas. Con la ley +-15 y dos crudos anulados por lado, que es
    // lo que le paso al item 101, pasa siempre.
    //
    // Y hay un tercer detector posible que nadie midio --uno que integre en una
    // ventana comparable al cuadro-- que caeria justo ahi. Nombrarlo seria archivar
    // una moneda como medicion.
    const cuantasAjustan = ajustes.filter((a) => a.peor <= L8_DESVIO_MAXIMO_DB).length;
    l8DesvioArriba = mejor.arriba;
    console.log(`   tope ${L8_DESVIO_MAXIMO_DB}`);
    console.log(ok
      ? (cuantasAjustan === 1
        ? `   PASA, y de paso: el medidor del canal se comporta como de ${mejor.nombre.toUpperCase()}. `
          + 'Nada recorto adentro de la consola.'
        : '   PASA: nada recorto adentro de la consola. Pero las DOS predicciones '
          + 'entran en el tope, asi que esta corrida NO decide si el medidor es de '
          + 'pico o de potencia: haria falta que el barrido llegue a |g| > 13,1 dB '
          + 'con los dos extremos vivos.')
      : '   FALLA. El medidor no sigue al realce por NINGUNO de los dos modelos. Las '
        + 'dos explicaciones son: hubo recorte o limitacion ADENTRO --que es lo que '
        + 'esta expectativa busca-- o el medidor no es ninguno de los dos, que nadie '
        + 'midio. No se puede atribuir a la primera sin descartar la segunda.');
    console.log('   **L8 es un control del REALCE.** Su sensibilidad en +20 dB es 0,99 si el');
    console.log('   medidor es de potencia y 0,91 si es de pico; en -20 dB, 0,01 y 0,09. En el');
    console.log('   corte es casi ciego, y da igual, porque el recorte solo puede ocurrir');
    console.log('   arriba. (Las dos cifras iban antes como una sola, la de potencia, de');
    console.log('   cuando se suponia ese modelo; desde que el veredicto es sobre los dos hay');
    console.log('   que decir los dos.) Y solo ve lo que pase AGUAS ABAJO de donde ese medidor');
    console.log('   toma, que este proyecto no midio.');
    if (!ok) problemas.push('L8');
  }
}
{
  const ats = utiles.map((p) => p.atenuacion).filter(Number.isFinite);
  const recorrido = ats.length === 0 ? NaN : Math.max(...ats) - Math.min(...ats);
  const ok = ats.length >= PUNTOS_MINIMOS && recorrido >= RECORRIDO_MINIMO_DB;
  console.log(`\nL4 el recorrido total: ${d(recorrido)} dB sobre ${utiles.length} puntos `
    + `(minimo ${RECORRIDO_MINIMO_DB})`);
  console.log(`   maximo realce ${d(Math.max(...ats))} dB, maximo corte ${d(Math.min(...ats))} dB`);
  console.log('   La tabla declara ±15 y el item 101 vio +20 en el extremo. Los dos no');
  console.log('   pueden ser ciertos, y quien lo dice es la PENDIENTE de L3: ~30 dB por');
  console.log('   unidad de crudo es ±15 y ~40 es ±20. Este minimo solo cuida que haya con');
  console.log('   que ajustar, y por eso NO vale 30: 30 es una de las dos respuestas, y');
  console.log('   ponerlo ahi dejaba a ±15 pasando por cero margen.');
  if (ats.length < PUNTOS_MINIMOS) {
    // Con dos puntos que abarquen el recorrido, `recorrido >= 30` pasaba. Era el
    // unico gate sin piso propio.
    console.log(`   NO DECIDE: ${ats.length} puntos utiles y hacen falta ${PUNTOS_MINIMOS}.`);
    problemas.push('L4 sin puntos');
  } else if (!ok) { console.log('   FALLA.'); problemas.push('L4'); } else console.log('   PASA.');
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
      // **La otra explicacion del mismo residuo, cuando L8 la sostiene.** Ver el
      // docblock de `l8DesvioArriba`: L8 pasa con hasta 1,5 dB de desvio y L3 falla
      // con 0,3 de residuo, asi que entre medio L3 acusaba sola.
      const aplastamiento = !ok && peor.r < 0 && peor.y > 0
        && l8DesvioArriba !== undefined && l8DesvioArriba >= Math.abs(peor.r);
      console.log(ok ? '   PASA. Y es una COTA, no una identidad.'
        : (aplastamiento
          ? '   FALLA, y NO se puede atribuir a la ley: L8 vio el medidor del canal '
            + `${d(l8DesvioArriba!)} dB por encima de lo que la atenuacion medida predice, `
            + 'que alcanza para explicar este residuo. Posible APLASTAMIENTO INTERNO aguas '
            + 'abajo de donde ese medidor toma. La ley no se imprime, y el proximo paso es '
            + 'repetir con el estimulo 10 dB mas bajo: si el residuo se va, era aplastamiento.'
          : '   FALLA: la ley NO es lineal en el crudo.'));
      if (!ok) problemas.push(aplastamiento ? 'L3 (posible aplastamiento interno)' : 'L3');

      // **Ordenados por crudo, no por orden de barrido.** `CRUDOS` no es monotona
      // --sube de 0,50 a 1,00 y salta a 0,45-- asi que contar rachas en el orden en
      // que se midio fabrica cambios de signo espurios en el salto y TAPA la
      // curvatura. Comprobado con una ley curva sintetica: 3 cambios en el orden del
      // barrido contra 2 ordenados, con el umbral en 3,3.
      const ordenados = [...res].sort((a, b) => a.x - b.x);
      const signos = ordenados.map((x) => Math.sign(x.r)).filter((x) => x !== 0);
      let cambios = 0;
      for (let k = 1; k < signos.length; k++) if (signos[k] !== signos[k - 1]) cambios++;
      const esperados = (signos.length - 1) / 2;

      // **La curvatura, que es lo que la pendiente NO podia medir.** La version
      // anterior calculaba la pendiente del residuo contra la misma x del ajuste, y
      // eso es **cero por construccion**: los residuos de un ajuste por minimos
      // cuadrados son ortogonales a x. Medido: -4,1e-14. Se imprimia como si fuera
      // evidencia y no podia decir nada.
      //
      // El coeficiente cuadratico de un ajuste de segundo orden si lo dice, y se
      // informa en decibeles --cuanto aporta la curvatura en el borde del
      // recorrido-- que es la unidad en la que el umbral significa algo.
      const cuad = ajusteCuadratico(pts.map((x) => x.x), pts.map((x) => x.y));
      // **|c|/6 y no |c|/4.** `ajusteCuadratico` devuelve el coeficiente de x² crudo,
      // y la desviacion maxima de ese termino respecto de su PROPIA mejor recta sobre
      // [0,1] es |c|/6. Con 0,25 el numero impreso como «lo que aporta la curvatura»
      // estaba 1,5 veces sobrestimado: el rotulo no decia lo que el numero era.
      const aporteDb = Math.abs(cuad) / 6;
      const estructurado = cambios < esperados / 3 || aporteDb > L3B_CURVATURA_MAXIMA_DB;
      console.log(`\nL3b el residuo no tiene estructura: ${cambios} cambios de signo sobre `
        + `${signos.length} ordenados por crudo (con residuos independientes se `
        + `esperarian ~${esperados.toFixed(0)})`);
      console.log(`   termino cuadratico ${cuad.toFixed(3)} dB, que aporta ${aporteDb.toFixed(3)} dB `
        + `en el borde del recorrido (tope ${L3B_CURVATURA_MAXIMA_DB})`);
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
  // **El papelito se borra SOLO si la relectura dio bien.** Borrarlo igual seria
  // perder el unico registro de lo que falta arreglar, justo cuando hace falta.
  if (bien) cerrarPendiente();

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
