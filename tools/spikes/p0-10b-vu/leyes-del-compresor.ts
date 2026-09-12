/**
 * Las leyes del compresor, medidas contra el aparato.
 *
 * **El instrumento** es el medidor de reducción, byte `+5` del bloque de canal:
 * dice cuántos dB atenúa el compresor, en vivo. **El testigo** es `pre`, medido
 * como anterior a todo el procesamiento del canal.
 *
 * **Por qué el diseño obvio no funciona.** El plan original era mover la fuente
 * con el fader del canal. **El fader está aguas abajo del detector**, medido el
 * 2026-09-09: con fuente fija, moviendo el fader, el medidor de entrada quedó
 * «clavado en −20,76 dB en las quince posiciones». Mover el fader movería la
 * rodilla cero. Acá la fuente se mueve **en el origen**, cambiando la amplitud
 * del tono, y **cuánto se movió se mide con `pre`** en vez de asumirlo.
 *
 * **La resolución manda el diseño.** El escalón del medidor de reducción es
 * 0,667 dB —la máscara alcanza un código de cada dos— y su primer valor no nulo
 * es 0,984 dB. O sea que una rodilla no se localiza mejor que ~1 dB. Con dos
 * rodillas separadas 6 dB la pendiente sale 96 ± 22, que no distingue 96 de 80.
 * **Por eso las dos fuentes van separadas 30 dB.**
 *
 * **Y el supresor se apaga.** Un tono sostenido es indistinguible de un acople:
 * las corridas de esta noche le plantaron seis filtros de −18 dB al general.
 * Decisión del usuario: se apaga antes de medir y se deja como estaba.
 *
 * Contrato: `docs/compromisos/97-leyes-del-compresor.md`, escrito antes.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/leyes-del-compresor.ts 10 192.168.0.78
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales,
  dbDeMedidor, dbDeReduccion, REDUCCION_RANGO_DB,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const maquina = process.argv[3] ?? '192.168.0.78';
const HZ = 1000;
const FM = 48000;

/**
 * El escalón real del medidor de reducción, en dB.
 *
 * **No es `REDUCCION_RANGO_DB / 128`.** La decodificación enmascara con 127 y
 * desplaza, así que sólo se alcanza un código de cada dos: medido contra
 * `dbDeReduccion`, del byte 246 al 240 hay 4,0 dB en seis bytes. Se deriva de la
 * función en vez de escribirlo, que es lo que este proyecto aprendió a hacer.
 */
const ESCALON_REDUCCION_DB = (dbDeReduccion(240) - dbDeReduccion(246)) / 6;

/** El primer valor que el instrumento puede informar por encima de cero. */
const PISO_REDUCCION_DB = dbDeReduccion(246);

/** Estado previo del canal, leído del aparato. */
const PREVIO = {
  threshold: 0.875, ratio: 1, attack: 0.34375, release: 0.4887695312,
};

/**
 * Razón para buscar la rodilla: alta y fija.
 *
 * `VtoRATIO(a) = 1/a`, así que 0,1 es 10:1. Con razón alta el exceso que hace
 * falta para salir de la zona muerta es chico —`0,984/(1−a)` ≈ 1,1 dB— y el
 * sesgo de la rodilla es chico. **Y fija, para que el sesgo sea el mismo en las
 * dos determinaciones y se cancele en la diferencia.**
 */
const RAZON_PARA_RODILLA = 0.1;

/** Las dos amplitudes del tono, separadas 30 dB en el origen. */
const NIVELES_DBFS = [-1, -31];

function tono(dbfs: number, segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, dbfs / 20) * 32767;
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
  const ruta = join(tmpdir(), `vse-comp-${dbfs}.wav`);
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let pre: number[] = [];
let reduccion: number[] = [];
let crudosDeReduccion: number[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const c = decodificarVuCanales(linea.slice(4))[n];
  if (c === undefined) return;
  pre.push(c.pre);
  reduccion.push(c.reduccionDb);
});

