/**
 * Que DELETESNAPSHOT hace lo que creemos, medido contra la consola.
 *
 * **Por que hace falta.** La retencion de INV-003 --conservar veinte
 * automaticas-- se implemento el 2026-09-09 y manda DELETESNAPSHOT. La prueba
 * que la acompano corrio con cuatro automaticas, o sea POR DEBAJO DEL MAXIMO,
 * asi que no borro nada: el comando se escribio, se probo contra un transporte
 * falso, y NUNCA SE EJECUTO CONTRA EL APARATO. Estabamos mandandole al usuario
 * un comando que jamas vimos funcionar.
 *
 * Un comando de borrado que no funciona falla en silencio hacia el lado malo:
 * la retencion no retiene y el show crece igual, sin que nada avise. Uno que
 * funciona distinto del que creemos falla hacia el lado peor.
 *
 * **Que toca y que no.** Guarda una automatica nuestra y borra ESA MISMA. El
 * show es VSE, que es de la aplicacion; el nombre es VSE_AUTO_<fecha>, que es
 * la unica forma que comandoBorrar() acepta. Las instantaneas del usuario
 * viven en otro show y ademas tienen nombres que no se pueden fechar, asi que
 * quedan fuera por dos razones independientes.
 *
 * Al terminar, la consola queda con la misma lista que tenia al empezar.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/borrar-instantanea-real.ts
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, SHOW_DE_LA_APLICACION, comandoBorrar,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const a = new Ui24rMixerAdapter(t);

// Se anota todo lo que sale hacia la consola: si en algun momento saliera una
// linea con el nombre de una instantanea del usuario, tiene que verse aca.
const enviadas: string[] = [];
const enviarOriginal = t.enviar.bind(t);
t.enviar = (linea: string) => { enviadas.push(linea); enviarOriginal(linea); };

await a.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const antes = await a.listarSnapshots();
console.log(`show de la aplicacion: ${SHOW_DE_LA_APLICACION}`);
console.log(`ANTES: ${antes.length} -> ${antes.join(', ') || '(ninguna)'}`);

const nombre = await a.guardarInstantanea();
if (nombre === null) { console.log('no se pudo guardar; se aborta sin borrar nada'); await a.desconectar(); process.exit(1); }
const conLaNueva = await a.listarSnapshots();
console.log(`GUARDADA: ${nombre} -> la consola lista ${conLaNueva.length}`);
if (!conLaNueva.includes(nombre)) { console.log('la consola no la lista; se aborta'); await a.desconectar(); process.exit(1); }

const orden = comandoBorrar(nombre);
console.log(`orden de borrado: ${orden ?? 'null'}`);
if (orden === null) { console.log('comandoBorrar() la rechazo; se aborta'); await a.desconectar(); process.exit(1); }
t.enviar(orden);

// El guardado necesita su espera y el borrado tambien: la consola contesta la
// lista cuando termino, no cuando recibio.
await new Promise((r) => setTimeout(r, 2500));
const despues = await a.listarSnapshots();
console.log(`DESPUES: ${despues.length} -> ${despues.join(', ') || '(ninguna)'}`);

const borro = !despues.includes(nombre);
const volvioAlPrincipio = despues.length === antes.length
  && antes.every((n) => despues.includes(n));
console.log('');
console.log(`la borro de verdad:            ${borro ? 'SI' : 'NO'}`);
console.log(`quedo como estaba al empezar:  ${volvioAlPrincipio ? 'SI' : 'NO'}`);

const rozaAlUsuario = enviadas.filter((l) => /Alma|Prueba asistente|DELETESHOW|LOADSNAPSHOT/i.test(l));
console.log(`lineas que rozan lo del usuario: ${rozaAlUsuario.length === 0 ? 'ninguna' : rozaAlUsuario.join(' | ')}`);

await a.desconectar();
process.exit(borro && volvioAlPrincipio && rozaAlUsuario.length === 0 ? 0 : 1);
