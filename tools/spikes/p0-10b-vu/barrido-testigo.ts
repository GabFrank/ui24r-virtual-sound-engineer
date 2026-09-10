/**
 * Que difunde la consola, ruta por ruta, medido con el testigo.
 *
 * **Por que existe.** La politica de confirmacion dice que el testigo cubre
 * «todo lo que la consola difunda», y eso estaba comprobado en TRES RUTAS:
 * i.9.mute, i.9.mix e i.9.pan. El criterio 1 de SPK-ACK-POLICY pide la tabla
 * parametro a metodo para la matriz entera, y una tabla escrita a mano diria
 * «se supone que si» en casi todas las filas. Esto la convierte en medicion.
 *
 * **Como.** Por cada ruta: se lee el valor actual del volcado, se escribe una
 * delta chica, se le pregunta al testigo si la vio dentro de la ventana, y se
 * restaura. Al final se relee todo y se compara contra lo de antes.
 *
 * **Sobre que canal.** El 17 --i.16--: SIN NOMBRE, SILENCIADO y con el fader
 * abajo. Un canal silenciado no puede sonar por mas que le escribamos, asi que
 * el peor caso de un fallo a mitad de camino es un parametro raro en un canal
 * que no esta en uso, y no un ruido en medio de un show.
 *
 * **Punto de retorno.** Se guarda una instantanea nuestra antes de escribir
 * nada, como manda INV-001, en el show VSE. No se toca ningun show del usuario.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/barrido-testigo.ts
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, TestigoDeEscrituras, codificarSetd, decodificar,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');   // canal 17
const VENTANA_MS = 500;

/**
 * Las rutas del barrido, con una delta que no cambia nada audible.
 *
 * Se eligen las que la aplicacion podria querer escribir algun dia y las que
 * la matriz marca como CONFIRMADAS sin haberlas visto difundir. Quedan fuera a
 * proposito: `hw.N.phantom` --INV-007, solo lectura, y ademas puede danar un
 * microfono de cinta--, `i.N.solo` --suena en los auriculares de alguien-- y
 * todo lo que sea de otro canal o del general.
 */
const RUTAS: { path: string; delta: number }[] = [
  { path: `i.${N}.mix`, delta: 0.02 },
  { path: `i.${N}.pan`, delta: 0.05 },
  { path: `i.${N}.mute`, delta: 0 },          // booleano: se invierte
  { path: `i.${N}.invert`, delta: 0 },
  { path: `i.${N}.delay`, delta: 0.02 },
  { path: `i.${N}.aux.0.value`, delta: 0.02 },
  { path: `i.${N}.aux.0.mute`, delta: 0 },
  { path: `i.${N}.aux.0.post`, delta: 0 },
  { path: `i.${N}.eq.b1.gain`, delta: 0.03 },
  { path: `i.${N}.eq.b1.freq`, delta: 0.02 },
  { path: `i.${N}.eq.hpf.freq`, delta: 0.02 },
  { path: `i.${N}.dyn.threshold`, delta: 0.03 },
  { path: `i.${N}.gate.thresh`, delta: 0.03 },
  { path: `i.${N}.deesser.threshold`, delta: 0.03 },
  { path: `hw.${N}.gain`, delta: 0.02 },
  { path: `hw.${N}.hiz`, delta: 0 },
  { path: `i.${N}.safe`, delta: 0 },
  { path: `i.${N}.mtkrec`, delta: 0 },
];

const principal = new Ui24rTransport();
const a = new Ui24rMixerAdapter(principal);

/**
 * El estado crudo se lleva aca y no se le pide al adaptador.
 *
 * El adaptador expone su estado ya interpretado --dB, booleanos--, y para
 * restaurar hace falta EL MISMO NUMERO CRUDO que la consola tenia, no su
 * traduccion: una ida y vuelta por la ley del fader deja un valor parecido y no
 * identico, y «parecido» no es restaurar.
 */
const crudo = new Map<string, number>();
principal.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
});

const leer = (path: string): number | null => crudo.get(path) ?? null;

// Recien ahora se conecta: el oyente tiene que estar puesto ANTES, o el volcado
// --que es de donde salen todos los valores de partida-- pasa sin que nadie lo
// anote y el barrido arranca sin saber a que restaurar.
await a.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

