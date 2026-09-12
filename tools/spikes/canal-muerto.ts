/**
 * Comprobar que lo que vamos a escribir no puede sonar en la sala.
 *
 * **Por qué es un módulo y no un párrafo copiado en cada guion.** La regla se
 * fue aprendiendo a los golpes y cada golpe la endureció:
 *
 * 1. Al principio alcanzaba con «el canal está silenciado». No alcanza: `i.8`
 *    de esta consola está silenciado y tiene **dos envíos abiertos a auxiliares
 *    y dos a efectos**, así que puede estar sonando en los monitores mientras el
 *    general no lo muestra.
 * 2. Después se agregó «y el fader al fondo». Tampoco alcanza por sí solo, y
 *    además es demasiado estricto: `i.20` tiene el fader a media altura y **no
 *    puede llevar nada**, porque su `src` es `none`.
 * 3. Y lo más fuerte resultó ser justamente ése: **`src = none` quiere decir que
 *    no hay entrada física conectada a esa tira**. Esta consola tiene 24 canales
 *    y 20 entradas, así que los cuatro últimos no tienen fuente posible.
 *
 * **Y por qué es código y no una nota.** `alcance-recall.ts` llevaba escrito en
 * su propio comentario que la comprobación era «ahora explícita», y era prosa:
 * el guion aceptaba la lista de canales que le pasaran y escribía. Antes de eso
 * había conmutado la alimentación fantasma cuatro veces contra INV-007, y había
 * patcheado una salida física que resultó inocua **por suerte y no por método**.
 * Una regla que vive en un comentario no es una regla; es una intención.
 */

/**
 * El estado entero de la consola por HTTP.
 *
 * **`/raw` no termina nunca**: la consola manda el volcado y después se queda
 * difundiendo por el mismo flujo. Un `await r.text()` no resuelve jamás, y con
 * un plazo encima aborta y devuelve vacío. Hay que leer de a trozos y cortar
 * cuando deja de llegar nada. Es la misma trampa que hace salir a `curl` con 28.
 */
export async function estadoPorHttp(maquina: string): Promise<Map<string, string>> {
  const r = await fetch(`http://${maquina}/raw`).catch(() => null);
  if (r === null || r.body === null) return new Map();
  const lector = r.body.getReader();
  const dec = new TextDecoder();
  let cuerpo = '';
  const hasta = Date.now() + 8000;
  for (;;) {
    const paso = await Promise.race([
      lector.read(),
      new Promise<{ done: true; value: undefined }>(
        (res) => setTimeout(() => res({ done: true, value: undefined }), 900),
      ),
    ]).catch(() => ({ done: true as const, value: undefined }));
    if (paso.done || Date.now() > hasta) break;
    cuerpo += dec.decode(paso.value, { stream: true });
  }
  await lector.cancel().catch(() => {});
  const m = new Map<string, string>();
  for (const linea of cuerpo.split('\n')) {
    const c = /^SET[DS]\^([^^]+)\^(.*)$/.exec(linea.trim());
    if (c !== null) m.set(c[1]!, c[2]!);
  }
  return m;
}

/**
 * Cuántas claves tiene que traer una lectura para ser creíble.
 *
 * El volcado de esta consola trae del orden de 6600 claves. Cualquier número
 * de tres cifras o menos es una lectura que falló, no una consola vacía.
 * Se pone en mil y no en seis mil para que un firmware con menos canales no
 * dispare la guarda; lo que hay que distinguir es «leí» de «no leí».
 */
export const CLAVES_MINIMAS_PLAUSIBLES = 1000;

/**
 * El estado de la consola, o una excepción. **Nunca un mapa vacío.**
 *
 * **Por qué existe además de {@link estadoPorHttp}.** Aquélla devuelve un mapa
 * vacío ante cualquier falla —el `fetch` que no conecta, el cuerpo nulo, el
 * plazo que corta antes del primer trozo—, y un mapa vacío es indistinguible de
 * una lectura real. Una auditoría encontró qué costaba eso: cuatro guiones del
 * compresor leían `m.afs.enabled` así, caían al valor por omisión `'1'`,
 * imprimían «estaba en 1» **como si lo hubieran medido**, y al restaurar
 * **encendían** el supresor de realimentación. O sea que una lectura fallida
 * dejaba encendido el único de cuarenta y cinco campos que una instantánea no
 * devuelve, en el bus general del usuario.
 *
 * El defecto de forma es el que este proyecto ya tiene nombrado: **un control
 * que sólo puede confirmar**. `?? '1'` no es un valor por omisión, es una
 * suposición disfrazada de lectura.
 *
 * Así que todo guion que vaya a **restaurar** algo a partir de lo que leyó usa
 * esta función. Si no pudo leer, no sabe a qué restaurar, y lo correcto es
 * abortar antes de escribir —no adivinar.
 */
