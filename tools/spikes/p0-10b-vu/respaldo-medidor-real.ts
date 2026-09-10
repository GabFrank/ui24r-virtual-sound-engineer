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
  const fin = crudo.get(ruta);
  console.log(`  restaurada: ${fin !== undefined && Math.abs(fin - antes) < 1e-6 ? 'si' : `¡NO! quedo en ${fin}`}`);
}

await app.desconectar();
