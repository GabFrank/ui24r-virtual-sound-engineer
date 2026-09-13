/**
 * ¿Llega señal al bus auxiliar cuando se abre el envío de un canal?
 *
 * **Convertido a `conRestauracion` el 2026-09-13.** Antes tenía un `try/finally`
 * que restauraba bien, y eso no alcanza: un `finally` no corre ante una señal, y
 * el caso ya ocurrió en este proyecto —una corrida pasada por `head -4` murió
 * cuando `head` cerró la tubería y dejó un envío a auxiliar **abierto en 0,8** en
 * la consola del usuario—. Tampoco reconectaba: si el transporte se cae, escribir
 * la restauración por el mismo socket falla, y eso también pasó esta madrugada.
 *
 * **Y el valor previo se lee por HTTP en vez de esperar el volcado del
 * WebSocket.** La versión anterior esperaba cinco segundos a que la consola
 * emitiera la clave y la cazaba al vuelo; si no llegaba en ese plazo, `exigirClave`
 * fallaba y la corrida se caía antes de medir nada. `estadoPorHttpExigido` la pide
 * y falla si el volcado viene corto, que es la misma garantía sin la carrera.
 */
import { spawn } from 'node:child_process';
import { Ui24rTransport, codificarSetd, decodificarVuBuses, dbDeMedidor } from '@vse/mixer-adapter';
import { estadoPorHttpExigido, exigirClave } from '../canal-muerto.ts';
import { conRestauracion } from '../con-restauracion.ts';
import { restaurarClaves } from '../restaurar.ts';
import { argIndice, argTexto } from '../argumentos.ts';

const canal = argIndice(2, 'canal', 10, { desde: 1, hasta: 24 });
const n = canal - 1;
const auxiliar = argIndice(3, 'auxiliar', 1, { desde: 1, hasta: 10 });
const a = auxiliar - 1;
const maquina = argTexto(4, '192.168.0.78');
const RUTA = `i.${n}.aux.${a}.value`;

const t = new Ui24rTransport();
let ult: ReturnType<typeof decodificarVuBuses> | null = null;
t.alRecibir((l) => {
  if (l.startsWith('VU2^')) ult = decodificarVuBuses(l.slice(4));
});

await t.conectar(maquina);
const e0 = await estadoPorHttpExigido(maquina);
const PREVIO: readonly (readonly [string, number])[] = [
  [RUTA, Number(exigirClave(e0, RUTA))],
];
console.log(`${RUTA} antes: ${PREVIO[0]![1]}`);

const db = (x: number): string => {
  const v = dbDeMedidor(x);
  return Number.isFinite(v) ? v.toFixed(1) : '-inf';
};
const mostrar = (etiqueta: string): void => {
  const bus = ult?.auxiliares[a];
  console.log(`${etiqueta.padEnd(34)} aux ${auxiliar}: `
    + `pre=${(bus ? db(bus.pre) : '?').padStart(6)}  post=${(bus ? db(bus.post) : '?').padStart(6)}`);
};

let sonando: ReturnType<typeof spawn> | null = null;

await conRestauracion(
  async () => {
    sonando?.kill();
    // La pausa antes de restaurar: el audio tarda en dejar de salir aunque
    // `afplay` muera al instante, y escribir con señal sonando ya costo caro.
    await new Promise((r) => setTimeout(r, 1500));
    await restaurarClaves(t, maquina, PREVIO);
  },
  async () => {
    // Fuente propia: sin señal la prueba no dice nada.
    sonando = spawn('afplay', ['/tmp/vse-comp.wav']);
    await new Promise((r) => setTimeout(r, 2500));
    mostrar('envio en reposo');
    t.enviar(codificarSetd(RUTA, 0.85));
    await new Promise((r) => setTimeout(r, 3000));
    mostrar(`envio del canal ${canal} al aux ${auxiliar}`);
  },
);

await new Promise((r) => setTimeout(r, 1000));
console.log('');
console.log('=== RESTAURACION, RELEIDA POR HTTP ===');
{
  const eFin = await estadoPorHttpExigido(maquina);
  const leido = Number(exigirClave(eFin, RUTA));
  const bien = Math.abs(leido - PREVIO[0]![1]) < 1e-9;
  console.log(`   ${RUTA} esperado ${PREVIO[0]![1]}, leido ${leido}`
    + (bien ? '   comprobado por un camino distinto del que escribio' : '   <-- NO COINCIDE'));
  if (!bien) process.exitCode = 1;
}
await t.desconectar();
