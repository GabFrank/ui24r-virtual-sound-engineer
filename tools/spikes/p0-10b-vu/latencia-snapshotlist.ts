/**
 * Cuanto tarda la consola en contestar SNAPSHOTLIST.
 *
 * **De donde sale la pregunta.** La politica de confirmacion afirmaba que
 * releer la lista es «mas lento que el testigo, del orden de un segundo». Ese
 * numero no salia de ninguna medicion: los 800 ms de esperaGuardadoMs y los
 * 2500 de un arnes son ESPERAS ANTES DE PREGUNTAR, no tiempos de respuesta.
 *
 * **Y no es una curiosidad.** pedirLista() le da a la respuesta el mismo
 * this.timeoutMs de 500 ms que la confirmacion de escritura, y al vencer
 * RESUELVE LISTA VACIA EN SILENCIO. Si la consola tardara de verdad un segundo,
 * guardarInstantanea() devolveria null sin decir por que e INV-001 abortaria la
 * transaccion con un mensaje que no menciona el vencimiento. O el numero era
 * inventado, o hay un defecto esperando.
 *
 * Se mide con la lista tal como esta --sin crear ni borrar nada-- y varias
 * veces, porque una sola muestra ya nos engano antes con los 27 ms del testigo.
 */
import { Ui24rTransport, SHOW_DE_LA_APLICACION } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const REPETICIONES = Number(process.argv[3] ?? '12');

const t = new Ui24rTransport();
let alLlegar: ((ms: number) => void) | null = null;
let t0 = 0;
t.alRecibir((l) => {
  if (l.startsWith('SNAPSHOTLIST^') && alLlegar !== null) {
    const cb = alLlegar; alLlegar = null; cb(Date.now() - t0);
  }
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));

const tiempos: number[] = [];
for (let i = 0; i < REPETICIONES; i++) {
  const ms = await new Promise<number>((res) => {
    alLlegar = res;
    t0 = Date.now();
    t.enviar(`SNAPSHOTLIST^${SHOW_DE_LA_APLICACION}`);
    setTimeout(() => { if (alLlegar !== null) { alLlegar = null; res(-1); } }, 3000);
  });
  tiempos.push(ms);
  await new Promise((r) => setTimeout(r, 400));
}

const buenos = tiempos.filter((x) => x >= 0).sort((a, b) => a - b);
console.log(`respuestas: ${buenos.length} de ${REPETICIONES}`);
console.log(`tiempos (ms): ${tiempos.join(', ')}`);
if (buenos.length > 0) {
  const mediana = buenos[Math.floor(buenos.length / 2)]!;
  console.log(`mediana ${mediana} ms, minimo ${buenos[0]}, maximo ${buenos[buenos.length - 1]}`);
  console.log('');
  console.log(buenos[buenos.length - 1]! < 500
    ? `Los 500 ms de pedirLista() alcanzan: el peor caso medido es ${buenos[buenos.length - 1]} ms.`
    : `NO ALCANZAN: el peor caso medido es ${buenos[buenos.length - 1]} ms y el tope son 500.`);
}
await t.desconectar();
