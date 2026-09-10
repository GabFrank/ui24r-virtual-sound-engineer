/**
 * Hay un pendrive en la consola, y con que adentro?
 *
 * **Por que.** SPK-P0.6 pregunta si el ruido rosa puede salir del reproductor de
 * la consola en vez de una interfaz externa. Se venia diciendo que eso «necesita
 * que el usuario este fisicamente ahi para poner un pendrive», y eso se afirmo
 * SIN COMPROBARLO: si ya hubiera uno conectado con algo adentro, la mitad de
 * protocolo --se puede pedir la lista, cargar y reproducir por red-- se podria
 * contestar hoy.
 *
 * Es SOLO LECTURA: se pide la lista y se escucha. No se carga ni se reproduce
 * nada, porque eso saldria por el general y hay un microfono abierto en la sala.
 */
import { Ui24rTransport } from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const t = new Ui24rTransport();
const lineas: string[] = [];
t.alRecibir((l) => {
  if (/PLAYLIST|MEDIA|TRACK|playBusy|currentPlaylist|currentTrack|currentLength/i.test(l)) {
    lineas.push(l.length > 220 ? `${l.slice(0, 220)}…(+${l.length - 220})` : l);
  }
});

await t.conectar(maquina);
await new Promise((r) => setTimeout(r, 5000));
console.log(`lineas del reproductor en el volcado: ${lineas.length}`);
for (const l of lineas.slice(0, 8)) console.log(`  ${l}`);

console.log('');
console.log('se pide la lista con UPDATE_PLAYLIST y se escucha 6 s...');
lineas.length = 0;
t.enviar('UPDATE_PLAYLIST');
await new Promise((r) => setTimeout(r, 6000));
console.log(`respuestas: ${lineas.length}`);
for (const l of lineas.slice(0, 10)) console.log(`  ${l}`);
if (lineas.length === 0) {
  console.log('  (ninguna: o no hay pendrive, o UPDATE_PLAYLIST no es la forma de preguntar)');
}
await t.desconectar();
