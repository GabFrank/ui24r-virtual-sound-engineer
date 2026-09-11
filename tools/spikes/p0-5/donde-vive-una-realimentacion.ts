/**
 * Dónde vive una realimentación de verdad. Segundo intento.
 *
 * **Por qué el primero no sirvió.** Cortó a fader 0,32 —unos −25 dB, lejísimos
 * del umbral— porque el criterio era «una banda sobresale 15 dB de sus
 * vecinas». Pero **la sala tiene una resonancia en esa banda y sobresale
 * siempre**: el corte disparó sobre el modo, no sobre una realimentación. El
 * usuario no escuchó nada, que era el dato que faltaba, y con dos puntos la
 * conclusión «105 Hz es el modo de realimentación» no la sostenía nada.
 *
 * **Lo que separa las dos hipótesis sin depender del oído.** Si el canal solo
 * pasa por el fader, la banda sube **exactamente lo que sube el fader**: razón
 * 1,0. Si hay ganancia de lazo —la señal sale por el parlante, vuelve por el
 * micrófono y se suma— la banda sube **más**, y la razón crece paso a paso hasta
 * dispararse. Una resonancia estable no hace eso; una realimentación sí.
 *
 * Por eso acá la razón se calcula en **cada** paso y es la que manda para
 * cortar, no el exceso sobre las vecinas.
 *
 * **Paso 0: comprobar que el canal llega al general.** Antes de subir nada se
 * compara el medidor del general con el canal silenciado y sin silenciar. Si no
 * cambia, no hay nada que medir y se aborta sin haber tocado ningún fader —
 * porque entonces el problema es el enrutamiento, no el lazo.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-5/donde-vive-una-realimentacion.ts [ip] [canal] [tope]
 */
