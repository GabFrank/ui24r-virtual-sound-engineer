/**
 * ¿La consola le devuelve al que guardó el cambio de `var.currentSnapshot`?
 *
 * **Por qué esto es urgente.** El 2026-09-10 se arregló que el almacén
 * confirmado reconozca el `SETS` de `var.currentSnapshot`, porque esa rama de
 * INV-021 era inalcanzable. Pero guardar una instantánea **mueve ese puntero**,
 * y la aplicación guarda una **antes de cada escritura** por INV-001.
 *
 * Si la consola le difunde ese cambio a quien lo provocó, el arreglo de hoy
 * hace que la aplicación **se invalide a sí misma en cada escritura**: el cartel
 * diría «alguien recuperó una instantánea en la consola» culpando a un operador
 * que no existe, `otroOperador()` informaría presencia inventada, y toda
 * escritura posterior saldría `CONFLICT`. Sería un arreglo que rompe más de lo
 * que arregla.
 *
 * **Lo medido el 2026-09-08 no alcanza para descartarlo.** Ahí se midió que la
 * consola no devuelve un `SETD` de parámetro a quien lo escribió, sobre
 * `i.9.mute` y `i.9.mix`. Acá hay dos diferencias: es un `SETS`, y no es una
 * escritura sino el **efecto colateral de un comando**. Ninguna de las dos se
 * probó.
 *
 * **Una sola conexión, a propósito.** La pregunta es qué ve el que guardó.
 * Abrir un testigo contestaría la pregunta de al lado, que ya está contestada.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-8/eco-del-puntero.ts [ip]
 */
import {
  Ui24rTransport, nombreDeInstantanea, comandoCrearShow, comandoGuardar,
  comandoListar, comandoBorrar, instantaneasDeLaLista,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const recibido: { linea: string; enMs: number }[] = [];
let anotando = false;
const listas: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith('SNAPSHOTLIST^')) listas.push(l);
  if (l.startsWith('VU2^') || l.startsWith('RTA^')) return;
  if (anotando) recibido.push({ linea: l.split('^').slice(0, 3).join('^'), enMs: Date.now() });
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));   // que pase el volcado inicial

t.enviar(comandoCrearShow());
await new Promise((r) => setTimeout(r, 800));

const nombre = nombreDeInstantanea(Date.now());
console.log(`consola ${maquina}, una sola conexion`);
console.log(`guardando ${nombre} y escuchando 4 s por esta misma conexion`);
console.log('');

anotando = true;
const t0 = Date.now();
t.enviar(comandoGuardar(nombre));
await new Promise((r) => setTimeout(r, 4000));
anotando = false;

const puntero = recibido.filter((r) => r.linea.includes('var.currentSnapshot'));
console.log(`lineas recibidas tras guardar: ${recibido.length}`);
for (const r of recibido.slice(0, 15)) console.log(`  +${String(r.enMs - t0).padStart(5)} ms  ${r.linea}`);
if (recibido.length > 15) console.log(`  ... y ${recibido.length - 15} mas`);
console.log('');
console.log(`lineas de var.currentSnapshot: ${puntero.length}`);
for (const r of puntero) console.log(`  +${r.enMs - t0} ms  ${r.linea}`);

// Dejar el show como estaba.
const borrar = comandoBorrar(nombre);
if (borrar !== null) {
  t.enviar(borrar);
  await new Promise((r) => setTimeout(r, 1200));
  listas.length = 0;
  t.enviar(comandoListar());
  await new Promise((r) => setTimeout(r, 1500));
  const quedan = listas.flatMap((l) => instantaneasDeLaLista(l));
  console.log('');
  console.log(`instantanea borrada: ${quedan.includes(nombre) ? 'NO' : 'si'}  (quedan ${quedan.length})`);
}
await t.desconectar();

console.log('');
if (puntero.length > 0) {
  console.log('LA CONSOLA SE LO DEVUELVE AL QUE GUARDO.');
  console.log('El arreglo de INV-021 hace que la aplicacion se invalide sola en cada escritura.');
  process.exit(1);
} else {
  console.log('NO se lo devuelve. El arreglo de INV-021 no se dispara solo al guardar.');
  console.log('Ojo con el alcance: esto dice que NO llega por la conexion que guardo.');
}
