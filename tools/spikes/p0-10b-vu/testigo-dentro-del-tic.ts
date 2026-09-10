/**
 * Que le pasa al testigo cuando dos escrituras caen en el mismo tic.
 *
 * **La hipotesis, y por que no alcanza con deducirla.** La consola difunde en
 * un tic de ~34 ms y manda el ULTIMO valor de la ventana. Si escribimos A y
 * despues B sobre la misma ruta dentro de ese tic, deberia salir una sola linea
 * con B, y el testigo que espera A no la veria nunca --aunque la escritura de A
 * SI se aplico--. Eso convertiria una escritura buena en un TIMEOUT, y en modo
 * automatico controlado un parametro sin confirmar es inelegible: la aplicacion
 * se auto-bloquearia por un exito.
 *
 * Se mide en vez de razonarlo porque la deduccion tiene un supuesto escondido:
 * que la consola aplica A antes de sobrescribirlo con B. Si en cambio
 * descartara A sin aplicarlo, el TIMEOUT seria correcto y no habria agujero.
 * Son dos mundos distintos y la unica diferencia visible es el valor final.
 *
 * Canal 17, silenciado, con punto de retorno.
 */
import { Ui24rTransport, Ui24rMixerAdapter, TestigoDeEscrituras, codificarSetd, decodificar } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const RUTA = `i.${N}.mix`;
const SEPARACIONES = [0, 5, 15, 25, 34, 60];
const REPETICIONES = 5;

const principal = new Ui24rTransport();
const app = new Ui24rMixerAdapter(principal);
const crudo = new Map<string, number>();
principal.alRecibir((l) => { const m = decodificar(l); if (m.tipo === 'SETD') crudo.set(m.path, m.valor); });

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
if (punto === null) { console.log('sin punto de retorno; se aborta'); await app.desconectar(); process.exit(1); }
const original = crudo.get(RUTA) ?? 0;
console.log(`punto de retorno: ${punto} · ${RUTA} vale ${original}`);

const t2 = new Ui24rTransport();
const testigo = new TestigoDeEscrituras(t2);

/**
 * Lo que la consola difundio de verdad, visto por el testigo.
 *
 * La primera version leia el valor final de la conexion PRINCIPAL y salia 0 en
 * todas las filas. No era la consola: la principal NO VE SUS PROPIAS
 * ESCRITURAS --esta medido-- asi que su copia se quedaba en el ultimo valor
 * ajeno. El instrumento estaba mirando el unico sitio donde el dato no podia
 * estar. Se anota aparte porque es el mismo error de forma que el testigo mal
 * arrancado: no fallo, contesto con seguridad un numero que no significaba
 * nada.
 */
const difundido: { valor: number; enMs: number }[] = [];
t2.alRecibir((l) => {
  const m = decodificar(l);
  if (m.tipo === 'SETD' && m.path === RUTA) difundido.push({ valor: m.valor, enMs: Date.now() });
});

await testigo.conectar(maquina);
if (!testigo.listoParaAtestiguar) { console.log('testigo no listo'); await app.desconectar(); process.exit(1); }

console.log('');
console.log(`${REPETICIONES} repeticiones por separacion; A=0,20 y B=0,40 sobre la misma ruta`);
console.log('');
console.log('separacion | A confirmada | B confirmada | lineas difundidas | que difundio');
console.log('-----------+--------------+--------------+-------------------+-------------');

for (const sep of SEPARACIONES) {
  let confA = 0, confB = 0, lineas = 0;
  const vistos: string[] = [];
  for (let r = 0; r < REPETICIONES; r++) {
    const a = 0.20, b = 0.40;
    // Se deja la ruta quieta en otro valor para que A sea un cambio de verdad.
    principal.enviar(codificarSetd(RUTA, 0.05));
    await new Promise((res) => setTimeout(res, 500));
    difundido.length = 0;

    const pa = testigo.esperar(RUTA, a, 800);
    principal.enviar(codificarSetd(RUTA, a));
    if (sep > 0) await new Promise((res) => setTimeout(res, sep));
    const pb = testigo.esperar(RUTA, b, 800);
    principal.enviar(codificarSetd(RUTA, b));
    const [vistaA, vistaB] = await Promise.all([pa, pb]);
    await new Promise((res) => setTimeout(res, 500));

    if (vistaA) confA++;
    if (vistaB) confB++;
    lineas += difundido.length;
    vistos.push(difundido.map((d) => d.valor.toFixed(2)).join('>') || '—');
  }
  console.log(
    `${String(sep).padStart(7)} ms | ${`${confA} de ${REPETICIONES}`.padEnd(12)} | ${`${confB} de ${REPETICIONES}`.padEnd(12)} | `
    + `${(lineas / REPETICIONES).toFixed(1).padStart(17)} | ${vistos.join('  ')}`,
  );
}

console.log('');
principal.enviar(codificarSetd(RUTA, original));
await new Promise((r) => setTimeout(r, 600));
const final = crudo.get(RUTA);
console.log('');
console.log(`restaurada: ${final !== undefined && Math.abs(final - original) < 1e-6 ? 'si' : `¡NO! quedo en ${final}`}`);

await testigo.cerrar();
await app.desconectar();
