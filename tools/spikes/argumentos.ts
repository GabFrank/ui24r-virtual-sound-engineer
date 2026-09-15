/**
 * Leer los argumentos de un guion de medición sin que una corrida se degrade en
 * silencio.
 *
 * **El defecto que este módulo cierra, con nombre y fecha.** El 2026-09-12 una
 * corrida del ítem 94 se archivó con **un solo punto** porque el guion decía
 * `Number(process.argv[5] ?? '-12')` y se le pasó `""` desde la línea de
 * órdenes —para saltear ese argumento y llegar al siguiente—. `??` **no** cae
 * al valor por omisión con una cadena vacía: sólo con `null` y `undefined`. Así
 * que el barrido barrió el cero y la tabla salió de una fila.
 *
 * Se arregló ese sitio a mano y una auditoría encontró, dos líneas debajo del
 * comentario que lo documentaba, **el mismo modismo intacto** en el argumento
 * de al lado: `Number(process.argv[6] ?? '-12')`. Con `""` eso da
 * `Number('') === 0`, o sea **un tono a 0 dBFS, fondo de escala, cuatro
 * minutos**. Y con un argumento malformado da `NaN`, que
 * `Buffer.writeInt16LE` escribe como cero sin lanzar: el WAV sale en silencio
 * digital y el barrido entero mide el piso de ruido del bus.
 *
 * **El defecto real no era el `??`.** Era que el guion aceptaba una corrida
 * degradada y la archivaba igual. De ahí la forma de este módulo: no hay
 * función que devuelva un valor dudoso. O el argumento es legible y está en
 * rango, o el proceso termina antes de tocar la consola.
 *
 * Y hay un test que lo guarda —`argumentos-de-los-guiones.test.ts`—, porque la
 * lección ya estaba escrita en el archivo donde el defecto seguía vivo. Una
 * lección en un comentario no es una regla; es una intención.
 */

/**
 * Termina el proceso explicando qué argumento estaba mal.
 *
 * **Código 2 y no 1**, igual que las guardas que ya existen en los guiones: 1
 * es «la medición salió y falló su criterio» y 2 es «esto no se midió». Son
 * cosas distintas para quien lee la salida después.
 */
function abortar(posicion: number, nombre: string, motivo: string): never {
  console.error(`argumento ${posicion} (${nombre}): ${motivo}`);
  console.error('No se midio nada y no se toco la consola.');
  process.exit(2);
}

/**
 * El texto crudo de un argumento, distinguiendo «no vino» de «vino vacío».
 *
 * Los dos casos caen al valor por omisión, y eso es deliberado: pasar `""` para
 * saltear un argumento posicional es una costumbre razonable de la línea de
 * órdenes. Lo que no es razonable es que `""` se convierta en `0`.
 */
function crudo(posicion: number): string | undefined {
  const v = process.argv[posicion];
  if (v === undefined || v.trim() === '') return undefined;
  return v.trim();
}

/** Un argumento de texto, con valor por omisión. Nunca devuelve cadena vacía. */
export function argTexto(posicion: number, porOmision: string): string {
  return crudo(posicion) ?? porOmision;
}

/**
 * Un argumento numérico, con rango obligatorio.
 *
 * **El rango es obligatorio a propósito.** Un número sin rango es la mitad del
 * defecto: `NaN` se atajaría y un nivel de fuente de 0 dBFS pasaría igual, que
 * es el caso que de verdad hace daño. Quien llame tiene que haber pensado entre
 * qué y qué vale este número, y eso queda escrito en el guion.
 */
export function argNumero(
  posicion: number, nombre: string, porOmision: number,
  rango: { readonly min: number; readonly max: number },
): number {
  const t = crudo(posicion);
  if (t === undefined) return porOmision;
  const v = Number(t);
  if (!Number.isFinite(v)) {
    abortar(posicion, nombre, `«${t}» no es un numero`);
  }
  if (v < rango.min || v > rango.max) {
    abortar(posicion, nombre, `${v} esta fuera de [${rango.min}, ${rango.max}]`);
  }
  return v;
}

/** Un índice entero, de `desde` a `hasta` inclusive. */
export function argIndice(
  posicion: number, nombre: string, porOmision: number,
  rango: { readonly desde: number; readonly hasta: number },
): number {
  const t = crudo(posicion);
  if (t === undefined) return porOmision;
  const v = Number(t);
  if (!Number.isInteger(v)) {
    abortar(posicion, nombre, `«${t}» no es un entero`);
  }
  if (v < rango.desde || v > rango.hasta) {
    abortar(posicion, nombre, `${v} esta fuera de ${rango.desde}..${rango.hasta}`);
  }
  return v;
}

/**
 * Una lista de números separados por comas, con mínimo de elementos.
 *
 * **El mínimo es lo que impide archivar un barrido que no dibuja nada.** Es la
 * guarda que faltaba cuando la corrida de un punto se archivó: el `??` fue el
 * mecanismo, y que el guion no exigiera un mínimo fue el defecto.
 */
export function argLista(
  posicion: number, nombre: string, porOmision: readonly number[],
  minimo: number,
): readonly number[] {
  const t = crudo(posicion);
  const xs = t === undefined ? [...porOmision] : t.split(',').map((x) => Number(x.trim()));
  const malos = xs.filter((x) => !Number.isFinite(x));
  if (malos.length > 0) {
    abortar(posicion, nombre, `${malos.length} valor(es) ilegibles en «${t}»`);
  }
  if (xs.length < minimo) {
    abortar(posicion, nombre,
      `${xs.length} punto(s) y hacen falta al menos ${minimo}. `
      + 'Un barrido mas corto no dibuja ninguna curva.');
  }
  return xs;
}
