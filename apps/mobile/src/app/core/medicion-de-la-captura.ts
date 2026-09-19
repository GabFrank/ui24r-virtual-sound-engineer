import { PISO_DE_RUIDO_DB, type AnalisisDeGanancia, type MuestraVu } from '@vse/assistants';
import type { Measurement, MeasurementMetrics, SignalType } from '@vse/domain';

/**
 * Convierte una ventana de captura del medidor de la consola en una medición
 * guardable.
 *
 * ## Por qué existe
 *
 * **Porque la aplicación escuchaba y tiraba lo que oía.** La pantalla de
 * ganancia aplica, vuelve a medir para contarle al usuario si sirvió, y esa
 * segunda ventana **no se guardaba en ninguna parte**. El motor de seguridad, en
 * cambio, exige una medición entre un cambio y el siguiente sobre el mismo
 * parámetro —es la regla 4 del repositorio, «primero medir, después corregir»— y
 * la resuelve contra la tabla `measurement`. Con la tabla vacía, **el segundo
 * ajuste sobre el mismo canal se rechaza siempre** con `SIN_MEDICION_INTERMEDIA`,
 * aunque el músico haya tocado dieciocho segundos.
 *
 * O sea que la aplicación sabía que había escuchado, se lo decía al usuario por
 * pantalla, y no se lo decía al motor.
 *
 * ## Por qué es una función aparte y no un método del servicio
 *
 * Por lo mismo que `CONSULTA_DE_MEDICIONES` y `LEY_DEL_ENVIO`: los servicios
 * llevan el decorador de Angular, y el modo de eliminación de tipos de Node
 * —con el que corren los tests— **no parsea un decorador**. Un mapeo con esta
 * cantidad de decisiones discutibles tiene que poder probarse.
 *
 * ## Lo que esta medición NO es, dicho antes de que alguien lo suponga
 *
 * **No es una medición acústica.** Sus muestras son tramas del medidor de la
 * consola tomadas cada `INTERVALO_DE_MUESTREO_MS`, no audio: no hay micrófono,
 * no hay interfaz de audio y no hay calibración. Por eso `micProfileId` va en
 * nulo, `archivoAudio` en nulo, y `calibrationStateId` en
 * {@link SIN_CALIBRACION}, que no coincide con ninguna calibración real y hace
 * que `medicionEsConfiable` conteste **no**. Es la respuesta correcta: de un
 * medidor no salen decisiones de ecualización de sala.
 *
 * Sirve para lo que sí sabe: **cuánto entró y cuándo**, que es exactamente lo
 * que el motor necesita para saber si hubo escucha.
 */

/**
 * Cada cuánto se lee el medidor durante una captura, en milisegundos.
 *
 * Vive acá y no como número escrito en el temporizador porque de este valor sale
 * el `sampleRate` de la medición: dejarlo suelto en dos sitios es la forma en que
 * una constante medida y su copia se separan.
 */
export const INTERVALO_DE_MUESTREO_MS = 50;

/**
 * Cuánto dura una ventana de escucha, en segundos.
 *
 * **Vive acá, con el resto de lo que define una captura, y no en la pantalla que
 * la usa.** Nació dentro del asistente de ganancia porque era el único que
 * capturaba; desde que el envío a monitor también escucha, dejarla ahí sería
 * tener la duración de la ventana definida en el módulo de otra herramienta —o,
 * peor, copiada—.
 *
 * **Y el motivo que estaba escrito acá era más fuerte que el verdadero.** Decía
 * que «de estos dos números salen campos de la medición que el motor juzga»: de
 * `INTERVALO_DE_MUESTREO_MS` sí sale uno —`duracionS` es muestras por intervalo—,
 * pero **`DURACION_CAPTURA_S` no entra en `medicionDeLaCaptura` en absoluto**;
 * sólo acota cuántas muestras puede haber, a través del bucle que recolecta. La
 * mudanza sigue estando bien por el motivo simple: dos herramientas escuchan, y la
 * duración de la ventana no puede vivir dentro del módulo de una de ellas. Lo
 * corrigió una auditoría de fidelidad el 2026-09-19.
 *
 * **Dieciocho y no diez, con diez de mínimo.** El motor exige diez segundos de
 * música para conceder el paso siguiente; la ventana es más larga porque el
 * músico no toca los dieciocho de corrido, y desde el 2026-09-19 lo que se
 * declara es **cuánto sonó**, no cuánto duró la ventana.
 */
