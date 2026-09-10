/**
 * Ruido rosa por el monitor, y el microfono mirando toda la cadena.
 *
 * **Dos cosas de una.** La primera es cerrar la pregunta de los graves con una
 * fuente de banda ancha: un tono contesta «llega o no llega» en una frecuencia;
 * el ruido rosa contesta la **forma entera** de la respuesta de un tirón, y
 * ademas no es tonal, asi que el supresor no tiene un pico que notchear.
 *
 * La segunda es que **esto es exactamente la materia prima de una calibracion**.
 * Lo que sale de aca es la respuesta de la cadena completa --Scarlett, canal,
 * general, Rockit, sala, B2, previo-- y esa curva es la que habria que guardar
 * para corregir un microfono que no es plano. NO ES la respuesta del microfono
 * solo, y conviene no confundirlas: sin una referencia plana en algun punto, lo
 * que se mide es el conjunto.
 *
 * **El ruido rosa se genera aca.** Voss-McCartney, que suma varias fuentes
 * blancas actualizadas a ritmos distintos: da una densidad que cae 3 dB por
 * octava, que es lo que «rosa» significa. Se comprueba midiendo, no se supone.
 *
 * Con el supresor APAGADO y devuelto al terminar. El canal del microfono queda
 * EN SILENCIO: hay un condensador enfrentado al monitor y ese silencio es lo
 * unico que impide el lazo.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar, frecuenciaDeBanda,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const CANAL_TONO = 10, CANAL_MIC = 9;
const FM = 48000, SEG = 30, DB = -14;

/**
 * Ruido rosa por Voss-McCartney.
 *
 * Se suman `OCTAVAS` fuentes blancas: la primera cambia en cada muestra, la
 * segunda cada dos, la tercera cada cuatro. Cada una aporta su energia en una
 * octava distinta y el resultado cae 3 dB por octava sin filtrar nada.
 */
function ruidoRosa(): string {
  const OCTAVAS = 16;
  const n = FM * SEG;
  const fuentes = new Array(OCTAVAS).fill(0).map(() => Math.random() * 2 - 1);
  let suma = fuentes.reduce((a, b) => a + b, 0);
  const muestras = new Float32Array(n);
  let pico = 0;
  for (let i = 0; i < n; i++) {
    // Se renueva la fuente k, donde k es la cantidad de ceros al final de i.
    let k = 0;
    let x = i;
    while (k < OCTAVAS - 1 && (x & 1) === 0) { x >>= 1; k++; }
    suma -= fuentes[k]!;
    fuentes[k] = Math.random() * 2 - 1;
    suma += fuentes[k]!;
    muestras[i] = suma / OCTAVAS;
    pico = Math.max(pico, Math.abs(muestras[i]!));
  }
  const escala = (Math.pow(10, DB / 20) / pico) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(muestras[i]! * escala)));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  const ruta = join(tmpdir(), 'vse-rosa.wav');
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

if ((crudo.get(`i.${CANAL_MIC - 1}.mute`) ?? 0) !== 1) {
  console.log(`el canal ${CANAL_MIC} NO esta en silencio: se aborta antes de sonar nada.`);
  await app.desconectar(); process.exit(1);
}
console.log(`canal ${CANAL_MIC} en silencio: no hay lazo posible`);

const afsAntes = crudo.get('m.afs.enabled') ?? 1;
const gananciaAntes = crudo.get(`hw.${CANAL_TONO - 1}.gain`) ?? 0;
t.enviar(codificarSetd('m.afs.enabled', 0));
t.enviar(codificarSetd(`hw.${CANAL_TONO - 1}.gain`, 0.70));
await new Promise((r) => setTimeout(r, 1500));
console.log(`supresor ${afsAntes} -> 0 · ganancia del canal ${CANAL_TONO} a 0,70`);

const ruta = ruidoRosa();
console.log(`ruido rosa de ${SEG} s a ${DB} dBFS de pico, generado por Voss-McCartney`);

let bandas: number[] = [];
const quitar = app.alEspectro((b) => { bandas = [...b]; });

/** Promedia el espectro que ve una fuente durante unos segundos. */
async function medir(fuente: string, seg: number): Promise<number[]> {
  if (!app.tomarAnalizador(fuente)) return [];
  bandas = [];
  await new Promise((r) => setTimeout(r, 3000));   // el analizador tarda en cambiar
  const muestras: number[][] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seg * 1000) {
    if (bandas.length > 0) muestras.push([...bandas]);
    await new Promise((r) => setTimeout(r, 40));
  }
  if (muestras.length === 0) return [];
  const n = muestras[0]!.length;
  const media = new Array(n).fill(0);
  for (const m of muestras) for (let i = 0; i < n; i++) media[i] += m[i]! / muestras.length;
  return media;
}

const sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2000));

console.log('');
console.log('1. el ruido rosa tal como ENTRA, mirando el canal del tono (sin acustica)');
const entrada = await medir(`i.${CANAL_TONO - 1}`, 6);
console.log('2. el mismo ruido DESPUES del aire, mirando el microfono');
const salida = await medir(`i.${CANAL_MIC - 1}`, 6);
sonando.kill();

quitar();
app.devolverAnalizador();
t.enviar(codificarSetd(`hw.${CANAL_TONO - 1}.gain`, gananciaAntes));
t.enviar(codificarSetd('m.afs.clearlive', 1));
await new Promise((r) => setTimeout(r, 1000));
t.enviar(codificarSetd('m.afs.clearlive', 0));
t.enviar(codificarSetd('m.afs.enabled', afsAntes));
await new Promise((r) => setTimeout(r, 1200));

if (entrada.length === 0 || salida.length === 0) {
  console.log('no se pudo medir alguna de las dos puntas');
} else {
  console.log('');
  console.log('    Hz | entra | sale | diferencia (la cadena: parlante + sala + microfono)');
  console.log('-------+-------+------+----------------------------------------------------');
  for (let banda = 7; banda < entrada.length; banda += 6) {
    const hz = frecuenciaDeBanda(banda);
    const e = entrada[banda]!, s = salida[banda]!;
    const d = s - e;
    const barra = d >= 0 ? '+'.repeat(Math.min(20, Math.round(d / 2))) : '-'.repeat(Math.min(20, Math.round(-d / 2)));
    console.log(
      `${(hz < 1000 ? `${hz.toFixed(0)}` : `${(hz / 1000).toFixed(1)}k`).padStart(6)} | `
      + `${e.toFixed(1).padStart(5)} | ${s.toFixed(1).padStart(4)} | ${d >= 0 ? '+' : ''}${d.toFixed(1).padStart(5)} ${barra}`,
    );
  }
}
console.log('');
console.log(`supresor devuelto a ${afsAntes}, ganancia a ${gananciaAntes.toFixed(4)}`);
await app.desconectar();
