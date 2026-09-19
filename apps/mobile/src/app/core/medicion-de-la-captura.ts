import type { AnalisisDeGanancia, MuestraVu } from '@vse/assistants';
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
  /** Las tramas del medidor, para lo que el análisis no cuenta. */
  readonly muestras: readonly MuestraVu[];
}

/**
 * ¿Hubo alguien tocando?
 *
 * **Es la única de las siete condiciones del motor que esta función decide**, y
 * decide bien o miente: `signalType` entra a una lista blanca —`PINK`, `SWEEP`,
 * `SINE`, `BURST`, `PERFORMANCE`— y `SILENCE` queda afuera a propósito, porque si
 * nadie tocó, nadie oyó.
 *
 * El criterio sale del propio análisis y no de un umbral repetido acá: cuando la
 * ventana no juntó suficientes muestras por encima del umbral de silencio,
 * `analizarVentana` devuelve el pico en `-Infinity`. Un pico finito es un medidor
 * que se movió.
 *
 * **Es `PERFORMANCE` y no `SINE` ni `PINK`** porque lo que suena es el
 * instrumento de alguien, no un generador: la aplicación no reproduce audio
 * todavía.
 */
function senal(analisis: AnalisisDeGanancia): SignalType {
  return Number.isFinite(analisis.picoDb) ? 'PERFORMANCE' : 'SILENCE';
}

/**
 * Las métricas de lo que el medidor vio, o nada.
 *
 * **Devuelve `null` cuando no hubo señal, y no un objeto con `-Infinity`.** No es
 * cosmética: `JSON.stringify(-Infinity)` es `"null"`, así que un pico infinito
 * guardado como JSON vuelve de la base como `null` en un campo declarado
 * `number`. El registro quedaría mintiéndole al tipo. Y de un silencio no hay
 * métricas que dar: no tenerlas es el dato.
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
    // **Tramas del medidor que llegaron al fondo de escala.** Se cuentan acá y
    // no se derivan de `probabilidadDeSaturacion`, que es otra cosa: esa es la
    // fracción de muestras en zona de RIESGO, unos decibeles antes del techo.
    // Contar riesgo como saturación diría que saturó algo que no saturó.
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
  return {
    id: c.id,
    sessionId: c.sessionId,
    timestamp: c.empezoEl,
    signalType: senal(c.analisis),
    // **En nulo, y es una decisión y no un olvido.** Los cuatro valores de
    // `AnalysisReferenceMode` describen desde qué envío de la consola se toma la
    // referencia eléctrica para una medición acústica (ADR-003), y esto no es
    // eso: es el medidor propio de la consola. De él se sabe, medido el
    // 2026-09-09, que está **antes del proceso dinámico**; dónde cae respecto
    // del fader **no se midió**. Declarar `RAW_INPUT` sería afirmar la mitad que
    // nadie comprobó, y la regla 1 del repositorio dice que nada se asume del
    // protocolo.
    referenceMode: null,
    paComponent: null,
    channelId: c.channelId,
    posicion: null,
    sceneId: null,
    buildState: null,
    micProfileId: null,
    calibrationStateId: SIN_CALIBRACION,
    snapshotRef: null,
    // **La cadencia del medidor, porque las muestras de esta medición son
    // tramas del medidor.** No son 48 000: no hay audio. Escribir la frecuencia
    // de muestreo del audio acá sería describir una captura que no ocurrió.
    sampleRate: 1000 / INTERVALO_DE_MUESTREO_MS,
    // **La duración MEDIDA —de la primera muestra a la última— y no los
    // dieciocho segundos que la ventana declara.** El motor exige diez segundos
    // de escucha para esta clase de parámetro y compara contra este campo; si la
    // captura se cortó antes, decir dieciocho sería declarar una escucha que no
    // pasó. Una ventana corta tiene que quedar corta.
    duracionS: c.analisis.duracionS,
    directRef: null,
    acousticRef: null,
    consoleTelemetry: metricas(c),
    archivoAudio: null,
  } as Measurement;
}
