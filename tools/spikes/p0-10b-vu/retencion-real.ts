/**
 * La retencion, con la consola por encima del maximo de verdad.
 *
 * **Por que hace falta llenar.** Todas las corridas anteriores tenian menos de
 * veinte automaticas, o sea POR DEBAJO DEL MAXIMO, asi que la retencion nunca
 * borro nada: el codigo se probaba contra un transporte falso y contra un arnes
 * que mandaba el comando a mano. Esta es la primera vez que EL ADAPTADOR borra
 * contra el aparato, que es lo unico que faltaba comprobar.
 *
 * Se guardan instantaneas hasta pasar el maximo y se mira si al guardar la
 * siguiente la consola queda con veinte. Todas son nuestras --show VSE, nombres
 * VSE_AUTO_<ms>-- y las del usuario viven en otro show con nombres que no se
 * pueden fechar, asi que quedan fuera por dos razones independientes.
 *
 * Al terminar deja el show con el maximo, que es su estado de regimen.
 */
import { Ui24rTransport, Ui24rMixerAdapter } from '@vse/mixer-adapter';
import { MAX_SNAPSHOTS_AUTOMATICAS } from '@vse/domain';

const maquina = process.argv[2] ?? '192.168.0.78';

const t = new Ui24rTransport();
const noSePudoBorrar: string[][] = [];
const a = new Ui24rMixerAdapter(t, {
  alNoPoderBorrar: (n) => noSePudoBorrar.push([...n]),
});

await a.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const antes = await a.listarSnapshots();
console.log(`maximo de automaticas: ${MAX_SNAPSHOTS_AUTOMATICAS}`);
console.log(`al empezar hay ${antes.length}`);

// Se llena hasta uno por encima del maximo, para que la proxima tenga que
// borrar. Si ya hay de sobra, no se guarda de mas.
const faltan = Math.max(0, MAX_SNAPSHOTS_AUTOMATICAS + 1 - antes.length);
console.log(`hay que guardar ${faltan} para pasar el maximo`);
for (let i = 0; i < faltan; i++) {
  const n = await a.guardarInstantanea();
  process.stdout.write(n === null ? '!' : '.');
}
console.log('');

const llena = await a.listarSnapshots();
console.log(`ahora hay ${llena.length}`);

console.log('');
console.log('se guarda una mas: la retencion tiene que borrar la mas vieja');
const masVieja = [...llena].sort()[0];
const nueva = await a.guardarInstantanea();
const final = await a.listarSnapshots();

console.log(`  guardada: ${nueva ?? 'NO QUEDO'}`);
console.log(`  quedan: ${final.length} (el maximo es ${MAX_SNAPSHOTS_AUTOMATICAS})`);
console.log(`  la mas vieja era ${masVieja} y ${final.includes(masVieja!) ? 'SIGUE AHI' : 'se borro'}`);
console.log(`  avisos de no poder borrar: ${noSePudoBorrar.length === 0 ? 'ninguno' : JSON.stringify(noSePudoBorrar)}`);

const ok = final.length <= MAX_SNAPSHOTS_AUTOMATICAS && !final.includes(masVieja!) && noSePudoBorrar.length === 0;
console.log('');
console.log(ok ? 'LA RETENCION FUNCIONA DESDE EL ADAPTADOR.' : 'ALGO NO CUADRA: mirar arriba.');
await a.desconectar();
process.exit(ok ? 0 : 1);
