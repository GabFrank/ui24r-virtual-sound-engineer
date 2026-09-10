/**
 * Entrada contra salida en un canal, y el fader que las separa.
 *
 * La consola dibuja la barra de la tira con la SALIDA y deja la ENTRADA como
 * marca fantasma. Si el modelo es correcto, la diferencia entre las dos tiene
 * que ser el fader del canal.
 */
import { Ui24rTransport, decodificarVuCanales, dbDeMedidor, faderADb } from '@vse/mixer-adapter';

const canal = Number(process.argv[2] ?? '21');
const t = new Ui24rTransport();
const ent: number[] = [];
const sal: number[] = [];
let fader: number | null = null;
t.alRecibir((l) => {
  if (l.startsWith('SETD^')) {
    const [, r, v] = l.split('^');
    if (r === `i.${canal - 1}.mix`) fader = faderADb(Number(v));
    return;
  }
  if (!l.startsWith('VU2^')) return;
  const c = decodificarVuCanales(l.slice(4))[canal - 1];
  if (c) { ent.push(dbDeMedidor(c.entrada)); sal.push(dbDeMedidor(c.salida)); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 7000));
await t.desconectar();
const max = (a: number[]) => a.reduce((m, v) => Math.max(m, v), -Infinity);
console.log(`canal ${canal}: pico entrada ${max(ent).toFixed(1)} dB, pico salida ${max(sal).toFixed(1)} dB`);
console.log(`diferencia ${(max(ent) - max(sal)).toFixed(1)} dB · fader del canal ${fader === null ? 'sin dato' : fader.toFixed(1) + ' dB'}`);