export const DURACION_CAPTURA_S = 18;

/**
 * Los segundos de aviso antes de empezar a escuchar.
 *
 * No es decoración: el músico está del otro lado del escenario con un instrumento
 * en la mano y necesita saber cuándo empezar.
 */
export const CUENTA_REGRESIVA_S = 3;

/**
 * La calibración de una medición que no tiene calibración.
 *
 * **`calibrationStateId` es obligatorio en el esquema y no hay tabla de
 * calibraciones**, porque nada la escribe todavía: el potenciómetro de la
 * interfaz no es legible por software y quien lo declare será una pantalla que no
 * existe (ADR-004, INV-027).
 *
 * Poner acá un identificador inventado que pareciera real sería lo peligroso: el
 * día que haya calibraciones, `medicionEsConfiable` cruza este campo contra la
 * vigente, y una coincidencia accidental convertiría una lectura de medidor en
 * evidencia acústica confiable. Este centinela **no puede coincidir** con un
 * identificador generado, y se lee como lo que es.
 */
export const SIN_CALIBRACION = 'sin-calibracion';

export interface CapturaParaGuardar {
  readonly id: string;
  readonly sessionId: string;
  /**
   * Cuándo **empezó** la ventana, en ISO 8601 y con huso explícito.
   *
   * Las dos cláusulas las exige `Measurement.timestamp` y las comprueba el
   * motor: `historialDeLaSesion` hace `timestamp + duracionS` para saber si la
   * escucha terminó, y rechaza una fecha sin huso en vez de adivinarle una —una
   * medición de un minuto antes de la escritura, escrita sin la `Z`, quedaba tres
   * horas después—.
   *
   * **Es el principio y no el final.** `ResultadoCaptura.capturadaEl` se toma
   * cuando la ventana termina, así que **no sirve para esto**: usarlo correría la
   * ventana dieciocho segundos hacia adelante y la escucha nunca daría por
   * terminada.
   */
  readonly empezoEl: string;
  /** El canal medido, para poder decir de quién es esta escucha. */
  readonly channelId: string | null;
  readonly analisis: AnalisisDeGanancia;
  /** Las tramas del medidor **del canal**, para lo que el análisis no cuenta. */
  readonly muestras: readonly MuestraVu[];
  /**
   * Las tramas del medidor **de la cuña**, cuando lo que se escucha es un monitor.
   *
   * **Ausente para la ganancia, y no por comodidad.** La ganancia está aguas
   * arriba del medidor del canal, así que moverla lo mueve y ese medidor solo
   * prueba lo que hay que probar. El envío a una cuña deriva del canal hacia el
   * bus y está antes del fader, de modo que subirlo **no mueve el medidor del
   * canal ni un escalón**: ahí hace falta el segundo, o la escucha diría que el
   * músico tocó sin decir nada de si su cuña sonó. Decisión del usuario del
   * 2026-09-19 entre tres opciones, [ADR-036](../../../../../docs/adr/ADR-036-la-escucha-de-una-cuna-se-comprueba-sobre-dos-medidores.md).
   *
   * **Va alineada por índice con `muestras`**: las dos se empujan en el mismo
   * tic del muestreo, así que la posición `i` de las dos describe el mismo
   * instante. Pareadas es como se puede preguntar «¿sonaron **a la vez**?», que
   * es lo que hay que preguntar: un músico que toca los últimos diez segundos y
   * una cuña que suena los primeros diez no son veinte segundos de escucha ni
   * diez, son cero.
   *
   * Lo que se lee de la cuña es lo que **sale hacia el parlante**, después del
   * fader del auxiliar. Ver `EstadoAuxiliar.nivelDb`.
   */
  readonly muestrasDeLaCuna?: readonly MuestraVu[];
}

