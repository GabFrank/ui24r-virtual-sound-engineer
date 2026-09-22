/**
 * ¿El supresor aprende en modo LOCK?
 *
 * **La pregunta útil de la fila 6**, y sólo ésa: qué modo es seguro para meter un
 * tono. No se prueban los tres — probar LIVE y FIXED significa **dejar que
 * planten filtros** en la consola del usuario, y `clearall` es lo único medido
 * que los borra y se lleva los doce que tiene. El usuario ya sabe que LIVE
 * aprende: le pasó dos veces, en septiembre.
 *
 * ## El problema de método, y cómo se resuelve
 *
 * **Un tono corto que no planta nada no prueba nada.** Podría ser corto para
 * cualquier modo, y entonces «no aprendió» sería la misma conclusión falsa que
 * sacar una medición del silencio. La evidencia sólo vale si la exposición es
 * comparable a la que **sí** plantó filtros antes.
 *
 * Así que la exposición es larga —minutos— y el riesgo se acota por el otro lado:
 * **la pila se vigila por el socket y el tono se corta en el instante**. La
 * consola difunde `SETS^m.afs.eq.N` cuando planta, así que no hay que sondear ni
 * esperar: llega solo. El peor caso deja de ser «una tanda de filtros» y pasa a
 * ser «uno, detectado al aparecer».
 *
 * El control positivo es **histórico y está documentado**: tonos sostenidos con
 * el supresor encendido —en LIVE, que es como está esta consola— plantaron seis
 * filtros el 2026-09-12. Ver
 * `docs/backlog/hallazgo-solo-clearall-borra-y-se-lleva-todo.md`.
 *
 * ## Qué escribe
 *
 * **`m.afs.logic` a 0**, que es lo que el cliente hace para poner LOCK, y nada
 * más. `m.afs.fmode` **no se toca**: el propio cliente lo deja como está al pasar
 * a LOCK, y tocarlo sería salirse de lo que el aparato hace.
 *
 * **`m.afs.enabled` se EXIGE en 1 y no se escribe.** Es la única forma de que la
 * prueba signifique algo: un supresor apagado no aprende en ningún modo, así que
 * apagarlo garantizaría el resultado que se busca. Si está apagado, se aborta.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/lock-aprende-o-no.ts 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');
const FM = 48000;
const NIVEL_DBFS = -18;
/** Cuánto dura la exposición, si nada aparece antes. */
const MINUTOS = 4;
/**
 * Las frecuencias del tono, **las mismas que plantaron filtros en septiembre**.
 *
 * No se eligen por comodidad: si la exposición no se parece a la que causó el
 * daño, un resultado negativo no dice nada. Los filtros de aquella vez quedaron
 * en 1 kHz, 100 Hz y 10 kHz.
 */
const FRECUENCIAS = [1000, 100, 10000] as const;

const carpeta = mkdtempSync(join(tmpdir(), 'lock-aprende-'));
const GRABADOR = 'tools/audio/bin/grabar';
/** La entrada de la interfaz por donde vuelve el general. Base cero. */
const ENTRADA = 0;
/** C1: cuanto tiene que sobresalir cada tono del piso para que valga. */
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

/**
 * La pila del supresor, leída por HTTP. Son claves de texto, no numéricas.
 *
 * **Y hay que separar dos cosas que este proyecto venía contando juntas.** Cada
 * `m.afs.eq.N` es una **ranura**, y una ranura vacía existe igual: la consola la
 * publica como `1000,116,0,0` --frecuencia de fábrica, Q de fábrica, 0 dB de
 * atenuación y la bandera en 0--. Contar ranuras y llamarlas «filtros» dice doce
 * cuando hay cero.
 *
 * Un filtro **plantado** se reconoce porque atenúa: el tercer campo deja de ser
 * cero. Eso es lo que hay que comparar antes y después, y no la cuenta.
 */
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

/**
 * **La vigilancia, por el socket y no sondeando.**
 *
 * La consola difunde el cambio en cuanto planta, así que la deteccion es
 * inmediata y no depende de con cuanta frecuencia se pregunte. Sondear por HTTP
 * costaria segundos por vuelta, y esos segundos son exactamente el tiempo en que
 * el dano crece.
 */
