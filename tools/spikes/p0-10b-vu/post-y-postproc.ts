/**
 * Qué hacen `post` y `postproc` en el audio, medido contra el aparato.
 *
 * **Por qué hace falta.** Las dos banderas están confirmadas como rutas que se
 * escriben y se difunden. Su efecto sobre el audio, no. Y si el envío es
 * post-procesamiento, el asistente ecualiza un canal pensando en la sala y le
 * mueve el monitor al músico sin decírselo a nadie. Son 240 banderas
 * independientes y `settings.auxsendpoint` no las reescribe.
 *
 * **Tres medidores, cada uno con su papel.** El bloque de canal trae `pre`
 * (+0), `entrada` (+1) y `salida` (+2), y ya está medido qué toca cada uno:
 *
 * - **`pre`** es anterior a todo el procesamiento: es el **testigo**. Si se
 *   mueve, la fuente se movió y la corrida no vale.
 * - **`entrada`** viene procesado: es la **prueba de que el ecualizador actuó**.
 *   Sin esto, un «el auxiliar no se movió» es indistinguible de «el ecualizador
 *   no hizo nada», que es la forma más fácil de confirmar `postproc = 0` por
 *   accidente.
 * - **el auxiliar** es lo que se mide.
 *
 * **Por qué el ecualizador y no el compresor.** El compresor está en 1:1 e
 * inerte; ponerlo a comprimir cambia el nivel de una forma que depende del
 * programa. El ecualizador realza una cantidad fija y ya está medido que **no
 * toca `pre`**, así que el testigo sigue sirviendo.
 *
 * **No hace falta saber la ley de la frecuencia.** Se realzan las cinco bandas
 * al máximo: cualquiera que sea la que cubre 1 kHz, el tono sube. Lo que se
 * mide es si ese movimiento llega al auxiliar, no cuántos dB son.
 *
 * Contrato: `docs/compromisos/95-post-y-postproc.md`, escrito antes de correr.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/post-y-postproc.ts 10 2 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuCanales, decodificarVuBuses,
  dbDeMedidor, VU_ESCALA, MEDIDOR_RANGO_DB,
} from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const aux = Number(process.argv[3] ?? '2');
const maquina = process.argv[4] ?? '192.168.0.78';
const NIVEL_FUENTE_DB = -1;
const HZ = 1000;
const FM = 48000;
const SEGUNDOS = 300;

/** Un escalón del medidor, derivado. Ningún hallazgo por debajo de esto existe. */
const RESOLUCION_DB = MEDIDOR_RANGO_DB * VU_ESCALA;

/** Estado previo, para restaurar. Leído del aparato el 2026-09-12. */
const PREVIO = {
  mix: 0.7647058824,
  gananciasEq: 0.5,
  post: 0,
  postproc: 1,
  valor: 0,
};

/** El envío durante toda la prueba: alto, para que haya margen hacia arriba y abajo. */
const ENVIO = 0.8;

function tonoLargo(): string {
  const muestras = FM * SEGUNDOS;
  const amplitud = Math.pow(10, NIVEL_FUENTE_DB / 20) * 32767;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    const v = Math.round(amplitud * Math.sin((2 * Math.PI * HZ * i) / FM));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
  const ruta = join(tmpdir(), 'vse-tono-postproc.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let pre: number[] = [];
let entrada: number[] = [];
let bus: number[] = [];

t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const c = decodificarVuCanales(carga)[n];
  if (c !== undefined) { pre.push(c.pre); entrada.push(c.entrada); }
  const b = decodificarVuBuses(carga).auxiliares[aux];
  if (b !== undefined) bus.push(b.pre);
});

const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;

async function leer(etiqueta: string): Promise<{ etiqueta: string; pre: number; entrada: number; bus: number; n: number }> {
  pre = []; entrada = []; bus = [];
  await new Promise((r) => setTimeout(r, 2500));
  return { etiqueta, pre: media(pre), entrada: media(entrada), bus: media(bus), n: bus.length };
}

function eq(ganancia: number): void {
  for (let b = 1; b <= 5; b++) t.enviar(codificarSetd(`i.${n}.eq.b${b}.gain`, ganancia));
}

await t.conectar(maquina);
const ruta = tonoLargo();
const sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2500));

t.enviar(codificarSetd(`i.${n}.aux.${aux}.value`, ENVIO));
await new Promise((r) => setTimeout(r, 1500));

