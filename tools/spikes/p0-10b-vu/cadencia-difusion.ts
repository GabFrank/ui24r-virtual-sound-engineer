/**
 * A que ritmo difunde la consola los cambios de una misma ruta.
 *
 * **De donde sale la pregunta.** Midiendo el criterio 5 de SPK-P0.9 se
 * escribieron 40 valores seguidos sobre i.16.mix cada 15 ms y al otro cliente
 * le llegaron SOLO 20, repartidos en 641 ms: unos 32 ms entre linea y linea.
 * Ese numero se parece demasiado a los 33 ms del RTA como para ser casualidad.
 *
 * **Por que importa, y bastante.** Si la consola junta los cambios de una
 * ventana y difunde el ultimo, entonces DOS ESCRITURAS SEGUIDAS A LA MISMA RUTA
 * PUEDEN PRODUCIR UNA SOLA LINEA, con el segundo valor. El testigo de INV-011
 * esperaria la confirmacion de la primera y no llegaria nunca, aunque la
 * escritura se haya aplicado. Es un agujero de la politica de confirmacion que
 * hasta ahora estaba anotado como «sin medir».
 *
 * **Metodo.** Se escribe a varios ritmos desde un cliente y se anota, en otro,
 * cuantas lineas llegan y cada cuanto. Si hay un tic fijo, el intervalo entre
 * llegadas se va a parecer entre ritmos aunque el de escritura cambie.
 *
 * Canal 17 --sin nombre, silenciado, fader abajo-- y punto de retorno antes.
 */
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const RUTA = `i.${N}.mix`;
const RITMOS = [5, 10, 15, 25, 40, 60, 100];
const ESCRITURAS = 40;

const principal = new Ui24rTransport();
const app = new Ui24rMixerAdapter(principal);
const crudo = new Map<string, number>();
const llegadas: number[] = [];
principal.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo !== 'SETD') return;
  crudo.set(m.path, m.valor);
  if (m.path === RUTA) llegadas.push(Date.now());
});

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
if (punto === null) { console.log('sin punto de retorno; se aborta'); await app.desconectar(); process.exit(1); }
const original = crudo.get(RUTA) ?? 0;
console.log(`punto de retorno: ${punto} · ${RUTA} vale ${original}`);

const otro = new Ui24rTransport();
await otro.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));

console.log('');
console.log('escrito cada | escritas | llegadas | % | intervalo entre llegadas (ms)');
console.log('-------------+----------+----------+-----+------------------------------');

const medias: number[] = [];
const perdidas: { ritmo: number; llegadas: number; mediana: number }[] = [];
for (const ritmo of RITMOS) {
  llegadas.length = 0;
  for (let i = 0; i < ESCRITURAS; i++) {
    otro.enviar(codificarSetd(RUTA, Number((0.10 + i * 0.004).toFixed(6))));
    await new Promise((r) => setTimeout(r, ritmo));
  }
  await new Promise((r) => setTimeout(r, 1200));

  const t = llegadas.slice();
  const gaps: number[] = [];
  for (let i = 1; i < t.length; i++) gaps.push(t[i]! - t[i - 1]!);
  const orden = [...gaps].sort((a, b) => a - b);
  const mediana = orden.length ? orden[Math.floor(orden.length / 2)]! : 0;
  const media = gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : 0;
  if (gaps.length > 2) medias.push(mediana);
  perdidas.push({ ritmo, llegadas: t.length, mediana });
  console.log(
    `${String(ritmo).padStart(9)} ms | ${String(ESCRITURAS).padStart(8)} | ${String(t.length).padStart(8)} | `
    + `${String(Math.round((t.length / ESCRITURAS) * 100)).padStart(3)} | `
    + `mediana ${mediana}, media ${media.toFixed(1)}, min ${orden[0] ?? '—'}, max ${orden[orden.length - 1] ?? '—'}`,
  );
}

otro.enviar(codificarSetd(RUTA, original));
await new Promise((r) => setTimeout(r, 600));
const final = crudo.get(RUTA);
console.log('');
console.log(`restaurada: ${final !== undefined && Math.abs(final - original) < 1e-6 ? 'si' : `¡NO! quedo en ${final}`}`);
/**
 * El veredicto se lee sobre el tic, no sobre el promedio.
 *
 * La primera version comparaba las medianas de todos los ritmos contra una
 * franja de 25 a 45 ms y concluia «no hay tic» porque los ritmos lentos daban
 * 67 y 100. ERA JUSTO AL REVES: 67 y 100 son dos y tres tics, o sea la prueba
 * mas fuerte de que el tic existe --las llegadas quedan CUANTIZADAS en
 * multiplos de el aunque se escriba a otro ritmo--. Un veredicto que promedia
 * lo que deberia dividir contesta lo contrario de lo que dicen los datos.
 *
 * Se mira entonces lo que de verdad distingue: cuando se escribe MAS RAPIDO que
 * el tic, se pierden lineas y el intervalo se clava; cuando se escribe mas
 * lento, no se pierde ninguna.
 */
if (medias.length > 1) {
  console.log(`medianas del intervalo entre llegadas, por ritmo: ${medias.join(', ')} ms`);
  const rapidos = perdidas.filter((p) => p.ritmo < 33);
  const lentos = perdidas.filter((p) => p.ritmo >= 40);
  const seClava = rapidos.every((p) => p.mediana >= 30 && p.mediana <= 38);
  const sePierde = rapidos.every((p) => p.llegadas < ESCRITURAS);
  const noSePierde = lentos.every((p) => p.llegadas === ESCRITURAS);
  console.log('');
  console.log(seClava && sePierde && noSePierde
    ? `HAY TIC de ~34 ms. Escribiendo mas rapido que el se pierden lineas y el intervalo se clava ahi; escribiendo mas lento no se pierde ninguna y las llegadas quedan cuantizadas en multiplos del tic (67 = dos, 100 = tres).`
    : 'Los datos no dibujan un tic limpio: mirar la tabla a mano.');
}

await otro.desconectar();
await app.desconectar();
