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
 * Cuánto por debajo del momento más fuerte de la ventana puede estar un instante
 * y seguir contando como que el músico estaba tocando.
 *
 * **Es una vara RELATIVA a la propia escucha, y ésa es la decisión.** Una vara
 * fija en decibeles no se puede elegir sin medir en un escenario con banda —el
 * único banco que este proyecto tiene es una sala callada— y encima castigaría
 * al músico que toca bajo, que es justamente el canal que el asistente de
 * ganancia existe para levantar. Comparando cada instante contra el pico de **su
 * propia ventana**, la vara se acomoda sola a cada micrófono, a cada instrumento
 * y a cada sala.
 *
 * **Veinte, y es decisión del usuario del 2026-09-19** entre tres opciones —12,
 * 20 y 30—, hecha como ingeniero de sonido: es la dinámica que tiene una frase
 * cantada o tocada de verdad. Más estricto haría repetir la escucha a un
 * instrumento de dinámica ancha; más generoso deja entrar el ambiente de entre
 * frases.
 *
 * **Y es «a 20 dB o menos», no «a menos de 20 dB»:** el instante que está
 * exactamente 20 dB bajo el pico **cuenta**. Comprobado en el borde por una
 * auditoría; una primera redacción prometía más estricto de lo que el código hace.
 *
 * **Lo que NO alcanza, dicho con todas las letras:** un escenario donde el
 * ambiente esté a 20 dB o menos del músico. Ahí esta mitad no filtra nada y la que
 * sostiene sola es {@link MOVIMIENTO_MINIMO_DB} --no la vecindad, que es sólo el
 * ancho del tramo; el enlace estaba mal--.
 *
 * **Y el caso peor no es ése: es que NADIE toque.** Ahí el pico de la ventana
 * **es** el ambiente, así que esta mitad no filtra nada por construcción. Una
 * auditoría adversarial lo midió el 2026-09-19: una sala viva declara entre 11 y
 * 16 segundos de música y **el motor concede el paso**. Ver
 * {@link MOVIMIENTO_MINIMO_DB}.
 */
export const DISTANCIA_AL_PICO_DB = 20;

/**
 * El tramo alrededor de un instante en el que se mira si el medidor se movió.
 *
 * **Una cota viene de algo medido y la otra es oficio, y hay que decir cuál es
 * cuál.** Por abajo, **medida**: tiene que abarcar varias tramas del medidor,
 * porque las `VU2` llegan con media 44,3 ms y mediana 34 ms, y un tramo más corto
 * dejaría que una sola trama decida si hubo movimiento. Por arriba, **elegida**:
 * tiene que ser más corto que una frase musical, o el silencio entre dos notas se
 * mezcla con las notas y cuenta como movimiento --y en este repositorio no hay
 * ninguna medición de cuánto dura una frase--.
 *
 * Medio segundo cumple las dos: abarca una decena de tramas y ningún músico hace
 * una frase entera en ese tiempo.
 *
 * **Acá decía «las dos vienen de algo medido», y era falso.** Lo cazó una
 * auditoría de fidelidad el 2026-09-19, el mismo día. Importa más de lo que
 * parece: toda esta pieza se apoya en distinguir lo medido de lo elegido --la
 * vara de {@link MOVIMIENTO_MINIMO_DB} está marcada con mayúsculas como
 * elegida-- y presentar como medida la mitad que no lo está debilita justamente
 * la distinción que hace útil a la otra marca.
 */
export const VECINDAD_DE_MOVIMIENTO_MS = 500;

