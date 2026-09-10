/**
 * A que se puede apuntar el analizador, ademas de un canal y del general?
 *
 * **Por que importa, y no es curiosidad.** El analizador se sabe apuntar a un
 * canal --`i.N`-- y al general --`m`--, y nada mas se probo. Pero la consola
 * tiene 10 auxiliares, 6 subgrupos y 4 efectos, y **un auxiliar es un envio de
 * monitor**: es donde mas acopla en vivo, porque el parlante apunta al cantante
 * y el microfono del cantante apunta al parlante. Un detector de realimentacion
 * que solo puede mirar el general esta mirando el sitio donde el acople se
 * escucha, no donde nace.
 *
 * **Como se contesta sin ambiguedad.** Se manda un tono por el canal 10, se lo
 * rutea al bus que toque, se apunta `var.rta` ahi y se mira si aparece en su
 * banda. Si aparece, el bus sirve de fuente; si el analizador queda en cero con
 * el tono sonando, no. No hay acustica en el medio: todo es electrico.
 *
 * Con el supresor APAGADO --un tono sostenido es, para el, una realimentacion--
 * y el general en cero para no sacar nada por el monitor. Todo se restaura.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar, bandaDeFrecuencia,
  decodificarVuBuses, dbDeMedidor,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const CANAL = 10, HZ = 1000, FM = 48000, DB = -12, SEG = 8;
const BANDA = Math.round(bandaDeFrecuencia(HZ));

/** Las fuentes a probar, con lo que hay que hacer para que les llegue el tono. */
const FUENTES: { nombre: string; rta: string; ruteo: [string, number][] }[] = [
  { nombre: 'canal 10 (conocido)', rta: `i.${CANAL - 1}`, ruteo: [] },
  { nombre: 'general (conocido)', rta: 'm', ruteo: [] },
  { nombre: 'auxiliar 1', rta: 'a.0', ruteo: [[`i.${CANAL - 1}.aux.0.value`, 0.8], [`i.${CANAL - 1}.aux.0.mute`, 0], ['a.0.mix', 0.7647]] },
  { nombre: 'subgrupo 1', rta: 's.0', ruteo: [['s.0.mix', 0.7647]] },
  { nombre: 'efecto 1', rta: 'f.0', ruteo: [['f.0.mix', 0.7647]] },
];

function tono(): string {
  const n = FM * SEG, amp = Math.pow(10, DB / 20) * 32767;
  const d = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = Math.round(amp * Math.sin((2 * Math.PI * HZ * i) / FM));
    d.writeInt16LE(v, i * 4); d.writeInt16LE(v, i * 4 + 2);
  }
  const c = Buffer.alloc(44);
  c.write('RIFF', 0); c.writeUInt32LE(36 + d.length, 4); c.write('WAVEfmt ', 8);
  c.writeUInt32LE(16, 16); c.writeUInt16LE(1, 20); c.writeUInt16LE(2, 22);
  c.writeUInt32LE(FM, 24); c.writeUInt32LE(FM * 4, 28); c.writeUInt16LE(4, 32);
  c.writeUInt16LE(16, 34); c.write('data', 36); c.writeUInt32LE(d.length, 40);
  const ruta = join(tmpdir(), 'vse-buses.wav');
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

// Se guarda TODO lo que se vaya a tocar, antes de tocarlo.
const original = new Map<string, number>();
const recordar = (ruta: string) => { if (!original.has(ruta)) original.set(ruta, crudo.get(ruta) ?? 0); };
for (const f of FUENTES) for (const [ruta] of f.ruteo) recordar(ruta);
recordar('m.afs.enabled'); recordar('m.mix'); recordar(`hw.${CANAL - 1}.gain`);

t.enviar(codificarSetd('m.afs.enabled', 0));
// **El general NO se baja, y la primera version lo bajaba.** Con el general en
// cero el control conocido --«el analizador sobre `m` ve el tono»-- tambien daba
// cero, asi que no se podia distinguir «este bus no sirve de fuente» de «a este
// bus no le llego senal». UN EXPERIMENTO CUYO CONTROL FALLA NO CONCLUYE NADA.
// El monitor va a sonar; no hay nadie en la sala.
t.enviar(codificarSetd(`hw.${CANAL - 1}.gain`, 0.70));
await new Promise((r) => setTimeout(r, 1500));
console.log(`supresor apagado, general en cero, ganancia del canal ${CANAL} a 0,70`);
console.log(`tono de ${HZ} Hz, que cae en la banda ${BANDA}`);

