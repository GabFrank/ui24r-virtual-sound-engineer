/**
 * Cuánto se corrió cada ruta en esta sesión, y cuáles ya se tocaron.
 *
 * **El agujero que esto empieza a cerrar.** `ContextoSeguridad` tiene tres
 * campos de historial y **los dos servicios que escriben en producción se los
 * pasan vacíos**, con el motivo declarado en el código: *«el historial de la
 * sesión no existe; van vacíos a propósito y no con datos inventados»*. Ser
 * honesto sobre el hueco no lo tapa, y el hueco deja **dos reglas del motor
 * existiendo en el código y no en el comportamiento**:
 *
 * - **El presupuesto por sesión** —6 dB en la ganancia, 4 en el envío a
 *   monitor— nunca se dispara, porque el acumulado siempre arranca en cero.
 * - **«Hay que comprobar el efecto antes de volver a moverlo»** nunca se
 *   dispara, porque sin rutas tocadas **cada cambio parece el primero**.
 *
 * Y la segunda falla **abierta**: la aplicación podría mover una ruta 2 dB, otra
 * vez 2 dB, y así sin fin. No pasó nunca porque ninguna pantalla repite un
 * cambio —la de ganancia aplica una vez y el servicio de monitor no tiene
 * pantalla—. La rampa de [ADR-034](../../../docs/adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md)
 * es lo primero que repite, y entraría justo por ahí.
 *
 * Es la misma forma que `techoPorRuta`, que también consultaba un mapa que nadie
 * llenaba, y la misma que INV-034: **una invariante viva pero inerte**.
 *
 * ## Por qué se reconstruye del diario y no se lleva en memoria
 *
 * Porque la sesión sobrevive a la aplicación. El diario se escribe **antes** de
 * cada escritura (INV-020) y está en la base; un contador en memoria se pierde
 * con el proceso, y lo que se perdería es justamente el freno. Una sesión que se
 * reanuda después de una caída tiene que seguir sabiendo cuánto movió.
 *
 * ## La tercera, que es la que hace que una rampa sea una rampa
 *
 * `rutasConMedicionPosterior` contesta *«¿se escuchó después del último cambio
 * de esta ruta?»*, y es lo que convierte una serie de escrituras en una rampa.
 * Sale de `EntradaDiario.medicionPosteriorId`, que se agregó junto con este
 * módulo: la columna estaba en la base desde el esquema inicial y no tuvo quien
 * la llenara **hasta el 2026-09-19**, cuando la pantalla de ganancia empezó a
 * guardar su ventana de verificación y a anotarla acá.
 *
 * **Mira sólo la última transacción que tocó cada ruta**, no si alguna vez hubo
 * una medición. Haber escuchado hace tres pasos no autoriza el cuarto.
 *
 * ## La cuarta, que es el ancla de ADR-034
 *
 * `rutasConNivelEstablecido` contesta *«¿alguien fijó ya el nivel de trabajo de
 * esta cuña?»*, y con eso el motor sabe si está poniendo el nivel o retocándolo.
 * Sale de `EntradaDiario.nivelEstablecidoEn`, que nace con este cambio.
 *
 * **Y es lo que además rebasa el acumulado.** Establecer el nivel no sólo cambia
 * qué reglas rigen: mueve la referencia desde la que se cuenta. Las dos cosas son
 * la misma frase de ADR-034 —*«poner el nivel fija el ancla, y retocar se mide
 * desde ahí»*— y separarlas dejaría al retoque naciendo con el presupuesto ya
 * gastado por la rampa.
 */
import { limiteDe, movimientoDe } from '@vse/domain';
import type { Measurement } from '@vse/domain';
import { clasificarRuta } from '@vse/mixer-adapter';
import type { EntradaDiario } from './journal.ts';