/**
 * Las muestras en que **entró algo**, por encima del piso de ruido del medidor.
 *
 * **`PISO_DE_RUIDO_DB` y no `UMBRAL_SILENCIO_DB`, y la diferencia es el defecto
 * que esta función existe para no repetir.** El proyecto separó las dos cosas el
 * 2026-09-09: «no entró nada» y «entró muy bajo» llevan a consejos opuestos, la
 * primera a revisar el cable y la segunda a subir la ganancia del previo. El
 * umbral de −50 es el que decide si hay señal **suficiente para recomendar**; el
 * piso de −60 es el que decide si **entró algo**.
 *
 * Para la pregunta de esta pieza —¿el músico estaba sonando mientras yo
 * escuchaba?— el que corresponde es el piso. Un canal que entró a −54 es un
 * músico tocando bajo, no un músico ausente, **y es el caso principal del
 * asistente de ganancia**: usar el umbral de −50 dejaba sin rampa justamente al
 * canal que el asistente existe para levantar.
 */
function conSonido(muestras: readonly MuestraVu[]): readonly MuestraVu[] {
  return muestras.filter((m) => Number.isFinite(m.db) && m.db > PISO_DE_RUIDO_DB);
}

/**
 * ¿El medidor **se movió**?
 *
 * **Es lo que separa a un músico de una consola caída, y medirlo costó una
 * auditoría.** `MixerService` sólo vacía la lista de canales cuando el usuario
 * desconecta a propósito: si la conexión se cae sola, los últimos niveles
 * conocidos se quedan ahí, y la captura muestrea dieciocho segundos de un número
 * muerto. Medido el 2026-09-19 con la cadena entera: una ventana con la consola
 * caída y el último nivel en −14,6 dB se guardaba como `PERFORMANCE` de 17,95
 * segundos y **el motor autorizaba el paso siguiente**, con cero segundos de
 * música.
 *
 * Un medidor congelado no se mueve **ni un escalón** en dieciocho segundos. Uno
 * con un instrumento delante, sí.
 *
 * **La comparación es contra cero y no contra un margen**, porque un margen
 * habría que medirlo y nadie lo midió: cualquier número inventado acá sería la
 * clase de constante que este repositorio pasa el tiempo retractando. Lo que
 * **esto no caza, dicho con todas las letras**: una conexión que se cae y vuelve
 * dentro de la misma ventana deja dos valores distintos, así que el medidor «se
 * movió» y esta prueba concede. Para eso está la otra mitad, en
 * `guardarLaEscucha`, que se niega a guardar una escucha si la consola no estaba
 * conectada al terminar; y ninguna de las dos alcanza a una caída que empieza y
 * termina adentro de la ventana. Eso se cierra mirando la frescura de las tramas,
 * y es una tarea aparte.
 */
function elMedidorSeMovio(sonando: readonly MuestraVu[]): boolean {
  if (sonando.length === 0) return false;
  let minimo = Infinity;
  let maximo = -Infinity;
  for (const m of sonando) {
    if (m.db < minimo) minimo = m.db;
    if (m.db > maximo) maximo = m.db;
  }
  return maximo > minimo;
}