/**
 * El nivel de cada bus, leido de la cola de `VU2`.
 *
 * Es el control que faltaba: **antes de preguntarle al analizador si ve el tono
 * en un bus, hay que saber si a ese bus le llego el tono**. El medidor del bus
 * lo dice y es independiente del analizador.
 */
const nivelBus = new Map<string, number>();
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const b = decodificarVuBuses(l.slice(4));
  const anotar = (clave: string, valor: number | undefined) => {
    if (valor === undefined) return;
    const db = dbDeMedidor(valor);
    if (Number.isFinite(db)) nivelBus.set(clave, Math.max(nivelBus.get(clave) ?? -Infinity, db));
  };
  // Cada familia tiene su formato: los auxiliares son mono --`post`-- y los
  // subgrupos y efectos son estereo, con izquierda y derecha por separado.
  b.auxiliares.forEach((m, i) => anotar(`a.${i}`, m.post));
  b.subgrupos.forEach((m, i) => anotar(`s.${i}`, Math.max(m.postIzq, m.postDer)));
  b.efectos.forEach((m, i) => anotar(`f.${i}`, Math.max(m.postIzq, m.postDer)));
  if (b.general !== null) anotar('m', Math.max(b.general.izquierdo.post, b.general.derecho.post));
});

let bandas: number[] = [];
const quitar = app.alEspectro((b) => { bandas = [...b]; });
const ruta = tono();
const sonando = spawn('afplay', [ruta]);
await new Promise((r) => setTimeout(r, 2000));

console.log('');
console.log('fuente               | var.rta | llega al bus | el analizador ve | veredicto');
console.log('---------------------+---------+--------------+------------------+----------');

for (const f of FUENTES) {
  for (const [rutaP, valor] of f.ruteo) t.enviar(codificarSetd(rutaP, valor));
  await new Promise((r) => setTimeout(r, 800));
  if (!app.tomarAnalizador(f.rta)) { console.log(`${f.nombre.padEnd(20)} | rechazado por el adaptador`); continue; }
  bandas = [];
  nivelBus.delete(f.rta);
  await new Promise((r) => setTimeout(r, 2500));

  const muestras: number[][] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    if (bandas.length > 0) muestras.push([...bandas]);
    await new Promise((r) => setTimeout(r, 40));
  }
  const n = muestras[0]?.length ?? 0;
  const media = new Array(n).fill(0);
  for (const m of muestras) for (let i = 0; i < n; i++) media[i] += m[i]! / muestras.length;
  const enBanda = n > BANDA ? media[BANDA]! : 0;
  const hayAlgo = media.some((db) => db > 1);
  const enElBus = nivelBus.get(f.rta);
  const llego = enElBus !== undefined && enElBus > -50;
  const veredicto = !llego
    ? 'NO CONCLUYE: al bus no le llego senal'
    : enBanda > 5 ? 'SIRVE de fuente'
    : hayAlgo ? 'el bus suena y el analizador NO lo ve'
    : 'el bus suena y el analizador da cero';
  console.log(
    `${f.nombre.padEnd(20)} | ${f.rta.padEnd(7)} | ${(enElBus === undefined ? 'sin medidor' : `${enElBus.toFixed(1)} dB`).padStart(12)} | `
    + `${enBanda.toFixed(1).padStart(6)} dB ${'#'.repeat(Math.max(0, Math.round(enBanda / 8)))}`.padEnd(17)
    + `| ${veredicto}`,
  );
}

sonando.kill();
quitar();
app.devolverAnalizador();
for (const [rutaP, valor] of original) t.enviar(codificarSetd(rutaP, valor));
await new Promise((r) => setTimeout(r, 1500));
console.log('');
console.log('restaurado:');
for (const [rutaP, valor] of original) console.log(`  ${rutaP} = ${valor}`);
await app.desconectar();