/**
 * Cuánto tiene que moverse el medidor dentro de {@link VECINDAD_DE_MOVIMIENTO_MS}
 * para que ahí haya estado pasando algo.
 *
 * **ELEGIDO, NO MEDIDO, y la distinción es de este repositorio.** Lo que haría
 * falta para medirlo es una ventana con alguien tocando por un micrófono en la
 * misma sala, contra otra de la sala sola; el equipo del usuario está a distancia
 * y en esa sala no hay nadie que pueda tocar, así que la medición no se puede
 * hacer hoy. **Se remide cuando se pueda**, y hasta entonces esto es un número
 * elegido con un argumento, que es distinto de un número medido.
 *
 * **El argumento, por si hay que discutirlo:** tres decibeles son el doble de
 * potencia. Que el medidor recorra eso en medio segundo quiere decir que la
 * fuente **hizo algo**, no que el número tembló. Y son nueve veces el escalón del
 * medidor, así que no puede salir de la resolución del instrumento --que es
 * exactamente de dónde salía el defecto viejo: un escalón de 0,3334 dB en
 * cualquiera de los 360 instantes declaraba dieciocho segundos de música--.
 *
 * **La primera versión de esta vara fue «más de un escalón» y no servía**, y vale
 * dejarlo escrito porque sonaba principista: usar la resolución del propio
 * instrumento parecía la elección sin arbitrariedad. Lo que mostró el test es que
 * el ruido parejo de una sala se mueve varias veces eso sin que nadie toque, así
 * que la vara principista dejaba pasar justamente lo que venía a filtrar. **Una
 * constante con buen argumento y mal valor es peor que una declarada a ojo**,
 * porque nadie vuelve a mirarla.
 *
 * **Lo que esto deja afuera, dicho con todas las letras:** una fuente sostenida y
 * pareja --un tono, un acorde de órgano tenido-- durante más de medio segundo,
 * **y sólo si es continua**: la misma fuente plana encendida y apagada cada medio
 * segundo sí cuenta, porque el movimiento se mide contra el silencio de al lado y
 * no contra la textura de la fuente. Un instrumento tocado no da una meseta
 * continua; un generador sí, y la aplicación no reproduce audio todavía. El día
 * que reproduzca tonos para medir, esta regla hay que volver a mirarla.
 *
 * ## Y LO PRINCIPAL: ESTA VARA NO ALCANZA PARA LO QUE SE PUSO
 *
 * **Medido el 2026-09-19 por una auditoría adversarial, con la cadena completa y
 * ambientes correlacionados como se mueve un medidor de sala de verdad: una sala
 * viva, SIN QUE NADIE TOQUE, declara entre 11 y 16 segundos de música y el motor
 * concede el paso de 2 dB.** La frontera está entre 3,8 y 4,0 dB pico a pico con
 * ambiente uniforme, y el nivel absoluto es irrelevante --el mismo ambiente a −55
 * o a −25 da el mismo veredicto--, porque con nadie tocando el pico **es** el
 * ambiente y {@link DISTANCIA_AL_PICO_DB} no filtra nada.
 *
 * **Lo que la auditoría mostró y decide qué sigue:** lo que delata a una sala
 * tranquila no es cuánto se mueve sino **qué tan despacio**. Una sala viva se
 * mueve rápido, igual que un instrumento. **Desde un solo medidor las dos cosas
 * se ven iguales, y ninguna vara sobre esta serie las separa.** Subir el número no
 * arregla nada: lo que hace falta es comparar contra una **ventana de referencia**
 * del mismo canal tomada con el músico callado a propósito. Decisión del usuario
 * del 2026-09-19, y es una pieza nueva.
 */
export const MOVIMIENTO_MINIMO_DB = 3;

