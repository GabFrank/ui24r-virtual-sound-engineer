import { Ui24rTransport } from '@vse/mixer-adapter';
const t = new Ui24rTransport();
const claves = new Map<string, string>();
t.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if ((c === 'SETD' || c === 'SETS') && r && (/afs/.test(r) || r === 'var.rta')) claves.set(r, v ?? '');
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));
await t.desconectar();
const eq = [...claves].filter(([k]) => /^m\.afs\.eq/.test(k));
console.log('--- supresor de realimentacion, estado ---');
for (const [k, v] of [...claves].filter(([k]) => /enabled|numfixed|numtotal|sensitivity/.test(k)).sort()) console.log(`  ${k} = ${v}`);
console.log(`--- filtros del GENERAL: ${eq.length} claves ---`);
for (const [k, v] of eq.sort()) console.log(`  ${k} = ${v}`);
console.log(`--- var.rta = ${JSON.stringify(claves.get('var.rta'))} ---`);
console.log(`--- var.afsdata presente: ${claves.has('var.afsdata')} ---`);
