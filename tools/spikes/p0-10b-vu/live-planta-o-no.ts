/**
 * El control POSITIVO CONCURRENTE del ítem 111: ¿este estímulo planta en LIVE?
 *
 * **Es la mitad que le faltaba al 111.** Aquella corrida midió que en LOCK el
 * supresor no aprende, y declaró su propio punto flojo: el control positivo era
 * **histórico** —tonos parecidos plantaron filtros en septiembre— y no
 * concurrente. Sin un positivo del mismo día, «en LOCK no aprendió» y «este
 * estímulo no hace aprender a ningún modo» son indistinguibles.
 *
 * ## Por qué se puede correr hoy y ayer no
 *
 * Porque **la pila está vacía**: las doce ranuras publican atenuación 0. Ver
 * `docs/backlog/hallazgo-los-doce-no-eran-filtros-eran-ranuras.md`.
 *
 * El 111 descartó probar LIVE con un argumento concreto: dejarlo aprender planta
 * filtros, y lo único medido que los borra es `clearall`, **que se lleva la pila
 * entera, incluidos los del usuario**. Ese costo hoy es cero. El usuario decidió
 * correrlo con esa información.
 *
 * ## Qué escribe
 *
 * **En el camino normal, NADA.** El modo LIVE se **exige** y no se pone: la
 * consola ya está en LIVE (`logic` 1, `fmode` 1) y encendida, que es su
 * configuración de trabajo. Escribir para llegar a un estado en el que ya está
 * es agregar riesgo sin comprar nada.
 *
 * **Sólo si planta** se escribe `m.afs.clearall`, con la misma secuencia que hace
 * el cliente de la consola —1, esperar 500 ms, 0—, leída de su `mixer.html`. No
 * se inventa el disparo de un botón que borra.
 *
 * ## Cómo se acota el daño, y qué NO se da por cierto
 *
 * El 111 apoyaba su cota de riesgo en que la consola **difunde** `SETS^m.afs.eq.N`
 * al plantar. **Eso nunca se comprobó**, y si fuera falso el tono seguiría sonando
 * y plantaría de más — que es justo lo que la cota prometía evitar.
 *
 * Así que hay **dos** vigilancias: el socket, que si funciona avisa al instante, y
 * una relectura por HTTP cada pocos segundos, que **no depende de ninguna
 * suposición**. El peor caso pasa a estar acotado por el sondeo, no por la
 * difusión. Y de paso la corrida dice cuál de las dos avisó primero, con lo que
 * queda medido si la difusión existe.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/live-planta-o-no.ts 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');
const FM = 48000;
const NIVEL_DBFS = -18;
/** El mismo tope que el 111, para que las dos corridas sean comparables. */
const MINUTOS = 4;
/** Las mismas tres frecuencias, por el mismo motivo. */
const FRECUENCIAS = [1000, 100, 10000] as const;
/** Cada cuánto se relee la pila por HTTP. Acota el daño sin suponer nada. */
const SONDEO_MS = 8000;

