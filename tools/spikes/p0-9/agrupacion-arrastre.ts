/**
 * La agrupación de un arrastre ajeno, y los dos criterios que tironea.
 *
 * **Qué hace la agrupación y por qué existe.** Cada cambio externo va al
 * registro y a la lista de «últimos cambios» de la aplicación. Un arrastre de
 * fader desde otro dispositivo produce decenas de líneas, y con eso **una sola
 * pasada ajena borra todo el historial reciente** — que es justo lo que el
 * operador iba a mirar para entender qué pasó. Por eso los cambios sobre una
 * misma ruta se juntan en una ventana y se avisa uno solo, con el último valor.
 *
 * **Y acá está lo que esta medición existe para dejar escrito: dos criterios
 * del spike piden cosas opuestas, y la misma constante decide los dos.**
 *
 * - El **criterio 1** pide que cien cambios externos se etiqueten como cien.
 * - El **criterio 5** pide que cuarenta escrituras de un arrastre se avisen como
 *   una.
 *
 * Sobre la **misma ruta**, eso no se puede cumplir a la vez: o se agrupan o no.
 * Lo que decide cuál gana es **el espaciado entre cambios frente a la ventana de
 * agrupación**, y por eso el criterio 1 se midió primero a 120 ms —y dio 1 de
 * 100— y después **se subió el espaciado a 400 ms a propósito** para volver a
 * dar 100. Ese número no es una propiedad de la consola: es una elección de
 * cómo se mide, y quien lea «100 de 100» sin saberlo se lleva una idea falsa.
 *
 * **Esto NO mide la consola.** Mide la aplicación: cuántos avisos emite su
 * almacén ante un mismo tráfico entrante. La consola aparece sólo como la vía
 * por la que ese tráfico llega, desde un segundo cliente que hace de otro
 * operador.
 *
 * **Control positivo, en la misma corrida.** «Cuarenta escrituras dan un aviso»
 * es un resultado que se puede producir también con el almacén roto, sin avisar
 * de nada. El barrido incluye espaciados **mayores** que la ventana, donde los
 * avisos tienen que ser tantos como las escrituras: si ahí tampoco avisa, lo que
 * está roto es el instrumento y no hay nada que concluir.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/agrupacion-arrastre.ts [ip] [canal]
 */
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar } from '@vse/mixer-adapter';
import { estadoPorHttp, exigirCanalesMuertos } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const RUTA = `i.${N}.mix`;

/** La ventana de agrupación que corre en producción, para marcarla en la tabla. */
const VENTANA_AGRUPACION_MS = 250;

/**
 * Espaciados a barrer, a los dos lados de la ventana.
 *
 * Los de abajo de 250 son el arrastre; los de arriba son el control. Sin los de
 * arriba, «un aviso de cuarenta escrituras» no distingue agrupar de no avisar.
 */
const ESPACIADOS = [15, 60, 120, 250, 400, 600];
const ESCRITURAS = 12;

const principal = new Ui24rTransport();
const app = new Ui24rMixerAdapter(principal);

const crudo = new Map<string, number>();
principal.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
});

/** Los avisos de cambio externo que la aplicación emite, que es lo que se mide. */
const avisos: { path: string; valor: number }[] = [];
app.alCambiarExterno((path, valor) => { avisos.push({ path, valor }); });

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const antesHttp = await estadoPorHttp(maquina);
if (antesHttp.size === 0) {
  console.log('no se pudo leer /raw: sin punto de comparacion independiente, no se escribe');
  await app.desconectar();
  process.exit(1);
}
console.log('');
if (!exigirCanalesMuertos(antesHttp, [N])) {
  console.log('ESTE CANAL NO ESTA MUERTO. No se escribe nada.');
  await app.desconectar();
  process.exit(1);
}

const original = crudo.get(RUTA);
if (original === undefined) {
  console.log(`no llego ${RUTA} en el volcado: sin valor de partida no se escribe`);
  await app.desconectar();
  process.exit(1);
}

const punto = await app.guardarInstantanea();
console.log('');
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO — se aborta'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }

// El segundo cliente hace de OTRO OPERADOR, que es lo que de verdad es para la
// consola: esta trata dos sockets del mismo proceso como clientes distintos.
const otro = new Ui24rTransport();
await otro.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));

