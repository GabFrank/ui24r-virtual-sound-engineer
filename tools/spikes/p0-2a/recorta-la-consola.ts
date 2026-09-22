/**
 * ¿La consola recorta un crudo fuera de rango, o lo guarda tal cual?
 *
 * **Qué decide, y por qué no es una curiosidad.** INV-004 acota cuánto puede
 * mover la aplicación cada parámetro por transacción. Esa invariante se apoya en
 * que el motor calcule el valor y lo escriba; **qué pasa si por un error de
 * cálculo sale un crudo fuera de 0..1 no está medido en esta consola**. Hoy la
 * respuesta que el proyecto usa está inferida de otro modelo —una Ui16, que
 * guarda 1,5 y −0,2 tal cual—, y una invariante de seguridad apoyada en el
 * comportamiento de otro aparato es una invariante con un supuesto adentro.
 *
 * Las dos respuestas sirven y las dos cambian algo:
 *
 * - **si recorta**, la consola es una red de contención y el peor caso de un
 *   error de cálculo es saturar el parámetro, no romperlo;
 * - **si guarda tal cual**, el crudo fuera de rango queda escrito, y entonces la
 *   guarda tiene que estar entera del lado de la aplicación.
 *
 * ## Trabajo previo, buscado ANTES de medir
 *
 * Se revisaron los cuatro proyectos de terceros que hablan este protocolo,
 * buscando qué hacen con un valor fuera de rango:
 *
 * - **`fmalcher/soundcraft-ui`**: **recorta del lado del cliente**.
 *   `setFaderLevel(value)` hace `value = clamp(value, 0, 1)` antes de enviar, y
 *   `fadeTo()` también; `clamp` vive en `packages/mixer-connection/src/lib/utils.ts`
 *   y aparece en 23 archivos. Guarda además un `setFaderLevelRaw` privado que
 *   **no** recorta.
 * - **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y
 *   **`NaturalDevCR/MyUiPro`**: cero coincidencias de recorte. Mandan lo que se
 *   les da.
 *
 * **Ninguno de los cuatro documenta qué hace la consola.** Uno se defiende y tres
 * no. O sea que la pregunta no está contestada en ningún lado, y tres bibliotecas
 * pueden estar enviando valores fuera de rango sin saber qué provocan. Que el más
 * cuidadoso de los cuatro haya elegido recortar en el cliente es una pista de que
 * tampoco lo sabía: quien conoce la respuesta no necesita defenderse de las dos.
 *
 * ## Cómo se mide sin arriesgar nada
 *
 * En un canal **sin fuente, silenciado y con el fader abajo** —se exige, no se
 * supone—, se escribe `i.N.mix` fuera de rango por arriba y por abajo, se relee
 * por HTTP, y se restaura. Un canal en esas condiciones no puede sonar aunque el
 * valor quede escrito.
 *
 * **Nunca sobre `hw.N.gain`**, que es la ganancia analógica del previo y el único
 * parámetro donde un valor absurdo tiene consecuencia física, y nunca con algo
 * conectado a los parlantes.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2a/recorta-la-consola.ts 5 192.168.0.78
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { leerUnaClave } from '../leer-una-clave.ts';
import { anotarPendiente, cerrarPendiente, avisarSiHayPendiente } from '../pendiente.ts';

const canal = argIndice(2, 'canal', 5, { desde: 1, hasta: 24 });
const maquina = argTexto(3, '192.168.0.78');
const n = canal - 1;
const RUTA = `i.${n}.mix`;

/** Los valores fuera de rango que se prueban, y por qué estos. */
const FUERA_DE_RANGO: readonly (readonly [number, string])[] = [
  [1.5, 'medio recorrido por encima del maximo'],
  [-0.2, 'por debajo del minimo, que es el caso que un resto podria producir'],
  [2, 'el doble del maximo'],
];

avisarSiHayPendiente();

const t = new Ui24rTransport();
await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);