/**
 * ¿Hubo alguien tocando?
 *
 * **Es la única de las condiciones del motor que esta función decide**, y decide
 * bien o miente: `signalType` entra a una lista blanca —`PINK`, `SWEEP`, `SINE`,
 * `BURST`, `PERFORMANCE`— y `SILENCE` queda afuera a propósito, porque si nadie
 * tocó, nadie oyó.
 *
 * **La primera versión se apoyaba en `analisis.picoDb` y fallaba en las DOS
 * direcciones**, medido el 2026-09-19: decía que sí con la consola caída y el
 * medidor congelado, y decía que no con un canal que entró a −54 dB. O sea que
 * mentía a favor y en contra, y la frase «un pico finito es un medidor que se
 * movió» era falsa: un pico finito es un número por encima de −50, se haya movido
 * o no.
 *
 * Hoy son dos preguntas y las dos tienen que dar que sí: **entró algo** —por
 * encima del piso de ruido— y **el medidor se movió**.
 *
 * **Es `PERFORMANCE` y no `SINE` ni `PINK`** porque lo que suena es el
 * instrumento de alguien, no un generador: la aplicación no reproduce audio
 * todavía.
 *
 * **Y cuando lo que se escucha es una cuña son CUATRO preguntas y no dos.** A
 * las dos del canal —que probaron que el músico tocó— se suman las mismas dos
 * sobre el medidor de la cuña, que prueban que le llegó. Decisión del usuario del
 * 2026-09-19: ninguna de las dos mitades implica la otra, porque en una cuña
 * entran varios instrumentos y verla moverse no dice que se haya movido **por
 * este músico**. Con una sola de las dos, la aplicación podría afirmar que
 * escuchó sobre una cuña muda, paso tras paso, hasta el techo de nominal.
 */
function senal(
  sonandoCanal: readonly MuestraVu[],
  sonandoCuna: readonly MuestraVu[] | undefined,
): SignalType {
  if (!elMedidorSeMovio(sonandoCanal)) return 'SILENCE';
  if (sonandoCuna !== undefined && !elMedidorSeMovio(sonandoCuna)) return 'SILENCE';
  return 'PERFORMANCE';
}

/**
 * Los instantes en que **los dos** medidores tenían algo.
 *
 * **Se cruzan por índice y no se cuentan por separado**, y ésa es la parte que
 * importa: las dos series se empujan en el mismo tic, así que la posición `i` de
 * una y de la otra describen el mismo momento. Contar por separado y quedarse con
 * el menor de los dos totales diría que hubo diez segundos de escucha cuando el
 * músico tocó los últimos diez y la cuña sonó los primeros diez —que son cero—.
 *
 * Devuelve las muestras **del canal**, porque son las que describen a quién se
 * estaba escuchando; lo que aporta la cuña es el permiso, no el número.
 *
 * Si una serie es más corta que la otra, los índices que le faltan no cuentan:
 * un instante del que no hay dato de la cuña no es un instante en que se sepa que
 * la cuña sonó.
 */
export function sonaronALaVez(
  canal: readonly MuestraVu[],
  cuna: readonly MuestraVu[],
): readonly MuestraVu[] {
  const conSonidoLaCuna = (m: MuestraVu | undefined): boolean =>
    m !== undefined && Number.isFinite(m.db) && m.db > PISO_DE_RUIDO_DB;
  return canal.filter(
    (m, i) => Number.isFinite(m.db) && m.db > PISO_DE_RUIDO_DB && conSonidoLaCuna(cuna[i]),
  );
}

/**
 * Cuánto tiempo **sonó de verdad** la fuente, en segundos.
 *
 * **Es la música y no el reloj, y es una decisión del usuario del 2026-09-19**,
 * entre tres opciones. La ventana dura dieciocho segundos pase lo que pase; lo
 * que el motor tiene que juzgar es la escucha, y una escucha es el tiempo en que
 * hubo algo que escuchar.
 *
 * **Medido antes de cambiarlo:** un músico que tocaba tres de los dieciocho
 * segundos declaraba **17,95 segundos** de escucha, indistinguible de uno que
 * tocó los dieciocho. Con eso la garantía de diez segundos que el usuario eligió
 * el 2026-09-18 no era la que regía: lo que el motor comprobaba era «pasaron
 * dieciocho segundos de reloj y en algún momento hubo señal».
 *
 * Sale de contar muestras y no de restar la primera a la última **porque un
 * músico que toca al principio y al final deja un hueco en el medio**, y esa
 * resta lo contaría como tiempo tocado.
 *
 * **Lo que se pierde, dicho con todas las letras:** la duración de la ventana ya
 * no queda registrada en ningún campo. Es aceptable porque el único consumidor de
 * `duracionS` es la comprobación de escucha; el día que alguien necesite saber
 * cuánto duró la captura, eso pide un campo propio y no reinterpretar éste.
 */