import { execFileSync } from 'node:child_process';
import {
  Ui24rTransport, codificarSetd, codificarSets, decodificarEspectro,
  decodificarVuCanales, dbDeMedidor, faderADb, frecuenciaDeBanda,
  nombreDeInstantanea, comandoCrearShow, comandoGuardar, comandoListar,
  comandoBorrar, instantaneasDeLaLista,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const canal = Number(process.argv[3] ?? '9');
const TOPE = Number(process.argv[4] ?? '0.70');
const n = canal - 1;

const DESDE = 0.30;
const PASO = 0.03;
const ESPERA_MS = 2200;

/**
 * Cuándo se corta, y ahora por el motivo correcto.
 *
 * La razón entre lo que creció la banda y lo que subió el fader. En 1,0 el canal
 * solo pasa; por encima, algo vuelve a entrar. Se corta con **dos pasos
 * seguidos** por encima del umbral, para no cortar por una lectura suelta.
 */
const RAZON_PARA_CORTAR = 2.0;
const NIVEL_ABSOLUTO_PARA_CORTAR_DB = 42;

function leerCrudo(): Map<string, string> {
  let t = '';
  try {
    t = execFileSync('curl', ['-s', '--max-time', '10', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { t = String((e as { stdout?: string }).stdout ?? ''); }
  const m = new Map<string, string>();
  for (const l of t.split('\n')) {
    const p = l.split('^');
    // **Se queda con el PRIMERO y no con el último.** `var.rta` viaja como
    // `SETS` y como `SETD`, y quedarse con el último dejaba el texto pisado por
    // el número: la corrida anterior restauró `var.rta` con «-1» donde había
    // una cadena vacía.
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] !== undefined && !m.has(p[1])) {
      m.set(p[1], (p[2] ?? '').trim());
    }
  }
  return m;
}

const base = leerCrudo();
const ORIG = {
  mute: Number(base.get(`i.${n}.mute`) ?? '1'),
  mix: Number(base.get(`i.${n}.mix`) ?? '0.5'),
  rta: base.get('var.rta') ?? '',
  afsdata: base.get('var.afsdata') ?? '',
};
console.log(`consola ${maquina}, canal ${canal}`);
console.log(`estado inicial: mute=${ORIG.mute} fader=${ORIG.mix.toFixed(4)} var.rta="${ORIG.rta}"`);
console.log(`filtros del supresor ANTES: ${ORIG.afsdata.length} caracteres de var.afsdata`);
console.log('');

const t = new Ui24rTransport();
let bandas: number[] = [];
let salidaGeneral = -Infinity;
const listas: string[] = [];
t.alRecibir((l) => {
  if (l.startsWith('RTA^')) {
    const d = decodificarEspectro(l.slice(4));
    if (d.length >= 122) bandas = d;
  } else if (l.startsWith('VU2^')) {
    const m = decodificarVuCanales(l.slice(4))[n];
    if (m !== undefined) salidaGeneral = dbDeMedidor(m.salida);
  } else if (l.startsWith('SNAPSHOTLIST^')) listas.push(l);
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 3000));

t.enviar(comandoCrearShow());
await new Promise((r) => setTimeout(r, 600));
const nombre = nombreDeInstantanea(Date.now());
t.enviar(comandoGuardar(nombre));
await new Promise((r) => setTimeout(r, 1800));
listas.length = 0;
t.enviar(comandoListar());
await new Promise((r) => setTimeout(r, 1500));
if (!listas.flatMap((l) => instantaneasDeLaLista(l)).includes(nombre)) {
  console.log('Sin punto de retorno verificado NO se sigue. INV-001.');
  await t.desconectar(); process.exit(2);
}
console.log(`punto de retorno: ${nombre}, verificado`);

t.enviar(codificarSets('var.rta', 'm'));
await new Promise((r) => setTimeout(r, 2000));
if (bandas.length < 122) {
  console.log('El analizador no manda bandas. Se aborta sin tocar el canal.');
  t.enviar(codificarSets('var.rta', ORIG.rta));
  await t.desconectar(); process.exit(2);
}

// ---------------------------------------- paso 0: ¿el canal llega al general?
console.log('');
console.log('=== Paso 0: ¿el canal llega al general? ===');
const promedio = (xs: readonly number[]): number =>
  xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
t.enviar(codificarSetd(`i.${n}.mute`, 1));
await new Promise((r) => setTimeout(r, 2500));
const conMute = promedio(bandas);
t.enviar(codificarSetd(`i.${n}.mix`, DESDE));
t.enviar(codificarSetd(`i.${n}.mute`, 0));
await new Promise((r) => setTimeout(r, 2500));
const sinMute = promedio(bandas);
console.log(`  general con el canal silenciado:    ${conMute.toFixed(2)} dB de media`);
console.log(`  general con el canal abierto a ${DESDE}: ${sinMute.toFixed(2)} dB de media`);
console.log(`  diferencia: ${(sinMute - conMute).toFixed(2)} dB`);
if (sinMute - conMute < 0.5) {
  console.log('  >>> El canal NO cambia el general. No hay lazo que medir.');
  console.log('  >>> El problema es el enrutamiento, no la realimentacion.');
} else {
  console.log('  >>> El canal SI llega al general. Se puede medir el lazo.');
}

console.log('');
console.log('=== Subiendo. Escucha el ambiente de la sala por el monitor. ===');
console.log('fader |   dB | banda alta        | nivel | subio | fader subio | RAZON');

function cortar(): void { t.enviar(codificarSetd(`i.${n}.mute`, 1)); }

const filas: { f: number; db: number; banda: number; nivel: number; razon: number }[] = [];
let seguidas = 0;
let motivo: string | null = null;

let anterior: { db: number; nivel: number; banda: number } | null = null;
for (let f = DESDE; f <= TOPE + 1e-9; f += PASO) {
  t.enviar(codificarSetd(`i.${n}.mix`, f));
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  const actual = bandas.slice();
  let mejor = 0;
  for (let b = 4; b < actual.length - 4; b++) if ((actual[b] ?? 0) > (actual[mejor] ?? 0)) mejor = b;
  const nivel = actual[mejor] ?? 0;
  const db = faderADb(f);

  let razon = NaN;
  if (anterior !== null) {
    const subioFader = db - anterior.db;
    const subioBanda = (actual[anterior.banda] ?? 0) - anterior.nivel;
    razon = subioFader > 0.01 ? subioBanda / subioFader : NaN;
    console.log(
      `${f.toFixed(3)} | ${db.toFixed(1).padStart(5)} | ${String(mejor).padStart(3)} (~${frecuenciaDeBanda(mejor).toFixed(0).padStart(5)} Hz) `
      + `| ${nivel.toFixed(1).padStart(5)} | ${subioBanda.toFixed(2).padStart(5)} | ${subioFader.toFixed(2).padStart(11)} | ${Number.isFinite(razon) ? razon.toFixed(2) : '—'}`,
    );
  } else {
    console.log(`${f.toFixed(3)} | ${db.toFixed(1).padStart(5)} | ${String(mejor).padStart(3)} (~${frecuenciaDeBanda(mejor).toFixed(0).padStart(5)} Hz) | ${nivel.toFixed(1).padStart(5)} |     — |           — | —`);
  }
  filas.push({ f, db, banda: mejor, nivel, razon });
  anterior = { db, nivel: actual[mejor] ?? 0, banda: mejor };

  if (nivel >= NIVEL_ABSOLUTO_PARA_CORTAR_DB) { motivo = `nivel absoluto ${nivel.toFixed(1)} dB`; }
  if (Number.isFinite(razon) && razon >= RAZON_PARA_CORTAR) {
    seguidas++;
    if (seguidas >= 2) motivo = `razon ${razon.toFixed(2)} dos pasos seguidos`;
  } else seguidas = 0;

  if (motivo !== null) { cortar(); console.log(''); console.log(`>>> CORTADO: ${motivo}`); break; }
}
if (motivo === null) { cortar(); console.log(''); console.log(`Se llego al tope (${TOPE}) sin que la razon se disparara.`); }

t.enviar(codificarSetd(`i.${n}.mix`, ORIG.mix));
t.enviar(codificarSetd(`i.${n}.mute`, ORIG.mute));
t.enviar(codificarSets('var.rta', ORIG.rta));
await new Promise((r) => setTimeout(r, 1500));
const borrar = comandoBorrar(nombre);
if (borrar !== null) { t.enviar(borrar); await new Promise((r) => setTimeout(r, 1200)); }
await t.desconectar();

console.log('');
console.log('=== Restauracion, por HTTP ===');
await new Promise((r) => setTimeout(r, 1500));
const fin = leerCrudo();
for (const [k, v] of [[`i.${n}.mute`, String(ORIG.mute)], [`i.${n}.mix`, String(ORIG.mix)], ['var.rta', ORIG.rta]] as [string, string][]) {
  const ahora = fin.get(k) ?? '';
  const ok = k === 'var.rta' ? ahora === v : Math.abs(Number(ahora) - Number(v)) < 1e-6;
  console.log(`  ${k.padEnd(12)} era "${v}", quedo "${ahora}"  ${ok ? 'ok' : '<-- NO'}`);
}
const afsDespues = fin.get('var.afsdata') ?? '';
console.log(`  var.afsdata: ${ORIG.afsdata.length} caracteres antes, ${afsDespues.length} despues ${afsDespues === ORIG.afsdata ? '(igual)' : '<-- EL SUPRESOR PUSO O SACO FILTROS'}`);

console.log('');
const validas = filas.map((r) => r.razon).filter((x) => Number.isFinite(x));
if (validas.length > 0) {
  console.log(`razon: media ${promedio(validas).toFixed(2)}, minimo ${Math.min(...validas).toFixed(2)}, maximo ${Math.max(...validas).toFixed(2)}`);
  console.log('Cerca de 1,00 en todo el recorrido = el canal solo pasa por el fader, NO hay lazo.');
  console.log('Creciendo paso a paso = hay ganancia de lazo y se acerca al umbral.');
}
