/**
 * La ley del fader de un bus auxiliar, medida contra el aparato.
 *
 * **Contrato:** `docs/compromisos/99a-ley-del-fader-de-bus.md`. Este guion
 * implementa ese contrato y no otro.
 *
 * **Por qué hace falta.** El usuario decidió que la aplicación pueda bajar el
 * auxiliar y el general para cazar un acople —«Los dos, con techo»—, y
 * `a.N.mix` va de 0 a 1 sin que nadie sepa a cuántos decibeles corresponde.
 * INV-004 rechaza todo parámetro sin límite declarado, y un límite en dB
 * necesita la ley.
 *
 * **El testigo viene incluido en el bloque.** El auxiliar es una tira mono de
 * cinco bytes, y los dos primeros cierran el experimento sobre sí mismo:
 *
 * - `+0` (`pre`) está **antes** del fader del bus,
 * - `+1` (`post`) está **después**.
 *
 * Así que mover el fader tiene que mover `post` y **no** `pre`. Si mueve los
 * dos, se movió algo entre el canal y el bus; si mueve `pre` y el testigo del
 * canal también, se movió la fuente.
 *
 * **Todo se expresa como atenuación respecto del tope del barrido.** `pre` y
 * `post` son tomas distintas y no hay motivo para suponer que comparten
 * referencia; suponerlo sería inventar un dato.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ley-del-fader-de-bus.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, decodificarVuBuses,
  dbDeMedidor, faderADb, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;

/**
 * El destino: un número de auxiliar (1 a 10), o `m` para el general.
 *
 * **Los dos tienen la misma forma en la trama** —`pre` antes del fader y `post`
 * después— y por eso comparten guion. El general son **dos** de esos bloques,
 * izquierdo y derecho, que se leen por separado: promediarlos escondería una
 * diferencia entre canales, que con una fuente mono sería un hallazgo.
 */
const destinoCrudo = argTexto(3, '5');
const esGeneral = destinoCrudo.toLowerCase() === 'm';
const b = esGeneral ? -1 : argIndice(3, 'auxiliar', 5, { desde: 1, hasta: 10 }) - 1;
const RUTA_FADER = esGeneral ? 'm.mix' : `a.${b}.mix`;
const RUTA_ENVIO = esGeneral ? null : `i.${n}.aux.${b}.value`;
const ETIQUETA = esGeneral ? 'general (m)' : `auxiliar ${b + 1} (a.${b})`;
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
const FM = 48000;

/** Un escalón del medidor, derivado. Ningún hallazgo por debajo de esto existe. */
const ESCALON_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

/**
 * Dos escalones: toda atenuación de esta corrida es una **diferencia** de dos
 * lecturas enteras, así que arrastra hasta dos cuantizaciones sin que nada se
 * haya movido.
 */
const TOLERANCIA_DB = 2 * ESCALON_DB;

/** El recorrido mínimo que hace falta para que la curva signifique algo. */
const RECORRIDO_MINIMO_DB = 20;

/**
 * Los valores del fader del bus a recorrer, de arriba hacia abajo.
 *
 * Paso fino a propósito: lo que interesa no es un punto sino la **forma** de la
 * curva. Un error de escala da un residuo plano contra el polinomio; una curva
 * distinta da un residuo que se mueve, y eso sólo se ve con varios puntos.
 */
const CRUDOS_COMPLETOS = [
  1.0, 0.95, 0.90, 0.85, 0.80, 0.7647058824, 0.72, 0.68, 0.64,
  0.60, 0.56, 0.52, 0.48, 0.44, 0.40, 0.36, 0.32, 0.28,
  0.24, 0.20, 0.16, 0.12, 0.08, 0.05,
];