export function cuantoSono(sonando: readonly MuestraVu[]): number {
  return (sonando.length * INTERVALO_DE_MUESTREO_MS) / 1000;
}

/**
 * Las métricas de lo que el medidor vio, o nada.
 *
 * **Devuelve `null` cuando el análisis no pudo calcularlas, y no un objeto con
 * `-Infinity`.** No es cosmética: `JSON.stringify(-Infinity)` es `"null"`, así que
 * un pico infinito guardado como JSON vuelve de la base como `null` en un campo
 * declarado `number`. El registro quedaría mintiéndole al tipo.
 *
 * **«Sin métricas» NO es «no sonó nadie», y una primera redacción decía que sí.**
 * Son dos preguntas distintas y las decide gente distinta: `senal()` pregunta si
 * el medidor se movió por encima del piso de ruido, y esto pregunta si hubo señal
 * **suficiente para recomendar una ganancia**, que es lo que `analizarVentana`
 * calcula. Un canal que entró a −54 dB es un músico tocando bajo: se guarda como
 * `PERFORMANCE` y **sin métricas**, porque no hay margen que afirmar sobre él. Lo
 * marcó una auditoría el 2026-09-19.
 */
function metricas(c: CapturaParaGuardar): MeasurementMetrics | null {
  const a = c.analisis;
  if (!Number.isFinite(a.picoDb) || !Number.isFinite(a.promedioDb)) return null;

  return {
    // El promedio del análisis es energético —suma de potencias y vuelta a
    // decibeles—, que es lo que significa un RMS en decibeles. **Sobre las
    // muestras con señal y no sobre la ventana entera**, porque promediar los
    // silencios entre frases hunde el número; es la misma decisión que toma el
    // asistente para proponer, y se anota acá para que quien lea la fila no
    // suponga otra cosa.
    rmsDb: a.promedioDb,
    // **Es el pico del MEDIDOR, no el de la señal**, y la diferencia importa:
    // cada trama es una ventana de la consola, así que un transitorio más corto
    // que esa ventana puede haber pasado por encima sin aparecer acá. Es la
    // cifra más alta que se puede afirmar, no la más alta que hubo.
    picoMuestraDb: a.picoDb,
    // El pico real pide sobremuestrear el audio, y acá no hay audio.
    picoRealDb: null,
    factorCrestaDb: a.picoDb - a.promedioDb,
    // **Ruido de fondo y relación señal-ruido necesitan la interfaz de audio**,
    // que sigue pendiente de los spikes. El asistente de ganancia ya usa el
    // mínimo del perfil en su lugar para no dar avisos falsos; acá no se pone
    // nada, porque un valor de perfil guardado como si fuera medido es
    // exactamente la clase de dato que después se cita.
    ruidoFondoDb: null,
    snrDb: null,
    // **Muestras sondeadas que llegaron al fondo de escala** --no tramas: entre
    // una lectura y otra puede haber llegado más de una trama `VU2` o ninguna,
    // porque la aplicación sondea cada 50 ms y las tramas llegan cada ~34-44 ms,
    // medido--. Se cuentan acá y no se derivan de `probabilidadDeSaturacion`, que
    // es otra cosa: esa es la fracción de muestras en zona de RIESGO, unos
    // decibeles antes del techo. Contar riesgo como saturación diría que saturó
    // algo que no saturó.
    eventosSaturacion: c.muestras.filter((m) => Number.isFinite(m.db) && m.db >= 0).length,
    // Un medidor de barras no tiene espectro, ni función de transferencia, ni
    // coherencia, ni retardo. Van en nulo las cuatro: «no se sabe» y «es cero»
    // llevan a conclusiones opuestas.
    tercioOctavaDb: null,
    transferMagnitudeDb: null,
    coherencia: null,
    retardoMuestras: null,
    promedios: null,
  };
}

