/**
 * Dónde se pierden los 29 dB: ¿sale poco, o vuelve poco?
 *
 * **Por qué existe.** El 2026-09-20 las dos corridas de la banda 2 capturaron a
 * −58,8 dBFS donde la corrida buena de la banda 1 capturó a −29,6, con el mismo
 * estímulo —comprobado: el archivo tiene pico real −27,00 dBFS y los dos canales
 * idénticos— y con el lazo sano —`llega-el-tono` pone −18 dBFS y devuelve −21—.
 * Las dos cosas no pueden ser ciertas a la vez, así que falta un dato.
 *
 * **El dato que falta lo da la propia interfaz.** La Scarlett expone **cuatro**
 * entradas: las dos físicas y **dos que devuelven lo que la computadora
 * transmitió**, sin pasar por ningún cable. Mirando las cuatro en la misma
 * captura:
 *
 * - si las de retorno interno traen el multitono a su nivel y las físicas no,
 *   **sale bien y vuelve mal**: el problema está en el camino analógico;
 * - si las de retorno interno también traen poco, **sale poco**: el problema está
 *   antes de la interfaz, en la reproducción.
 *
 * `respuesta()` mide la curva como capturado **menos** transmitido, así que una
 * caída de reproducción se cancela en la resta --por eso la ley salió bien las
 * dos veces-- pero se lleva puesta la relación señal a ruido, que es lo que hizo
 * fallar el control de cierre.
 *
 * **Escribe una sola clave: `m.afs.enabled`.** Se apaga antes de que suene nada y
 * se devuelve, igual que hace `llega-el-tono`, porque un multitono sostenido es
 * exactamente lo que le planta filtros permanentes al supresor. Se comprueba por
 * HTTP antes y después, y se cuentan los filtros.
 *
 * Uso: `node tools/spikes/p0-2b-eq/donde-se-pierden-los-db.ts [ip]`
 */
import { spawn } from 'node:child_process';
import { rmSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';
// @ts-expect-error -- JavaScript sin tipos
import { frecuenciasPorOctava, escribirMultitono } from '../../audio/multitono.mjs';
// @ts-expect-error -- JavaScript sin tipos
import { leerWav } from '../../audio/analizar.mjs';

const maquina = argTexto(2, '192.168.0.78');

const FM = 48000;
const SEGUNDOS = 4;
const PICO_OBJETIVO_DBFS = -27;
/** El mismo tono suelto que usa `llega-el-tono`, para tener los dos en una corrida. */
const TONO_HZ = 1000;
const TONO_DBFS = -18;

const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const carpeta = mkdtempSync(join(tmpdir(), 'vse-db-'));

const dB = (x: number): number => 20 * Math.log10(Math.max(x, 1e-12));

function tonoSuelto(ruta: string, segundos: number): void {
  const n = FM * segundos;
  const amp = Math.pow(10, TONO_DBFS / 20) * 32767;
  const datos = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * TONO_HZ * i) / FM));
    datos.writeInt16LE(v, i * 4);
    datos.writeInt16LE(v, i * 4 + 2);
  }
  const cab = Buffer.alloc(44);
  cab.write('RIFF', 0); cab.writeUInt32LE(36 + datos.length, 4); cab.write('WAVE', 8);
  cab.write('fmt ', 12); cab.writeUInt32LE(16, 16); cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(2, 22); cab.writeUInt32LE(FM, 24); cab.writeUInt32LE(FM * 4, 28);
  cab.writeUInt16LE(4, 32); cab.writeUInt16LE(16, 34);
  cab.write('data', 36); cab.writeUInt32LE(datos.length, 40);
  writeFileSync(ruta, Buffer.concat([cab, datos]));
}

async function capturarCuatro(etiqueta: string): Promise<void> {
  const wav = join(carpeta, `${etiqueta}.wav`);
  const hijo = spawn(GRABADOR, [String(SEGUNDOS), wav, 'Scarlett'], { stdio: 'ignore' });
  await new Promise<void>((r) => { hijo.on('close', () => r()); });
  const w = leerWav(wav) as { canales: Float32Array[]; frecuencia: number };
  console.log(`   ${etiqueta}:`);
  w.canales.forEach((c, i) => {
    let p = 0; let s = 0;
    for (const v of c) { const a = Math.abs(v); if (a > p) p = a; s += v * v; }
    const rms = Math.sqrt(s / c.length);
    const que = i === 0 ? 'entrada 1 (retorno del general)'
      : i === 1 ? 'entrada 2 (retorno del auxiliar)'
        : `retorno interno ${i - 1} (lo que la computadora transmitio)`;
    console.log(`      canal ${i}: pico ${dB(p).toFixed(2).padStart(8)} dBFS | `
      + `rms ${dB(rms).toFixed(2).padStart(8)} dBFS   ${que}`);
  });
  rmSync(wav, { force: true });
}

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const AFS_PREVIO = Number(exigirClave(e0, 'm.afs.enabled'));
const filtrosAntes = [...e0.keys()].filter((k) => /^m\.afs\.\d+\./.test(k)).length;

console.log('=== DONDE SE PIERDEN LOS 29 dB ===');
console.log(`consola: ${maquina}`);
console.log(`fecha:   ${new Date().toISOString()}`);
console.log(`supresor del general: ${AFS_PREVIO} (se apaga y se devuelve)`);
console.log(`estimulos: multitono pico ${PICO_OBJETIVO_DBFS} dBFS, y tono suelto de `
  + `${TONO_HZ} Hz a ${TONO_DBFS} dBFS, el mismo de llega-el-tono`);
