/**
 * Deja la consola lista para probar el lazo, y la devuelve al terminar.
 *
 * Apaga el supresor de realimentacion del general --los tonos sostenidos le
 * ensenan filtros-- y sube la ganancia del canal 10 a un valor bajo, para que
 * la propuesta tenga margen de subir y el lazo tenga algo que hacer.
 *
 *   node ... preparar-lazo.ts preparar
 *   node ... preparar-lazo.ts restaurar
 *
 * NO TOCA NINGUN SNAPSHOT. No manda LOADSNAPSHOT ni nada parecido.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { readFileSync, writeFileSync } from 'node:fs';

const RUTAS = ['m.afs.enabled', 'hw.9.gain'];
const GUARDADO = '/tmp/lazo-previos.json';
const orden = process.argv[2] ?? 'preparar';

const t = new Ui24rTransport();
const previos = new Map<string, number>();
t.alRecibir((l) => {
  const [c, r, v] = l.split('^');
  if (c === 'SETD' && r && RUTAS.includes(r) && !previos.has(r)) previos.set(r, Number(v));
});
await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 5000));

if (orden === 'preparar') {
  writeFileSync(GUARDADO, JSON.stringify([...previos]));
  console.log('anotado:', JSON.stringify([...previos]));
  t.enviar(codificarSetd('m.afs.enabled', 0));
  // Ganancia baja: deja lugar para que la propuesta sea subir, que es el caso
  // normal y el que conviene probar.
  t.enviar(codificarSetd('hw.9.gain', 0.20));
  await new Promise((r) => setTimeout(r, 2000));
  console.log('preparado: supresor apagado, ganancia del canal 10 en 0,20');
} else {
  const guardado = new Map<string, number>(JSON.parse(readFileSync(GUARDADO, 'utf8')));
  for (const [r, v] of guardado) t.enviar(codificarSetd(r, v));
  await new Promise((r) => setTimeout(r, 2000));
  console.log('restaurado:', JSON.stringify([...guardado]));
}
await t.desconectar();