/** Lo que el historial puede contestar hoy. */
export interface HistorialDeLaSesion {
  /**
   * Cuánto se corrió cada ruta respecto de **la referencia vigente**, en la
   * unidad declarada de cada cambio.
   *
   * Es una suma con signo, no de magnitudes: un cambio que devuelve la ruta
   * hacia donde estaba **descuenta**, que es lo que el motor espera —*«un
   * movimiento que acerca el parámetro a su valor inicial siempre es
   * admisible»*—.
   *
   * **En la escala del movimiento de cada hoja, desde ADR-039**, que es la
   * misma en que el motor compara el tope: octavas en una frecuencia, octavas
   * de ancho de banda en un Q, decibeles en una ganancia. Sumar hercios y
   * comparar contra un tope en octavas sería el defecto entero de esa decisión,
   * entrando por el productor en vez de por el consumidor. Lo cuenta
   * `movimientoDe`, la misma función del dominio que usa `verificarLimite`: no
   * es una segunda copia de la regla, es la misma leída acá.
   *
   * **La referencia es dónde estaba la ruta al empezar la sesión, salvo que
   * alguien haya establecido un nivel de trabajo**; desde ese momento la
   * referencia es ese nivel y la cuenta arranca de nuevo. Decirlo así --y no
   * «respecto de donde estaba al empezar»-- es la mitad de ADR-034 que vive acá:
   * *«poner el nivel fija el ancla, y retocar se mide desde ahí»*. Sin esto, una
   * cuña levantada veinticinco decibeles desde el piso llegaría al primer retoque
   * con el presupuesto de 4 dB agotado seis veces, y el motor la dejaría clavada
   * justo cuando empieza el trabajo fino.
   */
  readonly acumuladoPorRuta: ReadonlyMap<string, number>;
  /** Las rutas que esta sesión ya movió al menos una vez. */
  readonly rutasYaTocadas: ReadonlySet<string>;
  /**
   * Las rutas cuyo **último** cambio tiene una escucha **comprobada** después.
   *
   * El motor lo usa para negarse a mover dos veces sin escuchar en el medio. Una
   * ruta que no está acá o no se tocó nunca —y entonces no hace falta— o se
   * movió y nadie escuchó de verdad.
   *
   * **«Comprobada» quiere decir siete cosas, y hasta el 2026-09-18 no quería
   * decir ninguna.** El campo `medicionPosteriorId` del diario es una cadena, y
   * acá se miraba sólo que no fuera nula: sin resolverla, sin fecha, sin
   * cruzarla contra una medición real y sin ningún espaciado de reloj. Ver
   * `escuchaComprobada`, que es donde viven las siete condiciones y por qué.
   *
   * **Y la primera versión de este arreglo tenía cinco y no alcanzaban**: le
   * faltaba que la ventana de escucha hubiera terminado de verdad --sin eso
   * `duracionS` es una promesa del que escribe la fila, y la ráfaga de 32 dB
   * volvía entera con mediciones que sí existen-- y enumeraba la señal por lista
   * negra, así que el campo ausente concedía. Las dos las midió una auditoría
   * adversarial el mismo día, con la suite entera en verde.
   */
  readonly rutasConMedicionPosterior: ReadonlySet<string>;
  /**
   * Las rutas cuyo nivel de trabajo esta sesión ya estableció.
   *
   * El motor lo usa para saber en cuál de las dos operaciones de ADR-034 está
   * cada ruta. Una que no está acá todavía se está poniendo: su presupuesto
   * acumulado queda suspendido y lo que la acota es el techo de nominal.
   */
  readonly rutasConNivelEstablecido: ReadonlySet<string>;
}

/**
 * **Sólo cuenta lo que de verdad llegó a la consola.**
 *
 * Un cambio que el motor rechazó, que nunca se envió, o que se envió y no se
 * confirmó, **no movió nada en la sala**: contarlo gastaría presupuesto por algo
 * que no sonó, y el músico se quedaría sin los decibeles que nadie usó. El
 * criterio es `verificado`, que el ejecutor pone en `true` sólo cuando la
 * escritura resultó `APPLIED`.
 *
 * **Las entradas revertidas se cuentan igual, y no es un olvido.** Una reversión
 * es otro par de escrituras que también sonaron: lo que las cancela es la suma
 * con signo, no ignorarlas. Si se ignoraran, aplicar y revertir doce veces
 * costaría cero presupuesto habiendo movido la cuña veinticuatro.
 */

