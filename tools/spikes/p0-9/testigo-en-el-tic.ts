/**
 * Qué ve el testigo cuando dos escrituras caen en el mismo tic.
 *
 * **La pregunta.** La consola difunde en un tic de ~34 ms y manda el **último**
 * valor de la ventana —medido en `cadencia-difusion`—. Si se escribe A y
 * después B sobre la misma ruta dentro de ese tic, sale una sola línea con B, y
 * el testigo que espera A **no la ve nunca**. Eso convierte una escritura
 * aplicada en un vencimiento, y un parámetro sin confirmar es inelegible: la
 * aplicación se auto-bloquearía por un éxito.
 *
 * **Se mide en vez de deducirlo** porque la deducción tiene un supuesto
 * escondido: que la consola aplica A antes de sobrescribirlo con B. Si no lo
 * hiciera, A nunca ocurrió y no hay nada que confirmar — que es una respuesta
 * distinta y también hay que saberla.
 *
 * **Y lleva su control positivo, que la primera versión no tenía.** «El testigo
 * no vio A» es un resultado nulo, y un nulo sin control no vale: podría ser que
 * el testigo **no pueda** ver A nunca —por cómo empareja valores, por cómo se
 * arman las dos esperas, por un redondeo del crudo—. Así que la segunda vuelta
 * es la misma escritura con una pausa mayor que el tic entre A y B. Si ahí A se
 * ve, entonces el instrumento **sí puede** verla, y el cero de la primera vuelta
 * es del aparato y no del arnés.
 *
 * **Esta corrida reemplaza a una transcripción.** La del 2026-09-10 se archivó
 * a mano porque `medir.mjs` todavía no existía; su guion no quedó en el árbol.
 * Éste es el mismo experimento, escrito de nuevo sobre el molde que el
 * proyecto usa ahora: enumerar el canal antes de escribir, y comparar la
 * consola entera después, todo dentro del archivo de evidencia.
 *
 * **Qué toca.** Sólo `i.N.mix`, el fader. No desilencia ni sube ganancia, así
 * que alcanza con que el canal esté callado: silenciado, fader al fondo y sin
 * envíos abiertos.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/testigo-en-el-tic.ts [ip] [canal]
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, TestigoDeEscrituras, codificarSetd, decodificar,
  comandoBorrar,
} from '@vse/mixer-adapter';
import { estadoPorHttp, exigirCanalesMuertos } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const RUTA = `i.${N}.mix`;
const VENTANA_MS = 500;

/** Cuántas veces se repite el experimento. Uno solo no distingue de la suerte. */
const VUELTAS = 10;

const principal = new Ui24rTransport();
const a = new Ui24rMixerAdapter(principal);

const crudo = new Map<string, number>();
/**
 * Cuantas lineas difunde la consola para la ruta, por vuelta.
 *
 * **Es el dato que prueba que la PRIMERA escritura se aplico**, y la primera
 * version de este guion lo dejo afuera. Que el testigo no vea A admite dos
 * lecturas --la consola colapso la difusion, o la consola nunca aplico A-- y
 * solo se separan contando lineas: si de dos escrituras sale UNA linea con el
 * valor de B, hubo colapso; si sale una linea y el valor final es el de A, la
 * segunda no se aplico.
 *
 * La transcripcion vieja traia esta columna y la remedicion la perdio: era
 * estrictamente mas pobre que lo que reemplazaba. Lo marco una auditoria.
 */
let difundidas: { valor: number; enMs: number }[] = [];
principal.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
});

await a.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const antesHttp = await estadoPorHttp(maquina);
if (antesHttp.size === 0) {
  console.log('no se pudo leer /raw: sin punto de comparacion independiente, no se escribe');
  await a.desconectar();
  process.exit(1);
}
console.log('');
if (!exigirCanalesMuertos(antesHttp, [N])) {
  console.log('ESTE CANAL NO ESTA MUERTO. No se escribe nada.');
  await a.desconectar();
  process.exit(1);
}

const original = crudo.get(RUTA);
if (original === undefined) {
  console.log(`no llego ${RUTA} en el volcado: sin valor de partida no se escribe`);
  await a.desconectar();
  process.exit(1);
}

const punto = await a.guardarInstantanea();
console.log('');
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO — se aborta'}`);
if (punto === null) { await a.desconectar(); process.exit(1); }