export async function estadoPorHttpExigido(maquina: string): Promise<Map<string, string>> {
  const e = await estadoPorHttp(maquina);
  if (e.size < CLAVES_MINIMAS_PLAUSIBLES) {
    throw new Error(
      `la lectura por HTTP de ${maquina} trajo ${e.size} claves, y una consola viva trae `
      + `miles. No se escribe nada: sin saber el estado previo no hay a qué restaurar. `
      + `(umbral: ${CLAVES_MINIMAS_PLAUSIBLES} claves)`,
    );
  }
  return e;
}

/**
 * Lee una clave que hace falta de verdad, y avisa si no está.
 *
 * Distingue los dos casos que `?? valorPorOmision` confunde: **la clave no
 * existe en este firmware** y **la lectura no trajo nada**. La segunda ya la
 * ataja {@link estadoPorHttpExigido}; ésta ataja la primera, que con un `??`
 * se convierte silenciosamente en el valor que el guion esperaba encontrar.
 *
 * **Y sobre un mapa vacío también falla**, que es lo que la hace suficiente por
 * sí sola: un mapa sin claves no tiene la que se le pide. Así que un guion que
 * arma su propio mapa desde el WebSocket, sin pasar por
 * {@link estadoPorHttpExigido}, queda igual de protegido.
 *
 * Genérica en el tipo del valor porque los guiones tienen las dos formas: los
 * que leen `/raw` por HTTP arman `Map<string, string>` y los que escuchan el
 * WebSocket arman `Map<string, number>`. Una versión atada a `string` habría
 * obligado a una segunda función o a una conversión, y dos funciones para la
 * misma regla es la forma de que una de las dos quede sin usar.
 */
export function exigirClave<V>(estado: ReadonlyMap<string, V>, k: string): V {
  const v = estado.get(k);
  if (v === undefined) {
    throw new Error(
      `la clave ${k} no vino en el volcado de ${estado.size} claves. No se adivina su valor: `
      + `un guion que la restaura tiene que saber a qué.`,
    );
  }
  return v;
}

function num(estado: ReadonlyMap<string, string>, k: string): number {
  const v = Number(estado.get(k) ?? '0');
  return Number.isFinite(v) ? v : 0;
}

export interface InformeDeCanal {
  readonly canal: number;
  readonly silenciado: boolean;
  readonly fader: number;
  readonly src: string;
  readonly nombre: string;
  readonly auxAbiertos: readonly number[];
  readonly fxAbiertos: readonly number[];
  /** Si NO puede llegar audio a ningún lado por esta tira. */
  readonly muerto: boolean;
  /** Por qué está muerto, o por qué no. En castellano, para el archivo. */
  readonly porQue: string;
}

/** Qué se sabe de un canal antes de escribirle. */
export function informeDeCanal(estado: ReadonlyMap<string, string>, n: number): InformeDeCanal {
  const silenciado = estado.get(`i.${n}.mute`) === '1';
  const fader = num(estado, `i.${n}.mix`);
  const src = estado.get(`i.${n}.src`) ?? 'desconocido';
  const auxAbiertos = [...Array(10).keys()].filter(
    (k) => num(estado, `i.${n}.aux.${k}.value`) > 0.001 && estado.get(`i.${n}.aux.${k}.mute`) === '0',
  );
  const fxAbiertos = [...Array(4).keys()].filter(
    (k) => num(estado, `i.${n}.fx.${k}.value`) > 0.001 && estado.get(`i.${n}.fx.${k}.mute`) === '0',
  );

  // **Sin fuente no puede entrar nada, y eso gana sobre todo lo demás.** No
  // importa dónde esté el fader ni si hay envíos abiertos: una tira sin entrada
  // física conectada no tiene qué mandar.
  if (src === 'none') {
    return {
      canal: n, silenciado, fader, src, nombre: estado.get(`i.${n}.name`) ?? '',
      auxAbiertos, fxAbiertos, muerto: true,
      porQue: 'src=none: no hay entrada fisica conectada a esta tira',
    };
  }

  const razones: string[] = [];
  if (!silenciado) razones.push('NO esta silenciado');
  if (fader > 0.001) razones.push(`el fader esta en ${fader.toFixed(4)}`);
  if (auxAbiertos.length > 0) razones.push(`envios abiertos a auxiliares: ${auxAbiertos.join(',')}`);
  if (fxAbiertos.length > 0) razones.push(`envios abiertos a efectos: ${fxAbiertos.join(',')}`);
  return {
    canal: n, silenciado, fader, src, nombre: estado.get(`i.${n}.name`) ?? '',
    auxAbiertos, fxAbiertos,
    muerto: razones.length === 0,
    porQue: razones.length === 0
      ? 'silenciado, fader al fondo y sin envios abiertos'
      : razones.join('; '),
  };
}

