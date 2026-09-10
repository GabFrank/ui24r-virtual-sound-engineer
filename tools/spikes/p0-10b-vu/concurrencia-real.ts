/**
 * SPK-P0.9 contra la consola: cambios ajenos, arrastre y no pisarlos.
 *
 * **Que contesta.** Los criterios 1, 2 y 5 del spike de concurrencia, que hasta
 * hoy estaban probados solo contra el simulador. Y ahi esta el problema: EL
 * SIMULADOR DIFUNDE PORQUE NOSOTROS LE DIJIMOS QUE DIFUNDA. Una captura de la
 * aplicacion detectando una avalancha en el simulador no distingue entre que el
 * protocolo sea asi y que nuestra hipotesis del protocolo este equivocada.
 *
 * **Como.** Dos conexiones al mismo aparato. La principal es la aplicacion; la
 * segunda hace de OTRO OPERADOR --que es lo que de verdad es para la consola,
 * medido el 2026-09-09: trata dos sockets del mismo proceso como clientes
 * distintos--. El otro operador escribe y se mira que ve la aplicacion.
 *
 * **Sobre que canal.** El 17 --i.16--: sin nombre, SILENCIADO y con el fader
 * abajo, igual que el barrido del testigo. Punto de retorno antes de escribir.
 *
 * Uso:
 *   node --experimental-strip-types tools/spikes/p0-10b-vu/concurrencia-real.ts
 */
import {
  Ui24rTransport, Ui24rMixerAdapter, codificarSetd, decodificar,
} from '@vse/mixer-adapter';

const maquina = process.argv[2] ?? '192.168.0.78';
const N = Number(process.argv[3] ?? '16');
const RUTA = `i.${N}.mix`;

const principal = new Ui24rTransport();
const app = new Ui24rMixerAdapter(principal);

const crudo = new Map<string, number>();
principal.alRecibir((linea) => {
  const m = decodificar(linea);
  if (m.tipo === 'SETD') crudo.set(m.path, m.valor);
});

await app.conectar(maquina);
await new Promise((r) => setTimeout(r, 6000));

const punto = await app.guardarInstantanea();
console.log(`punto de retorno: ${punto ?? 'NO SE PUDO'}`);
if (punto === null) { await app.desconectar(); process.exit(1); }

const original = crudo.get(RUTA) ?? 0;
console.log(`${RUTA} vale ${original} y ahi tiene que volver al final`);

// El otro operador: una conexion aparte, que para la consola es otro cliente.
const otro = new Ui24rTransport();
await otro.conectar(maquina);
await new Promise((r) => setTimeout(r, 4000));

const ajenos: { parametro: string; valor: number; enMs: number }[] = [];
const masivos: { rutas: number; causa: string; ventanaMs: number }[] = [];
app.alCambiarExterno((parametro, valor) => ajenos.push({ parametro, valor, enMs: Date.now() }));
app.alCambioMasivo((e) => masivos.push({ rutas: e.rutasAfectadas, causa: e.probableCausa, ventanaMs: e.ventanaMs }));

// --- Criterio 1: 100 cambios ajenos, etiquetados ---------------------------
//
// **El espaciado se subio de 120 a 400 ms el 2026-09-10, y hay que decir por
// que.** Al agrupar el arrastre --criterio 5-- la ventana quedo en 250 ms, y con
// 120 los cien cambios caian dentro de una misma ventana: esta prueba paso de
// 100 de 100 a 1 DE 100 en la misma corrida. Los dos criterios estan en tension
// y no se puede tener los dos para cualquier ritmo.
//
// Se elige medir el etiquetado con un ritmo que un operador puede producir de
// verdad --un cambio cada 400 ms, o sea dos por segundo-- y NO se pretende que
// cien cambios en doce segundos sigan contando de a uno. Lo que se pierde son
// avisos, nunca conocimiento: el estado confirmado se actualiza con cada linea
// sin pasar por la agrupacion, asi que el criterio 2 --no pisar lo ajeno-- no
// depende de esto.
const ESPACIADO_MS = 400;
console.log('');
console.log(`criterio 1: 100 cambios desde el otro operador, espaciados ${ESPACIADO_MS} ms`);
ajenos.length = 0; masivos.length = 0;
const esperados: number[] = [];
for (let i = 0; i < 100; i++) {
  const v = Number((0.10 + (i % 20) * 0.005).toFixed(6));
  esperados.push(v);
  otro.enviar(codificarSetd(RUTA, v));
  await new Promise((r) => setTimeout(r, ESPACIADO_MS));
}
await new Promise((r) => setTimeout(r, 1500));

