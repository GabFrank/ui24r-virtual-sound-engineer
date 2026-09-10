/**
 * Se pueden borrar los filtros FIJOS del supresor por protocolo?
 *
 * **Por que se rehace.** Ya se habia probado y contestado que no, pero la prueba
 * corrio en un guion de diagnostico que despues se borro: la respuesta era real
 * y no quedaba verificable en ningun lado. Es el mismo error que el proyecto
 * lleva todo el dia encontrando, cometido justo despues de construir el
 * mecanismo que existe para impedirlo. Un archivo de evidencia no es papeleo:
 * es la diferencia entre haber medido y acordarse de haber medido.
 *
 * **Autorizacion.** El usuario pidio expresamente borrarlos --2026-09-10, «si
 * los puse yo, pero puedes borrarlos, no hay problema»--. Se le habia avisado
 * que eso obliga a rehacer la afinacion de sala.
 *
 * Se prueban las tres claves, con el supresor encendido y apagado, y **se relee
 * la pila por HTTP despues de cada intento**: la conexion que escribe no ve sus
 * propias escrituras, asi que preguntarle a ella cuantos filtros quedan es
 * preguntarle al unico sitio donde el dato no puede estar.
 */
import { Ui24rTransport, Ui24rMixerAdapter, codificarSetd } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

/** La pila de filtros, leida por HTTP. */
async function filtros(): Promise<string[]> {
  const res = await fetch(`http://${maquina}/raw`);
  const lector = res.body!.getReader();
  let texto = '';
  for (let i = 0; i < 200; i++) {
    const { value, done } = await lector.read();
    if (done) break;
    texto += new TextDecoder().decode(value);
    if (texto.includes('var.afsdata')) break;
  }
  await lector.cancel().catch(() => {});
  const m = /SETS\^var\.afsdata\^([^\n]*)/.exec(texto);
  if (m === null) return ['(no se encontro afsdata)'];
  const salida: string[] = [];
  for (const pila of m[1]!.split('fstack')) {
    if (!pila.includes('v1,')) continue;
    for (const reg of pila.split(':')) {
      if (!/v1,/.test(reg)) continue;
      const c = reg.replace(/^;+/, '').split(',');
      salida.push(`${Number(c[1]).toFixed(1)}Hz(${Number(c[2]).toFixed(0)}dB)`);
    }
  }
  return salida;
}

const t = new Ui24rTransport();
const app = new Ui24rMixerAdapter(t);
await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));
const punto = await app.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }

console.log('');
console.log(`al empezar: ${(await filtros()).join(' ') || '(ninguno)'}`);
console.log('');

const intentos: [string, number, number][] = [
  // clave, valor, estado del supresor
  ['m.afs.clearfixed', 1, 1],
  ['m.afs.clearall', 1, 1],
  ['m.afs.clearfixed', 1, 0],
  ['m.afs.clearall', 1, 0],
];

for (const [clave, valor, encendido] of intentos) {
  t.enviar(codificarSetd('m.afs.enabled', encendido));
  await new Promise((r) => setTimeout(r, 1200));
  t.enviar(codificarSetd(clave, valor));
  await new Promise((r) => setTimeout(r, 2500));
  const quedan = await filtros();
  console.log(`${clave} = ${valor}  con supresor ${encendido ? 'encendido' : 'apagado'}  ->  ${quedan.length} filtro(s): ${quedan.join(' ') || '(ninguno)'}`);
  // Se devuelve el disparador a cero: quedan en 1 si no.
  t.enviar(codificarSetd(clave, 0));
  await new Promise((r) => setTimeout(r, 600));
}

t.enviar(codificarSetd('m.afs.enabled', 1));
await new Promise((r) => setTimeout(r, 1500));
console.log('');
console.log(`al terminar: ${(await filtros()).join(' ') || '(ninguno)'}`);
const res = await fetch(`http://${maquina}/raw`);
const lector = res.body!.getReader();
let txt = '';
for (let i = 0; i < 200; i++) {
  const { value, done } = await lector.read();
  if (done) break;
  txt += new TextDecoder().decode(value);
  if (/m\.afs\.clearall/.test(txt) && /m\.afs\.enabled/.test(txt)) break;
}
await lector.cancel().catch(() => {});
for (const clave of ['enabled', 'clearfixed', 'clearlive', 'clearall']) {
  const m = new RegExp(`SETD\\^m\\.afs\\.${clave}\\^([-0-9.]+)`).exec(txt);
  console.log(`  m.afs.${clave} = ${m?.[1] ?? '?'}  (leido por HTTP)`);
}
await app.desconectar();
