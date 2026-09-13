/**
 * Lee **una** clave de `/raw`, cortando en cuanto aparece.
 *
 * **Por qué no se usa `estadoPorHttp` para esto.** Paga su tope —8000 ms— en cada
 * llamada, todas las veces. No es lentitud de la red: `/raw` entrega el volcado
 * **y después sigue emitiendo `RTA` a 30 Hz**, así que la carrera contra el
 * silencio nunca la gana el silencio y el bucle corta por reloj.
 *
 * Adentro del bucle de un barrido eso no es una molestia, es la diferencia entre
 * una corrida posible y una imposible. Medido el 2026-09-13 auditando el ítem
 * 106: con el volcado completo por punto, un barrido de 42 puntos costaba 567 s
 * contra un tono de 300 s — **el reproductor se moría a mitad del barrido y la
 * corrida no podía terminar nunca**.
 *
 * **Vive acá y no adentro de un guion** porque lo usan dos, y dos copias de un
 * instrumento son dos instrumentos que se separan. Estaba adentro del guion de la
 * 104; el 106 lo tiró y volvió al volcado completo, que es exactamente lo que
 * pasa cuando algo no tiene nombre propio.
 */
export async function leerUnaClave(
  maquina: string,
  clave: string,
  topeMs = 3000,
): Promise<number> {
  const res = await fetch(`http://${maquina}/raw`);
  const lector = res.body?.getReader();
  if (lector === undefined) throw new Error(`no se pudo leer /raw de ${maquina}`);
  const re = new RegExp(`^SETD\\^${clave.replace(/\./g, '\\.')}\\^(.*)$`, 'm');
  const decoder = new TextDecoder();
  let texto = '';
  const hasta = Date.now() + topeMs;
  try {
    while (Date.now() < hasta) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decoder.decode(value, { stream: true });
      const m = texto.match(re);
      if (m !== null) return Number(m[1]);
    }
  } finally {
    void lector.cancel();
  }
  throw new Error(`${clave} no aparecio en /raw de ${maquina} en ${topeMs} ms`);
}
