/**
 * Que la consola vuelva a su estado **pase lo que pase**.
 *
 * **Por qué existe, con la anécdota completa porque enseña más que la regla.**
 * Una auditoría de instrumentos encontró el 2026-09-12 que ninguno de los diez
 * guiones de la tanda tenía `try/finally`: cualquier caída a mitad de camino
 * dejaba escritos umbrales, relaciones, envíos, faderes, el ecualizador y
 * `m.afs.enabled = 0`. Y `enviar()` lanza si el socket se cayó, así que la
 * caída no era hipotética.
 *
 * Mientras escribía este módulo lo demostré en mí. Corrí un guion para
 * comprobar que su nueva guarda de argumentos abortaba, y lo pasé por
 * `head -4`. `head` cerró la tubería, el proceso murió, y dejó
 * `i.9.aux.2.value` en **0,8** cuando la restauración verificada de la medición
 * anterior lo dejaba en 0. Un envío a un auxiliar de la consola del usuario,
 * abierto, por una prueba de un argumento.
 *
 * **Y ahí está la lección que un `try/finally` solo no da.** Lo que me mató fue
 * una señal, no una excepción: `finally` no corre cuando el proceso recibe
 * `SIGTERM`, ni cuando alguien corta con Ctrl-C. Así que este módulo tapa las
 * dos puertas —la excepción y la señal—, porque tapar una sola habría dejado
 * abierta exactamente la que me pasó.
 *
 * **Lo que NO puede cubrir**, declarado para que nadie lo crea más fuerte de lo
 * que es:
 *
 * - `SIGKILL` y quedarse sin corriente. No hay vuelta.
 * - Que el socket esté caído cuando toca restaurar. Se informa por la salida de
 *   error qué quedó escrito, que es lo mínimo para que alguien lo arregle a
 *   mano.
 * - **`process.exit()` dentro del cuerpo.** Termina el proceso sin correr el
 *   `finally`, igual que una señal, y a diferencia de la señal no se puede
 *   atajar. Así que un guion envuelto en esto **no llama a `process.exit` desde
 *   adentro**: si tiene que abortar, lanza --la excepción sí pasa por la
 *   restauración--, y el código de salida lo pone quien envuelve. Las guardas de
 *   `argumentos.ts` sí usan `process.exit`, y eso está bien: corren **antes** de
 *   conectar, cuando todavía no hay nada escrito que restaurar.
 */

/**
 * Corre `cuerpo` y restaura después, siempre.
 *
 * `restaurar` se llama **una sola vez**, venga por el camino que venga: retorno
 * normal, excepción, o señal. El centinela está porque con Ctrl-C durante una
 * excepción se podía entrar dos veces, y escribir dos veces la restauración no
 * es grave pero sí confuso en el registro de la corrida.
 *
 * Y `restaurar` tiene que ser **idempotente y sin argumentos**: no recibe el
 * resultado de la medición porque no debe depender de que la medición haya
 * llegado a ningún lado. Lo que restaura tiene que estar leído **antes** de
 * empezar —ésa es la otra mitad, y la cubre `exigirClave`—.
 */
export async function conRestauracion<T>(
  restaurar: () => void | Promise<void>,
  cuerpo: () => Promise<T>,
): Promise<T> {
  let yaRestauro = false;
  const unaVez = async (): Promise<void> => {
    if (yaRestauro) return;
    yaRestauro = true;
    try {
      await restaurar();
    } catch (e) {
      // **Se informa y no se tapa.** Si la restauración falla, lo único útil es
      // que quede dicho en la salida de error: alguien tiene que arreglarlo a
      // mano y necesita saber qué.
      console.error('LA RESTAURACION FALLO. Hay que revisar la consola a mano.');
      console.error(e);
    }
  };

  // Las señales que sí se pueden atajar. `SIGPIPE` no hace falta: Node lo
  // convierte en un error `EPIPE` al escribir, que sale por el `catch`.
  const señales: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const alRecibirSeñal = (s: NodeJS.Signals) => {
    void (async () => {
      console.error(`\n${s} recibida: se restaura antes de salir.`);
      await unaVez();
      // El 128 + número de señal es la convención del intérprete de órdenes
      // para «murió por una señal», y la distingue de los códigos que los
      // guiones usan para sus veredictos (1 falló el criterio, 2 no se midió).
      process.exit(s === 'SIGINT' ? 130 : 143);
    })();
  };
  for (const s of señales) process.once(s, () => alRecibirSeñal(s));

  try {
    return await cuerpo();
  } finally {
    await unaVez();
    for (const s of señales) process.removeAllListeners(s);
  }
}
