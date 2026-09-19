/**
 * Dejar plano el canal del banco de medición, y decir qué se cambió.
 *
 * **Por qué hace falta, y por qué no estaba previsto.** El contrato del ítem 108
 * se escribió el 2026-09-13 dando por sentado que el canal 10 estaba limpio —«las
 * cinco bandas están planas (`gain = 0,5`), y se exige que sigan así»— y que su
 * banda 2 ya caía en 1000,0 Hz exactos, lo que el propio contrato celebra como
 * «una clave menos que tocar y una menos que restaurar».
 *
 * El 2026-09-15, antes de correr, la lectura por HTTP mostró otra cosa: el show
 * `Prueba` dejó sobre el canal 10 un ecualizador de bombo. Convertido con la ley
 * que midió el ítem 101 —`20·1102,5^V`—:
 *
 * | clave | crudo | Hz |
 * |---|---|---|
 * | `eq.hpf.freq` | 0,0981 | **39,8** — el contrato exige por debajo de 37 |
 * | `eq.lpf.freq` | 0,5588 | **1002,6** — sobre el bin que la corrida mide |
 * | `eq.b2.freq` | 0,2377 | **105,8**, no 1000,0 |
 *
 * **El pasa-bajos es el que lo vuelve urgente.** Cayendo en 1002,6 Hz, el codo
 * del filtro del usuario se apoya exactamente sobre el bin de 1 kHz: la corrida
 * habría medido esa pendiente creyendo que medía la ley de la ganancia, y el
 * resultado se habría publicado como la ley. No es una corrida que falla, que es
 * lo barato; es una corrida que **contesta mal y no lo dice**.
 *
 * El usuario lo confirmó como suyo —un ensayo— y autorizó el reseteo del canal,
 * nombrando también el compresor, que tenía el preajuste «Kick Drum».
 *
 * **De dónde salen los valores de destino: de la consola, no de este archivo.**
 * Escribir aquí un «0,5 es plano» sería exactamente lo que el protocolo de
 * verificación llama producir la solución y el criterio con el que se la declara
 * correcta. En vez de eso se leen los canales que la propia consola tiene planos
 * y se exige que **coincidan entre sí**; si no coinciden, no se escribe nada. El
 * aparato es la fuente.
 *
 * **Lo que NO se toca, y por qué.** El nombre del canal (`BOMBO`) y los nombres
 * de preajuste de compresor y puerta son etiquetas: borrarlas le cuesta algo al
 * usuario y no le da nada a la medición. `mtkrec` arma la grabación multipista y
 * tampoco entra en el camino de audio de esta corrida. Un reseteo que se lleva
 * puestas las etiquetas por prolijidad es una escritura de más sobre la consola
 * de alguien.
 *
 * **La restauración es condicional, y esa es la parte que costó entender.** La
 * primera versión no restauraba nada, con el argumento de que un guion cuyo
 * propósito es cambiar el canal no debe deshacer su propio trabajo. La guarda
 * `restauracion-garantizada.test.ts` lo rechazó, y tenía razón por un motivo que
 * el argumento no veía: **lo que hay que evitar no es el estado final sino el de
 * mitad de camino**. Un canal con las cinco bandas ya planas y el pasa-bajos
 * todavía en 1002,6 Hz pasa a simple vista por «listo para medir» y conserva
 * justo el filtro que deforma la ley.
 *
 * Así que si la corrida llega al final y verifica, el canal queda plano y no se
 * restaura nada; si muere o falla a mitad, vuelve al bombo. Nunca queda en el
 * medio. Además **imprime los valores previos**, que `medir.mjs` archiva en la
 * misma corrida: con ese archivo el bombo se repone clave por clave aunque la
 * corrida haya terminado bien.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/aplanar-canal.ts 10 192.168.0.78
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { argIndice, argTexto } from '../argumentos.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';

const n = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const maquina = argTexto(3, '192.168.0.78');

/**
 * Las claves que se aplanan, cada una con el motivo por el que entra.
 *
 * **Es una lista explícita y no «todo lo que difiera de un canal plano».** Un
 * guion que escribe un conjunto abierto de claves sobre la consola de alguien es
 * la forma equivocada: bastaría con que un canal de referencia tuviera una
 * diferencia inesperada para arrastrarla al canal del banco sin que nadie la
 * nombre.
 */