const t2 = new Ui24rTransport();
// **Se cuenta en el socket DEL TESTIGO, no en el de la principal.**
//
// Primer intento: se contaba en la principal, y dio «(ninguna)» las diez
// vueltas. Es correcto y esta medido desde el 2026-09-08: LA CONSOLA NO LE
// DEVUELVE LA ESCRITURA A QUIEN LA HIZO. La principal es la que escribe, asi
// que no ve nada; el unico que ve la difusion es el segundo socket.
//
// El guion no concluyo de mas cuando eso paso: su veredicto dijo «OJO: no todas
// las vueltas dieron una sola linea». Un guion que solo sabe decir «confirmado»
// habria publicado una conclusion sobre una columna vacia.
t2.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD' && m.path === RUTA) difundidas.push({ valor: m.valor, enMs: Date.now() });
});
const testigo = new TestigoDeEscrituras(t2);
await testigo.conectar(maquina);
if (!testigo.listoParaAtestiguar) {
  console.log('el testigo no quedo listo; se aborta antes de escribir nada');
  await a.desconectar();
  process.exit(1);
}

console.log('');
console.log(`canal ${N + 1} (i.${N}) · ruta ${RUTA} · ventana del testigo: ${VENTANA_MS} ms`);
console.log(`valor de partida: ${original}`);
console.log('');
console.log('vuelta | A      | B      | vio A | vio B | lineas | valores difundidos');
console.log('-------+--------+--------+-------+-------+--------+-------------------');

const filas: { vioA: boolean; vioB: boolean; lineas: number }[] = [];
for (let i = 0; i < VUELTAS; i++) {
  // Dos valores distintos entre si y del original, y los dos lejos del fondo
  // para que no se confundan con el silencio.
  const A = Number((0.10 + i * 0.01).toFixed(6));
  const B = Number((0.30 + i * 0.01).toFixed(6));

  // **Las dos esperas se arman ANTES de escribir**, las dos: si se arma la de B
  // despues de mandar B, se pierde la carrera contra los 0 ms de latencia que
  // esta consola llego a dar.
  const esperaA = testigo.esperar(RUTA, A, VENTANA_MS);
  const esperaB = testigo.esperar(RUTA, B, VENTANA_MS);

  difundidas = [];
  // A y B **sin esperar nada en el medio**: lo que se quiere es que caigan en el
  // mismo tic de ~34 ms.
  principal.enviar(codificarSetd(RUTA, A));
  principal.enviar(codificarSetd(RUTA, B));

  const vioA = await esperaA.visto;
  const vioB = await esperaB.visto;
  const vistas = difundidas.map((d) => d.valor);
  filas.push({ vioA, vioB, lineas: vistas.length });
  console.log(
    `${String(i + 1).padStart(6)} | ${A.toFixed(4)} | ${B.toFixed(4)} | `
    + `${(vioA ? 'SI' : 'no').padEnd(5)} | ${(vioB ? 'SI' : 'no').padEnd(5)} | `
    + `${String(vistas.length).padStart(6)} | ${vistas.map((v) => v.toFixed(4)).join(' > ') || '(ninguna)'}`,
  );

  // Se devuelve al original entre vueltas, para que cada una arranque igual.
  principal.enviar(codificarSetd(RUTA, original));
  await new Promise((r) => setTimeout(r, 400));
}

const vioA = filas.filter((f) => f.vioA).length;
const vioB = filas.filter((f) => f.vioB).length;
const unaLinea = filas.filter((f) => f.lineas === 1).length;
console.log('');
console.log(`el testigo vio A: ${vioA} de ${VUELTAS}`);
console.log(`el testigo vio B: ${vioB} de ${VUELTAS}`);
console.log(`vueltas donde la consola difundio UNA sola linea: ${unaLinea} de ${VUELTAS}`);

// ---------------------------------------------- control positivo: con pausa
console.log('');
console.log('== Control positivo: las mismas escrituras, separadas por mas que el tic ==');
console.log('Si aca A se ve, el instrumento PUEDE verla y el cero de arriba es del aparato.');
console.log('');
console.log('vuelta | A      | B      | testigo vio A | testigo vio B');
console.log('-------+--------+--------+---------------+--------------');