/**
 * Los instantes en que el músico **estaba tocando**.
 *
 * **Son TRES preguntas y hasta el 2026-09-19 eran una y media.** El criterio
 * viejo pedía que el medidor se moviera **una vez en toda la ventana** —un
 * `max > min` sobre los 360 instantes— y después contaba como escucha todo
 * instante que estuviera sobre el piso de ruido. Medido por una auditoría
 * adversarial con la cadena completa: **un solo escalón de 0,3334 dB en
 * cualquiera de los 360 instantes declaraba dieciocho segundos de música**, y
 * **dos segundos de música con ambiente alrededor, también**. En un escenario
 * real, con un micrófono abierto entre frase y frase, eso se cumple solo.
 *
 * Las tres, y las tres tienen que dar que sí:
 *
 * **1. Entró algo.** Por encima del piso de ruido del medidor.
 * **`PISO_DE_RUIDO_DB` y no `UMBRAL_SILENCIO_DB`**, y la diferencia es un defecto
 * que este proyecto ya pagó: el 2026-09-09 separó «no entró nada» de «entró muy
 * bajo» porque llevan a consejos opuestos —revisar el cable contra subir la
 * ganancia—, y el mapeo los había vuelto a fundir. Un canal que entró a −54 es un
 * músico tocando bajo.
 *
 * **2. Está cerca del momento más fuerte de esta misma escucha**, dentro de
 * {@link DISTANCIA_AL_PICO_DB}. Es lo que saca el ambiente de entre frases sin
 * castigar al que toca bajo: la vara se mueve con el músico.
 *
 * **3. El medidor se estaba moviendo ahí**, mirando el tramo de
 * {@link VECINDAD_DE_MOVIMIENTO_MS} alrededor del instante y pidiendo
 * {@link MOVIMIENTO_MINIMO_DB}. Es la única de las tres con un número **elegido y
 * no medido**, y ahí está dicho por qué y qué haría falta para medirlo.
 *
 * **Lo que esto NO prueba, y ADR-036 promete de más en su prosa:** que la cuña se
 * haya movido **por este músico**. El medidor del auxiliar es la suma del bus y no
 * distingue una voz de una guitarra; que las dos cosas pasen a la vez no dice que
 * una haya causado la otra. La tabla del ADR lo dice bien en su fila del medio.
 *
 * **Y lo que ya no hace falta que haga:** distinguir una consola caída. Desde el
 * 2026-09-19 el muestreo pregunta si la consola sigue ahí en **cada tic** y no
 * registra el instante que no pudo oír, así que un medidor congelado no llega
 * hasta acá. Esta función igual lo rechazaría --un valor clavado no se mueve-- y
 * eso es a propósito: las dos mitades se cubren.
 *
 * **Antes acá decía que la caída que empieza y termina adentro de la ventana «se
 * cierra mirando la frescura de las tramas, y es una tarea aparte», y era falso**
 * —lo midió una auditoría adversarial del mismo día—: el dato ya estaba y lo único
 * que faltaba era preguntarlo en el bucle. Queda escrito porque el error es la
 * parte instructiva: **presentar como caro algo que cuesta una línea es lo que
 * hace que esa línea no se escriba**, y estuvo un día entero logrando eso.
 *
 * **Trabajo previo:** ninguno de los cuatro proyectos de terceros que este
 * repositorio mira decide si alguien está tocando a partir del medidor.
 * Comprobado el 2026-09-19 clonando y grepeando; lo único que aparece al buscar
 * `threshold` son el umbral del **compresor** y el del **de-esser** de la propia
 * consola, que es otra cosa. Ver `docs/referencia/trabajo-previo-de-terceros.md`.
 * **Que no haya precedente es un dato: pide más cuidado, no menos.**
 *
 * Dos correcciones de una auditoría de fidelidad del mismo día: acá decía «la
 * puerta y el compresor» --el campo de la puerta se llama distinto y esa búsqueda
 * no lo alcanza-- y «los cuatro proyectos que hablan este protocolo», cuando uno
 * de los cuatro no lo habla: es una inyección en el cliente oficial.
 */