const deLaRuta = ajenos.filter((a) => a.parametro === RUTA);
const ultimoCoincide = deLaRuta.length > 0
  && Math.abs(deLaRuta[deLaRuta.length - 1]!.valor - esperados[esperados.length - 1]!) < 1e-6;
console.log(`  etiquetados como ajenos: ${deLaRuta.length} de 100`);
console.log(`  el ultimo valor coincide: ${ultimoCoincide ? 'si' : 'no'}`);
console.log(`  avalanchas disparadas por error: ${masivos.length}`);

// --- Criterio 5: arrastre agrupado -----------------------------------------
console.log('');
console.log('criterio 5: 40 escrituras seguidas sobre una sola ruta, cada 15 ms');
ajenos.length = 0; masivos.length = 0;
for (let i = 0; i < 40; i++) {
  otro.enviar(codificarSetd(RUTA, Number((0.10 + i * 0.004).toFixed(6))));
  await new Promise((r) => setTimeout(r, 15));
}
await new Promise((r) => setTimeout(r, 2000));
// Un arrastre NO tiene que dar un cambio masivo: es un gesto sobre una ruta,
// no una avalancha, y no invalida el estado. Lo que se mira es que se agrupe.
const grupos = masivos.filter((m) => m.causa === 'GRUPO_DE_CANALES');
const delArrastre = ajenos.filter((a) => a.parametro === RUTA);
const ventana = delArrastre.length > 1
  ? delArrastre[delArrastre.length - 1]!.enMs - delArrastre[0]!.enMs
  : 0;
console.log(`  lineas que la consola difundio y la aplicacion vio: ${delArrastre.length} de 40, en ${ventana} ms`);
console.log(`  cambios masivos detectados: ${masivos.length} -> ${masivos.map((m) => `${m.causa}(${m.rutas} rutas)`).join(', ') || '(ninguno)'}`);
console.log(`  clasificado como grupo de canales: ${grupos.length > 0 ? 'si' : 'no'} (tiene que ser no: es una sola ruta)`);
console.log(`  AGRUPADO EN UNO SOLO: ${delArrastre.length <= 1 ? 'si' : `no — la aplicacion recibe ${delArrastre.length} avisos separados`}`);

// --- Criterio 2: no pisar un cambio ajeno ----------------------------------
//
// El otro operador cambia la ruta; la aplicacion, que todavia cree el valor
// viejo, intenta escribir. INV-011 tiene que devolver CONFLICTO y NO ESCRIBIR.
console.log('');
console.log('criterio 2: el otro operador cambia y la aplicacion intenta escribir encima');
const antesDelPulso = crudo.get(RUTA) ?? original;
otro.enviar(codificarSetd(RUTA, 0.3));
await new Promise((r) => setTimeout(r, 400));
let resultado: unknown;
try {
  resultado = await app.escribir(RUTA, 0.9, antesDelPulso);
} catch (e) {
  resultado = { status: 'EXCEPCION', motivo: (e as Error).message };
}
console.log(`  resultado: ${JSON.stringify(resultado)}`);
await new Promise((r) => setTimeout(r, 500));
const quedo = crudo.get(RUTA);
console.log(`  ${RUTA} quedo en ${quedo} (0.3 = respeto lo ajeno; 0.9 = lo piso)`);
console.log(`  piso el cambio ajeno: ${quedo !== undefined && Math.abs(quedo - 0.9) < 1e-6 ? 'SI — CRITERIO FALLADO' : 'no'}`);

// --- Restaurar -------------------------------------------------------------
otro.enviar(codificarSetd(RUTA, original));
await new Promise((r) => setTimeout(r, 600));
const final = crudo.get(RUTA);
console.log('');
console.log(`restaurada: ${final !== undefined && Math.abs(final - original) < 1e-6 ? 'si' : `¡NO! quedo en ${final}`}`);

await otro.desconectar();
await app.desconectar();
