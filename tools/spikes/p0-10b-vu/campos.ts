import { Ui24rTransport, decodificarVuCanales } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const acum = new Map<number, { pre: number[]; ent: number[]; sal: number[]; dinE: number[]; dinS: number[]; red: number[] }>();
for (const c of [1, 21, 22]) acum.set(c, { pre: [], ent: [], sal: [], dinE: [], dinS: [], red: [] });
t.alRecibir((l) => {
  if (!l.startsWith('VU2^')) return;
  const canales = decodificarVuCanales(l.slice(4));
  for (const [canal, a] of acum) {
    const c = canales[canal - 1];
    if (!c) continue;
    a.pre.push(c.pre); a.ent.push(c.entrada); a.sal.push(c.salida);
    a.dinE.push(c.dinamicoEntrada); a.dinS.push(c.dinamicoSalida); a.red.push(c.byteReduccion);
  }
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 7000));
await t.desconectar();
const B = (v: number[]) => v.length === 0 ? '-' : String(Math.round(v.reduce((s, x) => s + x, 0) / v.length / 0.004167508166392142));
const dB = (v: number[]) => v.length === 0 ? '-' : ((Math.round(v.reduce((s, x) => s + x, 0) / v.length / 0.004167508166392142) - 255) * 0.4).toFixed(1);
console.log('canal | pre  ent  sal  dinE dinS red  | (ent-255)*0.4');
for (const [canal, a] of acum) {
  console.log(`  ${String(canal).padStart(2)}  | ${B(a.pre).padStart(4)} ${B(a.ent).padStart(4)} ${B(a.sal).padStart(4)} ${B(a.dinE).padStart(4)} ${B(a.dinS).padStart(4)} ${String(Math.round(a.red.reduce((s,x)=>s+x,0)/(a.red.length||1))).padStart(4)} | ${dB(a.ent)} dB`);
}
