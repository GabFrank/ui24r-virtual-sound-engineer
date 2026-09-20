import { LIMITES } from '@vse/domain';
import {
  CANALES_DE_ENTRADA, entrada, esEnvioAUnAuxiliar, esNivelDeEnvioAMonitor,
  FUENTES_DE_UN_AUXILIAR,
} from '@vse/mixer-adapter';

/**
 * Qué le llega a la cuña de un músico, leído del estado confirmado.
 *
 * **Es sólo lectura y a propósito.** Esta es la primera mitad de la pantalla por
 * músico: elegir a alguien y **ver** su cuña antes de que nada se mueva. Subir,
 * escuchar y anotar están enteros desde el 2026-09-19 en los dos servicios de al
 * lado, y hasta esta pantalla no los llamaba nadie.
 *
 * ## Por qué es un archivo sin decoradores
 *
 * El mismo motivo que [`ley-del-envio.ts`](./ley-del-envio.ts): el modo de
 * eliminación de tipos de Node —con el que corren los tests— no parsea un
 * decorador de Angular, así que lo que viva dentro del componente no se puede
 * probar. Y lo que hay acá **hay que probarlo**: cada una de estas funciones ya
 * tiene una forma de fallar que este repositorio pagó antes.
 *
 * ## Trabajo previo
 *
 * **La consola ya tiene una pantalla por músico y se llama MOREME**, y estaba en
 * el manual archivado de este repositorio sin que ningún documento la citara
 * —`docs/referencia/manual-ui24r-v1.0.txt`, secciones 6.2, 3.3 y 3.4—. El músico
 * se asigna su propio canal («ASSIGN ME») y su propio auxiliar («ME OUT»), y
 * arma **su mezcla personal**; su canal va **resaltado en naranja**. Eso valida
 * dos decisiones de esta pantalla: que la unidad sea el músico y no el auxiliar,
 * y que **su propio instrumento vaya primero y marcado**.
 *
 * Lo que MOREME no hace es lo que esta pantalla agrega: no mide, no tiene techo,
 * no distingue poner el nivel de retocarlo y no escucha entre paso y paso. Y es
 * para el teléfono del músico; ésta es para la tablet del que opera, con el
 * músico enfrente.
 *
 * De los cuatro repositorios de terceros, el único con algo parecido es el
 * banco de pruebas de `fmalcher/soundcraft-ui` —`auxbus/:bus`, que lista los
 * caminos que entran a un auxiliar—, y es un banco de pruebas: cablea cuatro
 * canales de ejemplo a mano. Detalle y citas en
 * [`trabajo-previo-de-terceros.md`](../../../../../docs/referencia/trabajo-previo-de-terceros.md).
 */

/** El techo de ADR-034: nominal. Sale de la tabla del motor, no se escribe acá. */
export const NOMINAL_DB = LIMITES.MONITOR_AUX_SEND?.techoAbsoluto ?? 0;

/**
 * La ruta del envío de un canal a una cuña, en la forma que publica la consola.
 *
 * **Los índices que se ven son base uno y los del protocolo son base cero**, y
 * ésa es toda la razón de que esta conversión tenga nombre propio en vez de
 * estar escrita en el componente: la pantalla habla de «el canal 1» y la consola
 * de `i.0`. Un desfase de uno acá no se rompe ruidosamente, muestra el envío del
 * vecino.
 *
 * Devuelve `undefined` cuando el par no existe en este aparato, y lo decide
 * `esNivelDeEnvioAMonitor` —la misma función que el asistente usa para aceptar o
 * rechazar una ruta— en vez de una comparación propia contra 24 y 10. Dos
 * copias del rango serían dos verdades, y la que se pudre es siempre la de la
 * pantalla.
 */
export function rutaDelEnvio(canal: number, auxiliar: number): string | undefined {
  if (!Number.isInteger(canal) || !Number.isInteger(auxiliar)) return undefined;
  const ruta = `i.${canal - 1}.aux.${auxiliar - 1}.value`;
  return esNivelDeEnvioAMonitor(ruta) ? ruta : undefined;
}