const CLAVES: readonly (readonly [string, string])[] = [
  ['eq.b1.gain', 'el contrato exige las cinco bandas planas'],
  ['eq.b2.gain', 'es la banda que la corrida barre; tiene que partir de plano'],
  ['eq.b3.gain', 'el contrato exige las cinco bandas planas'],
  ['eq.b4.gain', 'el contrato exige las cinco bandas planas'],
  ['eq.b5.gain', 'el contrato exige las cinco bandas planas'],
  ['eq.b1.freq', 'con la ganancia en plano no suena, pero deja el canal comparable'],
  ['eq.b2.freq', 'EL CENTRO DE LA MEDICION: tiene que dar 1000,0 Hz exactos'],
  ['eq.b3.freq', 'con la ganancia en plano no suena, pero deja el canal comparable'],
  ['eq.b4.freq', 'con la ganancia en plano no suena, pero deja el canal comparable'],
  ['eq.hpf.freq', 'esta en 39,8 Hz y el testigo de la corrida esta en 37'],
  ['eq.lpf.freq', 'esta en 1002,6 Hz, sobre el bin que la corrida mide'],
  ['eq.prmod', 'el contrato lo exige en 0'],
  ['dyn.prmod', 'el preajuste Kick Drum del compresor, que el usuario nombro'],
  ['dyn.threshold', 'el compresor depende del nivel y el barrido mueve 40 dB'],
  ['dyn.ratio', 'idem'],
  ['dyn.softknee', 'idem'],
  ['dyn.attack', 'idem'],
  ['dyn.release', 'idem'],
];

/**
 * **El fader NO entra, y lo dijo la propia guarda de unanimidad.**
 *
 * La primera version de esta lista incluia `mix` «para que el canal quede como
 * un canal sin usar». La corrida del 2026-09-15 aborto sin escribir nada: los
 * once canales planos tienen el fader en cinco posiciones distintas —0,
 * 0,003611, 0,586216, 0,589338 y 0,022148—. Esta archivado en
 * `docs/spikes/SPK-P0.10b-vu2/evidence/aplanar-canal-10-2026-09-15.txt`.
 *
 * El fader es una **posicion operativa**, no una propiedad de la configuracion
 * del canal: «plano» no dice nada sobre el. Elegir uno de los cinco valores
 * habria sido inventar el criterio, que es justo lo que la guarda existe para
 * impedir. Y no hace ninguna falta: el guion del item 108 escribe el fader el
 * mismo —`FADER_PARA_HACER_LUGAR`— y lo restaura al valor previo.
 */

/**
 * Qué tiene que cumplir un canal para servir de referencia de «plano».
 *
 * Se comprueba en vez de suponerse: un canal de referencia que no esté plano
 * convierte a este guion en un repartidor de la configuración de otro.
 */
function estaPlano(estado: ReadonlyMap<string, string>, c: number): boolean {
  // **Se compara por numero y no por cadena.** La consola escribe «0,5» como
  // `0.5` y «22050 Hz» como `1`, pero nada garantiza el formato: un dia que
  // mande `1.0000000000` una comparacion de texto diria que ningun canal esta
  // plano, y este guion abortaria por falta de referencias sin que se entienda
  // por que.
  const igual = (clave: string, esperado: number): boolean => {
    const v = Number(estado.get(clave));
    return !Number.isNaN(v) && Math.abs(v - esperado) < 1e-9;
  };
  return [1, 2, 3, 4, 5].every((b) => igual(`i.${c}.eq.b${b}.gain`, 0.5))
    && igual(`i.${c}.eq.prmod`, 0)
    && igual(`i.${c}.eq.hpf.freq`, 0)
    && igual(`i.${c}.eq.lpf.freq`, 1);
}