console.log(`canal ${canal} (i.${n}) -> auxiliar ${aux + 1} (a.${aux})`);
console.log(`tono de ${HZ} Hz a ${NIVEL_FUENTE_DB} dBFS, envio fijo en ${ENVIO}`);
console.log(`resolucion del medidor: ${RESOLUCION_DB.toFixed(4)} dB por escalon`);
console.log('');
console.log('estado                       | pre (testigo) | entrada (proc) | auxiliar  | n');

const filas: { etiqueta: string; pre: number; entrada: number; bus: number; n: number }[] = [];
async function paso(etiqueta: string): Promise<void> {
  const r = await leer(etiqueta);
  filas.push(r);
  console.log(`${etiqueta.padEnd(28)} | ${dbDeMedidor(r.pre).toFixed(2).padStart(13)} | `
    + `${dbDeMedidor(r.entrada).toFixed(2).padStart(14)} | `
    + `${dbDeMedidor(r.bus).toFixed(2).padStart(9)} | ${String(r.n).padStart(3)}`);
}

// Las cuatro combinaciones, con el ecualizador plano y realzado en cada una.
for (const post of [0, 1]) {
  for (const pp of [1, 0]) {
    t.enviar(codificarSetd(`i.${n}.aux.${aux}.post`, post));
    t.enviar(codificarSetd(`i.${n}.aux.${aux}.postproc`, pp));
    await new Promise((r) => setTimeout(r, 1200));
    eq(PREVIO.gananciasEq);
    await new Promise((r) => setTimeout(r, 1200));
    await paso(`post=${post} pp=${pp} eq plano`);
    eq(1);
    await new Promise((r) => setTimeout(r, 1200));
    await paso(`post=${post} pp=${pp} eq realzado`);
    eq(PREVIO.gananciasEq);
    await new Promise((r) => setTimeout(r, 1200));
    // Y con el fader bajado, para Q1: con post=1 el auxiliar tiene que seguirlo.
    t.enviar(codificarSetd(`i.${n}.mix`, 0.5));
    await new Promise((r) => setTimeout(r, 1200));
    await paso(`post=${post} pp=${pp} fader 0,50`);
    t.enviar(codificarSetd(`i.${n}.mix`, PREVIO.mix));
    await new Promise((r) => setTimeout(r, 1200));
  }
}

sonando.kill();

// --- Restauracion ---
eq(PREVIO.gananciasEq);
t.enviar(codificarSetd(`i.${n}.aux.${aux}.post`, PREVIO.post));
t.enviar(codificarSetd(`i.${n}.aux.${aux}.postproc`, PREVIO.postproc));
t.enviar(codificarSetd(`i.${n}.aux.${aux}.value`, PREVIO.valor));
t.enviar(codificarSetd(`i.${n}.mix`, PREVIO.mix));
await new Promise((r) => setTimeout(r, 2000));
await t.desconectar();

// --- Lectura ---
console.log('');
console.log('=== QUE SE MUEVE, EN dB, CONTRA EL ESTADO PLANO DE CADA COMBINACION ===');
console.log('combinacion      | cambio | entrada (proc) | auxiliar | veredicto');
for (let i = 0; i < filas.length; i += 3) {
  const plano = filas[i]!;
  for (const otro of [filas[i + 1]!, filas[i + 2]!]) {
    const dEnt = dbDeMedidor(otro.entrada) - dbDeMedidor(plano.entrada);
    const dBus = dbDeMedidor(otro.bus) - dbDeMedidor(plano.bus);
    const sigue = Math.abs(dBus) > RESOLUCION_DB;
    const etiqueta = otro.etiqueta.slice(otro.etiqueta.indexOf('eq ') >= 0 ? otro.etiqueta.indexOf('eq ') : otro.etiqueta.indexOf('fader'));
    console.log(`${plano.etiqueta.slice(0, 14).padEnd(16)} | ${etiqueta.padEnd(11)} | `
      + `${dEnt >= 0 ? '+' : ''}${dEnt.toFixed(2).padStart(13)} | `
      + `${dBus >= 0 ? '+' : ''}${dBus.toFixed(2).padStart(7)} | `
      + `${sigue ? 'LO SIGUE' : 'no lo sigue'}`);
  }
}
console.log('');
console.log(`«LO SIGUE» = el auxiliar se movio mas de un escalon (${RESOLUCION_DB.toFixed(4)} dB).`);
console.log('Si «entrada» no se movio en una fila de eq, esa fila NO prueba nada:');
console.log('el ecualizador no actuo y el auxiliar quieto no dice si lo sigue o no.');
console.log('');
console.log('restaurado por el mismo camino que escribio. La comprobacion por HTTP va aparte.');
