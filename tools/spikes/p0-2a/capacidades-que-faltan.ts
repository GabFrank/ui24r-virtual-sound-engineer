/**
 * Las seis capacidades que le faltaban al criterio 1 de SPK-P0.2a.
 *
 * El criterio pide dieciséis funciones confirmadas contra el aparato y tenía
 * diez. Faltaban: alimentación fantasma en lectura, silencio de envío auxiliar,
 * los dos puntos de derivación, matriz con el general como fuente, y retardos
 * de salida.
 *
 * **Lo que este guion NO hace, y por qué.** No escribe la alimentación
 * fantasma: INV-007 la deja en solo lectura para la aplicación, y el criterio
 * dice «en lectura» justamente por eso. Tampoco toca `hwoutaux.N.src`, que es
 * el enrutamiento de las salidas físicas: mover eso manda una señal a un jack
 * que uno no ve, y no es lo que pide el criterio. Se lee y se informa.
 *
 * **Cómo se confirma cada escritura.** La consola no le devuelve eco a quien
 * escribió —medido, SPK-P0.1—, así que hace falta una segunda conexión que
 * escuche. Y la comprobación final de que todo quedó como estaba se hace por
 * `GET /raw`, que es HTTP y no pasa por ninguna de las dos conexiones: una
 * comprobación de restauración tiene que leer por un camino distinto del que
 * escribió.
 *
 * **Por qué es seguro correrlo sin nadie en la sala.** Nada suena mientras
 * corre: los envíos auxiliares no van al general, y el general está en silencio
 * porque el único canal con micrófono está silenciado. Un retardo o una matriz
 * sobre silencio no hacen ruido.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-2a/capacidades-que-faltan.ts [ip] [canal]
 */
import { execFileSync } from 'node:child_process';
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';
import { exigirClave } from '../canal-muerto.ts';

const maquina = process.argv[2] ?? '192.168.0.78';
const canal = Number(process.argv[3] ?? '10');
const n = canal - 1;

/** Cuánto se le da al testigo para ver una escritura. Con 34 ms de tic, sobra. */
const ESPERA_MS = 800;