/** Cuántos canales planos tienen que coincidir para creerles. */
const REFERENCIAS_MINIMAS = 3;

const estado = await estadoPorHttpExigido(maquina);
const indice = n - 1;

const referencias: number[] = [];
for (let c = 0; c < 24; c++) {
  if (c !== indice && estaPlano(estado, c)) referencias.push(c);
}

console.log(`=== APLANAR EL CANAL ${n} (i.${indice}) EN ${maquina} ===`);
console.log('');
console.log(`canales planos que sirven de referencia: ${referencias.length === 0 ? '(ninguno)'
  : referencias.map((c) => c + 1).join(', ')}`);

if (referencias.length < REFERENCIAS_MINIMAS) {
  throw new Error(`hacen falta ${REFERENCIAS_MINIMAS} canales planos de referencia y hay `
    + `${referencias.length}. No se escribe nada: sin varias fuentes que coincidan, el valor `
    + `«plano» seria una suposicion de este guion en vez de un dato del aparato.`);
}

/** El destino de cada clave, exigiendo unanimidad entre las referencias. */
const destino: [string, number][] = [];
const previo = new Map<string, string>();
const discordantes: string[] = [];

for (const [hoja] of CLAVES) {
  const vistos = new Set(referencias.map((c) => exigirClave(estado, `i.${c}.${hoja}`)));
  if (vistos.size !== 1) {
    discordantes.push(`${hoja} (${[...vistos].join(' / ')})`);
    continue;
  }
  const valor = [...vistos][0] as string;
  previo.set(hoja, exigirClave(estado, `i.${indice}.${hoja}`));
  destino.push([`i.${indice}.${hoja}`, Number(valor)]);
}

if (discordantes.length > 0) {
  throw new Error(`los canales planos NO coinciden en: ${discordantes.join(', ')}. No se escribe `
    + `nada. Que discrepen significa que «plano» no es una sola cosa en esta consola, y elegir `
    + `una de las variantes seria inventar el criterio.`);
}

console.log('');
console.log('=== LO QUE SE VA A CAMBIAR ===');
let aCambiar = 0;
for (const [hoja, motivo] of CLAVES) {
  const antes = previo.get(hoja) ?? '?';
  const despues = String(destino.find(([k]) => k === `i.${indice}.${hoja}`)?.[1] ?? '?');
  const igual = Number(antes) === Number(despues);
  if (!igual) aCambiar++;
  console.log(`  i.${indice}.${hoja.padEnd(14)} ${antes.padStart(15)} -> ${despues.padStart(15)}`
    + `${igual ? '   (ya estaba)' : ''}`);
  console.log(`      ${motivo}`);
}
console.log('');
console.log(`claves que realmente cambian: ${aCambiar} de ${CLAVES.length}`);
console.log('');
console.log('NO se tocan, a proposito: el nombre del canal, los nombres de preajuste del');
console.log('compresor y de la puerta, y mtkrec. Son etiquetas y armado de grabacion: no');
console.log('entran en el camino de audio de la medicion.');

