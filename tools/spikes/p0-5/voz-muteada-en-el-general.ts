/**
 * ¿Un canal silenciado llega igual al analizador del general?
 *
 * **De dónde sale la pregunta.** Recorriendo la sesión en la tablet, el aviso de
 * realimentación marcó 105 Hz sostenida más de un minuto con la sala en
 * silencio. La conclusión fácil era «ruido eléctrico». El usuario avisó que
 * estaba hablando en la sala — y 105 Hz cae justo en el fundamental de una voz
 * masculina.
 *
 * Pero el canal del condensador **está silenciado**: `i.8.mute = 1`. Si su voz
 * aparece en el analizador del general igual, entonces el silencio **no lo saca
 * del analizador**, y eso importa mucho más que el aviso: significaría que el
 * detector de realimentación ve canales que el operador cree apagados.
 *
 * **Cómo se distingue una cosa de la otra sin pedirle nada a nadie.** Se leen a
 * la vez el medidor de entrada del canal —que sí registra el micrófono, esté
 * silenciado o no, porque es anterior al fader— y la banda del analizador. Si
 * las dos series se mueven juntas, la voz está pasando. Si el medidor se mueve
 * y la banda no, el 105 Hz es otra cosa y estaba ahí desde antes.
 *
 * No escribe nada: solo escucha los dos flujos que la consola ya manda.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-5/voz-muteada-en-el-general.ts [ip] [segundos] [canal]
 */