/**
 * ¿La medición que esta transacción anota como posterior es una escucha de
 * verdad?
 *
 * ## El agujero que cierra, medido
 *
 * `EntradaDiario.medicionPosteriorId` es una cadena, y hasta el 2026-09-18 el
 * historial miraba **sólo que no fuera nula**. Así que anotar cualquier texto
 * —`'x'`, o el mismo identificador quince veces— contaba como haber escuchado.
 *
 * **Medido con el motor real el 2026-09-18**: dieciséis transacciones honestas
 * de 2 dB, cada una atada al crudo por la ley medida y cada una dentro del tope
 * por paso, levantan una cuña **32 dB —de −32 a nominal— en 24 ms**, anotando
 * dieciséis mediciones que no existen. Lo que corta no es ningún freno de
 * INV-004 sino el techo de nominal, o sea el final del recorrido.
 *
 * **No estaba expuesto cuando se arregló, y esa era la razón para arreglarlo
 * entonces**: en producción nadie llenaba ese campo. **Desde el 2026-09-19 sí lo
 * llena la pantalla de ganancia**, que aplica, vuelve a medir dieciocho segundos,
 * guarda la ventana en `measurement` y anota su identificador acá. O sea que esta
 * guarda **ya juzga de verdad en un camino de producción**, y las siete
 * condiciones son las que dejan pasar o no un segundo ajuste sobre el mismo canal.
 *
 * El envío a monitor sigue sin llenarlo, y no por falta de código: `EnvioAMonitorService`
 * no mide. Quien va a capturar ahí es la pantalla por músico, que es la pieza que
 * sigue de ADR-034.
 *
 * ## Las cinco condiciones, y por qué cada una
 *
 * **Decisión del usuario, 2026-09-18**, entre tres opciones: *«una medición
 * real, posterior, y con el músico sonando»*. Las descartadas eran aceptar una
 * medición en silencio, y frenar sólo por reloj sin exigir medición — *«un
 * cronómetro no es una escucha»*.
 *
 *  1. **Existe.** El identificador tiene que resolver a una medición de las que
 *     se le pasan al historial. Una cadena que no resuelve no es una medición:
 *     es una cadena.
 *  2. **Es de esta sesión.** Una medición de otro soundcheck, en otra sala y con
 *     otra banda, no dice nada de esta cuña.
 *  3. **Empezó después de que la escritura llegara al cable.** Se compara contra
 *     el `enviadoEl` más tardío de los cambios **verificados** de esa
 *     transacción. Una medición anterior es la escucha de lo de antes, y contarla
 *     es contar dos veces la misma escucha.
 *  4. **Hubo señal.** `signalType` no puede ser `SILENCE`: si nadie tocó, nadie
 *     oyó la cuña. Es lo más cerca que la aplicación puede llegar de «el músico
 *     lo escuchó» sin preguntarle.
 *  5. **Duró lo que su clase de parámetro pide.** `limiteDe(kind, ruta).escuchaMinimaS`,
 *     que para el envío a monitor son diez segundos y para el silencio de canal
 *     cero. Ver ahí por qué.
 *
 * ## Lo que NO comprueba, dicho con todas las letras
 *
 * **No comprueba que la medición sea del parlante que se movió.** `Measurement`
 * trae `channelId`, y cruzarlo contra la ruta es la tarea de «el tope se cuenta
 * por clave y el oído es por parlante», que es otra y está anotada. Hoy una
 * medición del canal 5 autoriza el paso siguiente sobre la cuña del canal 3.
 *
 * **No comprueba que la medición sea confiable.** `medicionEsConfiable` cruza la
 * calibración, y el historial no tiene el estado de calibración. Es otra tarea.
 *
 * **Falla cerrado.** Sin mediciones que consultar, ninguna ruta queda con
 * escucha comprobada y el segundo paso se rechaza. Es lo correcto: la duda sobre
 * si se escuchó se resuelve no moviendo.
 */
/**
 * Las señales que cuentan como «el músico estaba sonando».
 *
 * **Lista blanca y no lista negra, y la primera versión fue lista negra.** Decía
 * `if (m.signalType === 'SILENCE') return false`, así que **todo lo demás pasaba,
 * incluido el campo ausente**: una fila vieja de la base, o un productor que no
 * escriba esa columna, concedía la escucha. Una auditoría adversarial lo midió el
 * 2026-09-18 y la ráfaga volvía entera —dieciséis pasos, 32 dB— con
 * `signalType` en `undefined`, en `null`, en `''`, en `'UNKNOWN'` y hasta en
 * `'silence'` en minúsculas.
 *
 * Es la quinta repetición de la misma forma en este repositorio —`NaN`,
 * `undefined`, `Infinity`, el campo ausente comparado con `!== null`— y estaba
 * **en la condición de al lado** de la que sí la evita. La regla que queda: una
 * guarda enumera lo que acepta, no lo que rechaza.
 */
