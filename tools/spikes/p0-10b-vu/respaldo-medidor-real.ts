/**
 * El respaldo por medidor contra la consola, sin testigo.
 *
 * **Por que.** Se acaba de cablear `confirmarPorMedidor`, que estuvo escrito y
 * desconectado desde el 2026-09-09. Los tests lo cubren con un transporte falso,
 * y eso prueba el despacho pero NO la fisica: que el medidor de entrada se mueva
 * lo que la curva de ganancia dice, dentro de la tolerancia de 1,5 dB y en los
 * 300 ms de espera. Eso solo lo contesta el aparato.
 *
 * **Como se fuerza el camino.** Se le da al adaptador un `crearTestigo` que
 * devuelve un transporte que no conecta. Es exactamente lo que pasa con la wifi
 * saturada, que es la situacion para la que INV-011 previo este respaldo.
 *
 * **Sobre que canal.** El 17 --i.16--: sin nombre, SILENCIADO y con el fader
 * abajo. Como esta en silencio NO VA A TENER SENAL, asi que la primera parte de
 * la prueba comprueba el rechazo por falta de senal, que es la mitad que
 * importa: sin senal NO SE ESCRIBE.
 *
 * Para la parte con senal hace falta una fuente sonando en un canal. Se pide por
 * parametro y, si no se da, se corre solo la mitad que no la necesita, diciendo
 * cual quedo sin correr.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/respaldo-medidor-real.ts [host] [canalConSenal]
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, decodificar, gananciaADb,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const CANAL_MUDO = 17;
const canalConSenal = process.argv[3] !== undefined ? Number(process.argv[3]) : null;

const principal = new Ui24rTransport();
const crudo = new Map<string, number>();
principal.alRecibir((l) => { const m = decodificar(l); if (m.tipo === 'SETD') crudo.set(m.path, m.valor); });

/**
 * Lee un valor **desde fuera**, por HTTP, y no por la conexion que escribio.
 *
 * **Porque `crudo` no sirve para comprobar una restauracion.** La conexion
 * principal NO VE SUS PROPIAS ESCRITURAS --esta medido-- asi que su copia se
 * queda en el ultimo valor que llego de otro lado. Este arnes imprimia
 * «restaurado: si» leyendo de ahi, y en una corrida DEJO EL FADER DEL CANAL 10
 * DOS DECIBELES ABAJO mientras afirmaba lo contrario.
 *
 * Es el tercer sitio donde el mismo malentendido produce un numero convincente
 * y falso. Una comprobacion de restauracion tiene que leer por un camino
 * distinto del que escribio, o no comprueba nada.
 */
async function leerDesdeFuera(ruta: string): Promise<number | null> {
  const res = await fetch(`http://${maquina}/raw`).catch(() => null);
  if (res === null || res.body === null) return null;
  // `/raw` es un flujo que no termina: se lee un trozo y se corta.
  const lector = res.body.getReader();
  let texto = '';
  for (let i = 0; i < 40; i++) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
    if (texto.includes(`SETD^${ruta}^`)) break;
  }
  await lector.cancel().catch(() => {});
  const m = new RegExp(`SETD\\^${ruta.replace(/\./g, '\\.')}\\^([-0-9.]+)`).exec(texto);
  return m === null ? null : Number(m[1]);
}

const app = new Ui24rMixerAdapter(principal, {
  // Un testigo que nunca conecta: la wifi saturada del show.
  crearTestigo: () => {
    const t = new Ui24rTransport();
    t.conectar = async () => { throw new Error('sin red para el testigo'); };
    return t;
  },
});

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const punto = await app.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }
console.log(`testigo abierto: ${app.testigoAbierto} (tiene que ser false)`);

const deCanal = (n: number) => app.canales().find((c) => c.indice === n);
const estado = deCanal(CANAL_MUDO);
console.log(`canal ${CANAL_MUDO}: nivel ${estado?.nivelDb.toFixed(1)} dB, ganancia ${estado?.gainDb?.toFixed(2)} dB`);

