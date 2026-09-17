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
import { execFileSync } from 'node:child_process';
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

/**
 * **Callar TODO antes de tocar nada, y el motivo costo un filtro.**
 *
 * El 2026-09-17, reparando un papelito, este guion devolvio `m.afs.enabled` a 1
 * mientras un `afplay` huerfano seguia tocando el tono de 4 kHz de la corrida que
 * se habia muerto. El supresor volvio a encenderse **con tono sonando** y planto
 * un filtro de -18 dB en 4000,03 Hz, en la consola del usuario.
 *
 * **Ninguna guarda podia verlo.** Las corridas normales matan su reproductor en el
 * `finally` de `conRestauracion`, pero este guion corre en OTRO proceso y no tiene
 * ningun manejador del huerfano: para el, el tono es invisible.
 *
 * Asi que lo primero que hace es matar cualquier reproductor y cualquier grabador
 * que hayan sobrevivido. Es tosco a proposito: no hay forma de distinguir «mi
 * huerfano» de otro, y en una maquina de medicion no hay ninguno legitimo.
 */
console.log('=== PRIMERO, SILENCIO ===');
for (const quien of ['afplay', 'tools/audio/bin/grabar']) {
  try {
    execFileSync('pkill', ['-f', quien], { stdio: 'ignore' });
    console.log(`   se mato ${quien} (habia alguno vivo)`);
  } catch {
    console.log(`   ${quien}: ninguno vivo`);
  }
}
await new Promise((r) => { setTimeout(r, 1500); });
console.log('');

/**
 * **Y el supresor se devuelve ULTIMO.**
 *
 * Es el mismo principio que el `PREVIO` de los guiones aplica al fader --«no se
 * devuelve el nivel antes de devolver lo que lo protege»--, y aca es mas fuerte:
 * si algo quedara sonando pese al silencio de arriba, encender el supresor
 * primero es plantar un filtro.
 */
const esSupresor = (k: string): boolean => /\.afs\.enabled$/.test(k);
const ordenadas = [
  ...p.pares.filter(([k]) => !esSupresor(k)),
  ...p.pares.filter(([k]) => esSupresor(k)),
];

const t = new Ui24rTransport();
await t.conectar(p.maquina);
try {
  await restaurarClaves(t, p.maquina, ordenadas);
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
