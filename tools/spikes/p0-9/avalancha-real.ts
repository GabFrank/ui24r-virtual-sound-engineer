/**
 * La avalancha, contra la consola y no contra el simulador.
 *
 * **Por qué hacía falta.** El criterio 4 de SPK-P0.9 figuraba probado, y lo
 * estaba: la captura `06-cambio-masivo.png` muestra el cartel funcionando. Pero
 * contra el **simulador**, que dispara la avalancha porque nosotros le pedimos
 * que la dispare. Eso prueba que la pantalla dibuja el aviso; no prueba que el
 * detector reconozca una avalancha real llegando por el socket. Son dos cosas
 * distintas y el acta las tenía por una sola.
 *
 * **Cómo se produce una de verdad.** Hacen falta dos clientes. La consola no le
 * devuelve la escritura a quien la hizo —medido, SPK-P0.1— así que un solo
 * proceso escribiendo no genera nada que él mismo pueda ver. Con dos, el
 * segundo hace de «otro operador»: escribe muchas rutas seguidas y la consola
 * se las difunde al primero, que es el que corre el detector.
 *
 * **Qué rutas se tocan, y por qué esas.** Los canales 21 a 24 tienen `i.N.src`
 * en `none` y están silenciados: no hay nada enchufado ni nada que pueda sonar
 * por ellos. Se usan cuatro rutas de cada uno —panorama, fader y dos envíos
 * auxiliares— para llegar a las dieciséis rutas distintas que hacen falta para
 * pasar el umbral de diez. **Nada de esto puede hacer ruido**, ni siquiera con
 * alguien en la sala.
 *
 * Cada vuelta restaura lo que tocó, y al final se comprueba por `GET /raw` —que
 * no es ninguna de las dos conexiones— que todo quedó como estaba.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/avalancha-real.ts [ip] [vueltas]
 */
import { execFileSync } from 'node:child_process';
import {
  Ui24rTransport, ConfirmedStateStore, codificarSetd, decodificar,
} from '@vse/mixer-adapter';
import type { BulkExternalChange } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const VUELTAS = Number(process.argv[3] ?? '10');

/** Canales sin fuente y silenciados: nada de lo que se escriba acá puede sonar. */
const CANALES = [20, 21, 22, 23];
const RUTAS = CANALES.flatMap((n) => [
  `i.${n}.pan`, `i.${n}.mix`, `i.${n}.aux.0.value`, `i.${n}.aux.1.value`,
]);

function leerCrudo(): Map<string, string> {
  let texto = '';
  try {
    texto = execFileSync('curl', ['-s', '--max-time', '8', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    texto = String((e as { stdout?: string }).stdout ?? '');
  }
  const m = new Map<string, string>();
  for (const linea of texto.split('\n')) {
    const p = linea.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) m.set(p[1], (p[2] ?? '').trim());
  }
  return m;
}

const antes = leerCrudo();
const originales = new Map<string, number>();
for (const r of RUTAS) originales.set(r, Number(antes.get(r) ?? '0'));

console.log(`consola ${maquina}, ${VUELTAS} vueltas`);
console.log(`rutas por vuelta: ${RUTAS.length} distintas, sobre los canales ${CANALES.map((n) => n + 1).join(', ')}`);
console.log(`umbral del detector: 10 rutas distintas en 1000 ms`);
console.log('');
for (const r of RUTAS.slice(0, 4)) console.log(`  ${r} = ${antes.get(r)}`);
console.log('  ...');
console.log('');

// La aplicacion: escucha por la principal y corre el detector.
const app = new Ui24rTransport();
const store = new ConfirmedStateStore();
let avisos: BulkExternalChange[] = [];
store.alCambioMasivo((e) => { avisos.push(e); });
app.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD') store.aplicar(m.path, m.valor);
});

// El otro operador.
const otro = new Ui24rTransport();

await app.conectar(maquina);
await otro.conectar(maquina);
// El volcado inicial que recibe la aplicacion al conectarse ES una avalancha
// legitima --seis mil rutas de golpe-- y dispararia el detector antes de que
// empiece la prueba. Se deja pasar y se limpia la cuenta.
await new Promise((r) => setTimeout(r, 4000));
avisos = [];

console.log('vuelta | rutas escritas | aviso | rutas que vio el detector | causa            | ms');

let detectadas = 0;
const rutasVistas: number[] = [];

for (let v = 1; v <= VUELTAS; v++) {
  avisos = [];
  const t0 = Date.now();
  // Todas de golpe: la avalancha es «muchas rutas en poco tiempo», no muchos
  // mensajes sobre una.
  for (const r of RUTAS) {
    const base = originales.get(r) ?? 0;
    otro.enviar(codificarSetd(r, base > 0.5 ? base - 0.2 : base + 0.2));
  }
  await new Promise((r) => setTimeout(r, 1400));

  const aviso = avisos[0];
  if (aviso !== undefined) { detectadas++; rutasVistas.push(aviso.rutasAfectadas); }
  console.log(
    `${String(v).padStart(6)} | ${String(RUTAS.length).padStart(14)} | `
    + `${(aviso === undefined ? 'NO' : 'si').padEnd(5)} | `
    + `${String(aviso?.rutasAfectadas ?? '—').padStart(25)} | `
    + `${(aviso?.probableCausa ?? '—').padEnd(16)} | `
    + `${Date.now() - t0}`,
  );

  // Restaurar y esperar a que se cierre la ventana de rafaga, para que la
  // vuelta siguiente no herede el aviso de esta.
  for (const r of RUTAS) otro.enviar(codificarSetd(r, originales.get(r) ?? 0));
  await new Promise((r) => setTimeout(r, 1600));
}

await otro.desconectar();
await app.desconectar();

console.log('');
console.log('== Restauracion, comprobada por HTTP ==');
await new Promise((r) => setTimeout(r, 1200));
const despues = leerCrudo();
let malas = 0;
for (const r of RUTAS) {
  const era = originales.get(r) ?? 0;
  const ahora = Number(despues.get(r) ?? 'NaN');
  const ok = Math.abs(ahora - era) < 1e-6;
  if (!ok) { malas++; console.log(`  ${r.padEnd(20)} era ${era}, quedo ${ahora}  <-- NO RESTAURADO`); }
}
console.log(`  ${RUTAS.length - malas} de ${RUTAS.length} rutas restauradas`);
console.log('');
console.log(`avalanchas detectadas: ${detectadas} de ${VUELTAS}`);
if (rutasVistas.length > 0) {
  const orden = [...rutasVistas].sort((a, b) => a - b);
  console.log(`rutas por aviso: mediana ${orden[Math.floor(orden.length / 2)]}, minimo ${orden[0]}, maximo ${orden[orden.length - 1]}`);
  console.log(`se escribieron ${RUTAS.length} rutas distintas por vuelta`);
}
process.exit(detectadas === VUELTAS && malas === 0 ? 0 : 1);
