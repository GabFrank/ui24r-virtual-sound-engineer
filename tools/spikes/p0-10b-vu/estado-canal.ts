import { Ui24rTransport, gananciaADb, faderADb } from '@vse/mixer-adapter';
const canal = Number(process.argv[2] ?? '10');
const n = canal - 1;
const t = new Ui24rTransport();
const crudo = new Map<string, number>();
const nombres = new Map<string, string>();
t.alRecibir((l) => {
  if (l.startsWith('SETD^')) { const [, r, v] = l.split('^'); if (r) crudo.set(r, Number(v)); }
  if (l.startsWith('SETS^')) { const [, r, v] = l.split('^'); if (r) nombres.set(r, v ?? ''); }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));
await t.desconectar();
const g = crudo.get(`hw.${n}.gain`);
const ph = crudo.get(`hw.${n}.phantom`);
const f = crudo.get(`i.${n}.mix`);
const mu = crudo.get(`i.${n}.mute`);
console.log(`canal ${canal}  (rutas i.${n} / hw.${n})`);
console.log(`  nombre    : ${nombres.get(`i.${n}.name`) || '(sin nombre)'}`);
console.log(`  FANTASMA  : ${ph === undefined ? 'sin dato' : (ph > 0.5 ? '*** ENCENDIDA ***' : 'apagada')}`);
console.log(`  ganancia  : ${g === undefined ? 'sin dato' : gananciaADb(g).toFixed(0) + ' dB'}`);
console.log(`  fader     : ${f === undefined ? 'sin dato' : faderADb(f).toFixed(1) + ' dB'}`);
console.log(`  silencio  : ${mu === undefined ? 'sin dato' : (mu > 0.5 ? 'SI' : 'no')}`);