/**
 * En qué nivel está un envío, o por qué no se puede decir.
 *
 * **Cada caso es distinto para el que mira, y ésa es la razón de que sean
 * cinco.** «Está en silencio» invita a subir; «no lo pude leer» invita a mirar
 * la conexión; «fuera del tramo medido» dice que el número existe pero que
 * ponerlo en decibeles sería inventarlo; y «manda, sin ley medida» dice que ese
 * camino le está llegando al músico y que **nadie midió cuánto vale su escala**.
 */
export type NivelDelEnvio =
  | {
      readonly tipo: 'EN_DB';
      readonly db: number;
      /**
       * Cuánto falta para el techo de nominal, en dB.
       *
       * Negativo significa que el envío ya está **por encima** del techo, que es
       * posible: la ley llega a +10 dB y el techo lo pone ADR-034, no el
       * aparato. Un envío así lo dejó alguien a mano, y la aplicación no lo va a
       * poder subir más — conviene que se vea antes de que el motor lo rechace.
       */
      readonly aNominalDb: number;
    }
  /** La consola publica el crudo cero: el envío está cerrado. */
  | { readonly tipo: 'EN_SILENCIO' }
  /**
   * Hay un valor, pero cae fuera del tramo que la 104 midió.
   *
   * **No se traduce a decibeles, y es deliberado.** `fromRaw` contesta un número
   * para cualquier crudo —con 0,1 devuelve −52,9 dB— pero por debajo de 0,25 lo
   * que se mide **no es la ley**: es una fuga de 1 kHz que viaja aguas abajo del
   * fader del general (ítem 105). **De quién es esa fuga no se sabe**, y la
   * primera redacción de esta línea decía «del banco»: el 105 imprimió `NO SE
   * IMPRIME VEREDICTO` y dejó sin separar si el cruce ocurre en la Scarlett o en
   * la etapa de salida de la consola. Para la guarda da igual de quién sea —lo que
   * importa es que no es la ley— pero adjudicarlo es afirmar lo que no se midió.
   * Mostrar ese número sería lo que la regla 1 del repositorio prohíbe. Se dice el
   * crudo, que es el dato que de verdad se tiene.
   */
  | { readonly tipo: 'FUERA_DEL_TRAMO_MEDIDO'; readonly crudo: number }
  /**
   * Manda algo, y la ley de **esa familia** no está medida.
   *
   * Es el caso de las entradas de línea, el reproductor y los retornos de
   * efecto: entran a la misma cuña que los canales y el ítem 104 midió **sólo**
   * `i.9.aux.4.value`. Suponerles la misma curva sería lo que la regla 1 del
   * repositorio prohíbe, así que se dice lo que se sabe --que ese camino está
   * abierto-- y no lo que no.
   *
   * **Y se dice, en vez de esconderlo, que es lo que hacía la primera versión.**
   * Un retorno de reverb abierto en la cuña de un cantante es lo más común que
   * hay, y la pantalla llegaba a decir «a esta cuña no le llega nada».
   */
  | { readonly tipo: 'MANDA_SIN_LEY'; readonly crudo: number }
  /** La consola no publicó esa clave, o publicó algo que no es un número. */
  | { readonly tipo: 'SIN_LEER' };

/**
 * Lee un envío del volcado del estado confirmado y lo pasa a decibeles.
 *
 * **La clave ausente no es silencio.** Un `Map` que no tiene la clave y un envío
 * cerrado se parecen —los dos «no mandan nada»— y son cosas opuestas: el primero
 * significa que no sé, el segundo que sé. Confundirlos haría que una cuña
 * invisible por falta de volcado se viera como una cuña lista para subir, con el
 * músico enfrente.
 *
 * **Y el crudo que no es un número tampoco es silencio.** Es la familia de
 * defecto que este motor ya tapó tres veces: `NaN` sobrevive a toda comparación
 * y sale por el lado permisivo. Acá sale por `SIN_LEER`.
 */
