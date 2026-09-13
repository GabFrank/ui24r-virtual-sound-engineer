/**
 * Las claves `eq.peak` de dos buses, LEIDAS y archivadas. No escribe nada.
 *
 * **Por que existe.** La medicion 102 encontro que el auxiliar 3 esta 22,67 dB
 * por debajo del 5 con el mismo envio, de forma constante. El documento de la 102
 * atribuyo esa diferencia al ecualizador grafico del auxiliar 3 y publico una
 * tabla de bandas con sus valores en decibeles. **Un auditor encontro que esa
 * tabla no estaba en ninguna corrida archivada**: salia de un volcado HTTP suelto,
 * y su columna en dB de una ley que este proyecto declara desconocida.
 *
 * Esto archiva lo que si se puede afirmar: **los crudos, tal como el aparato los
 * devuelve**. Nada mas.
 *
 * **Y lo que sigue sin saberse, que el propio proyecto ya tenia escrito.** La
 * auditoria tecnica dice, sobre `a.B.eq.peak`:
 *
 * > *«[DESCONOCIDO]: unidades/escala de cada valor; si `a.B.eq.peak` es la PEQ de
 * > 4 bandas o la GEQ de 31 bandas (no existe clave `geq`)»*
 *
 * Asi que de estos crudos NO se sigue ni a que frecuencia corresponde cada indice
 * ni cuantos decibeles vale cada valor. Lo unico que se lee directo es **cuales
 * estan en 0,5 y cuales no**, y que en un bus estan todos en 0,5 y en el otro no.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/ecualizador-de-los-buses.ts 3 5 192.168.0.78
 */
import { estadoPorHttpExigido } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';

const auxA = argIndice(2, 'auxiliar A', 3, { desde: 1, hasta: 10 });
const auxB = argIndice(3, 'auxiliar B', 5, { desde: 1, hasta: 10 });
const maquina = argTexto(4, '192.168.0.78');
const a = auxA - 1;
const b = auxB - 1;

const e = await estadoPorHttpExigido(maquina);
console.log('=== LAS CLAVES eq.peak DE DOS BUSES, LEIDAS DEL APARATO ===');
console.log(`${e.size} claves por HTTP | auxiliar ${auxA} = a.${a} | auxiliar ${auxB} = a.${b}`);
console.log('');

const claves = (bus: number): number[] => {
  const salida: number[] = [];
  for (let i = 0; ; i++) {
    const v = e.get(`a.${bus}.eq.peak.${i}`);
    if (v === undefined) break;
    salida.push(Number(v));
  }
  return salida;
};

const va = claves(a);
const vb = claves(b);
console.log(`a.${a}.eq.peak.*: ${va.length} claves | a.${b}.eq.peak.*: ${vb.length} claves`);
console.log('');
console.log(`indice | a.${a} (aux ${auxA}) | a.${b} (aux ${auxB}) | difieren`);
for (let i = 0; i < Math.max(va.length, vb.length); i++) {
  const x = va[i]; const y = vb[i];
  const dif = x !== undefined && y !== undefined && Math.abs(x - y) > 1e-9;
  console.log(`${String(i).padStart(6)} | ${(x ?? NaN).toFixed(10).padStart(13)} | `
    + `${(y ?? NaN).toFixed(10).padStart(13)} | ${dif ? 'SI' : ''}`);
}
console.log('');
const fuera = (v: number[]) => v.filter((x) => Math.abs(x - 0.5) > 1e-9).length;
console.log(`fuera del centro (0,5): a.${a} tiene ${fuera(va)} de ${va.length}, `
  + `a.${b} tiene ${fuera(vb)} de ${vb.length}`);
console.log('');
console.log('LO QUE ESTO NO DICE:');
console.log('   A que frecuencia corresponde cada indice. No esta medido y el propio');
console.log('   proyecto declara DESCONOCIDO si estas claves son la PEQ de 4 bandas o');
console.log('   la GEQ de 31 --no existe clave `geq`--. Que sean 31 lo sugiere y no lo');
console.log('   prueba.');
console.log('   Cuantos decibeles vale cada crudo. La ley de conversion de estas claves');
console.log('   no esta en RAW_MAP ni medida en ningun lado.');
console.log('   Y por lo tanto, cuanto atenua este ecualizador en 1 kHz.');
for (const k of [`a.${a}.eq.bypass`, `a.${b}.eq.bypass`, `a.${a}.eq.prmod`, `a.${b}.eq.prmod`,
  `a.${a}.eq.linked`, `a.${b}.eq.linked`]) {
  console.log(`   ${k.padEnd(18)} ${e.get(k) ?? '(ausente)'}`);
}