const SENALES_QUE_CUENTAN: ReadonlySet<string> = new Set([
  'PINK', 'SWEEP', 'SINE', 'BURST', 'PERFORMANCE',
]);

/**
 * Un instante, o nada, exigiendo que la fecha traiga su huso.
 *
 * **`Date.parse` a secas interpreta una fecha sin huso como hora LOCAL**, y eso
 * hace fallar la guarda por el lado que afloja. Medido por una auditoría el
 * 2026-09-18 en `America/Asuncion`: una medición de **un minuto antes** de la
 * escritura, escrita sin la `Z`, quedaba **tres horas después** y autorizaba el
 * paso siguiente. Con eso una medición de hacía una hora levantaba la cuña 32 dB.
 *
 * `enviadoEl` sale siempre de `toISOString()` y trae `Z`, pero
 * `Measurement.timestamp` es un `string` sin validar que va a llenar una pantalla
 * que todavía no existe. Mezclar los dos formatos es la condición exacta del
 * fallo, así que la fecha sin huso se rechaza en vez de adivinarle una.
 */
function instante(texto: string | null): number | null {
  if (texto === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.test(texto)) {
    return null;
  }
  const t = Date.parse(texto);
  return Number.isFinite(t) ? t : null;
}

function escuchaComprobada(
  entrada: EntradaDiario,
  ruta: string,
  porId: ReadonlyMap<string, Measurement>,
  ahora: number,
): boolean {
  const id = entrada.medicionPosteriorId ?? null;
  if (id === null) return false;

  // 1. Existe.
  const m = porId.get(id);
  if (m === undefined) return false;

  // 2. Es de esta sesión.
  if (m.sessionId !== entrada.sessionId) return false;

  // 3. Hubo señal. Lista blanca: ver `SENALES_QUE_CUENTAN`.
  if (!SENALES_QUE_CUENTAN.has(m.signalType as string)) return false;

  // 4. Duró lo que su clase de parámetro pide. Sin clase o sin límite declarado
  // no hay criterio, y sin criterio no se concede: es el mismo fallar cerrado
  // con que INV-004 rechaza todo parámetro sin límite declarado.
  const kind = clasificarRuta(ruta);
  const minimo = kind === null ? undefined : limiteDe(kind, ruta)?.escuchaMinimaS;
  if (minimo === undefined) return false;
  // **`Number.isFinite` antes de comparar, que es la trampa que este repositorio
  // ya pagó cuatro veces.** Con `duracionS` en `NaN`, `NaN < minimo` da `false`
  // y la guarda concede. Es la misma forma que `verificarLimite`, `atar` sobre
  // la magnitud, `atar` sobre el crudo y `coincideConEsperado`.
  if (!Number.isFinite(m.duracionS) || m.duracionS < minimo) return false;

  // 5. Cuándo terminó de moverse la cuña: el `enviadoEl` más tardío de los
  // cambios verificados de ESTA transacción. Escuchar antes de eso es escuchar
  // otra cosa.
  //
  // **Por instante y no por texto, y la primera versión comparaba texto.** Con
  // `09:00Z` y `07:00-05:00` --que es más tarde-- la comparación lexicográfica
  // elegía la primera, y una medición de las 09:30Z pasaba aunque la cuña
  // terminó de moverse a las 12:00Z. Lo midió la auditoría del 2026-09-18.
  //
  // **Y un cambio sin fecha no se lo presta un hermano.** La regla escrita era
  // «un cambio sin fecha de envío no se puede ordenar, así que no concede», y el
  // test la probaba con un solo cambio; con un segundo cambio en la misma
  // transacción, la fecha del otro autorizaba al primero. Ahora basta con que
  // **uno** de los verificados no tenga fecha utilizable para que no haya
  // escucha: sin saber cuándo terminó la ráfaga no hay contra qué ordenar.
  let ultimoEnvio: number | null = null;
  for (const c of entrada.cambios) {
    if (!c.verificado) continue;
    const t = instante(c.enviadoEl);
    if (t === null) return false;
    if (ultimoEnvio === null || t > ultimoEnvio) ultimoEnvio = t;
  }
  if (ultimoEnvio === null) return false;

  const empezo = instante(m.timestamp);
  if (empezo === null) return false;

  // 6. Empezó después de que la escritura llegara al cable.
  //
  // **La frontera es «no anterior» y no «estrictamente posterior»**: el reloj
  // tiene resolución de milisegundo y exigir más sería inventar un margen.
  if (empezo < ultimoEnvio) return false;

  // 7. **Y la ventana de escucha TERMINÓ.** Es la condición que faltaba, y sin
  // ella el arreglo no cerraba nada.
  //
  // `duracionS` es un campo que declara quien escribe la fila, no una medida del
  // reloj. Una medición creada en el mismo milisegundo de la escritura,
  // declarando diez segundos, cumplía las seis condiciones anteriores: una
  // auditoría adversarial corrió el 2026-09-18 la misma ráfaga que este arreglo
  // decía cerrar, pero con mediciones **que sí existen**, y la cuña volvió a
  // subir **32 dB en 4 ms**. La cifra de «2 dB en vez de 32» valía sólo contra un
  // identificador que no resuelve.
  //
  // Exigir que la ventana haya terminado convierte un campo declarado en tiempo
  // transcurrido de verdad, y **de paso cierra la medición del futuro**: un
  // timestamp adelantado --por un reloj desfasado o una fila mal escrita--
  // autorizaba la rampa entera reusando la misma medición, porque nada acotaba
  // por arriba. Su ventana termina en el futuro, así que ahora no pasa.
  //
  // `ahora` entra por parámetro y no se lee acá adentro: esta función es pura y
  // el historial se reconstruye del diario, que sobrevive a una caída.
  if (empezo + m.duracionS * 1000 > ahora) return false;

  // **Acá había una octava condición y era código muerto, así que se sacó.**
  // Decía `return rutasMovidas.has(ruta)`, cruzando contra las rutas que la
  // transacción movió. La auditoría del 2026-09-18 instrumentó ese retorno y
  // **nunca dio `false`**, ni en la suite entera ni contra su arnés adversarial,
  // y la razón es estructural: `escuchadaAlFinal` sólo se escribe en la misma
  // iteración en que se agrega la ruta a `movidasAca`, así que la transacción
  // que quedó como última de una ruta siempre la movió. Su mutante sobrevivía
  // con la suite verde, que es cómo se descubrió.
  //
  // **Se saca en vez de dejarla por las dudas** porque una guarda que se lee
  // como defensa y no puede disparar es peor que no tenerla: manda al que
  // audita a buscar protección donde no hay ninguna. El cruce sí hace falta en
  // `nivelEstablecidoEn`, donde la lista viene del llamador y puede nombrar una
  // ruta que la transacción no tocó; acá la ruta sale del propio recorrido.
  return true;
}