export function leerNivelDelEnvio(
  ruta: string,
  volcado: ReadonlyMap<string, { readonly valor: number }>,
): NivelDelEnvio {
  // **Se exige que sea un envío a monitor, y no sólo que tenga ley.** Sin esta
  // línea la función convertía alegremente cualquier ruta de la tabla --la
  // profundidad de la puerta, por ejemplo, que está medida desde el 2026-09-17--
  // y devolvía un número correcto para la pregunta equivocada. Es el defecto que
  // este repositorio ya nombró en `puedeSubirEnvioAMonitor`: el nombre mentía.
  // Lo encontró el test de esta pieza, que daba por sentado que `i.0.gate.depth`
  // no tenía ley.
  if (!esEnvioAUnAuxiliar(ruta)) return { tipo: 'SIN_LEER' };
  const leido = volcado.get(ruta);
  if (leido === undefined || !Number.isFinite(leido.valor)) return { tipo: 'SIN_LEER' };
  const crudo = leido.valor;
  // **El crudo cero es lo único que se puede afirmar sin ley**: es el extremo
  // del control, no un valor convertido. De ahí para arriba, sin ley no hay
  // decibeles que decir.
  if (crudo === 0) return { tipo: 'EN_SILENCIO' };
  // La ley está medida para la familia `i` y nada más (ítem 104). Se pregunta
  // por la **escritura**, que es la que exige ley, y no por la lectura.
  const e = esNivelDeEnvioAMonitor(ruta) ? entrada(ruta) : undefined;
  if (e === undefined) return { tipo: 'MANDA_SIN_LEY', crudo };
  if (crudo < e.rawMin || crudo > e.rawMax) {
    // **Los dos bordes son distintos y la primera versión los colapsó.** Un
    // crudo por encima del tope decía «muy abajo», sobre el camino que más
    // fuerte estaba mandando. Arriba del tramo medido se sabe algo útil: está
    // al máximo o cerca, así que va por «manda» y no por «fuera del tramo».
    return crudo > e.rawMax
      ? { tipo: 'MANDA_SIN_LEY', crudo }
      : { tipo: 'FUERA_DEL_TRAMO_MEDIDO', crudo };
  }
  const db = e.fromRaw(crudo);
  // La ley puede devolver algo no finito en los bordes; si pasa, se dice que no
  // se pudo leer en vez de imprimir «−∞ dB» en una tabla, que es lo que llegó a
  // la tablet la última vez que esto no se filtró.
  if (!Number.isFinite(db)) return { tipo: 'SIN_LEER' };
  return { tipo: 'EN_DB', db, aNominalDb: NOMINAL_DB - db };
}

/** Un canal de la consola, con lo mínimo que hace falta para nombrarlo. */
export interface CanalParaLaCuna {
  /** Base uno, como lo muestra la consola. */
  readonly indice: number;
  /** El nombre que publica la consola, para los canales que nadie asignó. */
  readonly nombre: string;
}

/** Una asignación, traída a la forma mínima para poder probar esto sin la base. */
export interface AsignacionParaLaCuna {
  /** La entrada física, base uno. */
  readonly entrada: number;
  readonly instrumento: string;
  readonly integranteId: string | null;
}

/** Un camino que entra a la cuña, ya resuelto: la plantilla no calcula nada. */
export interface CaminoALaCuna {
  readonly canal: number;
  readonly ruta: string;
  /** Qué es, dicho como lo diría el usuario: el instrumento, o el nombre del canal. */
  readonly que: string;
  /** Si este canal es del músico que se está mirando. */
  readonly esSuyo: boolean;
  /**
   * Si la aplicación puede mover este camino.
   *
   * Sólo los 24 canales: es lo que ADR-028 abrió y lo único con ley medida. Las
   * entradas de línea, el reproductor y los efectos **entran a la misma cuña y
   * son del usuario**. Decirlo en la fila evita la pregunta «¿y por qué a éste
   * no me lo sube?» tres minutos antes de empezar.
   */
  readonly laMueveLaAplicacion: boolean;
  readonly nivel: NivelDelEnvio;
}

/** El recuento de los 32 caminos, para que la pantalla pueda rendir cuentas. */
export interface CuentaDeLaCuna {
  readonly total: number;
  readonly mandan: number;
  readonly cerrados: number;
  readonly sinLeer: number;
}

/** Lo que la pantalla necesita de una cuña: las filas y el recuento. */
export interface LoQueLlega {
  readonly caminos: readonly CaminoALaCuna[];
  readonly cuenta: CuentaDeLaCuna;
}

