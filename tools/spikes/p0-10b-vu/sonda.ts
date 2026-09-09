/**
 * Sonda cruda de `VU2`, para SPK-P0.10b.
 *
 * Escucha la consola sin la aplicación en el medio y saca dos cosas que no se
 * pueden ver desde la interfaz: el **byte** que manda la consola para un canal
 * —antes de cualquier conversión nuestra— y el nombre que ese canal tiene en el
 * volcado. Sirve para comparar contra lo que muestra la consola en pantalla.
 *
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/sonda.ts 192.168.0.78 1 8
 */
import {
  Ui24rTransport, WebSocketTransport, decodificarVuCanales, decodificarVu,
} from '@vse/mixer-adapter';
import { esSimulador } from '@vse/domain';

const maquina = process.argv[2] ?? '192.168.0.78';
const canal = Number(process.argv[3] ?? '1');
const segundos = Number(process.argv[4] ?? '8');

const t = esSimulador(maquina) ? new WebSocketTransport() : new Ui24rTransport();
const nombres = new Map<string, string>();
const bytes: number[] = [];
const db: number[] = [];
let tramas = 0;

t.alRecibir((linea) => {
  if (linea.startsWith('SETS^')) {
    const [, ruta, texto] = linea.split('^');
    if (ruta !== undefined && /^i\.\d+\.name$/.test(ruta)) nombres.set(ruta, texto ?? '');
    return;
  }
  if (linea.startsWith('VU2^')) {
    tramas++;
    const carga = linea.slice(4);
    const canales = decodificarVuCanales(carga);
    const c = canales[canal - 1];
    if (c !== undefined) {
      bytes.push(Math.round(c.entrada * 255));
      db.push(decodificarVu(carga)[canal - 1] ?? -Infinity);
    }
  }
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, segundos * 1000));
await t.desconectar();

const max = (a: number[]) => a.reduce((m, v) => Math.max(m, v), -Infinity);
const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);

console.log(`tramas VU2: ${tramas}, muestras del canal ${canal}: ${bytes.length}`);
console.log(`byte crudo (entrada): max ${max(bytes)}, media ${media(bytes).toFixed(1)}, ultimos ${bytes.slice(-12).join(' ')}`);
console.log(`dB segun nuestra conversion: max ${max(db).toFixed(1)}, media ${media(db).toFixed(1)}`);
console.log('nombres del volcado:');
for (let i = 0; i < 24; i++) {
  const clave = `i.${i}.name`;
  console.log(`  ${clave} = ${nombres.has(clave) ? `"${nombres.get(clave)}"` : '(no llego en el volcado)'}`);
}
console.log(`indices de nombre presentes: ${[...nombres.keys()].map((k) => k.split('.')[1]).sort((a, b) => Number(a) - Number(b)).join(' ')}`);