console.log('escrituras a la consola: DOS, m.afs.enabled y i.9.dyn.bypass');
console.log('');

const DYN_PREVIO = Number(exigirClave(e0, 'i.9.dyn.bypass'));
const A_RESTAURAR: readonly (readonly [string, number])[] = [
  ['m.afs.enabled', AFS_PREVIO],
  ['i.9.dyn.bypass', DYN_PREVIO],
];
anotarPendiente('donde-se-pierden-los-db.ts', maquina, A_RESTAURAR);

let sonando: ReturnType<typeof spawn> | null = null;

await conRestauracion(
  async () => {
    sonando?.kill();
    await new Promise((r) => setTimeout(r, 1500));
    await restaurarClaves(t, maquina, A_RESTAURAR);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.enabled', 0));
    await new Promise((r) => setTimeout(r, 2000));
    const eC = await estadoPorHttpExigido(maquina);
    if (Number(exigirClave(eC, 'm.afs.enabled')) !== 0) {
      throw new Error('el supresor no se apago: no se mete un multitono sostenido con el encendido');
    }
    console.log('supresor apagado y COMPROBADO por HTTP');
    console.log('');

    console.log('=== 1. EN SILENCIO, para tener el piso ===');
    await capturarCuatro('silencio');
    console.log('');

    console.log('=== 2. CON EL TONO SUELTO, el que llega-el-tono dice que vuelve bien ===');
    const wTono = join(carpeta, 'tono.wav');
    tonoSuelto(wTono, 20);
    sonando = spawn('afplay', [wTono]);
    await new Promise((r) => setTimeout(r, 3000));
    await capturarCuatro('tono suelto');
    sonando.kill(); sonando = null;
    await new Promise((r) => setTimeout(r, 1500));
    console.log('');

    console.log('=== 3. CON EL MULTITONO, el que captura 29 dB abajo ===');
    const wMulti = join(carpeta, 'multitono.wav');
    const frecuencias: number[] = frecuenciasPorOctava({ anchoDelBinHz: 1 / SEGUNDOS });
    const info = escribirMultitono(wMulti, {
      frecuencias, fm: FM, segundos: SEGUNDOS,
      picoObjetivoDbFS: PICO_OBJETIVO_DBFS, repeticiones: 10,
    }) as { nivelPorTonoDbFS: number; factorDeCresta: number };
    console.log(`   ${frecuencias.length} tonos, ${info.nivelPorTonoDbFS.toFixed(1)} dBFS por tono, `
      + `cresta ${(20 * Math.log10(info.factorDeCresta)).toFixed(1)} dB`);
    sonando = spawn('afplay', [wMulti]);
    await new Promise((r) => setTimeout(r, 3000));
    await capturarCuatro('multitono, compresor del canal COMO ESTA');
    console.log('');

    // **La prueba de la atribucion.** Se puentea SOLO el compresor del canal, que
    // es una de las cinco cosas que `curvas-del-ecualizador.ts` neutraliza, y se
    // vuelve a capturar sin tocar nada mas. Si la caida aparece aca, la
    // atribucion deja de ser una cuenta y pasa a ser una medicion.
    console.log('=== 4. LO MISMO, PUENTEANDO SOLO EL COMPRESOR DEL CANAL ===');
    console.log(`   i.9.dyn.outgain vale ${exigirClave(e0, 'i.9.dyn.outgain')}, que por la ley`);
    console.log('   del cliente de la consola --72a-24, INFERIDA, no medida-- son +27,7 dB');
    t.enviar(codificarSetd('i.9.dyn.bypass', 1));
    await new Promise((r) => setTimeout(r, 2000));
    await capturarCuatro('multitono, compresor del canal PUENTEADO');
    sonando.kill(); sonando = null;
  },
);

console.log('');
console.log('=== COMO SE LEE ===');
console.log('   Los canales 2 y 3 NO pasan por ningun cable: son lo que la computadora');
console.log('   transmitio. Si ahi el multitono esta a su nivel y en el canal 0 no,');
console.log('   la perdida es del camino analogico. Si tambien esta bajo ahi, la');
console.log('   perdida es de la reproduccion y no tiene nada que ver con el banco.');
console.log('');

const eFin = await estadoPorHttpExigido(maquina);
const filtrosDespues = [...eFin.keys()].filter((k) => /^m\.afs\.\d+\./.test(k)).length;
const afsFin = Number(exigirClave(eFin, 'm.afs.enabled'));
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
const dynFin = Number(exigirClave(eFin, 'i.9.dyn.bypass'));
console.log(`   m.afs.enabled    esperado ${AFS_PREVIO}  leido ${afsFin}`);
console.log(`   i.9.dyn.bypass   esperado ${DYN_PREVIO}  leido ${dynFin}`);
console.log(`   filtros del supresor: ${filtrosAntes} antes, ${filtrosDespues} despues`);
const bien = afsFin === AFS_PREVIO && dynFin === DYN_PREVIO;
if (bien) cerrarPendiente();
console.log(bien
  ? '   Restaurado, comprobado por un camino distinto del que escribio.'
  : '   **SIN RESTAURAR.** Queda el registro en disco: reparar-pendiente.ts lo deshace.');

process.exit(0);
