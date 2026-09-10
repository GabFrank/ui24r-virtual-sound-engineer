/**
 * Criterio 3 de SPK-P0.9: cuantas de nuestras escrituras quedan como PROPIAS.
 *
 * **El criterio estaba falsado tal como se escribio.** Pedia etiquetar por
 * «correlacion de mensajes entrantes con ventana temporal», y con esta consola
 * ESE MENSAJE NO LLEGA NUNCA: no hay eco al emisor. La ventana de 300 ms del
 * almacen esperaba algo que no existe.
 *
 * El charter dejaba dos salidas y recomendaba la segunda: etiquetar contra el
 * TESTIGO. La linea que el testigo ve y que coincide con lo que la principal
 * acaba de mandar es nuestra; cualquier otra es ajena. Eso ya esta implementado
 * --deducirOrigen() devuelve EXTERNAL para todo lo que entra por la principal,
 * que es lo correcto, y confirmarPropia() marca SELF cuando la escritura se
 * verifico-- pero NUNCA SE MIDIO CUANTAS LO LOGRAN.
 *
 * Eso es lo que falta y es lo que hace esto: cien escrituras, y contar cuantas
 * terminan con origen SELF en el estado confirmado. El umbral es 98 %.
 *
 * Canal 17 --sin nombre, silenciado, fader abajo-- con punto de retorno antes.
 */
import { Ui24rTransport, Ui24rMixerAdapter, decodificar } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const ESCRITURAS = Number(process.argv[4] ?? '100');
const RUTA = `i.${N}.pan`;   // el panorama de un canal silenciado no se oye

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
const crudo = new Map<string, number>();
t.alRecibir((l) => { const m = decodificar(l); if (m.tipo === 'SETD') crudo.set(m.path, m.valor); });

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
if (punto === null) { console.log('sin punto de retorno; se aborta'); await app.desconectar(); process.exit(1); }
const original = crudo.get(RUTA) ?? 0.5;
console.log(`punto de retorno: ${punto} · ${RUTA} vale ${original}`);
console.log('');

let propias = 0, ajenas = 0, sinMarcar = 0;
const porQue = new Map<string, number>();
let anterior = original;

for (let i = 0; i < ESCRITURAS; i++) {
  // Se alterna alrededor del valor original para no derivar, y se espacia por
  // encima del tic de difusion --34 ms-- y de la ventana de agrupacion.
  const nuevo = Number((i % 2 === 0 ? 0.45 : 0.55).toFixed(4));
  const r = await app.escribir(RUTA, nuevo, anterior);
  porQue.set(`${r.status}/${r.confirmedBy}`, (porQue.get(`${r.status}/${r.confirmedBy}`) ?? 0) + 1);

  const origen = app.leer(RUTA).source;
  if (origen === 'SELF') propias++;
  else if (origen === 'EXTERNAL') ajenas++;
  else sinMarcar++;

  if (r.status === 'APPLIED') anterior = nuevo;
  await new Promise((res) => setTimeout(res, 300));
  if ((i + 1) % 20 === 0) process.stdout.write(`${i + 1} `);
}
console.log('');
console.log('');
console.log(`escrituras: ${ESCRITURAS}`);
console.log(`  etiquetadas PROPIAS: ${propias} (${((propias / ESCRITURAS) * 100).toFixed(1)} %)`);
console.log(`  etiquetadas ajenas:  ${ajenas}`);
console.log(`  sin etiquetar:       ${sinMarcar}`);
console.log(`resultados: ${[...porQue.entries()].map(([k, v]) => `${k} x${v}`).join(', ')}`);
console.log('');
const pct = (propias / ESCRITURAS) * 100;
console.log(pct >= 98
  ? `CRITERIO 3 CUMPLIDO: ${pct.toFixed(1)} % >= 98 %.`
  : `CRITERIO 3 NO CUMPLIDO: ${pct.toFixed(1)} % < 98 %.`);

// Restaurar.
await app.escribir(RUTA, original, anterior).catch(() => {});
await new Promise((r) => setTimeout(r, 600));
console.log(`restaurada: ${Math.abs((app.leer(RUTA).value ?? -1) - original) < 1e-6 ? 'si' : 'revisar'}`);
await app.desconectar();
