/**
 * Qué hay en el general ahora mismo, banda por banda.
 *
 * Existe por una lección cara: el 2026-09-10 y el 2026-09-11 se midió el
 * espectro del general dando por sentado que la sala estaba en silencio, y
 * **había un Bluetooth conectado a las entradas de línea `l.0`/`l.1`, abiertas a
 * 0 dB**, metiendo un chillido en el general todo el tiempo. Lo detectó el
 * usuario con el oído, no ninguna de las mediciones.
 *
 * Antes de medir el general hay que saber qué está entrando en él.
 */
import { Ui24rTransport, codificarSets, decodificarEspectro, frecuenciaDeBanda } from '@vse/mixer-adapter';
const maquina = process.argv[2] ?? '192.168.0.78';
const t = new Ui24rTransport();
let b: number[] = [];
t.alRecibir((l) => { if (l.startsWith('RTA^')) { const d = decodificarEspectro(l.slice(4)); if (d.length >= 122) b = d; } });
await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 2500));
t.enviar(codificarSets('var.rta', 'm'));
await new Promise((r) => setTimeout(r, 4000));
const snap = b.slice();
t.enviar(codificarSets('var.rta', ''));
await new Promise((r) => setTimeout(r, 1200));
await t.desconectar();
const orden = snap.map((v, i) => ({ i, v })).sort((a, z) => z.v - a.v).slice(0, 8);
console.log('las 8 bandas mas altas del general:');
for (const { i, v } of orden) console.log(`  banda ${String(i).padStart(3)} (~${frecuenciaDeBanda(i).toFixed(0).padStart(5)} Hz)  ${v.toFixed(1)} dB`);
const media = snap.reduce((s, v) => s + v, 0) / snap.length;
console.log('');
console.log(`media de las 122 bandas: ${media.toFixed(2)} dB`);
console.log(`banda 28 (~105 Hz): ${(snap[28] ?? 0).toFixed(1)} dB`);
console.log(`bandas 104 y 105 (~8,5 y 9 kHz): ${(snap[104] ?? 0).toFixed(1)} / ${(snap[105] ?? 0).toFixed(1)} dB`);
