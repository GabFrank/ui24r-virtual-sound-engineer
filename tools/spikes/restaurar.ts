/**
 * Devolver la consola a como estaba, **aunque el transporte se haya caído**.
 *
 * **El agujero que esto tapa, y que costó dejar la consola modificada.** El
 * 2026-09-13 la medición 101 perdió el WebSocket a mitad de corrida. La excepción
 * llegó a `conRestauracion`, que hizo lo suyo y llamó a restaurar — y la
 * restauración **también** falló, con «transporte no conectado», porque escribía
 * por el mismo socket que se acababa de morir. La consola quedó con cinco claves
 * cambiadas: el ecualizador puenteado, la puerta apagada, dos compresores
 * puenteados y el supresor apagado.
 *
 * `conRestauracion` declara honestamente lo que **no** cubre —SIGKILL, corte de
 * energía, socket muerto, y `process.exit()` dentro del cuerpo—. Esto cubre el
 * tercero de esos cuatro, que resultó ser el que pasa de verdad.
 *
 * **Se puede reconectar porque `Ui24rTransport` rehace el apretón de manos.** No
 * alcanza con reabrir la URL: el identificador de sesión se agota al usarse. Por
 * eso hace falta la **máquina** y no la dirección ya resuelta.
 */
import { Ui24rTransport, codificarSetd } from '@vse/mixer-adapter';

/** Cuántas veces se intenta reconectar antes de rendirse y decirlo. */
const INTENTOS = 3;
const ESPERA_ENTRE_INTENTOS_MS = 1500;
/** Entre escritura y escritura, para no atropellar a la consola. */
const ESPERA_ENTRE_CLAVES_MS = 200;

const dormir = (ms: number): Promise<void> =>
  new Promise((r) => { setTimeout(r, ms); });

/**
 * Escribe los pares `clave, valor`, reconectando si hace falta.
 *
 * Los valores tienen que venir **leídos del aparato antes de empezar** —eso lo
 * garantiza `exigirClave`—, porque restaurar a un valor supuesto deja la consola
 * en un estado que nunca existió, que es peor que no restaurar: nadie se entera.
 *
 * Lanza si no pudo dejar todo escrito. Quien llama decide qué hacer, pero lo
 * único correcto es que se vea en la salida de error: alguien tiene que ir a
 * mirar la consola a mano.
 */
export async function restaurarClaves(
  t: Ui24rTransport,
  maquina: string,
  pares: readonly (readonly [string, number])[],
): Promise<void> {
  if (!t.conectado) {
    console.error(`el transporte esta caido: se reconecta a ${maquina} para restaurar`);
    let ultima: unknown = null;
    for (let i = 1; i <= INTENTOS && !t.conectado; i++) {
      try {
        await t.conectar(maquina);
      } catch (e) {
        ultima = e;
        console.error(`   intento ${i} de ${INTENTOS} fallo`);
        if (i < INTENTOS) await dormir(ESPERA_ENTRE_INTENTOS_MS);
      }
    }
    if (!t.conectado) {
      throw new Error(`no se pudo reconectar a ${maquina} en ${INTENTOS} intentos, asi que `
        + `NO se restauro nada. Las claves que quedaron escritas son: `
        + `${pares.map(([k]) => k).join(', ')}. Hay que ponerlas a mano: `
        + `${pares.map(([k, v]) => `${k}=${v}`).join(' ')}`, { cause: ultima });
    }
    console.error('   reconectado');
  }
  for (const [clave, valor] of pares) {
    t.enviar(codificarSetd(clave, valor));
    await dormir(ESPERA_ENTRE_CLAVES_MS);
  }
  // Que las últimas escrituras lleguen antes de que alguien cierre el socket.
  await dormir(1000);
}
