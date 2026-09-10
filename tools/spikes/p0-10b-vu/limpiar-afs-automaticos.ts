/**
 * Borrar los filtros AUTOMATICOS del supresor, y solo esos.
 *
 * **Por que hizo falta.** Midiendo la respuesta acustica se reprodujeron tonos
 * sostenidos por el general, y el supresor de la consola los tomo por
 * realimentacion: le puso un notch de -18 dB a cada uno. Cinco filtros que no
 * estaban. Un tono sostenido es, para un supresor, indistinguible de un acople.
 *
 * **Que se toca y que no.** `var.afsdata` publica DOS pilas. La de automaticos
 * es donde cayeron los mios; la de fijos --que en esta consola tiene 199 Hz a
 * -6 dB y 999 Hz a -18-- se coloco deliberadamente y NO SE TOCA. Los
 * automaticos, si hacen falta, la consola los vuelve a poner sola; un fijo lo
 * puso alguien pensando.
 *
 * Se comprueba leyendo `/raw` DESPUES, por un camino distinto del que escribio.
 */
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

async function pilas(): Promise<string> {
  const res = await fetch(`http://${maquina}/raw`);
  const lector = res.body!.getReader();
  let texto = '';
  for (let i = 0; i < 200; i++) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
    if (texto.includes('var.afsdata')) break;
  }
  await lector.cancel().catch(() => {});
  const m = /SETS\^var\.afsdata\^([^\n]*)/.exec(texto);
  if (m === null) return '(no se encontro afsdata)';
  const salida: string[] = [];
  m[1]!.split('fstack').forEach((pila, i) => {
    if (!pila.includes('v1,')) return;
    const filtros = pila.split(':')
      .filter((r) => /v1,/.test(r))
      .map((r) => { const c = r.replace(/^;+/, '').split(','); return `${Number(c[1]).toFixed(0)}Hz(${Number(c[2]).toFixed(0)}dB)`; });
    salida.push(`  pila ${i}: ${filtros.join(' ')}`);
  });
  return salida.join('\n');
}

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }

console.log('');
console.log('ANTES:');
console.log(await pilas());

t.enviar(codificarSetd('m.afs.clearlive', 1));
await new Promise((r) => setTimeout(r, 2500));

console.log('');
console.log('DESPUES:');
console.log(await pilas());
console.log('');
console.log('Los fijos --199 Hz y 999 Hz-- tienen que seguir estando: se colocaron a proposito.');
await app.desconectar();
