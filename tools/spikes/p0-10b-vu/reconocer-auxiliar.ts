/**
 * ¿El cable del auxiliar 5 lleva señal a la entrada 2 de la interfaz?
 *
 * **Reconocimiento, no medición.** El usuario cableó la salida del auxiliar 5 a
 * la entrada 2 de la Scarlett y ese camino no se usó nunca. Antes de escribir el
 * contrato de la 102 hay que saber tres cosas que ningún documento tiene:
 *
 * 1. Que la entrada 2 reciba de verdad lo que sale del auxiliar.
 * 2. Con cuánta ganancia, para poder elegir los niveles del barrido sin recortar
 *    --que es el error que la 101 cometió y su guarda atajó.
 * 3. Si la puerta y el compresor del auxiliar están actuando, porque los dos
 *    dependen del nivel y habría que puentearlos.
 *
 * Escribe cuatro claves, las lee antes con `exigirClave`, y las restaura por
 * `restaurarClaves`, que reconecta si el transporte se cae.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/reconocer-auxiliar.ts 10 5 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, codificarSetd, decodificarVuBuses, decodificarVuCanales,
  dbDeMedidor, faderADb,
} from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
// @ts-expect-error -- JavaScript sin tipos
import { analizar } from '../../audio/analizar.mjs';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const auxiliar = argIndice(3, 'auxiliar', 5, { desde: 1, hasta: 10 });
const a = auxiliar - 1;
const maquina = argTexto(4, '192.168.0.78');

const HZ = 1000;
const FM = 48000;
const NIVEL_DBFS = -15;
const RAIZ = join(import.meta.dirname, '..', '..', '..');
const GRABADOR = join(RAIZ, 'tools', 'audio', 'bin', 'grabar');
const carpeta = mkdtempSync(join(tmpdir(), 'vse-recon-'));

function tono(segundos: number): string {
  const muestras = FM * segundos;
  const amplitud = Math.pow(10, NIVEL_DBFS / 20) * 32767;
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
  const ruta = join(tmpdir(), 'vse-recon-tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: { pre: number; post: number; reduccion: number; puerta: boolean; canal: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const carga = linea.slice(4);
  const bus = decodificarVuBuses(carga).auxiliares[a];
  const c = decodificarVuCanales(carga)[n];
  if (bus === undefined || c === undefined) return;
  cuadros.push({
    pre: bus.pre, post: bus.post, reduccion: bus.reduccionDb,
    puerta: bus.indicadorDePuerta, canal: c.salida,
  });
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.aux.${a}.value`, Number(exigirClave(e0, `i.${n}.aux.${a}.value`))],
  [`a.${a}.mix`, Number(exigirClave(e0, `a.${a}.mix`))],
  [`a.${a}.gate.enabled`, Number(exigirClave(e0, `a.${a}.gate.enabled`))],
  [`a.${a}.dyn.bypass`, Number(exigirClave(e0, `a.${a}.dyn.bypass`))],
];

console.log('=== RECONOCIMIENTO DEL CAMINO DEL AUXILIAR ===');
console.log(`canal ${canal} (i.${n}) -> auxiliar ${auxiliar} (a.${a}) -> entrada 2 de la interfaz`);
console.log(`hwoutaux.${a}.src = ${e0.get(`hwoutaux.${a}.src`) ?? '(ausente)'}`);
console.log('');
for (const k of [
  `i.${n}.aux.${a}.value`, `i.${n}.aux.${a}.post`, `i.${n}.aux.${a}.postproc`,
  `a.${a}.mix`, `a.${a}.mute`, `a.${a}.gate.enabled`, `a.${a}.gate.thresh`,
  `a.${a}.dyn.bypass`, `a.${a}.dyn.ratio`, `a.${a}.eq.bypass`, `a.${a}.afs.enabled`,
  `i.${n}.mix`, `hw.${n}.gain`,
]) {
  console.log(`   ${k.padEnd(24)} ${e0.get(k) ?? '(ausente)'}`);
}

let sonando: ReturnType<typeof spawn> | null = null;

await conRestauracion(
  async () => {
    sonando?.kill();
    await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true });
  },
  async () => {
    // La puerta y el compresor del auxiliar dependen del nivel: se neutralizan
    // para que lo que se vea sea el camino y no su dinamica.
    t.enviar(codificarSetd(`a.${a}.gate.enabled`, 0));
    t.enviar(codificarSetd(`a.${a}.dyn.bypass`, 1));
    t.enviar(codificarSetd(`i.${n}.aux.${a}.value`, 0.75));
    t.enviar(codificarSetd(`a.${a}.mix`, 0.7647058824));
    await new Promise((r) => setTimeout(r, 2500));

    sonando = spawn('afplay', [tono(60)]);
    await new Promise((r) => setTimeout(r, 3000));

    cuadros = [];
    const wav = join(carpeta, 'recon.wav');
    const hijo = spawn(GRABADOR, ['4', wav, 'Scarlett'], { stdio: 'ignore' });
    await new Promise<void>((r) => { hijo.on('close', () => r()); });
    const an = analizar(wav, HZ) as {
      canales: { tonoDb: number; picoDb: number; margenEnBinDb: number; recorteExacto: boolean }[];
    };
    rmSync(wav, { force: true });

    const media = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);
    console.log('');
    console.log(`=== CON EL ENVIO EN 0,75 Y EL FADER DEL AUXILIAR EN UNIDAD ===`);
    console.log(`   tramas de la consola en la ventana: ${cuadros.length}`);
    console.log(`   medidor del auxiliar: pre ${dbDeMedidor(media(cuadros.map((c) => c.pre))).toFixed(2)} dB`
      + ` | post ${dbDeMedidor(media(cuadros.map((c) => c.post))).toFixed(2)} dB`);
    console.log(`   reduccion del auxiliar: max ${Math.max(0, ...cuadros.map((c) => c.reduccion)).toFixed(2)} dB`
      + ` | puerta abierta en ${cuadros.filter((c) => c.puerta).length} de ${cuadros.length} tramas`);
    console.log(`   medidor del canal (salida): ${dbDeMedidor(media(cuadros.map((c) => c.canal))).toFixed(2)} dB`);
    console.log('');
    console.log('   LA INTERFAZ, los cuatro canales:');
    const nombres = ['1 general', '2 AUXILIAR', '3 referencia', '4 referencia'];
    an.canales.forEach((c, i) => {
      console.log(`     ${(nombres[i] ?? String(i + 1)).padEnd(14)} tono ${c.tonoDb.toFixed(2).padStart(8)} dBFS`
        + ` | pico ${c.picoDb.toFixed(2).padStart(7)} | margen en bin ${c.margenEnBinDb.toFixed(1).padStart(6)} dB`
        + (c.recorteExacto ? '   RECORTA' : ''));
    });
    console.log('');
    const aux = an.canales[1]!;
    if (aux.tonoDb < -80) {
      console.log('   EL CABLE DEL AUXILIAR NO LLEVA SEÑAL. La 102 no se puede hacer asi.');
    } else {
      console.log(`   El cable lleva señal. Ganancia de cadena hasta la interfaz: `
        + `${(aux.tonoDb - faderADb(0.7647058824) - dbDeMedidor(media(cuadros.map((c) => c.pre)))).toFixed(1)} dB`);
      console.log('   Eso es lo que la 102 necesita para elegir sus niveles sin recortar.');
    }
  },
);

await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();
console.log('');
console.log('restaurado:', PREVIO.map(([k, v]) => `${k}=${v}`).join(' '));
