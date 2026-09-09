/**
 * Criterio 5 de SPK-P0.1 y SPK-P0.9: varios clientes a la vez.
 *
 * La pregunta no es si la consola aguanta tres conexiones, sino si **todos ven
 * lo mismo**. Se compara la huella del estado confirmado de cada cliente, y
 * despues se provoca un cambio para ver si los demas lo reciben.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { huellaDelEstado } from '@vse/diagnostico';

const MAQUINA = '192.168.0.78';
const CUANTOS = 3;

const clientes = Array.from({ length: CUANTOS }, () => new Ui24rTransport());
const estados = clientes.map(() => new Map<string, number>());
const cambiosVistos = clientes.map(() => 0);
let escuchando = false;
const RUTA = 'i.9.pan';

clientes.forEach((c, i) => {
  c.alRecibir((l) => {
    if (!l.startsWith('SETD^')) return;
    const [, ruta, v] = l.split('^');
    if (ruta === undefined) return;
    estados[i]!.set(ruta, Number(v));
    if (escuchando && ruta === RUTA) cambiosVistos[i]! += 1;
  });
});

for (const c of clientes) await c.conectar(MAQUINA);
await new Promise((r) => setTimeout(r, 6000));

const huellas = estados.map((e) => huellaDelEstado(e));
console.log('claves y huella por cliente:');
huellas.forEach((h, i) => console.log(`  cliente ${i + 1}: ${estados[i]!.size} claves · ${h}`));
const todasIguales = huellas.every((h) => h === huellas[0]);
console.log(todasIguales
  ? 'Las tres huellas coinciden: los tres clientes ven el mismo estado.'
  : 'LAS HUELLAS NO COINCIDEN.');

if (!todasIguales) {
  const base = estados[0]!;
  for (let i = 1; i < estados.length; i++) {
    const otro = estados[i]!;
    const faltan = [...base.keys()].filter((k) => !otro.has(k));
    const sobran = [...otro.keys()].filter((k) => !base.has(k));
    const distintas = [...base.keys()].filter((k) => otro.has(k) && otro.get(k) !== base.get(k));
    console.log(`  cliente ${i + 1}: le faltan ${faltan.length}, le sobran ${sobran.length}, difieren ${distintas.length}`);
    for (const k of distintas.slice(0, 5)) console.log(`     ${k}: ${base.get(k)} vs ${otro.get(k)}`);
    for (const k of faltan.slice(0, 5)) console.log(`     falta ${k}`);
  }
}

console.log('');
const antes = estados[0]!.get(RUTA) ?? 0.5;
const objetivo = antes > 0.5 ? 0.3 : 0.7;
escuchando = true;
clientes[0]!.enviar(codificarSetd(RUTA, objetivo));
console.log(`el cliente 1 escribe ${RUTA} = ${objetivo} (antes ${antes})`);
await new Promise((r) => setTimeout(r, 4000));
cambiosVistos.forEach((n, i) => console.log(`  cliente ${i + 1}: ${n} linea(s) de ${RUTA}${i === 0 ? ' (es el que escribio)' : ''}`));

clientes[0]!.enviar(codificarSetd(RUTA, antes));
await new Promise((r) => setTimeout(r, 1000));
for (const c of clientes) await c.desconectar();
