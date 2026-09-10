import { Ui24rTransport, decodificarVuCanales, dbDeMedidor } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
let ult: ReturnType<typeof decodificarVuCanales> = [];
t.alRecibir((l) => { if (l.startsWith('VU2^')) ult = decodificarVuCanales(l.slice(4)); });
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
const vivos = ult.map((m, i) => ({ canal: i + 1, db: dbDeMedidor(m.entrada) }))
  .filter((c) => Number.isFinite(c.db) && c.db > -70);
console.log(vivos.length === 0 ? 'ningun canal con senal' : 'canales con senal:');
for (const c of vivos) console.log(`  canal ${String(c.canal).padStart(2)}: ${c.db.toFixed(1)} dB`);
await t.desconectar();