const media = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);
const maximo = (xs: number[]): number => xs.reduce((s, v) => Math.max(s, v), 0);

async function leer(ms = 1800): Promise<{ pre: number; red: number; redMax: number; n: number }> {
  pre = []; reduccion = []; crudosDeReduccion = [];
  await new Promise((r) => setTimeout(r, ms));
  return { pre: media(pre), red: media(reduccion), redMax: maximo(reduccion), n: reduccion.length };
}

/**
 * Busca la rodilla bajando el umbral, y después subiendo.
 *
 * Devuelve las dos: si no coinciden, lo que se midió fue el transitorio y no la
 * ley. No se promedian, que sería tapar el dato.
 */
async function rodilla(sentido: 'bajando' | 'subiendo', desde: number, hasta: number, paso: number) {
  const puntos: { crudo: number; pre: number; red: number; n: number }[] = [];
  let encontrada: number | null = null;
  const ir = sentido === 'bajando'
    ? (c: number) => c - paso
    : (c: number) => c + paso;
  for (let c = desde; sentido === 'bajando' ? c >= hasta : c <= hasta; c = ir(c)) {
    t.enviar(codificarSetd(`i.${n}.dyn.threshold`, Number(c.toFixed(4))));
    await new Promise((r) => setTimeout(r, 900));
    const l = await leer();
    puntos.push({ crudo: c, pre: l.pre, red: l.red, n: l.n });
    const activa = l.red > 0;
    if (encontrada === null && (sentido === 'bajando' ? activa : !activa)) {
      encontrada = c;
      // Dos puntos más para ver la forma, y se corta: no hace falta el barrido
      // entero y cada punto cuesta casi tres segundos.
      if (puntos.length > 2) break;
    }
  }
  return { sentido, encontrada, puntos };
}

await t.conectar(maquina);

// --- El supresor se apaga, y se anota cómo estaba ---
const { estadoPorHttpExigido, exigirClave } = await import('../canal-muerto.ts');
const e0 = await estadoPorHttpExigido(maquina);
// **Se EXIGE la clave, no se supone.** Antes esto era `?? '1'`, y una lectura
// HTTP fallida --que `estadoPorHttp` devuelve como mapa vacio-- hacia imprimir
// «estaba en 1» sin haberlo medido y ENCENDER al restaurar un supresor que el
// usuario podia tener apagado. Lo encontro una auditoria de instrumentos el
// 2026-09-12: era el hallazgo mas peligroso de los seis, porque toca el unico
// de 45 campos que una instantanea no devuelve.
const AFS_PREVIO = exigirClave(e0, 'm.afs.enabled');
t.enviar(codificarSetd('m.afs.enabled', 0));
await new Promise((r) => setTimeout(r, 1200));

console.log(`canal ${canal} (i.${n}), tono de ${HZ} Hz`);
console.log(`escalon del medidor de reduccion: ${ESCALON_REDUCCION_DB.toFixed(4)} dB`);
console.log(`piso del medidor de reduccion:    ${PISO_REDUCCION_DB.toFixed(3)} dB`);
console.log(`razon para la rodilla: crudo ${RAZON_PARA_RODILLA} = ${(1 / RAZON_PARA_RODILLA).toFixed(0)}:1`);
console.log(`supresor del general: estaba en ${AFS_PREVIO}, se apaga para medir`);
console.log('');

t.enviar(codificarSetd(`i.${n}.dyn.ratio`, RAZON_PARA_RODILLA));
await new Promise((r) => setTimeout(r, 1200));

const rodillas: { dbfs: number; pre: number; bajando: number | null; subiendo: number | null }[] = [];
let sonando: ChildProcess | null = null;