/**
 * Qué caminos se muestran, y en qué orden.
 *
 * **Su propio instrumento va primero, siempre, esté como esté.** Es lo que hace
 * el MOREME de la consola resaltándolo en naranja, y es lo que pide el
 * soundcheck del usuario: el músico se escucha a sí mismo antes que a nadie. Un
 * orden por nivel lo mandaría al final justo en el caso que importa —la cuña
 * arranca en silencio— y ahí es donde hay que mirarlo.
 *
 * **De los demás se muestra sólo lo que suena**, y por sitio: veinticuatro filas
 * en una tablet, a un metro y con poca luz, esconden las cuatro que importan. Un
 * canal ajeno cerrado no le llega al músico, así que no es parte de su cuña.
 *
 * **Un ajeno que no se pudo leer se muestra sólo si de esta cuña se leyó algo.**
 * La regla tiene dos mitades porque hay dos situaciones que se ven iguales y no
 * lo son. Si de la cuña se leyeron otros envíos, uno que falta **es una
 * anomalía**: no saber no es lo mismo que saber que no llega, y esconderlo
 * convertiría una conexión a medias en una cuña que se ve limpia. Pero si no se
 * leyó **ninguno**, lo que pasa no es una anomalía por canal sino que esa cuña
 * entera no está publicada, y listar veinticuatro filas de «no lo publicó» es
 * ruido que tapa las que importan.
 *
 * **Salió de mirar la pantalla y no de pensarla.** Con el simulador conectado
 * --que no modela los envíos a auxiliar-- la tabla salía con las veinticuatro,
 * y arriba decía «conectado». La primera versión sólo miraba si el volcado
 * estaba vacío, y el volcado estaba lleno de otras cosas.
 *
 * Entre los ajenos, **el que más manda va arriba**. Es «cuánto le manda este
 * canal a tu cuña» y no «cuánto se oye»: lo segundo depende además de cuánto
 * esté sonando la fuente, y eso esta pantalla no lo afirma.
 */
