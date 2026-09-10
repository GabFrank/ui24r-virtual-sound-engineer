/**
 * Confirmar una escritura mirando el medidor, cuando no hay testigo.
 *
 * **Es la segunda línea, no la primera.** Lo que confirma de verdad una
 * escritura contra esta consola es la segunda conexión testigo (ADR-024), que
 * ve el valor literal a los 11,5 ms de mediana. Esto entra cuando el testigo no
 * pudo abrir —wifi saturada en pleno show, que es justo cuando más falta hace—
 * y es lo que INV-011 ya contemplaba: para la ganancia con señal presente, el
 * propio medidor alcanza.
 *
 * **Qué comprueba y qué no.** Comprueba **el efecto**, no el valor. Si se
 * subió la ganancia 3 dB, el nivel tiene que subir 3 dB; si subió, algo hizo la
 * escritura. Lo que no dice es que el crudo escrito sea exactamente el que
 * quedó en la consola. Por eso se anota en el diario como `VU` y nunca como
 * `WITNESS`: un diario viejo tiene que seguir diciendo la verdad sobre con qué
 * se comprobó cada cosa.
 *
 * **Y no sirve sin señal.** Un canal en silencio no mueve su medidor por más
 * que la ganancia cambie, así que ahí no hay confirmación posible y la decisión
 * de ADR-026 es no escribir: escribir a ciegas y marcarlo «no verificado»
 * dejaría al operador sin forma de distinguir eso de un cambio que sí funcionó.
 */

/**
 * Cuánto puede desviarse el cambio observado del esperado.
 *
 * **Elegido, no medido.** Un escalón del medidor son 0,333 dB y la señal de un
 * instrumento real nunca está quieta, así que exigir el valor exacto haría
 * fallar confirmaciones buenas. Un decibel y medio es holgado para el ruido de
 * una fuente viva y estrecho para no dar por buena una escritura que no pasó:
 * la escritura más chica que el asistente propone es de 1 dB, y un cambio de
 * 1 dB con esta tolerancia no se confunde con quedarse quieto.
 */
export const TOLERANCIA_CONFIRMACION_DB = 1.5;

/**
 * Por debajo de esto se considera que el canal no está sonando.
 *
 * Es el mismo umbral con el que el asistente descarta muestras sin señal, y por
 * el mismo motivo: más abajo lo que se mide es el piso de ruido.
 */
export const NIVEL_MINIMO_PARA_CONFIRMAR_DB = -50;

export type ResultadoConfirmacion =
  | { readonly estado: 'CONFIRMADO'; readonly cambioDb: number }
  | { readonly estado: 'NO_CONFIRMADO'; readonly cambioDb: number; readonly esperadoDb: number }
  | { readonly estado: 'SIN_SENAL' };

export interface OpcionesConfirmacionPorMedidor {
  /** Nivel del canal antes de escribir, en dB de la escala de la consola. */
  readonly antesDb: number;
  /** Nivel después de escribir y esperar a que asiente. */
  readonly despuesDb: number;
  /** Cuánto tenía que moverse el nivel, con signo. */
  readonly esperadoDb: number;
  readonly toleranciaDb?: number;
  readonly nivelMinimoDb?: number;
}

/**
 * Si el medidor confirma el cambio.
 *
 * Se pide **los dos niveles ya medidos** en vez de un lector y un reloj: así
 * esto es una función pura y la política —cuánto esperar, cuántas tramas
 * promediar— queda del lado que tiene el transporte, que es donde puede
 * probarse contra el aparato.
 */
export function confirmarPorMedidor(o: OpcionesConfirmacionPorMedidor): ResultadoConfirmacion {
  const minimo = o.nivelMinimoDb ?? NIVEL_MINIMO_PARA_CONFIRMAR_DB;
  const tolerancia = o.toleranciaDb ?? TOLERANCIA_CONFIRMACION_DB;

  // **Las dos lecturas tienen que tener señal.** Con silencio en cualquiera de
  // las dos, la diferencia no dice nada del cambio: dice que la fuente paró.
  if (!Number.isFinite(o.antesDb) || !Number.isFinite(o.despuesDb)) return { estado: 'SIN_SENAL' };
  if (o.antesDb < minimo || o.despuesDb < minimo) return { estado: 'SIN_SENAL' };

  const cambioDb = o.despuesDb - o.antesDb;

  // **Dos condiciones, y la segunda no es adorno.**
  //
  // La primera es la obvia: el cambio observado tiene que parecerse al
  // esperado. La segunda es que además tiene que **haberse movido de verdad**,
  // en la dirección correcta y al menos la mitad de lo pedido.
  //
  // Hace falta porque la tolerancia es más ancha que el cambio más chico que el
  // asistente propone. Con 1 dB esperado y 1,5 de tolerancia, quedarse
  // completamente quieto da |0 − 1| = 1, que entra: el medidor habría
  // «confirmado» una escritura que no llegó. Lo destapó un test escrito para
  // documentar el límite, y el límite resultó inaceptable en vez de tolerable.
  const seMovio = Math.sign(cambioDb) === Math.sign(o.esperadoDb)
    && Math.abs(cambioDb) >= Math.abs(o.esperadoDb) / 2;

  if (Math.abs(cambioDb - o.esperadoDb) <= tolerancia && seMovio) {
    return { estado: 'CONFIRMADO', cambioDb };
  }
  return { estado: 'NO_CONFIRMADO', cambioDb, esperadoDb: o.esperadoDb };
}