console.log('');
console.log(`canal ${N + 1} (i.${N}) · ruta ${RUTA} · ${ESCRITURAS} escrituras por vuelta`);
console.log(`ventana de agrupacion de la aplicacion: ${VENTANA_AGRUPACION_MS} ms`);
console.log('');
console.log('espaciado | escrituras | avisos de la app | que criterio cumple');
console.log('----------+------------+------------------+--------------------');

const filas: { espaciado: number; avisos: number }[] = [];
for (const espaciado of ESPACIADOS) {
  avisos.length = 0;
  for (let i = 0; i < ESCRITURAS; i++) {
    otro.enviar(codificarSetd(RUTA, Number((0.10 + i * 0.01).toFixed(6))));
    await new Promise((r) => setTimeout(r, espaciado));
  }
  // Se espera mas que la ventana para que salga el ultimo aviso agrupado.
  await new Promise((r) => setTimeout(r, VENTANA_AGRUPACION_MS + 400));
  const cuantos = avisos.length;
  filas.push({ espaciado, avisos: cuantos });

  const cumple = cuantos === 1 ? 'el 5 (arrastre agrupado)'
    : cuantos === ESCRITURAS ? 'el 1 (cada cambio contado)'
      : 'ninguno de los dos, limpio';
  console.log(
    `${String(espaciado).padStart(6)} ms | ${String(ESCRITURAS).padStart(10)} | `
    + `${String(cuantos).padStart(16)} | ${cumple}`,
  );

  otro.enviar(codificarSetd(RUTA, original));
  await new Promise((r) => setTimeout(r, 500));
}

console.log('');
const agrupados = filas.filter((f) => f.avisos === 1).map((f) => f.espaciado);
const sueltos = filas.filter((f) => f.avisos === ESCRITURAS).map((f) => f.espaciado);
console.log(`espaciados donde ${ESCRITURAS} escrituras dan UN aviso: ${agrupados.join(', ') || 'ninguno'} ms`);
console.log(`espaciados donde dan ${ESCRITURAS} avisos: ${sueltos.join(', ') || 'ninguno'} ms`);
console.log('');

if (sueltos.length === 0) {
  console.log('EL CONTROL FALLO: a ningun espaciado la aplicacion avisa una vez por cambio.');
  console.log('Entonces «un solo aviso» no prueba que agrupe: puede no estar avisando nada,');
  console.log('y de esta corrida no se concluye nada.');
} else if (agrupados.length > 0) {
  console.log('CONFIRMADO, y con control: por debajo de la ventana la aplicacion agrupa el');
  console.log('arrastre en un solo aviso, y por encima cuenta cada cambio. El instrumento');
  console.log('sabe hacer las dos cosas, asi que el uno de arriba es agrupacion y no silencio.');
  console.log('');
  console.log('Y LO QUE HAY QUE LEER DE ACA: los criterios 1 y 5 piden cosas opuestas sobre');
  console.log('la misma ruta, y el espaciado elegido decide cual se cumple. Un «100 de 100»');
  console.log('sin decir a que espaciado se midio no informa nada.');
} else {
  console.log('NO SE VIO AGRUPACION a ningun espaciado por debajo de la ventana.');
  console.log('Mirar la tabla antes de sacar conclusiones.');
}

otro.enviar(codificarSetd(RUTA, original));
await new Promise((r) => setTimeout(r, 800));

console.log('');
const despuesHttp = await estadoPorHttp(maquina);
if (despuesHttp.size === 0) {
  console.log('COMPROBACION POR HTTP: no se pudo releer.');
} else {
  const distintas: string[] = [];
  for (const k of new Set([...antesHttp.keys(), ...despuesHttp.keys()])) {
    if (antesHttp.get(k) !== despuesHttp.get(k)) distintas.push(k);
  }
  console.log(`comprobacion por HTTP, contra el estado previo (${antesHttp.size} claves leidas):`);
  console.log(`  claves que cambiaron: ${distintas.length === 0 ? 'ninguna' : distintas.join(', ')}`);
}

await otro.desconectar();
await app.desconectar();
process.exit(0);