/** Mas que el tic de ~34 ms, con margen: que las dos caigan en ventanas distintas. */
const PAUSA_MS = 150;
const control: { vioA: boolean; vioB: boolean }[] = [];
for (let i = 0; i < VUELTAS; i++) {
  const A = Number((0.10 + i * 0.01).toFixed(6));
  const B = Number((0.30 + i * 0.01).toFixed(6));

  const esperaA = testigo.esperar(RUTA, A, VENTANA_MS);
  principal.enviar(codificarSetd(RUTA, A));
  const vA = await esperaA.visto;

  await new Promise((r) => setTimeout(r, PAUSA_MS));

  const esperaB = testigo.esperar(RUTA, B, VENTANA_MS);
  principal.enviar(codificarSetd(RUTA, B));
  const vB = await esperaB.visto;

  control.push({ vioA: vA, vioB: vB });
  console.log(
    `${String(i + 1).padStart(6)} | ${A.toFixed(4)} | ${B.toFixed(4)} | `
    + `${(vA ? 'SI' : 'no').padEnd(13)} | ${vB ? 'SI' : 'no'}`,
  );
  principal.enviar(codificarSetd(RUTA, original));
  await new Promise((r) => setTimeout(r, 400));
}
const ctrlA = control.filter((f) => f.vioA).length;
const ctrlB = control.filter((f) => f.vioB).length;
console.log('');
console.log(`con pausa de ${PAUSA_MS} ms -- el testigo vio A: ${ctrlA} de ${VUELTAS}`);
console.log(`con pausa de ${PAUSA_MS} ms -- el testigo vio B: ${ctrlB} de ${VUELTAS}`);
console.log('');
if (ctrlA === 0) {
  console.log('EL CONTROL FALLO: el testigo tampoco ve A con pausa, asi que NO SE PUEDE');
  console.log('concluir nada del cero de arriba. El instrumento no sabe ver esa escritura,');
  console.log('y el experimento no mide lo que dice medir.');
} else if (vioA === 0 && vioB === VUELTAS && ctrlA === VUELTAS) {
  console.log('CONFIRMADO, y con control: pegadas, el testigo solo ve la segunda; separadas');
  console.log('por mas que el tic, ve las dos. O sea que el cero NO es del arnes.');
  console.log('');
  if (unaLinea === VUELTAS) {
    console.log(`Y la consola difundio UNA sola linea las ${VUELTAS} vueltas, con el valor de B.`);
    console.log('O sea COLAPSO, no descarte: recibio las dos y difundio la ultima.');
  } else {
    console.log('OJO: no todas las vueltas dieron una sola linea. Mirar la columna antes de');
    console.log('decir «colapso»: con dos lineas no hubo colapso y el testigo fallo por otra cosa.');
  }
  console.log('');
  console.log('LO QUE ESTO NO MIDE, y hay que decirlo: si la consola APLICO A antes de');
  console.log('sobrescribirlo. Difundir una sola linea es compatible con las dos historias.');
  console.log('Para separarlas hace falta leer el estado entre las dos escrituras, y eso');
  console.log('no se puede hacer sin meter una espera que rompa el mismo tic que se mide.');
} else if (vioA === VUELTAS) {
  console.log('LAS DOS SE VEN PEGADAS: el tic no colapsa escrituras, o no cayeron en el mismo tic.');
} else {
  console.log('RESULTADO MIXTO: mirar las dos tablas antes de sacar conclusiones.');
}

principal.enviar(codificarSetd(RUTA, original));
await new Promise((r) => setTimeout(r, 600));

console.log('');
const despuesHttp = await estadoPorHttp(maquina);
if (despuesHttp.size === 0) {
  console.log('COMPROBACION POR HTTP: no se pudo releer. La restauracion queda sin verificar por fuera.');
} else {
  const distintas: string[] = [];
  for (const k of new Set([...antesHttp.keys(), ...despuesHttp.keys()])) {
    if (antesHttp.get(k) !== despuesHttp.get(k)) distintas.push(k);
  }
  console.log(`comprobacion por HTTP, contra el estado previo (${antesHttp.size} claves leidas):`);
  console.log(`  claves que cambiaron: ${distintas.length === 0 ? 'ninguna' : distintas.join(', ')}`);
}

// **El punto de retorno se borra, y la primera version no lo hacia.**
//
// Cada corrida dejaba una automatica en el show de la aplicacion, consumiendo
// una plaza del tope de veinte. La comprobacion por HTTP no puede verlo porque
// `/raw` no lista instantaneas: hay que pedir SNAPSHOTLIST. Una corrida que se
// limpia «salvo por una cosa que su propia comprobacion no mira» no se limpia.
const orden = comandoBorrar(punto);
if (orden === null) {
  console.log(`  el punto ${punto} no se pudo construir para borrar: queda en la consola`);
} else {
  principal.enviar(orden);
  await new Promise((r) => setTimeout(r, 800));
  console.log(`  punto de retorno borrado: ${punto}`);
}

await testigo.cerrar();
await a.desconectar();
process.exit(0);
