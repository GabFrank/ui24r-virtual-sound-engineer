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
 *
 * **Sólo lee claves `SETD`.** Las de texto —`hwoutaux.N.src`, `m.afs.eq.N`— viajan
 * como `SETS` y esta función **no las encuentra**: lanzaría «no apareció en /raw»
 * a los 3000 ms, que un lector confunde con una consola muerta. `estadoPorHttp`
 * acepta las dos. Queda escrito porque este módulo tiene nombre propio para que lo
 * usen varios guiones, y la restricción no se ve desde afuera.
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
  // Se guarda para poder cancelarlo: sin esto quedaban temporizadores colgando
  // que mantienen el bucle de eventos referenciado y retrasan la salida.
  let plazo: ReturnType<typeof setTimeout> | undefined;
  try {
    while (Date.now() < hasta) {
      // **Con plazo, y el plazo SALE en vez de reintentar.** Si la consola acepta
      // la conexión y no manda nada, `read()` no resuelve nunca y el guion queda
      // colgado —con el general del usuario abajo y el tono sonando, en el caso
      // del ítem 106—.
      //
      // **Y sale, no `continue`.** La primera versión de este plazo reintentaba, y
      // eso pierde datos de forma permanente: un `ReadableStreamDefaultReader`
      // **encola** las lecturas y las satisface en orden, así que el `read()`
      // abandonado sigue vivo y se come el trozo siguiente —el que la lectura
      // nueva creía estar esperando—. Comprobado ejecutándolo: con un plazo
      // agotado, el primer trozo va al `read()` abandonado y `texto` nunca lo ve.
      // Justo el trozo donde viven las claves tempranas del volcado.
      //
      // `estadoPorHttp` trata el plazo como `done` y sale, por esto mismo. Este
      // módulo copió el patrón y cambió la palabra clave.
      const temporizador = new Promise<null>((r) => { plazo = setTimeout(() => r(null), 900); });
      const paso = await Promise.race([lector.read(), temporizador]);
      if (paso === null) break;
      clearTimeout(plazo);
      const { value, done } = paso;
      if (done) break;
      texto += decoder.decode(value, { stream: true });
      const m = texto.match(re);
      if (m !== null) return Number(m[1]);
    }
  } finally {
    clearTimeout(plazo);
    void lector.cancel();
  }
  throw new Error(`${clave} no aparecio en /raw de ${maquina} en ${topeMs} ms`);
}