export function indicesConMusica(muestras: readonly MuestraVu[]): ReadonlySet<number> {
  const cuentan = new Set<number>();
  if (muestras.length === 0) return cuentan;

  let pico = -Infinity;
  for (const m of muestras) {
    if (Number.isFinite(m.db) && m.db > pico) pico = m.db;
  }
  if (!Number.isFinite(pico)) return cuentan;

  const radioMs = VECINDAD_DE_MOVIMIENTO_MS / 2;
  for (let i = 0; i < muestras.length; i++) {
    const m = muestras[i];
    // **`tMs` también se comprueba, y no es cosmética.** La vecindad se acota con
    // `Math.abs(v.tMs - m.tMs) > radioMs`, y esa comparación con `NaN` o
    // `Infinity` da falso: la muestra **no se descarta**, la vecindad pasa a ser la
    // ventana entera, y el criterio colapsa exactamente al `max > min` sobre los
    // 360 instantes que esta pieza vino a cerrar. O sea que fallaba **abierto, y
    // hacia la versión vieja del defecto**. Lo midió una auditoría adversarial el
    // 2026-09-19; no es alcanzable desde `recolectar` --ahí `tMs` es
    // `Date.now() - inicio`-- pero esta función es exportada y probable, y es la
    // sexta vez que este repositorio se come un no-número que concede.
    if (m === undefined || !Number.isFinite(m.db) || !Number.isFinite(m.tMs)) continue;
    if (m.db <= PISO_DE_RUIDO_DB) continue;
    if (m.db < pico - DISTANCIA_AL_PICO_DB) continue;

    // El tramo alrededor, por tiempo y no por cantidad de muestras: el muestreo
    // se salta un tic cuando la consola no publicó el canal, así que contar
    // vecinos por índice miraría un tramo más largo del que dice mirar.
    let minimo = Infinity;
    let maximo = -Infinity;
    for (let j = 0; j < muestras.length; j++) {
      const v = muestras[j];
      if (v === undefined || !Number.isFinite(v.db) || !Number.isFinite(v.tMs)) continue;
      if (Math.abs(v.tMs - m.tMs) > radioMs) continue;
      if (v.db < minimo) minimo = v.db;
      if (v.db > maximo) maximo = v.db;
    }
    if (maximo - minimo >= MOVIMIENTO_MINIMO_DB) cuentan.add(i);
  }
  return cuentan;
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
 * Hoy la pregunta se la hace {@link indicesConMusica}, que son **tres** y no
 * dos: entró algo, está cerca del momento más fuerte de esta misma escucha, y el
 * medidor se estaba moviendo ahí. Acá sólo queda traducir «no hubo ningún
 * instante que contara» a `SILENCE`.
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
  conMusicaCanal: ReadonlySet<number>,
  conMusicaCuna: ReadonlySet<number> | undefined,
): SignalType {
  if (conMusicaCanal.size === 0) return 'SILENCE';
  if (conMusicaCuna !== undefined && conMusicaCuna.size === 0) return 'SILENCE';
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
 *
 * **Y desde el 2026-09-19 lo que se cruza son los instantes CON MÚSICA de cada
 * una, no los que tenían algo por encima del piso.** Preguntar presencia era la
 * mitad floja del criterio viejo: en una cuña de escenario, con un micrófono
 * abierto, estar por encima del piso de ruido pasa siempre. Cada serie se juzga
 * con sus tres preguntas --ver {@link indicesConMusica}-- y contra **su propio**
 * pico, que es lo correcto: el pico de la cuña es el de la suma del bus y no
 * tiene por qué parecerse al del canal.
 */
export function sonaronALaVez(
  canal: readonly MuestraVu[],
  cuna: readonly MuestraVu[],
): readonly MuestraVu[] {
  const enCanal = indicesConMusica(canal);
  const enCuna = indicesConMusica(cuna);
  return canal.filter((_, i) => enCanal.has(i) && enCuna.has(i));
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
 * hubo algún instante con música --tres condiciones, ver `indicesConMusica`; esta
 * línea decía «si el medidor se movió por encima del piso de ruido» y quedó vieja
 * en el mismo commit que la invalidó--, y esto pregunta si hubo señal
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
  // `conMusicaCanal` prueba que el músico tocó; `conMusicaCuna`, que a su
  // parlante le llegó algo; y `sonando` son los instantes en que las dos cosas
  // pasaron **a la vez**, que es lo único que se puede declarar como escucha.
  // Para la ganancia no hay cuña y las tres colapsan en la primera.
  //
  // **Cada serie se juzga contra su propio pico**, que es lo que `indicesConMusica`
  // hace al recibirlas por separado: el medidor de la cuña es la suma del bus y no
  // tiene por qué parecerse al del canal.
  const conMusicaCanal = indicesConMusica(c.muestras);
  const conMusicaCuna = c.muestrasDeLaCuna === undefined
    ? undefined
    : indicesConMusica(c.muestrasDeLaCuna);
  const sonando = c.muestrasDeLaCuna === undefined
    ? c.muestras.filter((_, i) => conMusicaCanal.has(i))
    : sonaronALaVez(c.muestras, c.muestrasDeLaCuna);
  return {
    id: c.id,
    sessionId: c.sessionId,
    timestamp: c.empezoEl,
    signalType: senal(conMusicaCanal, conMusicaCuna),
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