/**
 * **Por que este guion SI usa `conRestauracion`, aunque exista para dejar el
 * canal distinto.**
 *
 * La primera version no la usaba, con el argumento de que envolver en una
 * restauracion un guion cuyo proposito es cambiar el canal desharia su propio
 * trabajo. La guarda `restauracion-garantizada.test.ts` lo rechazo, y al mirar
 * por que, el argumento resulto malo: lo que hay que evitar no es el estado
 * final, es el **estado de mitad de camino**.
 *
 * Un canal a medio aplanar es peor que cualquiera de los dos extremos. Si el
 * proceso muere despues de aplanar las ganancias y antes de mover el pasa-bajos,
 * el canal queda con las cinco bandas planas y el corte todavia en 1002,6 Hz
 * --o sea, pasando a simple vista por «listo para medir» mientras conserva
 * exactamente el filtro que deforma la ley--. Eso es la corrida que contesta mal
 * sin decirlo, otra vez, y por una caida de socket.
 *
 * Asi que la restauracion es **condicional y deliberada**: si la corrida llega
 * al final y verifica, el canal queda plano y no se toca nada; si muere o falla
 * a mitad, vuelve al bombo, que es un estado coherente y conocido. Nunca queda
 * en el medio.
 *
 * `logrado` se lee dentro de la restauracion y se escribe al final del cuerpo,
 * que es el unico orden que hace esto correcto.
 */
let logrado = false;
const previoPares: readonly (readonly [string, number])[] = CLAVES
  .map(([hoja]) => [`i.${indice}.${hoja}`, Number(previo.get(hoja))] as const);

const t = new Ui24rTransport();
await t.conectar(maquina);
try {
  await conRestauracion(
    async () => {
      if (logrado) {
        console.log('');
        console.log('el canal queda plano a proposito: no hay nada que restaurar.');
        return;
      }
      console.error('');
      console.error('LA CORRIDA NO TERMINO. Se devuelve el canal al estado previo para no');
      console.error('dejarlo a medio aplanar, que es el unico estado peligroso de los tres.');
      await restaurarClaves(t, maquina, previoPares);
    },
    async () => {
      for (const [clave, valor] of destino) {
        t.enviar(codificarSetd(clave, valor));
        await new Promise((r) => { setTimeout(r, 200); });
      }
      await new Promise((r) => { setTimeout(r, 1500); });

      // **La comprobacion va por HTTP y no por el socket que escribio.** Una
      // relectura por el mismo camino comparte cualquier error de ese camino; es
      // la regla de `protocolo-de-verificacion.md` sobre concordancia contra
      // procedencia.
      //
      // Y va **adentro** del cuerpo a proposito: si una clave no quedo como se
      // pidio, lo correcto es volver al bombo, no quedarse a mitad.
      console.log('');
      console.log('=== COMPROBACION, RELEYENDO POR HTTP ===');
      const despues = await estadoPorHttpExigido(maquina);
      const fallidas: string[] = [];
      for (const [clave, valor] of destino) {
        const leido = Number(exigirClave(despues, clave));
        const bien = Math.abs(leido - valor) < 1e-9;
        if (!bien) fallidas.push(`${clave}: se escribio ${valor} y se leyo ${leido}`);
        console.log(`  ${bien ? 'OK  ' : 'MAL '} ${clave.padEnd(22)} `
          + `${String(leido).padStart(15)}`);
      }

      console.log('');
      if (fallidas.length > 0) {
        throw new Error(`${fallidas.length} clave(s) no quedaron como se pidio:\n  `
          + `${fallidas.join('\n  ')}`);
      }

      const plano = estaPlano(despues, indice);
      console.log(`el canal ${n} quedo plano segun el mismo criterio que las referencias: `
        + `${plano ? 'SI' : 'NO'}`);
      if (!plano) {
        throw new Error(`las ${destino.length} claves se escribieron bien pero el canal ${n} `
          + `sigue sin pasar la prueba de plano. Algo que este guion no mira lo esta sacando `
          + `de plano.`);
      }

      logrado = true;
    },
  );
} finally {
  await t.desconectar();
}

console.log('');
console.log('=== COMO REPONER EL BOMBO, SI HACE FALTA ===');
console.log('Los valores previos, para escribirlos de vuelta clave por clave:');
for (const [hoja] of CLAVES) console.log(`  i.${indice}.${hoja} = ${previo.get(hoja)}`);
