/**
 * Crear el punto de retorno contra la consola de verdad.
 *
 * INV-001 lo exige antes de cualquier escritura. Nunca se habia hecho: el
 * metodo lanzaba "todavia no esta implementado".
 *
 * NO BORRA NADA. Guarda en el show VSE, que es de la aplicacion, y deja los
 * shows del usuario intactos. El modulo no sabe construir un DELETESNAPSHOT.
 */
import { Ui24rTransport, Ui24rMixerAdapter, SHOW_DE_LA_APLICACION } from '@vse/mixer-adapter';

const t = new Ui24rTransport();
const a = new Ui24rMixerAdapter(t);
await a.conectar('192.168.0.78');
await new Promise((r) => setTimeout(r, 6000));

console.log(`show de la aplicacion: ${SHOW_DE_LA_APLICACION}`);
const antes = await a.listarSnapshots();
console.log(`instantaneas nuestras ANTES: ${antes.length}${antes.length ? ' -> ' + antes.join(', ') : ''}`);

const nombre = await a.guardarInstantanea();
console.log(`guardarInstantanea() devolvio: ${nombre ?? 'null (no quedo)'}`);

const despues = await a.listarSnapshots();
console.log(`instantaneas nuestras DESPUES: ${despues.length} -> ${despues.join(', ')}`);
console.log(nombre !== null && despues.includes(nombre)
  ? 'VERIFICADA: la consola la tiene en su lista'
  : 'NO quedo verificada');
await a.desconectar();