/** Lee TODO el estado por HTTP. Es el camino independiente. */
function leerCrudo(): Map<string, string> {
  let texto = '';
  try {
    texto = execFileSync('curl', ['-s', '--max-time', '8', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // curl sale con 28 porque el flujo no cierra nunca. Los datos ya están.
    texto = String((e as { stdout?: string }).stdout ?? '');
  }
  const m = new Map<string, string>();
  for (const linea of texto.split('\n')) {
    const partes = linea.split('^');
    if ((partes[0] === 'SETD' || partes[0] === 'SETS') && partes[1] !== undefined) {
      m.set(partes[1], (partes[2] ?? '').trim());
    }
  }
  return m;
}

console.log(`consola ${maquina}, canal ${canal}`);
console.log('');

const antes = leerCrudo();
console.log(`estado inicial leido por HTTP: ${antes.size} claves`);
console.log('');

// ---------------------------------------------------------------- 1. fantasma
console.log('== 1. Alimentacion fantasma, EN LECTURA (INV-007: no se escribe) ==');
const fantasmas: string[] = [];
for (let i = 0; i < 20; i++) {
  const v = antes.get(`hw.${i}.phantom`);
  if (v !== undefined) fantasmas.push(`hw.${i}=${v}`);
}
console.log(`  hw.N.phantom: ${fantasmas.join(' ')}`);
const encendidos = fantasmas.filter((f) => f.endsWith('=1'));
console.log(`  encendidos: ${encendidos.length === 0 ? 'ninguno' : encendidos.join(' ')}`);
console.log(`  espejo i.N.phantom del mismo indice: i.8=${antes.get('i.8.phantom')} i.9=${antes.get('i.9.phantom')}`);
console.log(`  var.nophantom=${antes.get('var.nophantom')}  settings.nophantomonboot=${antes.get('settings.nophantomonboot')}`);
console.log('');

// ------------------------------------------------- enrutamiento fisico, lectura
console.log('== Enrutamiento de salidas fisicas, EN LECTURA (no es la matriz) ==');
for (const p of ['hwoutm.0.src', 'hwoutm.1.src', 'hwoutaux.0.src', 'hwoutaux.6.src', 'hwouthp.0.src']) {
  console.log(`  ${p.padEnd(16)} = ${antes.get(p) ?? '(ausente)'}`);
}
console.log('');

// ---------------------------------------------------- conexiones para escribir
const escritor = new Ui24rTransport();
const testigo = new Ui24rTransport();
const visto = new Map<string, { valor: string; enMs: number }>();
testigo.alRecibir((linea) => {
  const p = linea.split('^');
  if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) {
    visto.set(p[1], { valor: (p[2] ?? '').trim(), enMs: Date.now() });
  }
});

await testigo.conectar(maquina);
await escritor.conectar(maquina);
// El testigo recibe el volcado inicial completo al conectarse; hay que dejarlo
// pasar, o cada ruta figuraria como «vista» antes de escribir nada.
await new Promise((r) => setTimeout(r, 3500));

interface Resultado {
  path: string;
  original: number;
  escrito: number;
  confirmado: boolean;
  latenciaMs: number | null;
  leido: string | undefined;
}
const resultados: Resultado[] = [];

async function probar(path: string, nuevo: number): Promise<Resultado> {
  const crudo = antes.get(path);
  const original = Number(crudo ?? '0');
  visto.delete(path);
  const t0 = Date.now();
  escritor.enviar(codificarSetd(path, nuevo));
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  const v = visto.get(path);
  const confirmado = v !== undefined && Math.abs(Number(v.valor) - nuevo) < 1e-6;
  const r: Resultado = {
    path, original, escrito: nuevo, confirmado,
    latenciaMs: v === undefined ? null : v.enMs - t0,
    leido: v?.valor,
  };
  // Restaurar en el acto: si el guion muere despues de esto, la consola queda
  // como estaba y no hay que acordarse de nada.
  visto.delete(path);
  escritor.enviar(codificarSetd(path, original));
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  resultados.push(r);
  return r;
}

function mostrar(r: Resultado): void {
  console.log(
    `  ${r.path.padEnd(22)} ${String(r.original).padStart(12)} -> ${String(r.escrito).padStart(12)}  `
    + `${r.confirmado ? 'confirmado' : `NO (testigo dijo ${r.leido ?? 'nada'})`}`
    + `${r.latenciaMs === null ? '' : `, ${r.latenciaMs} ms`}`,
  );
}

// ----------------------------------------- 2. silencio del envio auxiliar
console.log('== 2. Silencio de envio auxiliar ==');
const muteAux = Number(antes.get(`i.${n}.aux.0.mute`) ?? '0');
mostrar(await probar(`i.${n}.aux.0.mute`, muteAux === 0 ? 1 : 0));
console.log('');

// ------------------------------------------------- 3 y 4. puntos de derivacion
console.log('== 3 y 4. Los dos puntos de derivacion del envio auxiliar ==');
console.log('  .post     = antes o despues del fader');
console.log('  .postproc = antes o despues del procesamiento del canal');
const post = Number(antes.get(`i.${n}.aux.0.post`) ?? '0');
mostrar(await probar(`i.${n}.aux.0.post`, post === 0 ? 1 : 0));
const postproc = Number(antes.get(`i.${n}.aux.0.postproc`) ?? '0');
mostrar(await probar(`i.${n}.aux.0.postproc`, postproc === 0 ? 1 : 0));
console.log('');
console.log('  Y el ajuste GLOBAL, que es el criterio 4 del charter:');
console.log(`    settings.auxsendpoint = ${antes.get('settings.auxsendpoint')}`);
console.log(`    settings.mtxsendpoint = ${antes.get('settings.mtxsendpoint')}`);
// **Se exige la clave en vez de suponerla.** Un `?? valor` antes de una
// escritura no es un valor por omision: es una suposicion disfrazada de
// lectura, y con una lectura HTTP fallida --que devuelve un mapa vacio--
// restauraba la consola a un numero inventado. Auditoria del 2026-09-12.
const global = Number(exigirClave(antes, 'settings.auxsendpoint'));
if (global === 0 || global === 1) {
  // La pregunta del criterio 4 no es si se puede escribir, sino QUE le hace a
  // las rutas por envio. Se anota que rutas difunde la consola al cambiarlo.
  const marca = Date.now();
  visto.clear();
  const nuevoGlobal = global === 0 ? 1 : 0;
  escritor.enviar(codificarSetd('settings.auxsendpoint', nuevoGlobal));
  await new Promise((r) => setTimeout(r, 1500));
  const arrastradas = [...visto.entries()]
    .filter(([k, v]) => v.enMs >= marca && k !== 'settings.auxsendpoint')
    .map(([k]) => k)
    .filter((k) => !k.startsWith('var.'));
  console.log(`    al cambiarlo, la consola difundio ${arrastradas.length} rutas mas`
    + `${arrastradas.length === 0 ? ' -> el ajuste global NO reescribe las rutas por envio'
      : `: ${arrastradas.slice(0, 12).join(' ')}${arrastradas.length > 12 ? ' ...' : ''}`}`);
  // La confirmacion se MIDE, como todas las demas. Acá estuvo escrita a mano
  // --`confirmado: true`-- durante una corrida entera, y el resumen dijo «9 de
  // 9» con una fila que nadie habia comprobado. Un contador que suma un dato
  // inventado es peor que no tener contador: se lee igual de bien.
  const vistoGlobal = visto.get('settings.auxsendpoint');
  escritor.enviar(codificarSetd('settings.auxsendpoint', global));
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  resultados.push({
    path: 'settings.auxsendpoint',
    original: global,
    escrito: nuevoGlobal,
    confirmado: vistoGlobal !== undefined && Number(vistoGlobal.valor) === nuevoGlobal,
    latenciaMs: vistoGlobal === undefined ? null : vistoGlobal.enMs - marca,
    leido: vistoGlobal?.valor,
  });
  mostrar(resultados[resultados.length - 1]!);
} else {
  console.log('    valor inesperado: no se toca');
}
console.log('');

// --------------------------------------- 5. matriz con el general como fuente
console.log('== 5. Matriz con el general como fuente ==');
console.log('  La matriz NO es hwoutaux.N.src (eso es el jack fisico).');
console.log('  Es m.mtx.M.*: el general como fuente, hacia el destino M.');
mostrar(await probar('m.mtx.0.value', 0.3));
mostrar(await probar('m.mtx.0.mute', Number(antes.get('m.mtx.0.mute') ?? '0') === 0 ? 1 : 0));
const conMtx = [...antes.keys()].filter((k) => /^[a-z]+\.?\d*\.mtx\.0\.value$/.test(k)).sort();
console.log(`  fuentes que tienen envio a la matriz: ${conMtx.map((k) => k.replace('.mtx.0.value', '')).join(' ')}`);
const sinPostproc = conMtx.filter((k) => !antes.has(k.replace('.value', '.postproc')));
console.log(`  de esas, SIN punto de derivacion propio: ${sinPostproc.length === 0 ? 'ninguna' : sinPostproc.map((k) => k.replace('.mtx.0.value', '')).join(' ')}`);
console.log('');

// ------------------------------------------------------ 6. retardos de salida
console.log('== 6. Retardos de salida ==');
mostrar(await probar('m.delayL', 0.25));
mostrar(await probar('m.delayR', 0.25));
mostrar(await probar('a.0.delay', 0.25));
console.log('');

await escritor.desconectar();
await testigo.desconectar();

// --------------------------------------------- la restauracion, por otro camino
console.log('== Restauracion, comprobada por HTTP (ni el escritor ni el testigo) ==');
await new Promise((r) => setTimeout(r, 1200));
const despues = leerCrudo();
let malas = 0;
for (const r of resultados) {
  const ahora = despues.get(r.path);
  const igual = ahora !== undefined && Math.abs(Number(ahora) - r.original) < 1e-6;
  if (!igual) malas++;
  console.log(`  ${r.path.padEnd(22)} era ${String(r.original).padStart(12)}, quedo ${String(ahora).padStart(12)}  ${igual ? 'ok' : '<-- NO RESTAURADO'}`);
}
console.log('');

const confirmadas = resultados.filter((r) => r.confirmado).length;
console.log(`escrituras confirmadas por el testigo: ${confirmadas} de ${resultados.length}`);
console.log(`rutas restauradas: ${resultados.length - malas} de ${resultados.length}`);
const lats = resultados.map((r) => r.latenciaMs).filter((x): x is number => x !== null).sort((a, b) => a - b);
if (lats.length > 0) {
  console.log(`latencia de difusion: mediana ${lats[Math.floor(lats.length / 2)]} ms, minimo ${lats[0]}, maximo ${lats[lats.length - 1]}`);
}
process.exit(malas === 0 ? 0 : 1);
