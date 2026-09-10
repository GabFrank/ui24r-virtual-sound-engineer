/**
 * ¿Se puede ver el compresor trabajando, en vivo, desde el protocolo?
 *
 * El sexto byte de cada canal en la trama `VU2` lleva la reducción de ganancia:
 * `parseVUdata` la saca con `deconvertVU_comp((byte & 127) << 1)` y la manda al
 * medidor de reducción de la tira. Si eso es cierto, la aplicación no sólo
 * puede saber que un canal tiene compresor activo —eso ya está en el volcado—
 * sino **cuántos decibeles le está sacando ahora mismo**, que es la diferencia
 * entre avisar «ojo, hay un compresor» y decir «este nivel ya viene 6 dB
 * comprimido».
 *
 * La prueba: tono fijo, y bajar el umbral del compresor hasta que actúe.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Ui24rTransport, codificarSetd, decodificarVuCanales, dbDeMedidor, VU_ESCALA } from '@vse/mixer-adapter';

const COMP_ZOOM = 2;
/** La misma cuenta que hace `mixer.html`. Devuelve 0 a 1 de reduccion. */
function reduccionDelByte(byte: number): number {
  const a = (byte & 127) << 1;
  const v = (1 - VU_ESCALA * (a | ((a >> 7) & 1))) * COMP_ZOOM;
  return v < 0.008 ? 0 : Math.min(1, v);
}

const canal = 10;
const n = canal - 1;
const FM = 48000; const HZ = 1000; const SEG = 40; const DB = -12;
const muestras = FM * SEG;
const amp = Math.pow(10, DB / 20) * 32767;
const datos = Buffer.alloc(muestras * 4);
for (let i = 0; i < muestras; i++) {
  const v = Math.round(amp * Math.sin((2 * Math.PI * HZ * i) / FM));
  datos.writeInt16LE(v, i * 4); datos.writeInt16LE(v, i * 4 + 2);
}
const c = Buffer.alloc(44);
c.write('RIFF', 0); c.writeUInt32LE(36 + datos.length, 4); c.write('WAVEfmt ', 8);
c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(datos.length, 40);
writeFileSync('/tmp/vse-comp.wav', Buffer.concat([c, datos]));

const t = new Ui24rTransport();
let bytes: number[] = [];
let niveles: number[] = [];
let pres: number[] = [];
let sals: number[] = [];
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const m = decodificarVuCanales(l.slice(4))[canal - 1];
  if (m) {
    bytes.push(m.byteReduccion);
    niveles.push(dbDeMedidor(m.entrada));
    pres.push(dbDeMedidor(m.pre));
    sals.push(dbDeMedidor(m.salida));
  }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 3000));

const p = spawn('afplay', ['/tmp/vse-comp.wav']);
// VtoTHRESH(a) = -90 + 96a  y  VtoRATIO(a) = 1/a, leidos del mixer.html.
// El crudo 1 de razon es 1:1, o sea SIN compresion: fue mi primer error.
const umbralDb = (crudo: number): number => -90 + 96 * crudo;
const razon = (crudo: number): number => 1 / crudo;
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, 0.25));
await new Promise((r) => setTimeout(r, 800));
console.log(`razon fijada en ${razon(0.25).toFixed(1)}:1`);
console.log('umbral dB | reduccion | pre    | entrada | salida | entrada+reduccion');
for (const umbral of [0.875, 0.75, 0.65, 0.55, 0.45, 0.35]) {
  t.enviar(codificarSetd(`i.${n}.dyn.threshold`, umbral));
  await new Promise((r) => setTimeout(r, 1500));
  bytes = []; niveles = []; pres = []; sals = [];
  await new Promise((r) => setTimeout(r, 2500));
  const media = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
  const b = media(bytes);
  const redDb = reduccionDelByte(Math.round(b)) * 40;
  const ent = media(niveles);
  console.log(
    `${umbralDb(umbral).toFixed(1).padStart(9)} | ${redDb.toFixed(2).padStart(9)} | `
    + `${media(pres).toFixed(2).padStart(6)} | ${ent.toFixed(2).padStart(7)} | `
    + `${media(sals).toFixed(2).padStart(6)} | ${(ent + redDb).toFixed(2).padStart(17)}`,
  );
}
p.kill();
t.enviar(codificarSetd(`i.${n}.dyn.threshold`, 0.875));
await new Promise((r) => setTimeout(r, 400));
t.enviar(codificarSetd(`i.${n}.dyn.ratio`, 1));
await new Promise((r) => setTimeout(r, 1000));
await t.desconectar();
console.log('umbral y razon restaurados');