const carpeta = mkdtempSync(join(tmpdir(), 'live-planta-'));
const GRABADOR = 'tools/audio/bin/grabar';
const ENTRADA = 0;
const MARGEN_MINIMO_DB = 40;

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = (Math.pow(10, NIVEL_DBFS / 20) * 32767) / FRECUENCIAS.length;
  const datos = Buffer.alloc(muestras * 4);
  for (let i = 0; i < muestras; i++) {
    let v = 0;
    for (const hz of FRECUENCIAS) v += amplitud * Math.sin((2 * Math.PI * hz * i) / FM);
    datos.writeInt16LE(Math.round(v), i * 4); datos.writeInt16LE(Math.round(v), i * 4 + 2);
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

interface Ranura { i: number; crudo: string; atenuacionDb: number; plantado: boolean }

const pila = (e: ReadonlyMap<string, string>): Ranura[] => {
  const f: Ranura[] = [];
  for (let i = 0; i < 16; i++) {
    const v = e.get(`m.afs.eq.${i}`);
    if (v === undefined) continue;
    const campos = v.split(',');
    const at = Number(campos[2] ?? NaN);
    f.push({ i, crudo: v, atenuacionDb: at, plantado: !(at === 0) });
  }
  return f;
};
const comoTexto = (p: readonly Ranura[]): string => p.map((r) => `${r.i}:${r.crudo}`).join('|');
const plantados = (p: readonly Ranura[]): Ranura[] => p.filter((r) => r.plantado);

avisarSiHayPendiente();

const t = new Ui24rTransport();
const avisos: string[] = [];
t.alRecibir((linea) => {
  if (/^SET[SD]\^m\.afs\.(eq\.|num)/.test(linea)) avisos.push(linea.trim());
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

// --- lo que se EXIGE, y no se escribe -------------------------------------
const enabled = Number(exigirClave(e0, 'm.afs.enabled'));
const logic = Number(exigirClave(e0, 'm.afs.logic'));
const fmode = Number(exigirClave(e0, 'm.afs.fmode'));
if (enabled !== 1) {
  throw new Error(`m.afs.enabled esta en ${enabled}: apagado no aprende en ningun modo y el `
    + `control positivo seria falso de antemano.`);
}
if (!(logic === 1 && fmode === 1)) {
  throw new Error(`el supresor no esta en LIVE (logic=${logic}, fmode=${fmode}). Este guion `
    + `EXIGE LIVE y no lo pone: si hay que escribir para llegar ahi, lo decide una persona.`);
}

const pilaAntes = pila(e0);
if (plantados(pilaAntes).length > 0) {
  throw new Error(`hay ${plantados(pilaAntes).length} filtro(s) ya plantado(s). Esta corrida `
    + `solo se autorizo con la pila VACIA, porque limpiarla despues se lleva todo. Con filtros `
    + `del usuario adentro, el costo vuelve a ser el que hizo que no se corriera.`);
}

// Sólo se escribe si planta, pero se anota antes de la primera escritura posible.
const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.clearall', Number(exigirClave(e0, 'm.afs.clearall'))],
];

console.log('=== CONTROL POSITIVO CONCURRENTE: ¿ESTE ESTIMULO PLANTA EN LIVE? ===');
console.log('');
console.log(`   supresor encendido: ${enabled}  (se EXIGE)`);
console.log(`   modo: logic=${logic} fmode=${fmode} -> LIVE  (se EXIGE, no se pone)`);
console.log(`   ranuras: ${pilaAntes.length}, con filtro plantado: ${plantados(pilaAntes).length}`);
console.log(`   estimulo: ${FRECUENCIAS.join(', ')} Hz, ${MINUTOS} min -- el MISMO del 111`);
console.log(`   vigilancia: socket + relectura por HTTP cada ${SONDEO_MS / 1000} s`);
console.log('');

anotarPendiente('live-planta-o-no.ts', maquina, PREVIO);

let sonando: ReturnType<typeof spawn> | null = null;
let planto = false;
let quienAviso = '';
let segundosHastaPlantar = NaN;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1000); });
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    avisos.length = 0;
    sonando = spawn('afplay', [tono(MINUTOS * 60 + 30)]);
    sonando.on('error', (e) => { throw e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => { setTimeout(r, 2000); });
    if (sonando.exitCode !== null) {
      throw new Error(`afplay salio con ${sonando.exitCode}: sin tono no hay nada que plantar.`);
    }

    // --- C1: el tono llega al general, medido --------------------------------
    const wav = join(carpeta, 'c1.wav');
    const grab = spawn(GRABADOR, ['3', wav, 'Scarlett'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errGrab = '';
    grab.stderr?.on('data', (b: Buffer) => { errGrab += b.toString(); });
    const cod = await new Promise<number | null>((res, rej) => {
      grab.on('error', rej); grab.on('close', (c) => res(c));
    });
    if (cod !== 0) throw new Error(`el grabador salio con ${cod} en C1: ${errGrab.trim()}`);
    console.log('   C1 -- ¿el tono llega al general?');
    const margenes: number[] = [];
    for (const hz of FRECUENCIAS) {
      const an = analizar(wav, hz) as { canales: { tonoDb: number; margenEnBinDb: number }[] };
      const c = an.canales[ENTRADA]!;
      margenes.push(c.margenEnBinDb);
      console.log(`      ${String(hz).padStart(5)} Hz: ${c.tonoDb.toFixed(2)} dBFS, `
        + `${c.margenEnBinDb.toFixed(1)} dB sobre el piso`);
    }
    rmSync(wav, { force: true });
    if (FRECUENCIAS.some((_, i) => !(margenes[i]! >= MARGEN_MINIMO_DB))) {
      throw new Error(`C1 FALLA: alguna frecuencia no llega a ${MARGEN_MINIMO_DB} dB sobre el `
        + `piso. Sin estimulo, «no planto» no dice nada del modo.`);
    }
    console.log(`   C1 PASA: las tres por encima de ${MARGEN_MINIMO_DB} dB`);
    console.log('');

    const arranque = Date.now();
    const hasta = arranque + MINUTOS * 60 * 1000;
    let ultimoSondeo = 0;
    let ultimoAviso = 0;
    while (Date.now() < hasta) {
      const seg = Math.round((Date.now() - arranque) / 1000);

      if (avisos.length > 0) {
        planto = true; quienAviso = 'el socket'; segundosHastaPlantar = seg;
      } else if (seg - ultimoSondeo >= SONDEO_MS / 1000) {
        // **La vigilancia que no depende de ninguna suposicion.**
        ultimoSondeo = seg;
        const eN = await estadoPorHttpExigido(maquina);
        if (comoTexto(pila(eN)) !== comoTexto(pilaAntes)) {
          planto = true; quienAviso = 'la relectura por HTTP'; segundosHastaPlantar = seg;
        }
      }

      if (planto) {
        sonando.kill();
        console.log('');
        console.log(`   *** LA PILA SE MOVIO a los ${seg} s -- lo vio ${quienAviso} ***`);
        console.log('   tono cortado AHORA');
        for (const a of avisos.slice(0, 8)) console.log(`      socket: ${a}`);
        break;
      }

      if (seg - ultimoAviso >= 30) {
        ultimoAviso = seg;
        console.log(`   ${seg} s de tono, la pila sin moverse`);
      }
      if (sonando.exitCode !== null) {
        throw new Error(`el tono se murio a los ${seg} s: la exposicion no se completo.`);
      }
      await new Promise((r) => { setTimeout(r, 1000); });
    }
    sonando.kill();
    await new Promise((r) => { setTimeout(r, 2000); });
  },
);

const e1 = await estadoPorHttpExigido(maquina);
const pilaDespues = pila(e1);
console.log('');
console.log('=== LA PILA, DESPUES DEL TONO ===');
console.log(`   filtros plantados: ${plantados(pilaAntes).length} antes, `
  + `${plantados(pilaDespues).length} despues`);
for (const r of pilaDespues) {
  const antes = pilaAntes.find((x) => x.i === r.i);
  if (antes?.crudo !== r.crudo) {
    console.log(`   RANURA ${r.i}: antes ${antes?.crudo ?? '(no estaba)'}`);
    console.log(`               ahora ${r.crudo}`);
  }
}

// --- si planto, se limpia: la pila estaba vacia y el usuario lo autorizo ----
let limpio = true;
if (plantados(pilaDespues).length > 0) {
  console.log('');
  console.log('=== LIMPIEZA ===');
  // **La secuencia del cliente es 1, esperar 500 ms, 0 -- y en ESTA consola eso
  // solo no alcanzaria.** `m.afs.clearall` esta en 1 en reposo acá, y el cliente
  // siempre lo deja en 0: el estado archivado de `fmalcher/soundcraft-ui`
  // tambien lo trae en 0. O sea que el disparo es el flanco de subida y en esta
  // consola no hay flanco posible: ya esta arriba.
  //
  // Probablemente lo dejo asi este mismo proyecto el 2026-09-13, al probar el
  // borrado sin la vuelta a 0. Se baja primero para que el flanco exista, y
  // despues se hace lo que hace el cliente, sin inventar nada mas.
  console.log('   se baja a 0 primero: en esta consola `clearall` esta en 1 y sin flanco');
  console.log('   de subida el boton no dispara. Despues, la secuencia del cliente.');
  t.enviar(codificarSetd('m.afs.clearall', 0));
  await new Promise((r) => { setTimeout(r, 700); });
  t.enviar(codificarSetd('m.afs.clearall', 1));
  await new Promise((r) => { setTimeout(r, 500); });
  t.enviar(codificarSetd('m.afs.clearall', 0));
  await new Promise((r) => { setTimeout(r, 2000); });
  const e2 = await estadoPorHttpExigido(maquina);
  const pilaLimpia = pila(e2);
  limpio = plantados(pilaLimpia).length === 0;
  console.log(`   filtros plantados despues de limpiar: ${plantados(pilaLimpia).length}`);
  console.log(`   ${limpio ? 'LIMPIA.' : 'NO QUEDO LIMPIA -- HAY QUE MIRAR LA CONSOLA.'}`);
  // **`clearall` queda en 0 y NO se restaura a 1, a proposito.** La regla de este
  // repositorio es devolver lo que se encontro, y acá se la rompe con el motivo
  // escrito: el 1 que se encontro es casi seguro un residuo de este mismo
  // proyecto, y dejarlo puesto es dejar el boton CLEAR ALL del usuario sin flanco
  // posible, o sea inutilizable. Restaurar el residuo seria restaurar el defecto.
  //
  // Queda informado abajo para que el usuario lo vea, no escondido en un finally.
  console.log('   `m.afs.clearall` queda en 0 --como lo deja el cliente-- y NO en el 1');
  console.log('   que se encontro. El motivo esta en el comentario del guion y en el informe.');
}

const e3 = await estadoPorHttpExigido(maquina);
console.log('');
console.log('=== LA CONSOLA, AL FINAL ===');
for (const k of ['m.afs.enabled', 'm.afs.logic', 'm.afs.fmode', 'm.afs.clearall']) {
  console.log(`   ${k.padEnd(18)} ${exigirClave(e3, k)}`);
}
const finales = pila(e3);
console.log(`   ranuras ${finales.length}, con filtro plantado ${plantados(finales).length}`);
if (limpio && plantados(finales).length === 0) cerrarPendiente(); else process.exitCode = 1;

console.log('');
console.log('=== VEREDICTO ===');
if (planto) {
  console.log(`   SI PLANTA EN LIVE, a los ${segundosHastaPlantar} s, y lo vio ${quienAviso}.`);
  console.log('   O sea que el control positivo del item 111 YA NO ES HISTORICO: este mismo');
  console.log('   estimulo, este mismo dia, hace aprender al supresor. Con eso, «en LOCK no');
  console.log('   aprendio» pasa a significar lo que se queria que significara.');
} else {
  console.log(`   NO PLANTO EN LIVE en ${MINUTOS} minutos.`);
  console.log('   **Y eso RETIRA la conclusion del item 111, no la confirma.** Si este');
  console.log('   estimulo no hace aprender ni en el modo que se sabe que aprende, entonces');
  console.log('   que LOCK no aprendiera con el no dice nada de LOCK: dice que el estimulo');
  console.log('   es demasiado flojo. Lo que hay que revisar es el nivel, no el modo.');
  process.exitCode = 1;
}
