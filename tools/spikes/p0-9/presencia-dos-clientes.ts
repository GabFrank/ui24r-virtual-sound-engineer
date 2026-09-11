/**
 * La presencia inferida, con dos clientes y contra la consola.
 *
 * El criterio 6 de SPK-P0.9 pide el mecanismo **elegido y verificado con prueba
 * de dos clientes**. Elegido el 2026-09-10 por el usuario, después de medir que
 * la consola no publica presencia: no difunde nada al entrar ni al salir un
 * cliente, y ninguna de las claves cuyo nombre lo sugería se mueve. Lo único
 * que la consola cuenta es quién **toca** algo.
 *
 * Acá se comprueban las tres cosas que hacen falta:
 *
 * 1. Con nadie tocando nada, la aplicación **no inventa** un operador — ni
 *    siquiera con el volcado inicial de seis mil claves entrando.
 * 2. Cuando otro cliente escribe, lo ve.
 * 3. **Cuando escribe la aplicación misma, no se ve a sí misma.** Éste es el
 *    requisito que se le agregó al criterio el 2026-09-10, cuando la política
 *    de confirmación pasó a usar una segunda conexión propia.
 *
 * Todo sobre el canal 21, que no tiene nada enchufado y está silenciado.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-9/presencia-dos-clientes.ts [ip]
 */
import { execFileSync } from 'node:child_process';
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const RUTA = 'i.20.pan';

function leer(path: string): string | undefined {
  let t = '';
  try {
    t = execFileSync('curl', ['-s', '--max-time', '8', `http://${maquina}/raw`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) { t = String((e as { stdout?: string }).stdout ?? ''); }
  for (const l of t.split('\n')) {
    const p = l.split('^');
    if ((p[0] === 'SETD' || p[0] === 'SETS') && p[1] === path) return (p[2] ?? '').trim();
  }
  return undefined;
}

const original = Number(leer(RUTA) ?? '0.5');
console.log(`consola ${maquina}, ruta de prueba ${RUTA} = ${original}`);
console.log('');

const principal = new Ui24rTransport();
const app = new Ui24rMixerAdapter(principal);
await app.conectar(maquina);
// El volcado inicial entra entero por acá. Si contara, la aplicación arrancaría
// diciendo que hay otro operador cada vez que se conecta.
await new Promise((r) => setTimeout(r, 5000));

const p0 = app.otroOperador();
console.log('1. Recién conectados, con el volcado de ~6700 claves ya adentro');
console.log(`   presente: ${p0.presente}   desdeHaceMs: ${p0.desdeHaceMs}`);
console.log(`   ${p0.presente ? 'MAL: el volcado se esta contando como alguien tocando' : 'ok: el volcado no inventa un operador'}`);
console.log('');

console.log('2. La aplicacion escribe. No tiene que verse a si misma');
// `escribir` toma TRES argumentos posicionales --ruta, valor nuevo, valor
// esperado-- y devuelve `status`, no `estado`. La primera version le pasaba un
// objeto y leia un campo que no existe: imprimia «undefined» y seguia como si
// nada. Con eso, el paso 2 no probaba que la aplicacion no se ve a si misma;
// probaba que una escritura que nunca ocurrio no se ve, que es otra cosa y no
// le sirve a nadie.
const nuevoValor = original > 0.5 ? original - 0.2 : original + 0.2;
const r = await app.escribir(RUTA, nuevoValor, original);
await new Promise((x) => setTimeout(x, 1500));
const p1 = app.otroOperador();
console.log(`   resultado de la escritura: ${r.status}${r.motivo === null ? '' : ` (${r.motivo})`}`);
const escribioDeVerdad = r.status === 'APPLIED';
console.log(`   ¿escribio de verdad? ${escribioDeVerdad ? 'si' : 'NO -- este paso no prueba nada'}`);
console.log(`   presente: ${p1.presente}   desdeHaceMs: ${p1.desdeHaceMs}`);
console.log(`   ${p1.presente ? 'MAL: la aplicacion se ve a si misma como otro operador' : 'ok: lo propio no cuenta'}`);
console.log('');

console.log('3. Otro cliente escribe. Ahora si');
const otro = new Ui24rTransport();
await otro.conectar(maquina);
await new Promise((x) => setTimeout(x, 2500));
otro.enviar(codificarSetd(RUTA, original > 0.5 ? original - 0.3 : original + 0.3));
await new Promise((x) => setTimeout(x, 1500));
const p2 = app.otroOperador();
console.log(`   presente: ${p2.presente}   desdeHaceMs: ${p2.desdeHaceMs}`);
console.log(`   ${p2.presente ? 'ok: se detecta al otro operador' : 'MAL: no lo vio'}`);
console.log('');

// Restaurar por el otro cliente y comprobar por HTTP, que no es ninguno de los dos.
otro.enviar(codificarSetd(RUTA, original));
await new Promise((x) => setTimeout(x, 1200));
await otro.desconectar();
await app.desconectar();
await new Promise((x) => setTimeout(x, 1200));
const final = Number(leer(RUTA) ?? 'NaN');
const restaurado = Math.abs(final - original) < 1e-6;
console.log(`restaurada por HTTP: era ${original}, quedo ${final}  ${restaurado ? 'ok' : '<-- NO'}`);

const bien = !p0.presente && escribioDeVerdad && !p1.presente && p2.presente && restaurado;
console.log('');
console.log(bien ? 'Las tres condiciones se cumplen.' : 'ALGUNA CONDICION NO SE CUMPLE.');
process.exit(bien ? 0 : 1);
