/**
 * Saca los filtros que el supresor del general tenga plantados.
 *
 * **Es una herramienta de limpieza, no una medición**, y existe porque el
 * 2026-09-16 hizo falta de verdad: el control positivo del ítem 111 dejó tres
 * filtros en la consola del usuario en menos de cinco segundos de tono, que es
 * lo que ese control buscaba demostrar.
 *
 * ## Lo que borra, y lo que se lleva puesto
 *
 * **`clearall` borra TODO.** Se midió el 2026-09-13: `clearlive` no borra,
 * `clearfixed` tampoco, y `clearall` sí — llevándose la pila entera, incluidos
 * los filtros que el usuario haya plantado en sus fechas. Ver
 * `docs/backlog/hallazgo-solo-clearall-borra-y-se-lleva-todo.md`.
 *
 * Por eso este guion **cuenta lo que hay antes y lo dice**, y por eso **aborta si
 * encuentra más filtros de los que se le dijo que espera**: borrar de más es
 * exactamente el daño que se quiere evitar.
 *
 * ## El flanco, que en esta consola no es gratis
 *
 * El cliente de la consola dispara el botón con `clearall` a 1, esperar 500 ms y
 * volver a 0. **En esta consola la clave está en 1 en reposo**, así que ese
 * `setValue(1)` no produce ningún flanco de subida y el botón no dispara. El
 * estado archivado de `fmalcher/soundcraft-ui` la trae en **0**, que es donde el
 * cliente la deja siempre: el 1 es casi seguro un residuo de este proyecto, del
 * 2026-09-13, cuando se probó el borrado sin la vuelta a 0.
 *
 * Así que se baja primero, y recién después se hace lo que hace el cliente. Y se
 * deja en **0**, no en el 1 que se encontró: restaurar ese 1 sería restaurar un
 * defecto que deja el botón CLEAR ALL del usuario sin flanco posible.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/limpiar-supresor.ts <cuantos> [maquina]
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';

const esperados = argIndice(2, 'cuantos filtros se esperan', 0, { desde: 0, hasta: 16 });
const maquina = argTexto(3, '192.168.0.78');

interface Ranura { i: number; crudo: string; plantado: boolean }
const pila = (e: ReadonlyMap<string, string>): Ranura[] => {
  const f: Ranura[] = [];
  for (let i = 0; i < 16; i++) {
    const v = e.get(`m.afs.eq.${i}`);
    if (v === undefined) continue;
    const at = Number(v.split(',')[2] ?? NaN);
    f.push({ i, crudo: v, plantado: !(at === 0) });
  }
  return f;
};

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const antes = pila(e0).filter((r) => r.plantado);

console.log('=== LIMPIAR LOS FILTROS DEL SUPRESOR DEL GENERAL ===');
console.log('');
console.log(`   filtros plantados ahora: ${antes.length}  (se esperaban ${esperados})`);
for (const r of antes) console.log(`      ranura ${r.i}: ${r.crudo}`);
console.log('');

if (antes.length === 0) {
  console.log('   No hay nada que borrar. No se escribe nada.');
  await t.desconectar();
  process.exit(0);
}
if (antes.length > esperados) {
  throw new Error(`hay ${antes.length} filtros y se esperaban ${esperados}. `
    + `\`clearall\` se lleva la pila ENTERA, asi que borrar de mas es el daño que este `
    + `guion existe para evitar. Si los de mas son del usuario, esto lo decide el usuario.`);
}

console.log(`   clearall antes: ${exigirClave(e0, 'm.afs.clearall')}`);
console.log('   se baja a 0 para que exista el flanco, y despues la secuencia del cliente.');

// **La restauracion de este guion deja la clave en 0, no en lo que encontro, y
// eso NO la vuelve teatro.** El peligro real es morirse entre el 1 y el 0: ahi
// la clave queda arriba y el boton CLEAR ALL del usuario vuelve a quedar sin
// flanco posible, que es el defecto que este guion existe para sacar. El
// `finally` garantiza que termine abajo pase lo que pase.
//
// Devolver el 1 que se encontro seria devolver ese defecto. El motivo esta en
// `docs/backlog/hallazgo-el-boton-clear-all-estaba-trabado.md`.
anotarPendiente('limpiar-supresor.ts', maquina, [['m.afs.clearall', 0]]);

await conRestauracion(
  async () => {
    t.enviar(codificarSetd('m.afs.clearall', 0));
    await new Promise((r) => { setTimeout(r, 800); });
  },
  async () => {
    t.enviar(codificarSetd('m.afs.clearall', 0));
    await new Promise((r) => { setTimeout(r, 700); });
    t.enviar(codificarSetd('m.afs.clearall', 1));
    await new Promise((r) => { setTimeout(r, 500); });
    t.enviar(codificarSetd('m.afs.clearall', 0));
    await new Promise((r) => { setTimeout(r, 2500); });
  },
);

const e1 = await estadoPorHttpExigido(maquina);
const despues = pila(e1).filter((r) => r.plantado);
console.log('');
console.log('=== RELEIDO POR HTTP ===');
console.log(`   filtros plantados: ${despues.length}`);
for (const r of despues) console.log(`      ranura ${r.i}: ${r.crudo}`);
console.log(`   m.afs.clearall  ${exigirClave(e1, 'm.afs.clearall')}  (queda en 0, como lo deja el cliente)`);
console.log(`   m.afs.enabled   ${exigirClave(e1, 'm.afs.enabled')}   (no se toco)`);
console.log(`   m.afs.logic     ${exigirClave(e1, 'm.afs.logic')}   (no se toco)`);
console.log(`   m.afs.fmode     ${exigirClave(e1, 'm.afs.fmode')}   (no se toco)`);
console.log(`   m.afs.numtotal  ${exigirClave(e1, 'm.afs.numtotal')}`);

await t.desconectar();
console.log('');
if (despues.length === 0) {
  cerrarPendiente();
  console.log('LIMPIA. La pila del supresor vuelve a no tener ningun filtro plantado.');
} else {
  console.log('NO QUEDO LIMPIA. Hay que mirar la consola a mano.');
  process.exitCode = 1;
}