for (const dbfs of NIVELES_DBFS) {
  sonando?.kill();
  sonando = spawn('afplay', [tono(dbfs, 420)]);
  await new Promise((r) => setTimeout(r, 3000));

  // Umbral bien arriba: sin reduccion, y de ahi se baja.
  t.enviar(codificarSetd(`i.${n}.dyn.threshold`, 0.95));
  await new Promise((r) => setTimeout(r, 1500));
  const base = await leer();
  console.log(`--- tono a ${dbfs} dBFS: pre = ${dbDeMedidor(base.pre).toFixed(2)} dB, `
    + `reduccion en reposo = ${base.red.toFixed(2)} dB, n=${base.n} ---`);
  console.log('crudo umbral | pre (testigo) | reduccion | n');

  const abajo = await rodilla('bajando', 0.95, 0.05, 0.01);
  for (const p of abajo.puntos) {
    console.log(`${p.crudo.toFixed(3).padStart(12)} | ${dbDeMedidor(p.pre).toFixed(2).padStart(13)} | `
      + `${p.red.toFixed(2).padStart(9)} | ${String(p.n).padStart(3)}`);
  }
  console.log(`  rodilla bajando: ${abajo.encontrada === null ? 'NO SE ENCONTRO' : abajo.encontrada.toFixed(3)}`);

  const arriba = abajo.encontrada === null ? { encontrada: null, puntos: [] }
    : await rodilla('subiendo', Math.max(0.05, abajo.encontrada - 0.04), 0.95, 0.01);
  console.log(`  rodilla subiendo: ${arriba.encontrada === null ? 'NO SE ENCONTRO' : arriba.encontrada.toFixed(3)}`);

  rodillas.push({ dbfs, pre: dbDeMedidor(base.pre), bajando: abajo.encontrada, subiendo: arriba.encontrada });
  console.log('');
}

sonando?.kill();

// --- Restauracion ---
t.enviar(codificarSetd(`i.${n}.dyn.threshold`, PREVIO.threshold));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, PREVIO.ratio));
t.enviar(codificarSetd('m.afs.enabled', Number(AFS_PREVIO)));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

// --- Lectura ---
console.log('=== C1: LA PENDIENTE DEL UMBRAL ===');
const [a, b] = rodillas;
if (a?.bajando !== null && b?.bajando !== null && a !== undefined && b !== undefined) {
  const dPre = a.pre - b.pre;
  const dCrudo = a.bajando! - b.bajando!;
  const pendiente = dPre / dCrudo;
  // Cada rodilla vale +-1 dB: la incertidumbre de la pendiente sale de propagar
  // eso sobre el corrimiento de crudo, que es lo unico que se midio.
  const incert = (2 * PISO_REDUCCION_DB) / Math.abs(dCrudo);
  console.log(`fuente movida (medida en pre): ${dPre.toFixed(2)} dB`);
  console.log(`rodilla movida:                ${dCrudo.toFixed(3)} de crudo`);
  console.log(`pendiente medida:              ${pendiente.toFixed(1)} +- ${incert.toFixed(1)} dB por unidad`);
  console.log(`VtoTHRESH del mixer.html dice: 96`);
  const cae = Math.abs(pendiente - 96) <= incert;
  console.log(cae ? 'El 96 cae dentro de la incertidumbre: compatible, no confirmado.'
    : 'El 96 queda FUERA de la incertidumbre: la ley no es la que dice el codigo.');
} else {
  console.log('No se encontraron las dos rodillas: C1 no se puede evaluar.');
}
console.log('');
console.log('=== HISTERESIS: si no coinciden, se midio el transitorio ===');
for (const r of rodillas) {
  const h = r.bajando !== null && r.subiendo !== null ? Math.abs(r.bajando - r.subiendo) : null;
  console.log(`  ${r.dbfs} dBFS: bajando ${r.bajando ?? '-'}  subiendo ${r.subiendo ?? '-'}`
    + (h === null ? '' : `  diferencia ${h.toFixed(3)} de crudo`));
}
console.log('');
console.log('restaurado, supresor incluido. La comprobacion por HTTP va aparte.');
