/**
 * El analizador de la consola mirando un microfono de verdad.
 *
 * **Lo que esto agrega.** El RTA esta decodificado y medido --122 bandas, un
 * doceavo de octava, 0,375 dB por byte-- pero SIEMPRE con tonos por la Scarlett:
 * senales de una sola frecuencia, generadas y entradas por linea. Nunca se lo
 * miro con una fuente acustica de banda ancha entrando por un preamplificador.
 *
 * Hoy llueve, y la lluvia es justamente eso: ruido de banda ancha, bastante
 * estacionario, gratis y sin tener que armar ningun lazo. Es la ocasion.
 *
 * **Que contesta, concretamente.** Si las 122 bandas se llenan de forma
 * plausible con una fuente real --y no solo con el pico unico de un tono--, y si
 * el vigilante de realimentacion se queda callado ante ruido de banda ancha, que
 * es lo que TIENE que hacer: el ruido sube todas las bandas a la vez, y una
 * realimentacion es una sola que no baja.
 *
 * NO ARMA NINGUN LAZO: el canal 9 esta en silencio, y su medidor de entrada y el
 * analizador son anteriores a eso.
 */
import { Ui24rTransport, Ui24rMixerAdapter, frecuenciaDeBanda } from '@vse/mixer-adapter';
import { VigilanteDeRealimentacion } from '@vse/assistants';

const maquina = process.argv[2] ?? '192.168.0.78';
const FUENTE = process.argv[3] ?? 'i.8';    // el canal 9
const SEGUNDOS = Number(process.argv[4] ?? '25');

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const original = app.fuenteOriginalDelAnalizador();
console.log(`fuente del analizador al llegar: ${original === null || original === '' ? '(ninguna)' : original}`);
console.log(`se apunta a ${FUENTE} y se devuelve al terminar (ADR-025)`);

const vigilante = new VigilanteDeRealimentacion();
const tramas: number[][] = [];
let avisos = 0;
const quitar = app.alEspectro((bandas) => {
  tramas.push([...bandas]);
  avisos += vigilante.observar(bandas, Date.now()).length;
});
if (!app.tomarAnalizador(FUENTE)) { console.log('no se pudo tomar el analizador'); await app.desconectar(); process.exit(1); }

console.log('');
console.log(`escuchando ${SEGUNDOS} s...`);
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
quitar();
app.devolverAnalizador();
await new Promise((r) => setTimeout(r, 800));

const conDatos = tramas.filter((b) => b.some((db) => db > 0));
console.log('');
console.log(`tramas de analizador: ${tramas.length}, con contenido: ${conDatos.length}`);
if (conDatos.length === 0) {
  console.log('TODAS EN CERO: el analizador no esta viendo esta fuente.');
} else {
  const n = conDatos[0]!.length;
  const media = new Array(n).fill(0);
  for (const b of conDatos) for (let i = 0; i < n; i++) media[i] += b[i]! / conDatos.length;
  const conEnergia = media.filter((db) => db > 1).length;
  console.log(`bandas: ${n} · con energia por encima de 1 dB: ${conEnergia}`);
  console.log('');
  console.log('espectro medio, una linea por octava:');
  for (let banda = 7; banda < n; banda += 12) {
    const hz = frecuenciaDeBanda(banda);
    const db = media[banda]!;
    const barra = '#'.repeat(Math.max(0, Math.round(db / 1.5)));
    console.log(`  ${hz < 1000 ? hz.toFixed(0).padStart(6) + ' Hz' : (hz / 1000).toFixed(1).padStart(5) + ' kHz'}  ${db.toFixed(1).padStart(5)} dB  ${barra}`);
  }
  const pico = media.indexOf(Math.max(...media));
  console.log('');
  console.log(`banda mas fuerte: ${pico} (${frecuenciaDeBanda(pico).toFixed(0)} Hz) a ${media[pico]!.toFixed(1)} dB`);
}
console.log('');
console.log(`avisos de realimentacion durante el ruido: ${avisos}`);
console.log(avisos === 0
  ? 'CORRECTO: el ruido de banda ancha sube todas las bandas a la vez, y eso no es una realimentacion.'
  : 'ATENCION: el vigilante avisa con ruido de banda ancha, que es un falso positivo.');
console.log(`fuente del analizador devuelta a: ${app.fuenteOriginalDelAnalizador() ?? '(ninguna)'}`);
await app.desconectar();