/**
 * El barrido, recortado a donde el aparato ya está cuando el destino es el
 * general.
 *
 * **El general nunca se sube por encima de donde el usuario lo dejó.** El tope
 * del barrido, crudo 1,0, son +10 dB, y `m.mix` suele estar cerca de 0 dB: un
 * barrido completo **arrancaría subiendo diez decibeles el volumen de la sala**.
 *
 * Y no hace falta: la decisión del usuario es que la aplicación pueda **bajar**
 * el general para cazar un acople, nunca subirlo, así que el tramo de realce no
 * lo va a usar nadie. Se mide exactamente el recorrido que la aplicación va a
 * usar y ni un decibel más.
 *
 * En un auxiliar sí se barre entero: ahí la aplicación **sí** sube —los pedidos
 * de los músicos por QR— y el tramo de realce es parte de lo que va a usar.
 *
 * Si alguna vez hace falta la curva completa del general, es otra corrida y con
 * el usuario al lado del volumen.
 */
function crudosDelBarrido(esElGeneral: boolean, dondeEsta: number): readonly number[] {
  if (!esElGeneral) return CRUDOS_COMPLETOS;
  const tope = Math.min(1.0, dondeEsta);
  const recortados = CRUDOS_COMPLETOS.filter((c) => c <= tope + 1e-9);
  // El punto donde está ahora entra siempre, aunque no caiga en la lista: es el
  // tope del barrido y la referencia de toda la atenuación.
  return recortados.includes(tope) ? recortados : [tope, ...recortados];
}

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
  const ruta = join(tmpdir(), 'vse-fader-bus.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

interface Lectura {
  /** Antes del fader del bus. El testigo que viene con el bloque. */
  readonly preBus: number;
  /** Después del fader del bus. Lo que se mide. */
  readonly postBus: number;
  /** Antes de todo, en el canal. El testigo de la fuente. */
  readonly preCanal: number;
  readonly bytePost: number;
  /** El bloque derecho del general. `NaN` cuando el destino es un auxiliar. */
  readonly postDer: number;
  readonly reduccionBusDb: number;
  readonly puertaAbiertaSiempre: boolean;
  readonly cuadros: number;
}

const t = new Ui24rTransport();
let cuadros: {
  preBus: number; postBus: number; preCanal: number; postDer: number;
  reduccionBusDb: number; puerta: boolean;
}[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const c = decodificarVuCanales(carga)[n];
  // **Se usa la biblioteca y no una cuenta de bytes a mano.** Calcular el
  // desplazamiento a mano ya costó una corrida: se salteó la sección del
  // reproductor y leyó el centinela 247 como si fuera un nivel.
  const salidas = decodificarVuBuses(carga);
  // El general viene en dos bloques; el izquierdo hace de `post` principal y el
  // derecho se sigue aparte, para que una diferencia entre canales se vea.
  const a = esGeneral ? salidas.general?.izquierdo : salidas.auxiliares[b];
  const der = esGeneral ? salidas.general?.derecho : undefined;
  if (c === undefined || a === undefined) return;
  cuadros.push({
    preBus: a.pre, postBus: a.post, preCanal: c.pre,
    postDer: der?.post ?? NaN,
    reduccionBusDb: a.reduccionDb, puerta: a.indicadorDePuerta,
  });
});

const media = (xs: number[]): number =>
  (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);