export function medicionDeLaCaptura(c: CapturaParaGuardar): Measurement {
  // **Tres series y no una, y conviene tener claro qué decide cada una.**
  // `sonandoCanal` prueba que el músico tocó; `sonandoCuna`, que a su parlante le
  // llegó algo; y `sonando` son los instantes en que las dos cosas pasaron **a la
  // vez**, que es lo único que se puede declarar como escucha. Para la ganancia
  // no hay cuña y las tres colapsan en la primera, que es exactamente el
  // comportamiento anterior.
  const sonandoCanal = conSonido(c.muestras);
  const sonandoCuna = c.muestrasDeLaCuna === undefined
    ? undefined
    : conSonido(c.muestrasDeLaCuna);
  const sonando = c.muestrasDeLaCuna === undefined
    ? sonandoCanal
    : sonaronALaVez(c.muestras, c.muestrasDeLaCuna);
  return {
    id: c.id,
    sessionId: c.sessionId,
    timestamp: c.empezoEl,
    signalType: senal(sonandoCanal, sonandoCuna),
    // **En nulo, y el motivo que estaba escrito acá era FALSO.** Decía que
    // «dónde cae el medidor respecto del fader no se midió», y está medido desde
    // el 2026-09-09: el fader está **aguas abajo** del byte que esta captura lee
    // --`docs/compromisos/99b-el-medidor-contra-la-salida-real.md` lo usa como su
    // testigo fuerte, y `protocol-spec.md` lo verificó con música por las RCA--.
    // O sea que ese byte está después del previo y **antes de todo** el
    // procesamiento del canal, fader incluido. Lo cazó una auditoría de fidelidad
    // el 2026-09-19, y la frase estaba además en el mensaje de un test.
    //
    // El motivo verdadero es otro y es más simple: los cuatro valores de
    // `AnalysisReferenceMode` nombran desde qué **envío** de la consola se toma la
    // referencia eléctrica para una medición acústica (ADR-003), y esto no es un
    // envío: es el medidor propio de la consola. Ninguno de los cuatro lo
    // describe, así que declarar uno sería declarar un camino que no se usó.
    referenceMode: null,
    paComponent: null,
    channelId: c.channelId,
    posicion: null,
    sceneId: null,
    buildState: null,
    micProfileId: null,
    calibrationStateId: SIN_CALIBRACION,
    snapshotRef: null,
    // **La cadencia con que la aplicación SONDEA el medidor**, veinte veces por
    // segundo. No son 48 000: no hay audio, y escribir la frecuencia de muestreo
    // del audio acá sería describir una captura que no ocurrió.
    //
    // **Y no es la cadencia del medidor, que es otra y está medida**: las tramas
    // `VU2` llegan con media 44,3 ms y mediana 34 ms, así que sondeando cada 50 ms
    // una trama se cuenta dos veces o se saltea. Una redacción anterior de esta
    // línea las confundía.
    sampleRate: 1000 / INTERVALO_DE_MUESTREO_MS,
    // **Cuánto sonó la fuente, no cuánto duró la ventana.** Ver `cuantoSono`: es
    // una decisión del usuario del 2026-09-19, y antes de ella tres segundos de
    // música en una ventana de dieciocho declaraban 17,95 segundos de escucha.
    duracionS: cuantoSono(sonando),
    directRef: null,
    acousticRef: null,
    consoleTelemetry: metricas(c),
    archivoAudio: null,
    // **La aserción está y hay que decir qué apaga, que es lo que faltaba.**
    // `id`, `sessionId`, `channelId` y `calibrationStateId` son tipos marcados
    // --`MeasurementId`, `SessionId`, `ChannelAssignmentId`, `CalibrationStateId`--
    // y acá entran cadenas: sin la aserción, `tsc` da cuatro errores. O sea que
    // esto **desactiva la comprobación de los cuatro identificadores** y además
    // dejaría pasar en silencio un campo obligatorio nuevo de `Measurement`.
    //
    // Se deja porque este repositorio no tiene constructores de identificadores
    // marcados --nadie genera un `MeasurementId` en ninguna parte-- y el resto del
    // código hace lo mismo. Lo que no se deja es sin decir: era la única decisión
    // de este archivo sin una línea al lado, en un archivo que explica por qué
    // `picoRealDb` va en nulo. Lo marcó una auditoría el 2026-09-19.
  } as Measurement;
}