export function loQueLlegaALaCuna(
  auxiliar: number,
  integranteId: string | null,
  canales: readonly CanalParaLaCuna[],
  asignaciones: readonly AsignacionParaLaCuna[],
  volcado: ReadonlyMap<string, { readonly valor: number }>,
): LoQueLlega {
  const porEntrada = new Map(asignaciones.map((a) => [a.entrada, a]));
  const porIndice = new Map(canales.map((c) => [c.indice, c]));
  // **Se censan los 24 canales, siempre, y la consola sólo aporta los nombres.**
  // La primera versión recorría lo que la consola publicaba, así que con la
  // consola desconectada no quedaba una sola fila --ni el instrumento del propio
  // músico-- mientras el aviso de arriba prometía «quién manda a esta cuña, no
  // cuánto». La segunda recorría la unión con las asignaciones, que arreglaba
  // eso y dejaba el recuento mintiendo: decía «de los 12 caminos» cuando a un
  // auxiliar le entran 32. Un canal que la consola no publicó **sigue siendo un
  // camino a esa cuña**; lo que falta es el dato, no el camino.
  const indices = Array.from({ length: CANALES_DE_ENTRADA }, (_, k) => k + 1);
  const suyos: CaminoALaCuna[] = [];
  const ajenos: CaminoALaCuna[] = [];
  const todos: CaminoALaCuna[] = [];

  for (const indice of indices) {
    const ruta = rutaDelEnvio(indice, auxiliar);
    if (ruta === undefined) continue;
    const a = porEntrada.get(indice);
    const c = porIndice.get(indice);
    const camino: CaminoALaCuna = {
      canal: indice,
      ruta,
      // El instrumento gana sobre el nombre de la consola: «Voz de Ana» dice más
      // que «CH3». Y si la consola no publicó nada, se nombra con el número, que
      // es lo único que se sabe con certeza de ese canal.
      que: a?.instrumento ?? c?.nombre ?? `Canal ${indice}`,
      // **`null` no es de nadie, y no puede ser de todos.** Sin esta guarda, un
      // músico sin identificador se quedaría con todos los canales que tampoco
      // lo tienen, y la fila «tu instrumento» mostraría el bombo de otro.
      esSuyo: integranteId !== null && a !== undefined && a.integranteId === integranteId,
      laMueveLaAplicacion: true,
      nivel: leerNivelDelEnvio(ruta, volcado),
    };
    todos.push(camino);
    if (camino.esSuyo) suyos.push(camino);
    else if (camino.nivel.tipo !== 'EN_SILENCIO') ajenos.push(camino);
  }

  // **Las otras tres familias, que entran a la misma cuña y la primera versión
  // no miraba.** Son ocho caminos más --dos de línea, dos del reproductor y
  // cuatro retornos de efecto-- y el que importa es el último: la reverb de un
  // cantante en su propia cuña es lo más común que hay, y sin esto la pantalla
  // llegaba a decir «a esta cuña no le llega nada». No son de nadie --nadie las
  // asigna a un integrante-- y la aplicación no las puede mover.
  for (const f of FUENTES_DE_UN_AUXILIAR) {
    if (f.familia === 'i') continue;
    for (let n = 1; n <= f.cuantas; n++) {
      const ruta = `${f.familia}.${n - 1}.aux.${auxiliar - 1}.value`;
      if (!esEnvioAUnAuxiliar(ruta)) continue;
      const camino: CaminoALaCuna = {
        // Se numeran por debajo de cero para que no choquen con los canales al
        // ordenar y al seguir la lista: son otra familia, no el canal 25.
        canal: -(FUENTES_DE_UN_AUXILIAR.indexOf(f) * 100 + n),
        ruta,
        que: `${f.comoSeLlama} ${n}`,
        esSuyo: false,
        laMueveLaAplicacion: false,
        nivel: leerNivelDelEnvio(ruta, volcado),
      };
      todos.push(camino);
      if (camino.nivel.tipo !== 'EN_SILENCIO') ajenos.push(camino);
    }
  }

  // Si de esta cuña no se leyó ni un envío, los ajenos desconocidos son ruido:
  // lo que hay que decir --una sola vez, arriba-- es que la cuña no se leyó.
  const seLeyoAlgo = todos.some((c) => c.nivel.tipo !== 'SIN_LEER');
  const ajenosVisibles = seLeyoAlgo
    ? ajenos
    : ajenos.filter((c) => c.nivel.tipo !== 'SIN_LEER');

  suyos.sort((x, y) => x.canal - y.canal);
  ajenosVisibles.sort((x, y) => certeza(y.nivel) - certeza(x.nivel)
    || cuantoManda(y.nivel) - cuantoManda(x.nivel)
    || x.canal - y.canal);

  // **El recuento cubre los 32, incluidos los que no se muestran.** Es lo que
  // permite que la pantalla rinda cuentas en vez de prometer completitud: quien
  // mira puede ver que no falta nada escondido. Se cuenta sobre `todos`, que es
  // el censo, y no sobre las filas visibles.
  return {
    caminos: [...suyos, ...ajenosVisibles],
    cuenta: {
      total: todos.length,
      mandan: todos.filter((c) => c.nivel.tipo === 'EN_DB'
        || c.nivel.tipo === 'MANDA_SIN_LEY'
        || c.nivel.tipo === 'FUERA_DEL_TRAMO_MEDIDO').length,
      cerrados: todos.filter((c) => c.nivel.tipo === 'EN_SILENCIO').length,
      sinLeer: todos.filter((c) => c.nivel.tipo === 'SIN_LEER').length,
    },
  };
}

/**
 * Con qué criterio se ordenan los ajenos.
 *
 * **Se ordena por CERTEZA y después por nivel, y no todo junto.** No hay un
 * orden total honesto: un retorno de efecto abierto y un canal en −30 dB no se
 * pueden comparar, porque la ley de la familia del efecto no está medida.
 * Colapsarlos en un número obligaría a inventarle un valor a uno de los dos, y
 * cualquiera de las dos invenciones miente en el caso que importa --mandar la
 * reverb del cantante al fondo de la lista, o ponerla arriba de todo--.
 *
 * Así que primero van los que se saben en decibeles, de mayor a menor; después
 * los que mandan sin ley medida; después los que caen por debajo del tramo; y al
 * final los que no se pudieron leer. La columna de detalle dice cuál es cuál.
 */
function certeza(n: NivelDelEnvio): number {
  switch (n.tipo) {
    case 'EN_DB': return 3;
    case 'MANDA_SIN_LEY': return 2;
    case 'FUERA_DEL_TRAMO_MEDIDO': return 1;
    default: return 0;
  }
}

/** Dentro de los que se saben en decibeles, el que más manda va arriba. */
function cuantoManda(n: NivelDelEnvio): number {
  return n.tipo === 'EN_DB' ? n.db : Number.NEGATIVE_INFINITY;
}