const avisos: string[] = [];
t.alRecibir((linea) => {
  if (/^SET[SD]\^m\.afs\.(eq\.|num)/.test(linea)) avisos.push(linea.trim());
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

const enabled = Number(exigirClave(e0, 'm.afs.enabled'));
if (enabled !== 1) {
  throw new Error(`m.afs.enabled esta en ${enabled}. Esta prueba SOLO significa algo con el `
    + `supresor encendido: apagado no aprende en ningun modo, asi que medirlo asi seria `
    + `garantizar de antemano el resultado que se busca.`);
}

const PREVIO: readonly (readonly [string, number])[] = [
  ['m.afs.logic', Number(exigirClave(e0, 'm.afs.logic'))],
];
const pilaAntes = pila(e0);
const modoAntes = `logic=${exigirClave(e0, 'm.afs.logic')} fmode=${exigirClave(e0, 'm.afs.fmode')}`;

console.log('=== ¿EL SUPRESOR APRENDE EN MODO LOCK? ===');
console.log('');
console.log(`   supresor encendido: ${enabled}  (se EXIGE, no se escribe)`);
console.log(`   modo al empezar: ${modoAntes}`);
console.log(`   ranuras del supresor: ${pilaAntes.length}`);
console.log(`   de esas, con filtro PLANTADO (atenuacion distinta de 0): `
  + `${plantados(pilaAntes).length}`);
for (const r of plantados(pilaAntes)) console.log(`      ${r.i}: ${r.crudo}`);
console.log(`   estimulo: ${FRECUENCIAS.join(', ')} Hz, las mismas que plantaron en septiembre`);
console.log(`   exposicion: hasta ${MINUTOS} min, cortando en cuanto aparezca algo`);
console.log('');
console.log('   SOLO se escribe m.afs.logic. Ni fmode ni enabled se tocan.');
console.log('');

anotarPendiente('lock-aprende-o-no.ts', maquina, PREVIO);

let sonando: ReturnType<typeof spawn> | null = null;
let cortadoPorAviso = false;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => { setTimeout(r, 1000); });
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.logic', 0));
    await new Promise((r) => { setTimeout(r, 1500); });
    const leido = await leerUnaClave(maquina, 'm.afs.logic');
    if (leido !== 0) {
      throw new Error(`m.afs.logic quedo en ${leido} y se pidio 0. Sin LOCK puesto, lo que se `
        + `mida es de otro modo --y el otro modo es el que planta filtros.`);
    }
    console.log('   LOCK puesto y COMPROBADO por HTTP (logic = 0)');
    console.log('');

    avisos.length = 0;
    sonando = spawn('afplay', [tono(MINUTOS * 60 + 30)]);
    sonando.on('error', (e) => { throw e instanceof Error ? e : new Error(String(e)); });
    await new Promise((r) => { setTimeout(r, 2000); });
    if (sonando.exitCode !== null) {
      throw new Error(`afplay salio con ${sonando.exitCode}: sin tono no hay nada que aprender.`);
    }

    // --- C1: el tono LLEGA AL GENERAL, medido ---------------------------------
    //
    // **Sin esto, toda la corrida se apoya en una suposicion.** Que `afplay` no
    // haya muerto dice que el iMac esta reproduciendo, no que la señal llegue al
    // bus donde vive el supresor: entre medio estan la interfaz, el previo, el
    // fader del canal, la puerta del canal --que HOY esta encendida-- y el fader
    // del general. Si algo de eso corta, la pila no se mueve y la conclusion
    // seria «LOCK no aprende» cuando lo cierto es «no hubo tono».
    //
    // Es exactamente la trampa que este repositorio tiene escrita desde hace
    // meses --medir sobre silencio y leerlo como una lectura-- y aca costaria
    // caro de una forma nueva: un falso negativo no se nota, se publica.
    //
    // Se mide por donde vuelve el general al banco, o sea DESPUES del punto
    // donde el supresor escucha.
    const wav = join(carpeta, 'c1.wav');
    const grab = spawn(GRABADOR, ['3', wav, 'Scarlett'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errGrab = '';
    grab.stderr?.on('data', (b: Buffer) => { errGrab += b.toString(); });
    const cod = await new Promise<number | null>((res, rej) => {
      grab.on('error', rej); grab.on('close', (c) => res(c));
    });
    if (cod !== 0) {
      throw new Error(`el grabador salio con ${cod} en C1: ${errGrab.trim() || '(nada)'}`);
    }
    console.log('   C1 -- ¿el tono llega al general?');
    const margenes: number[] = [];
    for (const hz of FRECUENCIAS) {
      const an = analizar(wav, hz) as {
        canales: { tonoDb: number; margenEnBinDb: number }[];
      };
      const c = an.canales[ENTRADA]!;
      margenes.push(c.margenEnBinDb);
      console.log(`      ${String(hz).padStart(5)} Hz: ${c.tonoDb.toFixed(2)} dBFS, `
        + `${c.margenEnBinDb.toFixed(1)} dB sobre el piso`);
    }
    rmSync(wav, { force: true });
    const flojo = FRECUENCIAS.filter((_, i) => !(margenes[i]! >= MARGEN_MINIMO_DB));
    if (flojo.length > 0) {
      throw new Error(`C1 FALLA: ${flojo.join(', ')} Hz no llegan a ${MARGEN_MINIMO_DB} dB sobre `
        + `el piso. Sin tono en el general, «la pila no se movio» no dice nada del modo LOCK: `
        + `dice que no hubo estimulo. NO se publica un negativo medido sobre silencio.`);
    }
    console.log(`   C1 PASA: las tres frecuencias por encima de ${MARGEN_MINIMO_DB} dB`);
    console.log('');

    const hasta = Date.now() + MINUTOS * 60 * 1000;
    let ultimoAviso = 0;
    while (Date.now() < hasta) {
      if (avisos.length > 0) {
        cortadoPorAviso = true;
        sonando.kill();
        console.log('');
        console.log('   *** LA CONSOLA TOCO EL SUPRESOR: se corta el tono AHORA ***');
        for (const a of avisos.slice(0, 6)) console.log(`      ${a}`);
        break;
      }
      const seg = Math.round((MINUTOS * 60 * 1000 - (hasta - Date.now())) / 1000);
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
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
const volvio = Number(exigirClave(e1, 'm.afs.logic')) === PREVIO[0]![1];
console.log(`   m.afs.logic  esperado ${PREVIO[0]![1]}  leido ${exigirClave(e1, 'm.afs.logic')}`
  + `  ${volvio ? 'OK' : 'MAL'}`);
console.log(`   m.afs.fmode  ${exigirClave(e1, 'm.afs.fmode')}  (no se toco)`);
console.log(`   m.afs.enabled ${exigirClave(e1, 'm.afs.enabled')}  (no se toco)`);

const igual = comoTexto(pilaAntes) === comoTexto(pilaDespues);
console.log('');
console.log('=== LA PILA DEL SUPRESOR ===');
console.log(`   ranuras: ${pilaAntes.length} antes, ${pilaDespues.length} despues`);
console.log(`   filtros PLANTADOS: ${plantados(pilaAntes).length} antes, `
  + `${plantados(pilaDespues).length} despues`);
console.log(`   ${igual ? 'IDENTICA, ranura por ranura y campo por campo.'
  : 'CAMBIO. Hay que mirar la consola.'}`);
if (!igual) {
  const antes = new Map(pilaAntes.map((r) => [r.i, r.crudo]));
  for (const r of pilaDespues) {
    if (antes.get(r.i) !== r.crudo) {
      console.log(`      RANURA ${r.i} CAMBIO -> antes ${antes.get(r.i) ?? '(no estaba)'}`);
      console.log(`                              ahora ${r.crudo}`);
    }
  }
}
if (volvio && igual) cerrarPendiente(); else process.exitCode = 1;

console.log('');
console.log('=== VEREDICTO ===');
if (!igual || cortadoPorAviso) {
  console.log('   EN LOCK EL SUPRESOR TOCA LA PILA. NO es un modo seguro para meter tono.');
  console.log('   Se corto en cuanto se detecto, asi que el dano es el minimo posible, pero');
  console.log('   HAY QUE MIRAR LA CONSOLA: lo plantado solo lo borra `clearall`, y se lleva');
  console.log('   la pila entera.');
  process.exitCode = 1;
} else {
  console.log(`   EN LOCK NO APRENDIO. ${MINUTOS} minutos de las tres frecuencias que`);
  console.log('   plantaron filtros en septiembre, y la pila quedo identica filtro por filtro.');
  console.log('');
  console.log('   Lo que esto SI habilita: LOCK es el modo para meter tono cuando no se');
  console.log('   quiera apagar el supresor. La guarda de `m.afs.enabled = 0` sigue siendo');
  console.log('   la primera opcion, porque no depende de esta medicion.');
  console.log('');
  console.log('   Lo que NO prueba: nada de LIVE ni de FIXED, que no se probaron a proposito.');
  console.log('   Y es UNA exposicion, de cuatro minutos, en un dia. El control positivo es');
  console.log('   historico --septiembre-- y no concurrente: no se demostro que ESTE estimulo');
  console.log('   hubiera plantado algo en otro modo.');
}

await t.desconectar();