/**
 * Cuánto hay que exigirle a un canal, según lo que el guion le vaya a hacer.
 *
 * **`callado` no alcanza para todo, y eso lo enseñó una auditoría.** Un guion
 * que sólo mueve una panoramización o un filtro puede trabajar sobre un canal
 * silenciado con el fader al fondo: lo que escriba no puede sonar.
 *
 * Pero `alcance-recall.ts` hace otra cosa. Su regex de booleanos captura
 * `i.N.mute`, así que sobre un canal silenciado escribe **cero**: lo
 * **desilencia**. Después sube el fader de 0 a 0,2 y la ganancia del previo
 * +0,2, y lo deja así entre ocho y quince segundos hasta que el recall lo
 * devuelve. Sobre una entrada XLR con algo enchufado, eso **suena en la sala**.
 *
 * Y ahí está lo que hay que decir sin rodeos: la corrida del 2026-09-11 eligió
 * i.4, i.13, i.16 e i.17 —silenciados y con el fader al fondo, sí— y **los
 * cuatro tienen `src=hw.N`**. Los canales 21 a 24, que el guion traía por
 * omisión, tienen `src=none`. O sea que se eligieron canales **menos** seguros
 * que los de fábrica, en el mismo trabajo que celebraba `src=none` como el
 * criterio más fuerte.
 */
export type Exigencia =
  /** No puede sonar tal como está: silenciado, fader al fondo, sin envíos. */
  | 'callado'
  /** No puede sonar **haga lo que haga el guion**: sin entrada física. */
  | 'sin-fuente';

/**
 * Enumera los canales pedidos, lo imprime, y dice si se puede escribir.
 *
 * **Imprime siempre, pasen o no.** La enumeración tiene que quedar en el archivo
 * de evidencia: una medición que dice «se eligieron canales muertos» sin mostrar
 * en qué estado estaban es una afirmación sin respaldo, y este proyecto ya
 * publicó dos de ésas.
 */
export function exigirCanalesMuertos(
  estado: ReadonlyMap<string, string>, canales: readonly number[],
  exigencia: Exigencia = 'callado',
): boolean {
  console.log(`canales enumerados por HTTP antes de escribir (exigencia: ${exigencia}):`);
  let todos = true;
  for (const n of canales) {
    const i = informeDeCanal(estado, n);
    const alcanza = exigencia === 'sin-fuente' ? i.src === 'none' : i.muerto;
    const porQue = exigencia === 'sin-fuente' && i.src !== 'none'
      ? `tiene entrada fisica conectada (${i.src}), y este guion desilencia y sube ganancia`
      : i.porQue;
    console.log(
      `  i.${String(n).padEnd(2)} mute=${i.silenciado ? 1 : 0} fader=${i.fader.toFixed(4)} `
      + `src=${i.src.padEnd(8)} nombre=${JSON.stringify(i.nombre)} `
      + `-> ${alcanza ? 'SIRVE' : 'NO SIRVE'}: ${porQue}`,
    );
    if (!alcanza) todos = false;
  }
  return todos;
}

/**
 * Lo que no es un canal y también puede sonar: el reproductor.
 *
 * Un guion que conmuta `p.0.mute` con una lista cargada y el fader arriba hace
 * ruido en la sala aunque todos los canales estén muertos.
 */
export function reproductorCallado(estado: ReadonlyMap<string, string>): { si: boolean; porQue: string } {
  const lista = estado.get('var.currentPlaylist') ?? '';
  const faders = [num(estado, 'p.0.mix'), num(estado, 'p.1.mix')];
  const razones: string[] = [];
  if (lista !== '') razones.push(`hay lista cargada: ${JSON.stringify(lista)}`);
  if (faders.some((f) => f > 0.001)) razones.push(`faders del reproductor en ${faders.map((f) => f.toFixed(4)).join(' y ')}`);
  return {
    si: razones.length === 0,
    porQue: razones.length === 0 ? 'sin lista cargada y con los dos faders al fondo' : razones.join('; '),
  };
}

/**
 * Un bus de salida al que se le va a cambiar el patcheo.
 *
 * Mandar una señal a un jack que uno no ve es la clase de cosa que sale bien
 * hasta el día que hay algo enchufado ahí.
 */
export function busSinEnvios(
  estado: ReadonlyMap<string, string>, bus: string, canales: number,
): { si: boolean; porQue: string } {
  const m = /^a\.(\d+)$/.exec(bus);
  if (m === null) return { si: false, porQue: `no se sabe leer el bus ${bus}` };
  const b = Number(m[1]);
  const abiertos = [...Array(canales).keys()].filter(
    (c) => num(estado, `i.${c}.aux.${b}.value`) > 0.001 && estado.get(`i.${c}.aux.${b}.mute`) === '0',
  );
  const fader = num(estado, `${bus}.mix`);
  const razones: string[] = [];
  if (abiertos.length > 0) razones.push(`canales con envio abierto: ${abiertos.join(',')}`);
  if (fader > 0.001) razones.push(`el fader del bus esta en ${fader.toFixed(4)}`);
  return {
    si: razones.length === 0,
    porQue: razones.length === 0 ? 'ningun canal le manda y su fader esta al fondo' : razones.join('; '),
  };
}
