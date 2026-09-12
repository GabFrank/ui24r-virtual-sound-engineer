/**
 * Un tono conocido por el monitor, y el microfono mirando a ver si llega.
 *
 * **Dos preguntas de una.** La primera es si la cadena acustica entera funciona:
 * PC -> Scarlett -> canal 10 -> general -> Rockit -> AIRE -> B2 -> canal 9 ->
 * analizador. Si un tono de 1 kHz aparece en la banda 67, funciona; si no
 * aparece, hay algo roto y sabemos donde mirar.
 *
 * La segunda es la que quedo abierta midiendo la lluvia: las bandas de 31, 63 y
 * 125 Hz dieron EXACTAMENTE CERO. O la lluvia no tiene energia ahi a esta
 * distancia, o algo del camino la quita. Mandando tonos graves conocidos se
 * separa: si un tono de 63 Hz aparece, la lluvia no los tenia; si no aparece con
 * el de 1 kHz funcionando, el camino se come los graves y hay que averiguar
 * donde --el Rockit, la sala, el B2 o la consola--.
 *
 * **No arma ningun lazo.** El canal 9 esta EN SILENCIO, asi que lo que capta el
 * microfono no vuelve al general. El medidor de entrada y el analizador son
 * anteriores al silencio, que es lo que hace posible medir sin acoplar.
 *
 * El tono lo reproduce ESTE proceso y no un comando suelto: un `afplay` lanzado
 * desde una llamada de herramienta muere cuando esa llamada termina, y eso ya
 * hizo concluir dos veces que «no llegaba senal» cuando lo que pasaba es que no
 * habia quien la generara.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar,
  frecuenciaDeBanda, bandaDeFrecuencia, decodificarVuCanales, dbDeMedidor,
} from '@vse/mixer-adapter';
import { exigirClave } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const HZ = (process.argv[3] ?? '1000,500,250,125,63,40').split(',').map(Number);
const CANAL_TONO = 10;                 // por donde entra la Scarlett
const CANAL_MIC = 9;                   // el B2
const GANANCIA_TONO = 0.70;            // para que el monitor suene de verdad
const FM = 48000, DB = -12, SEG = 6;

function tono(hz: number): string {
  const n = FM * SEG, amp = Math.pow(10, DB / 20) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / FM));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  const ruta = join(tmpdir(), `vse-aire-${hz}.wav`);
  writeFileSync(ruta, Buffer.concat([c, d]));
  return ruta;
}

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
const crudo = new Map<string, number>();
t.alRecibir((l) => { const m = decodificar(l); if (m.tipo === 'SETD') crudo.set(m.path, m.valor); });

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
if (punto === null) { console.log('sin punto de retorno; se aborta'); await app.desconectar(); process.exit(1); }
console.log(`punto de retorno: ${punto}`);

const muteMic = crudo.get(`i.${CANAL_MIC - 1}.mute`) ?? 0;
if (muteMic !== 1) {
  console.log(`el canal ${CANAL_MIC} NO esta en silencio: se aborta antes de sonar nada.`);
  console.log('Con el microfono abierto frente al monitor esto seria un lazo.');
  await app.desconectar(); process.exit(1);
}
console.log(`canal ${CANAL_MIC} en silencio: no hay lazo posible`);

/**
 * **El supresor se apaga mientras dura la medicion, y es imprescindible.**
 *
 * Medido el 2026-09-10: un tono sostenido es, para un supresor, indistinguible
 * de una realimentacion. La primera tanda de tonos hizo que la consola le
 * pusiera un notch de -18 dB A CADA UNO, y las mediciones siguientes salieron
 * por esos notches. El instrumento se defendia de la medicion.
 *
 * No se borran los filtros del usuario --se probo y no se puede por protocolo--
 * sino que se apaga el supresor entero, que ademas es reversible y no le cuesta
 * a nadie el trabajo de afinacion.
 */
// **Se exige la clave en vez de suponerla.** Un `?? valor` antes de una
// escritura no es un valor por omision: es una suposicion disfrazada de
// lectura, y con una lectura HTTP fallida --que devuelve un mapa vacio--
// restauraba la consola a un numero inventado. Auditoria del 2026-09-12.
const afsAntes = exigirClave(crudo, 'm.afs.enabled');
t.enviar(codificarSetd('m.afs.enabled', 0));
await new Promise((r) => setTimeout(r, 1500));
console.log(`supresor de realimentacion: ${afsAntes} -> 0 mientras dura la medicion`);