import {
  Ui24rTransport, decodificarVuCanales, decodificarEspectro, dbDeMedidor,
  bandaDeFrecuencia, frecuenciaDeBanda,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const SEGUNDOS = Number(process.argv[3] ?? '40');
const canal = Number(process.argv[4] ?? '9');
const HZ = 105;
/** Piso para representar el silencio sin perder la muestra. */
const PISO_DB = -80;
// **`bandaDeFrecuencia` devuelve un decimal** --105 Hz cae en la banda 27,98--
// y usarlo como indice de un array da `undefined` sin quejarse. La primera
// corrida junto CERO muestras utiles por esto: el guion pedia diez para hablar,
// y por eso dijo «no alcanza» en vez de inventar una conclusion. Si el umbral
// hubiera sido cero, habria impreso una correlacion de ruido.
const BANDA = Math.round(bandaDeFrecuencia(HZ));

const t = new Ui24rTransport();
const serie: { enMs: number; vu: number | null; rta: number | null; todas: number[] | null }[] = [];
let ultimoVu: number | null = null;
let ultimoRta: number | null = null;
let ultimasBandas: number[] | null = null;

t.alRecibir((linea) => {
  if (linea.startsWith('VU2^')) {
    const m = decodificarVuCanales(linea.slice(4))[canal - 1];
    if (m !== undefined) {
      // El silencio da -Infinity, y descartarlo seria tirar justo las muestras
      // que contestan la pregunta: la mitad callada de la prueba.
      const db = dbDeMedidor(m.entrada);
      ultimoVu = Number.isFinite(db) ? db : PISO_DB;
    }
  } else if (linea.startsWith('RTA^')) {
    const bandas = decodificarEspectro(linea.slice(4));
    // **`decodificarEspectro` YA devuelve decibeles.** La primera version
    // volvia a multiplicar por `RTA_DB_POR_BYTE` y daba valores 0,375 veces los
    // reales: con eso la banda parecia estar en 4,8 dB --por debajo del piso
    // util de 12-- y la conclusion habria sido «el detector dispara por debajo
    // de su propio piso», que es un bug que no existe. La correlacion no se
    // entera, porque es invariante de escala; la lectura absoluta si.
    const b = bandas[BANDA];
    if (b !== undefined) ultimoRta = b;
    if (bandas.length > 0) ultimasBandas = bandas;
  }
});

await t.conectar(maquina);
console.log(`consola ${maquina}, canal ${canal}, banda ${BANDA} (~${frecuenciaDeBanda(BANDA).toFixed(0)} Hz)`);
console.log(`escuchando ${SEGUNDOS} s. Hablá en la sala parte del tiempo y quedate callado la otra.`);
console.log('');
await new Promise((r) => setTimeout(r, 2000));

const t0 = Date.now();
const muestreo = setInterval(() => {
  serie.push({ enMs: Date.now() - t0, vu: ultimoVu, rta: ultimoRta, todas: ultimasBandas });
}, 250);
await new Promise((r) => setTimeout(r, SEGUNDOS * 1000));
clearInterval(muestreo);
await t.desconectar();

const utiles = serie.filter((s) => s.vu !== null && s.rta !== null);
if (utiles.length < 10) {
  console.log(`solo ${utiles.length} muestras utiles: no alcanza para decir nada`);
  process.exit(1);
}

console.log('  t(s) | medidor del canal | banda 105 Hz');
for (let i = 0; i < utiles.length; i += Math.max(1, Math.floor(utiles.length / 24))) {
  const s = utiles[i]!;
  const barra = (v: number, min: number, max: number): string =>
    '#'.repeat(Math.max(0, Math.round(((v - min) / (max - min)) * 30)));
  console.log(
    `${(s.enMs / 1000).toFixed(1).padStart(6)} | ${s.vu!.toFixed(1).padStart(7)} ${barra(s.vu!, -80, 0).padEnd(31)}`
    + `| ${s.rta!.toFixed(1).padStart(6)} ${barra(s.rta!, 0, 40)}`,
  );
}

// Correlacion de Pearson entre las dos series. No hace falta mas: la pregunta
// es si se mueven juntas, no cuanto vale cada una.
const xs = utiles.map((s) => s.vu!);
const ys = utiles.map((s) => s.rta!);
const media = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
const mx = media(xs); const my = media(ys);
let num = 0; let dx = 0; let dy = 0;
for (let i = 0; i < xs.length; i++) {
  num += (xs[i]! - mx) * (ys[i]! - my);
  dx += (xs[i]! - mx) ** 2;
  dy += (ys[i]! - my) ** 2;
}
const r = num / Math.sqrt(dx * dy);

console.log('');
console.log(`muestras: ${utiles.length}`);
console.log(`medidor del canal: media ${mx.toFixed(1)} dB, recorrido ${Math.min(...xs).toFixed(1)} a ${Math.max(...xs).toFixed(1)}`);
console.log(`banda de ${HZ} Hz: media ${my.toFixed(1)} dB, recorrido ${Math.min(...ys).toFixed(1)} a ${Math.max(...ys).toFixed(1)}`);
console.log(`correlacion: ${r.toFixed(3)}`);
console.log('');
// **Una sola banda no contesta la pregunta.** Que el 105 Hz no siga a la voz
// dice que ESA banda no es la voz; no dice que la voz no este pasando por otro
// lado. La pregunta --si un canal silenciado llega al analizador del general--
// se contesta buscando la banda que MEJOR correlacione, entre las 122.
const conBandas = utiles.filter((s) => s.todas !== null && s.todas.length >= 122);
let mejorBanda = -1;
let mejorR = 0;
if (conBandas.length >= 20) {
  const vs = conBandas.map((s) => s.vu!);
  const mv = media(vs);
  for (let b = 0; b < 122; b++) {
    const bs = conBandas.map((s) => s.todas![b] ?? 0);
    const mb = media(bs);
    let n = 0; let a = 0; let c = 0;
    for (let i = 0; i < vs.length; i++) {
      n += (vs[i]! - mv) * (bs[i]! - mb);
      a += (vs[i]! - mv) ** 2;
      c += (bs[i]! - mb) ** 2;
    }
    const rb = c === 0 ? 0 : n / Math.sqrt(a * c);
    if (Math.abs(rb) > Math.abs(mejorR)) { mejorR = rb; mejorBanda = b; }
  }
  console.log(`la banda que MEJOR sigue al microfono, de las 122: banda ${mejorBanda} (~${frecuenciaDeBanda(mejorBanda).toFixed(0)} Hz), correlacion ${mejorR.toFixed(3)}`);
} else {
  console.log(`solo ${conBandas.length} muestras con espectro completo: no alcanza para barrer las 122 bandas`);
}

console.log('');
if (Math.abs(r) > 0.5) {
  console.log(`El 105 Hz SIGUE a la voz: el canal silenciado llega al analizador del general.`);
} else if (Math.abs(mejorR) > 0.5) {
  console.log(`El 105 Hz no es la voz, pero la banda ${mejorBanda} SI la sigue: algo del canal silenciado pasa.`);
} else if (mejorBanda >= 0) {
  console.log('NINGUNA de las 122 bandas sigue al microfono. El canal silenciado NO llega al');
  console.log('analizador del general, y el 105 Hz estaba ahi antes de que nadie hablara.');
} else {
  console.log('No alcanza para concluir.');
}
