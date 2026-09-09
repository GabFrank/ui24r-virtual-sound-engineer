/**
 * Que ruta trae cada canal, leido del volcado sin la aplicacion en el medio.
 *
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/sonda-gain.ts 192.168.0.78
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/sonda-gain.ts ws://localhost:8765
 */
import { Ui24rTransport, WebSocketTransport, gananciaADb, faderADb } from '@vse/mixer-adapter';
import { esSimulador } from '@vse/domain';

const destino = process.argv[2] ?? '192.168.0.78';
const t = esSimulador(destino) ? new WebSocketTransport() : new Ui24rTransport();
const crudo = new Map<string, number>();
const nombres = new Map<string, string>();
t.alRecibir((l) => {
  if (l.startsWith('SETD^')) { const [, r, v] = l.split('^'); if (r) crudo.set(r, Number(v)); }
  if (l.startsWith('SETS^')) { const [, r, v] = l.split('^'); if (r) nombres.set(r, v ?? ''); }
});
await t.conectar(destino);
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
console.log('idx | nombre        | hw.N.gain      | i.N.mix (fader) | i.N.mute');
for (let i = 0; i <= 5; i++) {
  const g = crudo.get(`hw.${i}.gain`);
  const f = crudo.get(`i.${i}.mix`);
  const m = crudo.get(`i.${i}.mute`);
  const nom = (nombres.get(`i.${i}.name`) ?? '').padEnd(13);
  const gs = g === undefined ? 'sin dato' : `${gananciaADb(g).toFixed(0)} dB (${g.toFixed(3)})`;
  const fs = f === undefined ? 'sin dato' : `${faderADb(f).toFixed(1)} dB`;
  console.log(`i.${i} | ${nom} | ${gs.padEnd(14)} | ${fs.padEnd(15)} | ${m ?? '-'}`);
}
