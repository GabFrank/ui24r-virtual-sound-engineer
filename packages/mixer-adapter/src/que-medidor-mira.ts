/**
 * Qué parámetros se pueden confirmar mirando un medidor, y cuál.
 *
 * **Por qué existe separado.** `confirmarPorMedidor` compara dos niveles y dice
 * si el cambio pasó, pero no sabe **de dónde salen esos niveles ni cuánto
 * tenían que moverse**. Eso depende del parámetro y es donde se puede meter la
 * pata sin que ningún test lo note: mirar el medidor de entrada para juzgar un
 * fader daría «no se movió» siempre, porque el fader es posterior a ese punto.
 *
 * Vive fuera del adaptador para poder probarse sin consola: es aritmética sobre
 * las leyes ya medidas, no protocolo.
 */
import { faderADb, gananciaADb } from './conversiones.ts';

/** Dónde mirar el nivel de un canal. */
export type PuntoDeMedida = 'ENTRADA' | 'SALIDA';

export interface ComoConfirmarPorMedidor {
  readonly canal: number;
  /**
   * Qué medidor del canal se mira.
   *
   * **La ganancia se juzga en la ENTRADA y el fader en la SALIDA**, y no es
   * intercambiable. El medidor de entrada está después del previo y antes del
   * fader —medido el 2026-09-08—, así que la ganancia lo mueve y el fader no.
   * Al revés, el de salida es después del fader, así que ahí sí se ve.
   */
  readonly punto: PuntoDeMedida;
  /** Cuánto tiene que moverse el nivel, con signo. */
  readonly esperadoDb: number;
}

/**
 * Cómo confirmar por medidor una escritura, o `null` si no se puede.
 *
 * Devolver `null` es la respuesta correcta para la mayoría de los parámetros y
 * no un caso de borde: un ecualizador, una puerta o un retardo pueden no mover
 * el nivel en absoluto, y «no se movió» no distingue entre que la escritura
 * falló y que hizo exactamente lo que tenía que hacer.
 */
export function comoConfirmarPorMedidor(
  parametro: string,
  valor: number,
  anterior: number,
  canalDelPrevio: (fuente: string) => number | null = () => null,
): ComoConfirmarPorMedidor | null {
  const fader = /^i\.(\d+)\.mix$/.exec(parametro);
  if (fader !== null) {
    return {
      canal: Number(fader[1]) + 1,
      punto: 'SALIDA',
      esperadoDb: faderADb(valor) - faderADb(anterior),
    };
  }

  const ganancia = /^hw\.(\d+)\.gain$/.exec(parametro);
  if (ganancia !== null) {
    // **El previo `hw.M` alimenta al canal que lo tenga como fuente, y no
    // siempre es el M+1.** `i.N.src` puede apuntar a cualquiera.
    //
    // Antes acá se devolvía `M + 1` con un comentario diciendo «quien llama lo
    // corrige si sabe otra cosa». **Nadie lo corregía**: el adaptador usaba el
    // canal tal cual, así que con un enrutamiento distinto del de fábrica el
    // respaldo miraba el medidor de otro canal y confirmaba —o rechazaba—
    // mirando una señal ajena. Es el mismo defecto que ya se había arreglado
    // para la lectura de ganancia, reaparecido en un camino nuevo, y lo
    // encontró una auditoría. Un comentario que reparte la responsabilidad no
    // es una salvaguarda: es una nota que nadie lee.
    //
    // Ahora hay que decirle quién es el canal, y **si no se sabe, no se
    // confirma**: devolver `null` deja la escritura sin enviar, que es la misma
    // decisión que toma `rutaDeGanancia` cuando le falta el `src`.
    const canal = canalDelPrevio(`hw.${ganancia[1]}`);
    if (canal === null) return null;
    return {
      canal,
      punto: 'ENTRADA',
      esperadoDb: gananciaADb(valor) - gananciaADb(anterior),
    };
  }

  // El silencio queda afuera A PROPOSITO. No tiene un «cuánto tenía que
  // moverse»: va al piso, y confirmar «llegó al piso» necesita otra regla
  // —cuánto es el piso, cuánto tarda, qué pasa si el canal ya estaba en
  // silencio—. Meterlo acá con un esperadoDb inventado sería peor que no
  // tenerlo, porque parecería cubierto.
  return null;
}