export function historialDeLaSesion(
  entradas: readonly EntradaDiario[],
  /**
   * Las mediciones de esta sesión, para poder resolver `medicionPosteriorId`.
   *
   * **Obligatorio y sin valor por omisión, a propósito.** Un `= []` habría
   * dejado los llamadores existentes compilando sin enterarse, que es
   * exactamente el descuido que `magnitudPropuesta` evitó siendo obligatorio.
   * Acá el compilador tiene que señalar cada sitio, porque **el que no las pase
   * frena**: sin mediciones ninguna ruta queda con escucha comprobada.
   */
  mediciones: readonly Measurement[],
  /**
   * El instante en que se está juzgando, en milisegundos desde la época.
   *
   * **Hace falta para saber si la ventana de escucha terminó de verdad**, que es
   * la condición sin la cual `duracionS` es una promesa y no un tiempo. Entra por
   * parámetro --y no como `Date.now()` acá adentro-- para que esta función siga
   * siendo pura y para que un test pueda fijar el reloj; es el mismo motivo por
   * el que el ejecutor de transacciones recibe su `ahora`.
   */
  ahora: number,
): HistorialDeLaSesion {
  // **Un identificador repetido no se queda con el último: se descarta.** La
  // primera versión hacía `porId.set(m.id, m)` en el bucle, así que con el mismo
  // id dos veces el resultado dependía del orden de la lista --`[buena, mala]`
  // negaba la escucha y `[mala, buena]` la concedía-- y no avisaba. Una lista con
  // ids repetidos es una lista corrupta, y ante una lista corrupta lo correcto es
  // no conceder. Lo encontró la auditoría del 2026-09-18.
  const porId = new Map<string, Measurement>();
  const repetidos = new Set<string>();
  for (const m of mediciones) {
    if (porId.has(m.id)) repetidos.add(m.id);
    porId.set(m.id, m);
  }
  for (const id of repetidos) porId.delete(id);
  const acumulado = new Map<string, number>();
  const tocadas = new Set<string>();
  const conNivel = new Set<string>();
  /** Por ruta, la ÚLTIMA transacción que la movió. Gana la última: es la que el
   * motor tiene que mirar antes del próximo movimiento. */
  const escuchadaAlFinal = new Map<string, EntradaDiario>();

  // **El orden lo pone el almacén** --`deLaSesion` ordena por fecha de
  // creación-- y acá se recorre tal cual. Reordenar de nuevo escondería el día
  // que alguien llame con una lista suelta: que el orden sea del almacén está
  // escrito en la interfaz del diario, y es ahí donde tiene que sostenerse.
  for (const entrada of entradas) {
    /** Las rutas que ESTA transacción movió de verdad, para cruzar el ancla. */
    const movidasAca = new Set<string>();
    for (const c of entrada.cambios) {
      if (!c.verificado) continue;
      // **Un salto desde el silencio no se puede acumular, y no se inventa.**
      // Salir de −∞ es lo que ADR-034 llama «el primer paso», y su delta no es
      // un número: sumarlo envenena el acumulado de esa ruta para toda la
      // sesión. La ruta queda tocada —se movió— y su desplazamiento arranca a
      // contarse desde donde el silencio quedó atrás.
      //
      // **Y el movimiento lo cuenta la escala de la hoja, no una resta.** Para
      // una ganancia las dos cosas son lo mismo; para una frecuencia, restar
      // hercios daría un número que no se puede comparar con un tope en
      // octavas. `movimientoDe` devuelve `NaN` cuando no puede contar --sin
      // tope declarado, o con la unidad de la fila distinta de la de la hoja--
      // y ese `NaN` cae en la misma guarda que el salto desde el silencio: no
      // se suma. **La diferencia con ADR-034 es qué significa**, y conviene
      // decirla: allá es un primer paso legítimo que no tiene delta, acá es una
      // fila que no se puede interpretar. Las dos veces lo correcto es no
      // inventar un número, y la ruta queda tocada igual, así que el motor va a
      // exigir escucha antes del próximo movimiento.
      const kindDeLaRuta = clasificarRuta(c.path);
      const delta = kindDeLaRuta === null ? NaN
        : movimientoDe(kindDeLaRuta, c.path, c.unidad, c.magnitudEsperada, c.magnitudEnviada);
      tocadas.add(c.path);
      movidasAca.add(c.path);
      // **Se guarda la transacción, no un booleano, y se pisa en cada vuelta a
      // propósito: gana la última**, que es la que el motor tiene que mirar
      // antes del próximo movimiento.
      //
      // Acá sólo se anota *cuál* fue; si esa transacción cuenta como escucha lo
      // decide `escuchaComprobada` al final, porque necesita el cruce contra las
      // rutas que la transacción movió de verdad, y ese conjunto recién está
      // completo al salir de este bucle. La versión anterior resolvía la
      // pregunta acá con `(entrada.medicionPosteriorId ?? null) !== null`, o sea
      // mirando sólo que el campo no fuera nulo.
      escuchadaAlFinal.set(c.path, entrada);
      // **Salir del silencio es la única ausencia de delta que se perdona, y
      // se reconoce por el origen y no por el resultado.** Antes la condición
      // era `!Number.isFinite(delta)`, que perdona cualquier cuenta que no dé
      // un número: una fila con la unidad cambiada, una ruta que el dominio no
      // sabe clasificar, una frecuencia declarada en cero --`log2(x/0)` es
      // infinito-- pasaban por la misma puerta que el primer paso de ADR-034 y
      // el acumulado quedaba en cero, que es **aflojar**. Son dos cosas
      // distintas: allá no hay delta que contar y es correcto, acá la fila no
      // se puede interpretar.
      if (c.magnitudEsperada === -Infinity) continue;
      // **Lo que no se puede contar envenena la ruta en vez de valer cero.**
      // El motor lee este número y lo compara contra un tope; un `NaN` cae en
      // `MAGNITUD_NO_NUMERICA` y la ruta no se vuelve a mover en la sesión,
      // mientras que un cero la deja con el presupuesto entero. Ante una fila
      // que no se entiende, lo correcto es no moverse: es la misma forma con
      // que INV-004 rechaza todo parámetro sin límite declarado.
      if (!Number.isFinite(delta)) {
        acumulado.set(c.path, NaN);
        continue;
      }
      acumulado.set(c.path, (acumulado.get(c.path) ?? 0) + delta);
    }

    // **Después de contar los cambios de esta transacción, no antes.** La
    // transacción que establece el nivel es la que lo alcanzó: sus decibeles son
    // el último paso de la rampa y pertenecen a la rampa. Resetear primero los
    // cobraría contra el presupuesto del retoque, que empieza recién acá.
    //
    // **`?? []` porque una entrada vieja no trae el campo.** El diario se
    // serializa entero como JSON, así que las transacciones anteriores a esta
    // pieza vuelven sin él, y `for…of undefined` estalla. La ausencia es
    // «ninguna ruta», que además es lo cierto: cuando esas entradas se
    // escribieron, establecer un nivel no existía.
    //
    // ## Las tres condiciones, y por qué la primera versión no tenía ninguna
    //
    // **La primera versión aceptaba la lista tal cual**, y una auditoría del
    // 2026-09-17 demostró qué costaba: con `nivelEstablecidoEn: ['hw.0.gain']`
    // el acumulado de la **ganancia del previo** volvía a cero, y repitiendo la
    // marca se movían 30 dB en pasos de 3 con el motor viendo cero. O sea que el
    // ancla, que es de monitores, le sacaba el presupuesto a cualquier parámetro
    // del aparato.
    //
    // **Y lo peor no era el agujero sino que estaba documentado al revés.**
    // `ContextoSeguridad.rutasConNivelEstablecido` argumentaba que esto no es
    // «pedir la exención diciendo que se la merece», citando de precedente a
    // `correspondeExencionDeSistema` --que **sí** cruza lo declarado contra lo
    // que la transacción de verdad toca--. La autodeclaración no se había
    // eliminado: se había mudado de quien propone la transacción a quien escribe
    // el diario, y se había quedado sin el cruce. Ahora lo tiene.
    for (const ruta of entrada.nivelEstablecidoEn ?? []) {
      // **1. Que esta transacción haya movido esa ruta, y que haya sonado.** El
      // nivel lo establece la transacción que lo alcanzó; marcar una ruta que
      // esta transacción no tocó es hablar de otra cosa. Y `movidasAca` sólo
      // tiene las verificadas, así que una transacción que dio conflicto, se
      // revirtió o nunca salió no establece nada: es el mismo criterio que el
      // acumulado --*«sólo cuenta lo que de verdad llegó a la consola»*-- que la
      // primera versión aplicaba a los decibeles y no al ancla.
      if (!movidasAca.has(ruta)) continue;
      // **2. Que sea un parámetro con techo declarado.** Establecer el nivel
      // suspende el presupuesto acumulado, y `verificarLimite` sólo concede esa
      // suspensión a un tipo que declare `techoAbsoluto`. Rebasar el acumulado
      // de un tipo sin techo le saca el único tope sobre el total sin darle
      // nada a cambio, que es exactamente lo que ADR-034 **no** decidió.
      const kind = clasificarRuta(ruta);
      if (kind === null || limiteDe(kind, ruta)?.techoAbsoluto === undefined) continue;
      // **3. Una sola vez.** `journal.ts` razona que desestablecer sería
      // peligroso porque devolvería la rampa entera; volver a **establecer**
      // hacía lo mismo y nadie lo impedía --marcar la ruta en cada transacción
      // devolvía los 4 dB enteros, sin límite--. La garantía estaba escrita como
      // si fuera del código y era del llamador que todavía no existe.
      if (conNivel.has(ruta)) continue;
      conNivel.add(ruta);
      acumulado.set(ruta, 0);
    }
  }

  const conMedicion = new Set<string>();
  for (const [ruta, ultima] of escuchadaAlFinal) {
    if (escuchaComprobada(ultima, ruta, porId, ahora)) conMedicion.add(ruta);
  }

  return {
    acumuladoPorRuta: acumulado,
    rutasYaTocadas: tocadas,
    rutasConMedicionPosterior: conMedicion,
    rutasConNivelEstablecido: conNivel,
  };
}
