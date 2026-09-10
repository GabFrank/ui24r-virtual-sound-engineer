/**
 * Criterio 3 de SPK-P0.1: ¿la consola devuelve eco de las escrituras propias?
 *
 * La respuesta decide cómo se confirma cada escritura, y por lo tanto toda la
 * política de confirmación (SPK-ACK-POLICY). Si no hay eco, `escribir()` no
 * puede esperar uno: quedaría siempre en UNVERIFIED.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
const RUTA = process.argv[2] ?? 'i.9.mute';
const t = new Ui24rTransport();
let valor: number | null = null;
let escuchando = false;
const recibidas: { linea: string; enMs: number }[] = [];
let envioEnMs = 0;

t.alRecibir((l) => {
  if (!l.startsWith(`SETD^${RUTA}^`)) return;
  valor = Number(l.split('^')[2]);
  if (escuchando) recibidas.push({ linea: l, enMs: Date.now() - envioEnMs });
});

await t.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 4000));
const inicial = valor;
const objetivo = inicial === 1 ? 0 : 1;
console.log(`ruta ${RUTA}, valor inicial ${inicial}, se escribe ${objetivo}`);

escuchando = true;
envioEnMs = Date.now();
t.enviar(`SETD^${RUTA}^${objetivo}`);
await new Promise((r) => setTimeout(r, 6000));

console.log(`lineas recibidas para esa ruta en 6 s: ${recibidas.length}`);
for (const r of recibidas) console.log(`  +${r.enMs} ms  ${r.linea}`);

console.log('');
console.log('ahora se pide INIT para ver que quedo de verdad:');
recibidas.length = 0;
envioEnMs = Date.now();
t.enviar('INIT');
await new Promise((r) => setTimeout(r, 6000));
for (const r of recibidas) console.log(`  +${r.enMs} ms  ${r.linea}`);
console.log(`valor tras INIT: ${valor}  ->  ${valor === objetivo ? 'LA ESCRITURA SE APLICO' : 'no se aplico'}`);
await t.desconectar();