// Punto de retorno antes de la primera escritura, como manda INV-001. Va
// DESPUES de conectar: la primera version lo pedia antes y devolvia null
// siempre, o sea que el barrido se abortaba solo. Un punto de retorno que se
// pide sobre una conexion que no existe no es una precaucion, es una linea.
const punto = await a.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO — se aborta'}`);
if (punto === null) { await a.desconectar(); process.exit(1); }

// El testigo se conecta POR SU METODO, no por el del transporte. La primera
// version llamaba a t2.conectar() directamente y el resultado fue 0 de 18: el
// testigo nunca se suscribio a nada y quedo diciendo que no vio ninguna
// escritura. Un testigo mal arrancado no falla, ATESTIGUA QUE NO PASO NADA, que
// es la respuesta mas convincente y la mas equivocada.
const t2 = new Ui24rTransport();
const testigo = new TestigoDeEscrituras(t2);
await testigo.conectar(maquina);
if (!testigo.listoParaAtestiguar) {
  console.log('el testigo no quedo listo; se aborta antes de escribir nada');
  await a.desconectar();
  process.exit(1);
}

console.log('');
console.log('ruta                          | antes    | escrito  | testigo | ms   | restaurada');
console.log('------------------------------+----------+----------+---------+------+-----------');

const filas: { path: string; visto: boolean; ms: number; restaurada: boolean; antes: number | null }[] = [];

for (const { path, delta } of RUTAS) {
  const antes = leer(path);
  if (antes === null) {
    console.log(`${path.padEnd(29)} | ${'no esta'.padEnd(8)} | ${'—'.padEnd(8)} | ${'—'.padEnd(7)} | —    | —`);
    filas.push({ path, visto: false, ms: 0, restaurada: true, antes: null });
    continue;
  }
  // Un booleano se invierte; un continuo se mueve una delta y se acota a [0,1].
  const nuevo = delta === 0 ? (antes === 0 ? 1 : 0) : Math.min(1, Math.max(0, antes + delta));
  if (nuevo === antes) {
    console.log(`${path.padEnd(29)} | ${antes.toFixed(4).padEnd(8)} | ${'sin margen'.padEnd(8)} | ${'—'.padEnd(7)} | —    | —`);
    filas.push({ path, visto: false, ms: 0, restaurada: true, antes });
    continue;
  }

  const t0 = Date.now();
  const promesa = testigo.esperar(path, nuevo, VENTANA_MS);
  principal.enviar(codificarSetd(path, nuevo));
  const visto = await promesa;
  const ms = Date.now() - t0;

  // Restaurar SIEMPRE, haya visto o no: lo que importa es dejar la consola
  // como estaba, no que la medicion salga linda.
  principal.enviar(codificarSetd(path, antes));
  await new Promise((r) => setTimeout(r, 250));
  const ahora = leer(path);
  const restaurada = ahora !== null && Math.abs(ahora - antes) < 1e-6;

  console.log(
    `${path.padEnd(29)} | ${antes.toFixed(4).padEnd(8)} | ${nuevo.toFixed(4).padEnd(8)} | `
    + `${(visto ? 'SI' : 'no').padEnd(7)} | ${String(visto ? ms : '—').padEnd(4)} | ${restaurada ? 'si' : '¡NO!'}`,
  );
  filas.push({ path, visto, ms, restaurada, antes });
}

const utiles = filas.filter((f) => f.antes !== null);
const vistas = utiles.filter((f) => f.visto);
const sinRestaurar = filas.filter((f) => !f.restaurada);
const tiempos = vistas.map((f) => f.ms).sort((x, y) => x - y);

console.log('');
console.log(`rutas con valor: ${utiles.length} de ${RUTAS.length}`);
console.log(`difundidas y vistas por el testigo: ${vistas.length} de ${utiles.length}`);
if (tiempos.length > 0) {
  console.log(`latencia del testigo: mediana ${tiempos[Math.floor(tiempos.length / 2)]} ms, minimo ${tiempos[0]}, maximo ${tiempos[tiempos.length - 1]}`);
}
console.log(`sin restaurar: ${sinRestaurar.length === 0 ? 'ninguna' : sinRestaurar.map((f) => f.path).join(', ')}`);

await testigo.cerrar();
await a.desconectar();
process.exit(sinRestaurar.length === 0 ? 0 : 1);
