/**
 * El decodificador de buses contra la trama de verdad.
 *
 * Con la musica sonando en 21/22, el general tiene senal y los auxiliares y
 * subgrupos deberian estar donde el decodificador dice. Si las cuentas de la
 * cabecera no cuadraran, esto leeria basura o listas vacias.
 */
import { Ui24rTransport, decodificarVuBuses, dbDeMedidor } from '@vse/mixer-adapter';

const t = new Ui24rTransport();
let hecho = false;
t.alRecibir((l) => {
  if (!l.startsWith('VU2^') || hecho) return;
  hecho = true;
  const m = decodificarVuBuses(l.slice(4));
  const db = (x: number): string => {
    const v = dbDeMedidor(x);
    return Number.isFinite(v) ? v.toFixed(1).padStart(7) : '     -inf';
  };
  console.log(`reproductor: ${m.reproductor.length}   subgrupos: ${m.subgrupos.length}`
    + `   efectos: ${m.efectos.length}   auxiliares: ${m.auxiliares.length}`);
  console.log('');
  console.log('reproductor        pre    entrada    salida');
  m.reproductor.forEach((r, i) => console.log(`  ${i + 1}          ${db(r.pre)} ${db(r.entrada)} ${db(r.salida)}`));
  console.log('');
  console.log('subgrupo         preIzq     preDer    postIzq    postDer');
  m.subgrupos.forEach((s, i) => console.log(`  ${i + 1}        ${db(s.preIzq)} ${db(s.preDer)} ${db(s.postIzq)} ${db(s.postDer)}`));
  console.log('');
  console.log('auxiliar            pre       post');
  m.auxiliares.forEach((a, i) => console.log(`  ${String(i + 1).padStart(2)}       ${db(a.pre)} ${db(a.post)}`));
});
await t.conectar(process.argv[2] ?? '192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
await t.desconectar();