const gananciaAntes = exigirClave(crudo, `hw.${CANAL_TONO - 1}.gain`);
t.enviar(codificarSetd(`hw.${CANAL_TONO - 1}.gain`, GANANCIA_TONO));
await new Promise((r) => setTimeout(r, 1000));
console.log(`ganancia del canal ${CANAL_TONO}: ${gananciaAntes.toFixed(4)} -> ${GANANCIA_TONO} (para que el monitor suene)`);

let bandas: number[] = [];
/**
 * El nivel ELECTRICO del tono al entrar, para separar donde se pierde un grave.
 *
 * Sin esto, «el microfono no ve los 63 Hz» tiene dos explicaciones que no se
 * distinguen: que el tono no llegue a la consola --la Scarlett, el cable, el
 * archivo-- o que llegue y no sobreviva al aire --el monitor, la sala--. Con el
 * medidor de entrada del canal del tono, la pregunta se parte en dos y solo una
 * queda abierta.
 */
let nivelTono = -Infinity;
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const c = decodificarVuCanales(l.slice(4))[CANAL_TONO - 1];
  if (!c) return;
  const db = dbDeMedidor(c.entrada);
  if (Number.isFinite(db)) nivelTono = Math.max(nivelTono, db);
});
const quitar = app.alEspectro((b) => { bandas = [...b]; });
if (!app.tomarAnalizador(`i.${CANAL_MIC - 1}`)) {
  console.log('no se pudo tomar el analizador'); await app.desconectar(); process.exit(1);
}

console.log('');
console.log('  Hz  | banda | entra al canal 10 | lo ve el microfono | pico del espectro');
console.log('------+-------+-------------------+--------------------+------------------');

for (const hz of HZ) {
  const ruta = tono(hz);
  const sonando = spawn('afplay', [ruta]);
  await new Promise((r) => setTimeout(r, 2500));
  nivelTono = -Infinity;

  // Se promedian dos segundos de tramas para no depender de una sola.
  const muestras: number[][] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    if (bandas.length > 0) muestras.push([...bandas]);
    await new Promise((r) => setTimeout(r, 40));
  }
  sonando.kill();
  await new Promise((r) => setTimeout(r, 800));

  if (muestras.length === 0) { console.log(`${String(hz).padStart(5)} | sin tramas`); continue; }
  const n = muestras[0]!.length;
  const media = new Array(n).fill(0);
  for (const m of muestras) for (let i = 0; i < n; i++) media[i] += m[i]! / muestras.length;

  const banda = Math.round(bandaDeFrecuencia(hz));
  const enLaBanda = banda >= 0 && banda < n ? media[banda]! : 0;
  const pico = media.indexOf(Math.max(...media));
  const electrico = nivelTono === -Infinity ? 'sin senal' : `${nivelTono.toFixed(1)} dB`;
  console.log(
    `${String(hz).padStart(5)} | ${String(banda).padStart(5)} | ${electrico.padStart(17)} | `
    + `${enLaBanda.toFixed(1).padStart(6)} dB ${'#'.repeat(Math.max(0, Math.round(enLaBanda / 3)))}`.padEnd(20)
    + `| banda ${pico} (${frecuenciaDeBanda(pico).toFixed(0)} Hz) a ${media[pico]!.toFixed(1)} dB`,
  );
}

quitar();
app.devolverAnalizador();
t.enviar(codificarSetd(`hw.${CANAL_TONO - 1}.gain`, gananciaAntes));
// El supresor vuelve, y se limpian los automaticos que hubiera colocado igual.
t.enviar(codificarSetd('m.afs.clearlive', 1));
await new Promise((r) => setTimeout(r, 1200));
t.enviar(codificarSetd('m.afs.clearlive', 0));
t.enviar(codificarSetd('m.afs.enabled', afsAntes));
await new Promise((r) => setTimeout(r, 1200));
console.log(`supresor devuelto a ${afsAntes}, automaticos limpiados`);
console.log('');
console.log(`ganancia del canal ${CANAL_TONO} devuelta a ${gananciaAntes.toFixed(4)}`);
console.log(`analizador devuelto a: ${app.fuenteOriginalDelAnalizador() ?? '(ninguna)'}`);
await app.desconectar();
