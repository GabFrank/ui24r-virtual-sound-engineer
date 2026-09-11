/**
 * ¿La consola dice quién está conectado?
 *
 * El criterio 6 de SPK-P0.9 pide **elegir un mecanismo de presencia**, y desde
 * el 2026-09-10 tiene un requisito más: la política de confirmación abre una
 * **segunda conexión propia** que hace de testigo, así que el mecanismo tiene
 * que distinguir nuestro testigo de un segundo operador. Si no, la aplicación
 * se ve a sí misma y avisa «hay otro operador» cada vez que escribe.
 *
 * Antes de elegir hay que saber qué ofrece el aparato, y eso no es opinión.
 * Este guion lo mide: un observador escucha por la principal mientras otro
 * cliente entra y sale varias veces, y se anota **todo** lo que la consola
 * difunde en esas ventanas. Si no difunde nada, la presencia no existe por
 * protocolo y hay que construirla — y eso sí es una decisión, con alternativas
 * que vale la pena discutir antes de escribir código.
 *
 * No escribe nada. No hay nada que restaurar.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/hay-presencia.ts [ip] [ciclos]
 */
import { execFileSync } from 'node:child_process';
import { Ui24rTransport } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const CICLOS = Number(process.argv[3] ?? '3');

/** Claves que podrían hablar de presencia, según sus nombres. */
const SOSPECHOSAS = [
  'settings.maxconn', 'var.present', 'var.pongtime', 'var.asosec',
  'var.cascade.connected', 'settings.cascade.remote',
];

function leerCrudo(): Map<string, string> {
  let texto = '';
  try {
    texto = execFileSync('curl', ['-s', '--max-time', '8', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { texto = String((e as { stdout?: string }).stdout ?? ''); }
  const m = new Map<string, string>();
  for (const l of texto.split('\n')) {
    const p = l.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined) m.set(p[1], (p[2] ?? '').trim());
  }
  return m;
}

console.log(`consola ${maquina}, ${CICLOS} ciclos de entrar y salir`);
console.log('');
console.log('== Claves cuyo nombre sugiere presencia, leidas por HTTP ==');
const crudo = leerCrudo();
for (const k of SOSPECHOSAS) console.log(`  ${k.padEnd(26)} = ${crudo.get(k) ?? '(ausente)'}`);
console.log('');

const observador = new Ui24rTransport();
let recogiendo = false;
const recogido: string[] = [];
observador.alRecibir((linea) => {
  // Los medidores llegan siempre y no dicen nada de quien esta conectado.
  if (linea.startsWith('VU2^') || linea.startsWith('RTA^')) return;
  if (recogiendo) recogido.push(linea.split('^').slice(0, 2).join('^'));
});

await observador.conectar(maquina);
// El volcado inicial del observador no cuenta: es su propia conexion.
await new Promise((r) => setTimeout(r, 4000));

console.log('ciclo | al ENTRAR el otro cliente | al SALIR el otro cliente');

const alEntrar: string[][] = [];
const alSalir: string[][] = [];

for (let c = 1; c <= CICLOS; c++) {
  const otro = new Ui24rTransport();
  recogido.length = 0;
  recogiendo = true;
  await otro.conectar(maquina);
  await new Promise((r) => setTimeout(r, 3000));
  recogiendo = false;
  const entrando = [...new Set(recogido)];
  alEntrar.push(entrando);

  recogido.length = 0;
  recogiendo = true;
  await otro.desconectar();
  await new Promise((r) => setTimeout(r, 3000));
  recogiendo = false;
  const saliendo = [...new Set(recogido)];
  alSalir.push(saliendo);

  const resumir = (xs: string[]): string =>
    xs.length === 0 ? 'nada' : `${xs.length}: ${xs.slice(0, 3).join(' ')}${xs.length > 3 ? ' ...' : ''}`;
  console.log(`${String(c).padStart(5)} | ${resumir(entrando).padEnd(25)} | ${resumir(saliendo)}`);
}

await observador.desconectar();

console.log('');
const nuncaNada = alEntrar.every((x) => x.length === 0) && alSalir.every((x) => x.length === 0);
if (nuncaNada) {
  console.log('La consola NO difundio NADA al entrar ni al salir un cliente, en ningun ciclo.');
  console.log('No hay presencia por protocolo: si se quiere, hay que construirla.');
} else {
  console.log('Algo se difundio. Lo unico que aparecio, sin repetir:');
  const todo = [...new Set([...alEntrar.flat(), ...alSalir.flat()])];
  for (const k of todo) console.log(`  ${k}`);
}

console.log('');
console.log('== Las mismas claves despues, por HTTP: ¿alguna se movio? ==');
const despues = leerCrudo();
let movio = 0;
for (const k of SOSPECHOSAS) {
  const a = crudo.get(k); const b = despues.get(k);
  if (a !== b) { movio++; console.log(`  ${k} paso de ${a} a ${b}`); }
}
if (movio === 0) console.log('  ninguna');