async function leer(ms = 2000): Promise<Lectura> {
  cuadros = [];
  await new Promise((r) => setTimeout(r, ms));
  const xs = cuadros;
  const postBus = media(xs.map((c) => c.postBus));
  return {
    preBus: media(xs.map((c) => c.preBus)),
    postBus,
    preCanal: media(xs.map((c) => c.preCanal)),
    bytePost: Number.isNaN(postBus) ? -1 : Math.round(postBus / VU_ESCALA),
    postDer: media(xs.map((c) => c.postDer)),
    reduccionBusDb: media(xs.map((c) => c.reduccionBusDb)),
    // Booleano: promediarlo daría 0,7 y no significaría nada. Lo que importa es
    // si se cerró alguna vez en la ventana.
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

const PREVIO = {
  // El envío sólo existe cuando el destino es un auxiliar: al general el canal
  // llega por su propio fader, que no se toca.
  envio: RUTA_ENVIO === null ? null : Number(exigirClave(e0, RUTA_ENVIO)),
  faderBus: Number(exigirClave(e0, RUTA_FADER)),
  mute: esGeneral ? Number(exigirClave(e0, 'm.mute')) : null,
  afs: Number(exigirClave(e0, 'm.afs.enabled')),
};

/** El barrido concreto de esta corrida, que depende de dónde está el fader. */
const CRUDOS = crudosDelBarrido(esGeneral, PREVIO.faderBus);

console.log('=== 99a — LA LEY DEL FADER DE UN BUS ===');
console.log(`canal ${canal} (i.${n}) -> ${ETIQUETA}, tono de ${HZ} Hz a -1 dBFS`);
console.log(`escalon del medidor: ${ESCALON_DB.toFixed(6)} dB | tolerancia: ${TOLERANCIA_DB.toFixed(4)} dB`);
console.log('');

console.log('=== ESTADO DEL BUS Y DEL CANAL, LEIDO DEL APARATO ===');
console.log(`   ${e0.size} claves leidas por HTTP`);
const prefijo = esGeneral ? 'm' : `a.${b}`;
for (const k of [
  RUTA_FADER, `${prefijo}.mute`, `${prefijo}.afs.enabled`,
  `${prefijo}.dyn.bypass`, `${prefijo}.dyn.ratio`, `${prefijo}.dyn.threshold`,
  ...(esGeneral ? [] : [`a.${b}.stereoIndex`, `i.${n}.aux.${b}.value`,
    `i.${n}.aux.${b}.mute`, `i.${n}.aux.${b}.post`, `i.${n}.aux.${b}.postproc`]),
  `hw.${n}.gain`, `i.${n}.mix`, `i.${n}.mute`, 'settings.auxsendpoint', 'm.afs.enabled',
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}
// **Quién más le manda al bus.** Con señal en otro canal, el piso del barrido
// es la suma y no el envío: la curva se aplana abajo y parece otra ley.
const otros: number[] = [];
for (let i = 0; i < 24; i++) {
  if (i === n) continue;
  // Al general un canal llega por su fader y su silencio; a un auxiliar, por su
  // envío. Son dos preguntas distintas y hay que hacer la que corresponde.
  const abierto = esGeneral
    ? Number(e0.get(`i.${i}.mix`) ?? 0) > 0.001 && e0.get(`i.${i}.mute`) === '0'
    : Number(e0.get(`i.${i}.aux.${b}.value`) ?? 0) > 0.001
      && e0.get(`i.${i}.aux.${b}.mute`) === '0';
  if (abierto) otros.push(i + 1);
}
console.log(`   otros canales que le llegan a ${prefijo}: ${otros.length === 0 ? 'ninguno' : otros.join(', ')}`);
if (otros.length > 0) {
  console.log('   AVISO: con señal en ellos, el piso del barrido es la suma y no el envio.');
}
console.log('');

// ------------------------------------------------------------- la corrida

const sonando = spawn('afplay', [tono(600)]);

interface Punto {
  readonly crudo: number;
  readonly sentido: 'baja' | 'sube';
  readonly postDb: number;
  readonly preBusDb: number;
  readonly preCanalDb: number;
  readonly bytePost: number;
  readonly puertaOk: boolean;
  readonly cuadros: number;
}

const puntos: Punto[] = [];
let topeDb = NaN;

await conRestauracion(
  () => {
    // Primero callar la fuente, después deshacer: al revés, el tono sigue
    // sonando mientras se escribe.
    sonando.kill();
    if (RUTA_ENVIO !== null && PREVIO.envio !== null) {
      t.enviar(codificarSetd(RUTA_ENVIO, PREVIO.envio));
    }
    t.enviar(codificarSetd(RUTA_FADER, PREVIO.faderBus));
    if (PREVIO.mute !== null) t.enviar(codificarSetd('m.mute', PREVIO.mute));
    t.enviar(codificarSetd('m.afs.enabled', PREVIO.afs));
  },
  async () => {
    await escribir('m.afs.enabled', 0, 1200);
    console.log(`supresor del general: estaba en ${PREVIO.afs}, se apaga para medir`);
    await new Promise((r) => setTimeout(r, 3000));

    // El envío al máximo: el bus tiene la mayor señal posible y el barrido el
    // mayor recorrido antes de tocar el piso. Al general no se le abre nada: el
    // canal ya le llega por su propio fader, y tocarlo sería otra medición.
    if (RUTA_ENVIO !== null) await escribir(RUTA_ENVIO, 1.0, 2000);

    // --- Dónde está el silencio respecto de la toma del medidor -----------
    //
    // **Nadie lo midió, y el usuario lo preguntó bien**: si se puede silenciar
    // la salida y medir igual por los medidores internos, entonces el silencio
    // está DESPUÉS de la toma; si silenciar manda `post` a cero, está ANTES y
    // no se puede.
    //
    // Cuesta un paso y contesta la pregunta para siempre. Se hace con el fader
    // arriba, que es donde la diferencia sería más visible, y se restaura.
    {
      const rutaMute = esGeneral ? 'm.mute' : `a.${b}.mute`;
      await escribir(RUTA_FADER, 1.0, 1600);
      const abierto = await leer(1500);
      await escribir(rutaMute, 1, 1500);
      const silenciado = await leer(1500);
      await escribir(rutaMute, esGeneral ? (PREVIO.mute ?? 0) : 0, 1500);
      const devuelto = await leer(1500);
      console.log('');
      console.log(`=== DONDE ESTA EL SILENCIO (${rutaMute}) RESPECTO DEL MEDIDOR ===`);
      console.log(`   sin silenciar: post ${dbDeMedidor(abierto.postBus).toFixed(2)} dB `
        + `(byte ${abierto.bytePost}), pre ${dbDeMedidor(abierto.preBus).toFixed(2)}`);
      console.log(`   silenciado:    post ${dbDeMedidor(silenciado.postBus).toFixed(2)} dB `
        + `(byte ${silenciado.bytePost}), pre ${dbDeMedidor(silenciado.preBus).toFixed(2)}`);
      console.log(`   devuelto:      post ${dbDeMedidor(devuelto.postBus).toFixed(2)} dB `
        + `(byte ${devuelto.bytePost}), pre ${dbDeMedidor(devuelto.preBus).toFixed(2)}`);
      const caeAlPiso = silenciado.bytePost <= 0;
      const seMovio = Math.abs(dbDeMedidor(abierto.postBus) - dbDeMedidor(silenciado.postBus));
      console.log(caeAlPiso
        ? '   El silencio esta ANTES de la toma: manda `post` al piso. NO se puede\n'
          + '   medir con la salida silenciada.'
        : seMovio <= TOLERANCIA_DB
          ? '   El silencio esta DESPUES de la toma: `post` no se movio. SI se puede\n'
            + '   medir con la salida silenciada, que es lo que el usuario propuso.'
          : `   Ni una cosa ni la otra: post se movio ${seMovio.toFixed(2)} dB sin caer al\n`
            + '   piso. Hace falta mirarlo aparte antes de concluir nada.');
      // Y que el devuelto coincida con el de antes: si no, silenciar dejo algo
      // distinto y el resto del barrido no arranca donde se cree.
      const vuelta = Math.abs(dbDeMedidor(abierto.postBus) - dbDeMedidor(devuelto.postBus));
      console.log(`   al devolver el silencio, post volvio a ${vuelta.toFixed(2)} dB del original`
        + (vuelta > TOLERANCIA_DB ? '   <-- NO VOLVIO, el barrido no vale' : ''));
    }

    console.log('');
    console.log('crudo      | post (bus) | atenuacion | segun faderADb | residuo | '
      + 'pre bus | pre canal | byte | puerta | n');

    for (const sentido of ['baja', 'sube'] as const) {
      const orden = sentido === 'baja' ? CRUDOS : [...CRUDOS].reverse();
      for (const crudo of orden) {
        await escribir(RUTA_FADER, crudo, 1600);
        const l = await leer();
        const postDb = dbDeMedidor(l.postBus);
        if (sentido === 'baja' && crudo === CRUDOS[0]) topeDb = postDb;
        const atenuacion = topeDb - postDb;
        // La ley del fader, referida al mismo tope: `faderADb(crudo)` menos
        // `faderADb` del tope del barrido.
        const segunLey = faderADb(CRUDOS[0]!) - faderADb(crudo);

        puntos.push({
          crudo, sentido, postDb, preBusDb: dbDeMedidor(l.preBus),
          preCanalDb: dbDeMedidor(l.preCanal), bytePost: l.bytePost,
          puertaOk: l.puertaAbiertaSiempre, cuadros: l.cuadros,
        });

        const enElPiso = l.bytePost <= 0;
        console.log(`${crudo.toFixed(4).padStart(10)} | ${postDb.toFixed(2).padStart(10)} | `
          + `${atenuacion.toFixed(2).padStart(10)} | ${segunLey.toFixed(2).padStart(14)} | `
          + `${(atenuacion - segunLey).toFixed(2).padStart(7)} | `
          + `${dbDeMedidor(l.preBus).toFixed(2).padStart(7)} | `
          + `${dbDeMedidor(l.preCanal).toFixed(2).padStart(9)} | `
          + `${String(l.bytePost).padStart(4)} | `
          + `${(l.puertaAbiertaSiempre ? 'ok' : 'CERRO').padEnd(6)} | ${String(l.cuadros).padStart(3)}`
          + (enElPiso ? '   EN EL PISO' : ''));
      }
    }
  },
);

await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

// ------------------------------------------------------------ veredictos

const utiles = puntos.filter((p) => p.cuadros > 0 && p.bytePost > 0);
console.log('');
console.log('=== VEREDICTOS, contra el contrato del item 99a ===');
console.log(`   ${utiles.length} puntos con senal de ${puntos.length}`);

// F1 — el pre del bus no se mueve
{
  const xs = puntos.map((p) => p.preBusDb).filter((v) => Number.isFinite(v));
  const peor = xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs);
  console.log('');
  console.log(`F1 deriva del pre del bus (antes del fader): ${peor.toFixed(2)} dB `
    + `(${(peor / ESCALON_DB).toFixed(2)} escalones)`);
  console.log(peor <= TOLERANCIA_DB
    ? '   PASA. El byte +0 esta antes del fader del bus, confirmado en este bus.'
    : '   FALLA. El fader del bus mueve el byte +0: se reabre que es ese byte, y\n'
      + '   la atenuacion medida aca no es solo del fader.');
}

// F2 — el pre del canal no se mueve
{
  const xs = puntos.map((p) => p.preCanalDb).filter((v) => Number.isFinite(v));
  const peor = xs.length === 0 ? NaN : Math.max(...xs) - Math.min(...xs);
  console.log('');
  console.log(`F2 deriva del pre del canal (la fuente): ${peor.toFixed(2)} dB `
    + `(${(peor / ESCALON_DB).toFixed(2)} escalones)`);
  console.log(peor <= TOLERANCIA_DB ? '   PASA.' : '   FALLA: la fuente se movio y la corrida no vale.');
}

// F5 — el recorrido util, antes que F3 porque F3 depende de el
let recorrido = NaN;
{
  const bajando = utiles.filter((p) => p.sentido === 'baja');
  recorrido = bajando.length === 0 ? NaN
    : topeDb - Math.min(...bajando.map((p) => p.postDb));
  console.log('');
  console.log(`F5 recorrido util antes del piso: ${recorrido.toFixed(2)} dB `
    + `(${bajando.length} puntos con senal)`);
  console.log(recorrido >= RECORRIDO_MINIMO_DB
    ? `   PASA (se pedian ${RECORRIDO_MINIMO_DB} dB).`
    : `   FALLA: con ${recorrido.toFixed(2)} dB no se separa faderADb de una curva\n`
      + '   parecida. Es lo que le paso a la primera corrida de la 94.');
}

// F3 — la atenuacion contra faderADb
{
  const bajando = utiles.filter((p) => p.sentido === 'baja');
  let peor = 0; let dondePeor = NaN;
  for (const p of bajando) {
    const d = Math.abs((topeDb - p.postDb) - (faderADb(CRUDOS[0]!) - faderADb(p.crudo)));
    if (d > peor) { peor = d; dondePeor = p.crudo; }
  }
  console.log('');
  console.log(`F3 desvio maximo contra faderADb: ${peor.toFixed(2)} dB `
    + `= ${(peor / ESCALON_DB).toFixed(2)} escalones, en el crudo ${dondePeor}`);
  console.log(peor <= ESCALON_DB
    ? '   Dentro de un escalon. **Es una COTA, no una identidad**: dice que si hay\n'
      + '   diferencia es menor que la resolucion del instrumento. NO dice que sean la\n'
      + '   misma ley --es lo que la 94 declaro indecidible para el envio.'
    : '   FUERA de un escalon. Primera evidencia de que el fader de un bus no usa la\n'
      + '   misma ley que el fader de canal.');
  // El signo de los residuos: si todos van para el mismo lado, es estructura y
  // no dispersion. La 94 tuvo que agregar esto despues de una auditoria.
  const residuos = bajando.map((p) =>
    (topeDb - p.postDb) - (faderADb(CRUDOS[0]!) - faderADb(p.crudo)));
  const positivos = residuos.filter((r) => r > 0).length;
  const negativos = residuos.filter((r) => r < 0).length;
  console.log(`   signo de los residuos: ${positivos} positivos, ${negativos} negativos, `
    + `${residuos.length - positivos - negativos} en cero`);
  if (positivos === 0 || negativos === 0) {
    console.log('   TODOS DEL MISMO SIGNO: es estructura, no dispersion. Hay que decirlo.');
  }
}

// F4 — ida y vuelta
{
  let peor = 0; let dondePeor = NaN;
  for (const p of utiles.filter((x) => x.sentido === 'baja')) {
    const v = utiles.find((x) => x.crudo === p.crudo && x.sentido === 'sube');
    if (v === undefined) continue;
    const d = Math.abs(p.postDb - v.postDb);
    if (d > peor) { peor = d; dondePeor = p.crudo; }
  }
  console.log('');
  console.log(`F4 histeresis entre los dos sentidos: ${peor.toFixed(2)} dB en el crudo ${dondePeor}`);
  console.log(peor <= TOLERANCIA_DB
    ? '   PASA: los puntos estan asentados.'
    : '   FALLA: lo que se midio es el transitorio, y esos puntos no valen.');
}

// El dinamico del bus, que podria estar comprimiendo el barrido entero
{
  const conReduccion = puntos.filter((p) => p.cuadros > 0).length > 0
    && puntos.some((p) => p.puertaOk === false);
  const cerrados = puntos.filter((p) => !p.puertaOk).length;
  console.log('');
  console.log(`CONTROL: puntos con la puerta del bus cerrada en algun cuadro: ${cerrados}`);
  console.log(conReduccion
    ? '   Hay puntos con la puerta cerrada: ahi la atenuacion no es solo del fader.'
    : '   Ninguno. La atenuacion medida no lleva puerta del bus adentro.');
}

console.log('');
console.log('=== LO QUE ESTA CORRIDA NO DICE ===');
console.log('   Nada sobre m.mix, que es otra ruta y mueve el volumen de la sala.');
console.log('   No prueba que a.N.mix deba abrirse: medir la ley es el requisito de');
console.log('   INV-004, no la decision. Abrirla necesita su propio ADR.');
console.log('   Un bus de diez, un dia, una frecuencia, un nivel de fuente.');
console.log('   Y esto es AUTOCONSISTENCIA, no calibracion: todos los dB son de la');
console.log('   escala del medidor, NO dBFS.');
console.log('');
console.log(`restaurado: envio ${PREVIO.envio}, fader del bus ${PREVIO.faderBus}, `
  + `m.afs.enabled ${PREVIO.afs}, los tres leidos del aparato antes de empezar.`);
console.log('Por el mismo camino que escribio, asi que la comprobacion por HTTP va aparte.');