// **Las condiciones del canal se EXIGEN, no se suponen.** Escribir un valor
// absurdo en un canal con fuente y sin silenciar es la unica forma en que esta
// medicion podria sonar en la sala.
const mute = Number(exigirClave(e0, `i.${n}.mute`));
const fader = Number(exigirClave(e0, RUTA));
if (mute !== 1) {
  throw new Error(`el canal ${canal} no esta silenciado (mute = ${mute}). Esta medicion escribe `
    + `valores absurdos: solo se hace en un canal que no pueda sonar.`);
}
if (fader > 0.01) {
  throw new Error(`el canal ${canal} tiene el fader en ${fader}. Se pide abajo: si la consola `
    + `NO recorta, el valor fuera de rango queda escrito en un fader que no esta en cero.`);
}

const PREVIO: readonly (readonly [string, number])[] = [[RUTA, fader]];

console.log(`=== ¿RECORTA LA CONSOLA? — ${RUTA} en ${maquina} ===`);
console.log('');
console.log(`   canal ${canal}: silenciado (mute = ${mute}), fader en ${fader}`);
console.log(`   se restaura a ${fader} al terminar`);
console.log('');

anotarPendiente('recorta-la-consola.ts', maquina, PREVIO);

const resultados: { pedido: number; leido: number; recorto: boolean }[] = [];

await conRestauracion(
  async () => {
    await restaurarClaves(t, maquina, PREVIO);
  },
  async () => {
    console.log('   pedido   | leido por HTTP | veredicto');
    console.log('   ---------|----------------|------------------------');
    for (const [v, porque] of FUERA_DE_RANGO) {
      t.enviar(codificarSetd(RUTA, v));
      await new Promise((r) => { setTimeout(r, 1200); });
      const leido = await leerUnaClave(maquina, RUTA);
      const recorto = Math.abs(leido - v) > 1e-9;
      resultados.push({ pedido: v, leido, recorto });
      console.log(`   ${String(v).padStart(8)} | ${String(leido).padStart(14)} | `
        + `${recorto ? 'RECORTO' : 'lo guardo tal cual'}`);
      console.log(`            | ${' '.repeat(14)} | (${porque})`);
      // Se vuelve al valor bueno entre prueba y prueba: si la corrida muere en la
      // segunda, la consola no queda con el valor de la primera.
      t.enviar(codificarSetd(RUTA, fader));
      await new Promise((r) => { setTimeout(r, 800); });
    }
  },
);

const despues = await estadoPorHttpExigido(maquina);
const final = Number(exigirClave(despues, RUTA));
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
const volvio = Math.abs(final - fader) < 1e-9;
console.log(`   ${RUTA}  esperado ${fader}  leido ${final}  ${volvio ? 'OK' : 'MAL'}`);
if (volvio) cerrarPendiente();
else process.exitCode = 1;

console.log('');
console.log('=== VEREDICTO ===');
const todosRecortaron = resultados.every((r) => r.recorto);
const ningunoRecorto = resultados.every((r) => !r.recorto);
if (todosRecortaron) {
  console.log('   LA CONSOLA RECORTA. Un crudo fuera de rango no queda escrito: el aparato');
  console.log('   es una red de contencion, y el peor caso de un error de calculo es');
  console.log('   saturar el parametro.');
} else if (ningunoRecorto) {
  console.log('   LA CONSOLA GUARDA EL VALOR TAL CUAL. No hay red de contencion del lado');
  console.log('   del aparato: la guarda tiene que estar entera en la aplicacion, y');
  console.log('   INV-004 deja de apoyarse en una suposicion prestada de otro modelo.');
} else {
  console.log('   RECORTA SOLO EN ALGUNOS CASOS, que es la respuesta mas incomoda de las');
  console.log('   tres: una contencion parcial es la que induce a confiar donde no hay.');
  for (const r of resultados) {
    console.log(`     ${r.pedido} -> ${r.leido} (${r.recorto ? 'recorto' : 'tal cual'})`);
  }
}
console.log('');
console.log('   Esto mide UNA ruta de fader en UN canal. Nada dice de `hw.N.gain`,');
console.log('   que no se toca a proposito, ni de las rutas de otro tipo.');

await t.desconectar();