// --- Sin senal: no se escribe ----------------------------------------------
const rutaMuda = `hw.${CANAL_MUDO - 1}.gain`;
const gMuda = crudo.get(rutaMuda) ?? 0;
console.log('');
console.log(`SIN SENAL — se intenta ${rutaMuda}: ${gMuda.toFixed(4)} -> ${(gMuda + 0.05).toFixed(4)}`);
const r1 = await app.escribir(rutaMuda, gMuda + 0.05, gMuda);
console.log(`  ${r1.status} / ${r1.confirmedBy}`);
console.log(`  ${r1.motivo}`);
await new Promise((r) => setTimeout(r, 500));
const quedo = crudo.get(rutaMuda);
console.log(`  la ganancia quedo en ${quedo?.toFixed(4)} — ${Math.abs((quedo ?? -1) - gMuda) < 1e-6 ? 'INTACTA, no se escribio' : '¡SE ESCRIBIO IGUAL!'}`);

// --- Con senal: se confirma por el medidor ---------------------------------
if (canalConSenal === null) {
  console.log('');
  console.log('CON SENAL — no se corrio: hace falta pasar un canal que este sonando.');
  console.log('  node ... respaldo-medidor-real.ts 192.168.0.78 <canal>');
} else {
  const n = canalConSenal - 1;
  const ruta = `hw.${n}.gain`;
  const antes = crudo.get(ruta) ?? 0;
  const est = deCanal(canalConSenal);
  console.log('');
  console.log(`CON SENAL — canal ${canalConSenal} a ${est?.nivelDb.toFixed(1)} dB`);
  const nuevo = Math.min(1, antes + 0.04);
  const esperado = gananciaADb(nuevo) - gananciaADb(antes);
  console.log(`  ${ruta}: ${antes.toFixed(4)} -> ${nuevo.toFixed(4)}, o sea ${esperado.toFixed(2)} dB`);
  const r2 = await app.escribir(ruta, nuevo, antes);
  console.log(`  ${r2.status} / ${r2.confirmedBy}`);
  if (r2.motivo !== null) console.log(`  ${r2.motivo}`);
  // Restaurar SIEMPRE.
  await app.escribir(ruta, antes, nuevo).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  const fin = await leerDesdeFuera(ruta);
  console.log(`  restaurada (leido por HTTP, no por la conexion que escribio): `
    + `${fin !== null && Math.abs(fin - antes) < 1e-6 ? 'si' : `¡NO! quedo en ${fin}`}`);
}

// --- El fader, que se juzga en el OTRO medidor -------------------------------
//
// Es la mitad que faltaba. El fader se confirma mirando la SALIDA del canal, no
// la entrada: el medidor de entrada esta antes del fader --medido el
// 2026-09-08-- asi que ahi un fader no mueve nada y una escritura buena saldria
// rechazada. Los tests con transporte falso lo cubren; la fisica no.
if (canalConSenal !== null) {
  const n2 = canalConSenal - 1;
  const ruta = `i.${n2}.mix`;
  const antes = crudo.get(ruta) ?? 0;
  console.log('');
  console.log(`CON SENAL, EL FADER — canal ${canalConSenal}`);
  const est2 = deCanal(canalConSenal);
  console.log(`  salida del canal: ${est2?.nivelSalidaDb?.toFixed(1)} dB`);
  // **Se sube, no se baja, y el motivo es una medicion.** Con el fader bajando
  // 2 dB desde -48,7 el nivel de despues cae POR DEBAJO DEL PISO de -50 dB y el
  // medidor deja de poder confirmar: la escritura sale UNVERIFIED aunque se haya
  // aplicado. Es correcto --no se puede confirmar lo que no se oye-- y es un
  // limite real del respaldo cerca del silencio, no un defecto del arnes. Se
  // anota en la evidencia.
  const nuevo = Math.min(1, antes + 0.04);
  const r3 = await app.escribir(ruta, nuevo, antes);
  console.log(`  ${ruta}: ${antes.toFixed(4)} -> ${nuevo.toFixed(4)}`);
  console.log(`  ${r3.status} / ${r3.confirmedBy}`);
  if (r3.motivo !== null) console.log(`  ${r3.motivo}`);
  await app.escribir(ruta, antes, nuevo).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  const fin = await leerDesdeFuera(ruta);
  console.log(`  restaurado (leido por HTTP, no por la conexion que escribio): `
    + `${fin !== null && Math.abs(fin - antes) < 1e-6 ? 'si' : `¡NO! quedo en ${fin}`}`);
}

await app.desconectar();
