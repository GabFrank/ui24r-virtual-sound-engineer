/**
 * De donde salen los 22,67 dB entre el auxiliar 3 y el 5 con el mismo envio.
 *
 * **Por que existe.** La medicion 102 comparo el byte `pre` de los dos buses con
 * el MISMO crudo de envio y encontro que siguen la misma pendiente --el rango de
 * la diferencia es 0,36 dB-- pero con un desplazamiento constante de **22,67 dB**.
 * La conclusion de la 102 --que la escala del auxiliar 5 vale para el 3 por
 * transitividad, y con eso las cifras de la 94 quedan en pie-- se apoya en la
 * pendiente, no en el nivel, asi que sigue valiendo. Pero publicarla con un
 * desplazamiento de veintidos decibeles sin explicar seria dejar un numero suelto
 * en la evidencia.
 *
 * **La hipotesis a descartar:** el auxiliar 3 tiene TRES canales mas con el envio
 * abierto --`i.1` en 0,355, `i.15` en 0,297 y `i.18` en 0,756-- que la medicion 94
 * ya habia encontrado. Pero una contribucion ajena aditiva daria una diferencia
 * VARIABLE, no constante: al bajar el tono, lo ajeno pesaria cada vez mas. Que sea
 * constante apunta a una diferencia de GANANCIA, no de suma.
 *
 * Se mide en vez de razonarlo.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/diferencia-entre-buses.ts 10 192.168.0.78
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ui24rTransport, codificarSetd, decodificarVuBuses, dbDeMedidor } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const maquina = argTexto(3, '192.168.0.78');
const HZ = 1000; const FM = 48000; const NIVEL_DBFS = -15;
const carpeta = mkdtempSync(join(tmpdir(), 'vse-dif-'));

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
  const ruta = join(carpeta, 'tono.wav');
  writeFileSync(ruta, Buffer.concat([c, datos]));
  return ruta;
}

const t = new Ui24rTransport();
let cuadros: { a2: number; a4: number }[] = [];
t.alRecibir((linea) => {
  if (!linea.startsWith('VU2^')) return;
  const b = decodificarVuBuses(linea.slice(4)).auxiliares;
  if (b[2] === undefined || b[4] === undefined) return;
  cuadros.push({ a2: b[2].pre, a4: b[4].pre });
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const PREVIO: readonly (readonly [string, number])[] = [
  [`i.${n}.aux.2.value`, Number(exigirClave(e0, `i.${n}.aux.2.value`))],
  [`i.${n}.aux.4.value`, Number(exigirClave(e0, `i.${n}.aux.4.value`))],
];

const media = (xs: number[]) => (xs.length === 0 ? NaN : xs.reduce((s, v) => s + v, 0) / xs.length);
const leer = async (etiqueta: string, segundos = 3) => {
  cuadros = [];
  await new Promise((r) => setTimeout(r, segundos * 1000));
  const xs = cuadros;
  const a2 = dbDeMedidor(media(xs.map((c) => c.a2)));
  const a4 = dbDeMedidor(media(xs.map((c) => c.a4)));
  console.log(`   ${etiqueta.padEnd(38)} a.2 pre ${a2.toFixed(2).padStart(8)} | `
    + `a.4 pre ${a4.toFixed(2).padStart(8)} | diferencia ${(a2 - a4).toFixed(2).padStart(7)} dB `
    + `| ${xs.length} tramas`);
  return { a2, a4 };
};

console.log('=== DE DONDE SALEN LOS 22,67 dB ENTRE EL AUXILIAR 3 Y EL 5 ===');
console.log('');
console.log('Quien alimenta cada bus, leido del aparato:');
for (const bus of [2, 4]) {
  const otros = [...e0.keys()]
    .filter((k) => new RegExp(`^(i|f|l|p)\\.\\d+\\.aux\\.${bus}\\.value$`).test(k))
    .map((k) => [k, Number(e0.get(k))] as const)
    .filter(([, v]) => v > 0);
  console.log(`   a.${bus}: ${otros.length} tiras abiertas -> `
    + `${otros.map(([k, v]) => `${k.split('.').slice(0, 2).join('.')}=${v.toFixed(3)}`).join(' ') || '(ninguna)'}`);
}

let sonando: ReturnType<typeof spawn> | null = null;
await conRestauracion(
  async () => { sonando?.kill(); await restaurarClaves(t, maquina, PREVIO);
    rmSync(carpeta, { recursive: true, force: true }); },
  async () => {
    console.log('');
    console.log('Con el TONO APAGADO (lo que aportan los canales ajenos, solo su ruido):');
    t.enviar(codificarSetd(`i.${n}.aux.2.value`, 0));
    t.enviar(codificarSetd(`i.${n}.aux.4.value`, 0));
    await new Promise((r) => setTimeout(r, 2000));
    await leer('los dos envios cerrados, sin tono');

    sonando = spawn('afplay', [tono(180)]);
    await new Promise((r) => setTimeout(r, 3000));
    console.log('');
    console.log('Con el TONO SONANDO:');
    await leer('los dos envios cerrados');

    for (const crudo of [1.0, 0.8, 0.6, 0.4]) {
      t.enviar(codificarSetd(`i.${n}.aux.2.value`, crudo));
      t.enviar(codificarSetd(`i.${n}.aux.4.value`, crudo));
      await new Promise((r) => setTimeout(r, 2000));
      await leer(`los dos envios en ${crudo}`);
    }

    console.log('');
    console.log('Y ahora SOLO al auxiliar 3, para aislar lo ajeno:');
    t.enviar(codificarSetd(`i.${n}.aux.4.value`, 0));
    t.enviar(codificarSetd(`i.${n}.aux.2.value`, 1.0));
    await new Promise((r) => setTimeout(r, 2000));
    await leer('envio al 3 en 1,0, al 5 cerrado');
    console.log('');
    console.log('Si la diferencia es CONSTANTE con el crudo, es una ganancia distinta.');
    console.log('Si CRECE al bajar el crudo, es una contribucion ajena que se suma.');
  },
);
await new Promise((r) => setTimeout(r, 1500));
await t.desconectar();
