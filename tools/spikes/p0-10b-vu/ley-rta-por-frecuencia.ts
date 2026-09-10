/**
 * La ley del analizador, ¿es la misma en las 122 bandas?
 *
 * **El agujero.** `RTA_DB_POR_BYTE = 0.375` se establecio con tonos a 1 kHz y
 * nunca se comprobo en otra frecuencia. Todo el detector de realimentacion
 * supone que un byte vale lo mismo abajo que arriba: compara una banda contra
 * sus vecinas y contra su propio pasado, y si el analizador pesara distinto las
 * bandas graves, el umbral de 9 dB sobre la vecindad significaria una cosa a
 * 200 Hz y otra a 5 kHz.
 *
 * **Por que esto se puede contestar y la medicion acustica no.** Un tono por el
 * aire pasa por el parlante, la sala y el microfono, y ninguno de los tres es
 * plano: la caida medida no se puede repartir. Pero el analizador se puede
 * apuntar a un CANAL, y entonces no hay acustica en el medio. El tono entra por
 * la Scarlett SIEMPRE AL MISMO NIVEL ELECTRICO --medido: -21,7 dB en seis
 * frecuencias-- asi que cualquier diferencia entre bandas es del analizador.
 *
 * Se corre con el supresor APAGADO: un tono sostenido es, para el, una
 * realimentacion, y notchearlo arruinaria la medicion. Se devuelve al terminar.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar,
  bandaDeFrecuencia, frecuenciaDeBanda, decodificarVuCanales, dbDeMedidor,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const CANAL = 10;
const HZ = (process.argv[3] ?? '63,125,250,500,1000,2000,4000,8000').split(',').map(Number);
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
  const ruta = join(tmpdir(), `vse-rta-${hz}.wav`);
  writeFileSync(ruta, Buffer.concat([c, d]));
  return ruta;
}

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
const crudo = new Map<string, number>();
let nivelCanal = -Infinity;
t.alRecibir((l) => {
  const m = decodificar(l);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
  if (l.startsWith('VU2^')) {
    const c = decodificarVuCanales(l.slice(4))[CANAL - 1];
    if (c) { const db = dbDeMedidor(c.entrada); if (Number.isFinite(db)) nivelCanal = Math.max(nivelCanal, db); }
  }
});

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
if (punto === null) { console.log('sin punto de retorno; se aborta'); await app.desconectar(); process.exit(1); }
console.log(`punto de retorno: ${punto}`);

const afsAntes = crudo.get('m.afs.enabled') ?? 1;
t.enviar(codificarSetd('m.afs.enabled', 0));
const generalAntes = crudo.get('m.mix') ?? 0;
t.enviar(codificarSetd('m.mix', 0));           // que no salga nada por el monitor
const gananciaAntes = crudo.get(`hw.${CANAL - 1}.gain`) ?? 0;
t.enviar(codificarSetd(`hw.${CANAL - 1}.gain`, 0.70));
await new Promise((r) => setTimeout(r, 1500));
console.log(`supresor ${afsAntes} -> 0 · general a 0 · ganancia del canal ${CANAL} a 0,70`);
console.log('el analizador mira el CANAL, no el general: no hay acustica en el medio');

let bandas: number[] = [];
const quitar = app.alEspectro((b) => { bandas = [...b]; });
if (!app.tomarAnalizador(`i.${CANAL - 1}`)) { console.log('no se pudo tomar el analizador'); await app.desconectar(); process.exit(1); }

console.log('');
console.log('   Hz | banda | nivel electrico | el analizador lee | pico');
console.log('------+-------+-----------------+-------------------+------');

const filas: { hz: number; electrico: number; lectura: number }[] = [];
for (const hz of HZ) {
  const ruta = tono(hz);
  const sonando = spawn('afplay', [ruta]);
  await new Promise((r) => setTimeout(r, 2500));
  nivelCanal = -Infinity;
  const muestras: number[][] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    if (bandas.length > 0) muestras.push([...bandas]);
    await new Promise((r) => setTimeout(r, 40));
  }
  sonando.kill();
  await new Promise((r) => setTimeout(r, 700));
  if (muestras.length === 0) { console.log(`${String(hz).padStart(6)} | sin tramas`); continue; }

  const n = muestras[0]!.length;
  const media = new Array(n).fill(0);
  for (const m of muestras) for (let i = 0; i < n; i++) media[i] += m[i]! / muestras.length;
  const banda = Math.round(bandaDeFrecuencia(hz));
  const lectura = banda >= 0 && banda < n ? media[banda]! : 0;
  const pico = media.indexOf(Math.max(...media));
  filas.push({ hz, electrico: nivelCanal, lectura });
  console.log(
    `${String(hz).padStart(6)} | ${String(banda).padStart(5)} | ${`${nivelCanal.toFixed(1)} dB`.padStart(15)} | `
    + `${lectura.toFixed(1).padStart(6)} dB ${'#'.repeat(Math.max(0, Math.round(lectura / 4)))}`.padEnd(19)
    + `| banda ${pico} (${frecuenciaDeBanda(pico).toFixed(0)} Hz)`,
  );
}

quitar();
app.devolverAnalizador();
t.enviar(codificarSetd(`hw.${CANAL - 1}.gain`, gananciaAntes));
t.enviar(codificarSetd('m.mix', generalAntes));
t.enviar(codificarSetd('m.afs.clearlive', 1));
await new Promise((r) => setTimeout(r, 1000));
t.enviar(codificarSetd('m.afs.clearlive', 0));
t.enviar(codificarSetd('m.afs.enabled', afsAntes));
await new Promise((r) => setTimeout(r, 1200));

console.log('');
if (filas.length > 1) {
  const ref = filas.find((f) => f.hz === 1000) ?? filas[0]!;
  console.log('diferencia contra 1 kHz, con el nivel electrico igual en todas:');
  for (const f of filas) {
    const dElec = f.electrico - ref.electrico;
    const dLect = f.lectura - ref.lectura;
    console.log(`  ${String(f.hz).padStart(5)} Hz: electrico ${dElec >= 0 ? '+' : ''}${dElec.toFixed(1)} dB · analizador ${dLect >= 0 ? '+' : ''}${dLect.toFixed(1)} dB`);
  }
  const desvios = filas.map((f) => (f.lectura - ref.lectura) - (f.electrico - ref.electrico));
  const peor = desvios.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  console.log('');
  console.log(Math.abs(peor) <= 3
    ? `El analizador pesa PAREJO: el desvio mayor contra 1 kHz es ${peor.toFixed(1)} dB.`
    : `El analizador NO pesa parejo: hasta ${peor.toFixed(1)} dB de desvio contra 1 kHz.`);
}
console.log(`supresor devuelto a ${afsAntes}, general a ${generalAntes}, ganancia a ${gananciaAntes}`);
await app.desconectar();
