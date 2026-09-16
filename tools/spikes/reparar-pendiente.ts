/**
 * Deshacer lo que una corrida que se murió de golpe dejó escrito.
 *
 * Lee el papelito que `pendiente.ts` deja antes de la primera escritura, devuelve
 * cada clave a su valor previo por el camino garantizado —`restaurarClaves`, que
 * reconecta si hace falta— y **lo comprueba releyendo por HTTP**, que es una vía
 * distinta de la que escribió.
 *
 * **Se corre a mano y a propósito.** No lo dispara ninguna otra corrida sola:
 * aplicar valores de una sesión que murió quién sabe cómo es escribir sobre la
 * consola de alguien sin que nadie mire. El que lo corre está mirando.
 *
 * **Si no hay nada que reparar, sale bien y lo dice.** Un reparador que se queja
 * cuando no hay nada roto es un reparador que nadie corre.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/reparar-pendiente.ts
 */
import { Ui24rTransport } from '@vse/mixer-adapter';
import { restaurarClaves } from './restaurar.ts';
import { leerPendiente, cerrarPendiente, RUTA_PENDIENTE } from './pendiente.ts';
import { leerUnaClave } from './leer-una-clave.ts';

const p = leerPendiente();
if (p === null) {
  console.log('No hay nada pendiente de restaurar.');
  process.exit(0);
}

console.log('=== RESTAURACION PENDIENTE ===');
console.log(`   papelito: ${RUTA_PENDIENTE}`);
console.log(`   la dejo:  ${p.guion}`);
console.log(`   cuando:   ${p.cuando}`);
console.log(`   consola:  ${p.maquina}`);
console.log('');

if (p.pares.length === 0) {
  throw new Error('el papelito no dice que claves restaurar. Hay que mirar la consola a mano: '
    + 'el guion que lo dejo esta nombrado arriba, y su PREVIO esta en su evidencia si llego a '
    + 'archivarse.');
}

for (const [k, v] of p.pares) console.log(`   ${k} -> ${v}`);
console.log('');

const t = new Ui24rTransport();
await t.conectar(p.maquina);
try {
  await restaurarClaves(t, p.maquina, p.pares);
} finally {
  await t.desconectar();
}

console.log('=== COMPROBACION, RELEIDA POR HTTP ===');
const fallidas: string[] = [];
for (const [k, v] of p.pares) {
  const leido = await leerUnaClave(p.maquina, k);
  const bien = Math.abs(leido - v) < 1e-9;
  if (!bien) fallidas.push(`${k}: se esperaba ${v} y se leyo ${leido}`);
  console.log(`   ${bien ? 'OK  ' : 'MAL '} ${k.padEnd(24)} ${leido}`);
}

console.log('');
if (fallidas.length > 0) {
  // **El papelito NO se borra si algo quedo mal.** Borrarlo aca seria perder el
  // unico registro de lo que falta arreglar, justo en el caso en que hace falta.
  throw new Error(`${fallidas.length} clave(s) no volvieron:\n  ${fallidas.join('\n  ')}\n`
    + `El papelito se deja donde esta: es el unico registro de lo que falta.`);
}

cerrarPendiente();
console.log('La consola quedo como estaba, y el papelito se borro.');
