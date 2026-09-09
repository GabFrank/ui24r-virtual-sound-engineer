import type { ChannelProfile, Confidence, DinamicaDeCanal } from '@vse/domain';
import { confianzaCanal, describirProcesos, procesosEn } from '@vse/domain';

/**
 * Asistente de ganancia.
 *
 * Trabaja sobre la telemetría de la consola, no sobre la interfaz de audio
 * externa. La razón es que la cadena externa suma dos ganancias analógicas que
 * la aplicación no puede leer: el envío auxiliar y el preamplificador de la
 * interfaz, cuyo potenciómetro el usuario puede mover en cualquier momento.
 * El medidor de la consola, en cambio, es telemetría directa (ADR-004).
 *
 * Todo lo de este archivo son funciones puras: entra una ventana de medidas,
 * sale un análisis. Sin estado, sin red y sin framework, así que se prueba
 * entero con datos sintéticos.
 */

/**
 * Una lectura del medidor, con su instante.
 *
 * **`db` tiene que venir del medidor anterior al procesamiento dinámico**, que
 * en esta consola es el primer byte de cada canal de la trama —`pre`— y no el
 * segundo. El segundo es el que la consola dibuja en su tira, y llega con el
 * compresor encima: medido el 2026-09-09, con el compresor apretando 5 dB uno
 * cayó a −53,33 y el otro se quedó en −48,66. Aconsejar ganancia sobre el
 * segundo es aconsejar sobre una señal ya procesada.
 *
 * `reduccionDb` viaja igual, aunque el nivel ya no dependa de ella: sirve para
 * decirle al usuario cuánto está apretando el canal, que cambia lo que va a
 * escuchar cuando mueva la perilla.
 */
export interface MuestraVu {
  readonly tMs: number;
  /** Nivel anterior al procesamiento dinámico, en la escala de la consola. */
  readonly db: number;
  /**
   * Decibeles que el procesador dinámico estaba sacando en ese instante.
   *
   * Es un campo obligatorio a propósito: hacerlo opcional dejaría que un
   * llamador nuevo volviera a medir sin mirarlo, y este dato es lo único que
   * distingue un compresor puesto de uno actuando.
   */
  readonly reduccionDb: number;
}

export interface AnalisisDeGanancia {
  readonly picoDb: number;
  /** Promedio energético, no promedio de decibeles: sumar decibeles no significa nada. */
  readonly promedioDb: number;
  /** Distancia entre el pico y el fondo de escala. */
  readonly margenDb: number;
  /** Fracción de muestras en zona de riesgo de saturación. */
  readonly probabilidadDeSaturacion: number;
  /** Desviación típica del nivel: cuánto varía la fuente. */
  readonly estabilidadDb: number;
  readonly rangoDinamicoDb: number;
  readonly muestras: number;
  readonly duracionS: number;
  readonly suficiente: boolean;
  readonly motivoInsuficiente: string | null;
  /**
   * Reducción que el compresor aplicaba **en el instante del pico**.
   *
   * Es la que importa y no el promedio: es el momento más fuerte de la toma, o
   * sea el que decide cuánto va a comprimir el canal en el show. Un canal que
   * aprieta tres decibeles en las frases y nada en el grito no es lo mismo que
   * uno que aprieta nueve justo cuando el cantante empuja.
   */
  readonly reduccionEnPicoDb: number;
  /** La mayor reducción vista en toda la ventana. */
  readonly reduccionMaximaDb: number;
  /** Fracción de muestras con señal en las que el compresor estuvo actuando. */
  readonly fraccionComprimida: number;
}

/**
 * Umbral por encima del cual una muestra cuenta como riesgo de saturación.
 *
 * **Cuelga del techo medido del medidor, no es un número suelto.** El techo
 * está medido: el byte se clava en 239 y la lectura deja de subir, y en la
 * escala de la consola ese tope es 0 dB. Lo que se elige acá es el **margen**
 * que se le deja antes de avisar, y eso sí es una decisión nuestra.
 *
 * El techo se escribe acá en vez de importarse del adaptador porque los
 * asistentes no pueden hablar con la consola —lo comprueba
 * `validate-limites`—. Que el tope de la escala sea 0 dB no es un detalle del
 * transporte sino de la escala misma, así que no se pierde nada.
 *
 * Lo que sigue sin estar confirmado —y por eso el margen no es más fino— es
 * que la lectura de cero del medidor corresponda al fondo de escala digital.
 * Esa correspondencia la mide SPK-P0.10b con un tono de −1 dBFS por un bucle
 * físico. Mientras tanto el aviso se da antes de llegar al techo, que es el
 * lado seguro: avisar de más molesta, avisar de menos deja pasar un recorte.
 *
 * El margen es de 1 dB **para que el umbral siga siendo el mismo −1 dB de
 * antes**. Derivarlo de una medición era el punto; cambiar de paso cuándo
 * avisa la aplicación, no. Si algún día se afina, que sea una decisión
 * deliberada y no el efecto colateral de una limpieza.
 */
const TECHO_DEL_MEDIDOR_DB = 0;
const MARGEN_ANTES_DEL_TECHO_DB = 1;
export const UMBRAL_RIESGO_DB = TECHO_DEL_MEDIDOR_DB - MARGEN_ANTES_DEL_TECHO_DB;

/** Por debajo de esto se considera que la fuente no está sonando. */
export const UMBRAL_SILENCIO_DB = -50;

/**
 * Reducción por debajo de la cual el compresor no cambia ningún consejo.
 *
 * **No es un umbral elegido a ojo: es la granularidad del control que se está
 * aconsejando mover.** La ganancia de entrada de esta consola es escalonada —de
 * 2 en 2 dB hasta +26 y de 1 en 1 desde +27, 48 posiciones en total, medido en
 * SPK-P0.2a—. El escalón más fino es de un decibel, así que un sesgo menor que
 * eso no puede cambiar a qué posición de la perilla se manda al usuario.
 *
 * Es también lo que separa «hay un compresor puesto» de «hay un compresor
 * actuando». La distinción vale la pena: casi todos los canales de un show
 * tienen compresor, y avisar en todos sería un cartel que se aprende a ignorar.
 */
export const REDUCCION_RELEVANTE_DB = 1;

const DURACION_MINIMA_S = 10;
const MUESTRAS_MINIMAS = 60;

/**
 * Un número de decibeles para leer, que nunca imprime `Infinity`.
 *
 * El margen es `objetivo − pico`, así que con el canal en silencio da infinito
 * y `toFixed` lo escupe tal cual. Apareció en la tablet, en la pantalla que el
 * usuario mira para decidir si mueve una perilla.
 */
function formatearDb(db: number): string {
  if (!Number.isFinite(db)) return '—';
  return db.toFixed(1);
}

export function analizarVentana(muestras: readonly MuestraVu[]): AnalisisDeGanancia {
  if (muestras.length === 0) return vacio('la ventana no tiene ninguna muestra');

  const primera = muestras[0]!;
  const ultima = muestras[muestras.length - 1]!;
  const duracionS = (ultima.tMs - primera.tMs) / 1000;

  // Solo cuentan las muestras donde la fuente realmente sonó: promediar los
  // silencios entre frases hunde el promedio y arruina la recomendación.
  const conSenal = muestras.filter((m) => m.db > UMBRAL_SILENCIO_DB);

  if (conSenal.length < MUESTRAS_MINIMAS) {
    return {
      ...vacio(`solo ${conSenal.length} muestras con señal, hacen falta ${MUESTRAS_MINIMAS}`),
      muestras: conSenal.length,
      duracionS,
    };
  }

  let pico = -Infinity;
  let minimo = Infinity;
  let sumaPotencia = 0;
  let enRiesgo = 0;
  let reduccionEnPico = 0;
  let reduccionMaxima = 0;
  let comprimidas = 0;

  for (const m of conSenal) {
    if (m.db > pico) {
      pico = m.db;
      // La reducción del pico se toma de la misma muestra que el pico, no del
      // promedio de la ventana: las dos cifras vienen de la misma trama y
      // describen el mismo instante.
      reduccionEnPico = m.reduccionDb;
    }
    if (m.db < minimo) minimo = m.db;
    // Promedio en potencia y de vuelta a decibeles. Promediar decibeles
    // directamente da un número que no corresponde a ninguna energía real.
    sumaPotencia += Math.pow(10, m.db / 10);
    if (m.db >= UMBRAL_RIESGO_DB) enRiesgo++;
    if (m.reduccionDb > reduccionMaxima) reduccionMaxima = m.reduccionDb;
    if (m.reduccionDb >= REDUCCION_RELEVANTE_DB) comprimidas++;
  }

  const promedioDb = 10 * Math.log10(sumaPotencia / conSenal.length);
  const varianza =
    conSenal.reduce((acc, m) => acc + (m.db - promedioDb) ** 2, 0) / conSenal.length;

  return {
    picoDb: pico,
    promedioDb,
    margenDb: -pico,
    probabilidadDeSaturacion: enRiesgo / conSenal.length,
    estabilidadDb: Math.sqrt(varianza),
    rangoDinamicoDb: pico - minimo,
    muestras: conSenal.length,
    duracionS,
    suficiente: duracionS >= DURACION_MINIMA_S,
    motivoInsuficiente:
      duracionS >= DURACION_MINIMA_S
        ? null
        : `la ventana duró ${duracionS.toFixed(1)} s y hacen falta ${DURACION_MINIMA_S}`,
    reduccionEnPicoDb: reduccionEnPico,
    reduccionMaximaDb: reduccionMaxima,
    fraccionComprimida: comprimidas / conSenal.length,
  };
}

function vacio(motivo: string): AnalisisDeGanancia {
  return {
    picoDb: -Infinity, promedioDb: -Infinity, margenDb: Infinity,
    probabilidadDeSaturacion: 0, estabilidadDb: 0, rangoDinamicoDb: 0,
    muestras: 0, duracionS: 0, suficiente: false, motivoInsuficiente: motivo,
    reduccionEnPicoDb: 0, reduccionMaximaDb: 0, fraccionComprimida: 0,
  };
}

export interface PropuestaDeGanancia {
  /** La ganancia leída de la consola, o `null` si todavía no se leyó. */
  readonly gainActualDb: number | null;
  readonly gainPropuestoDb: number | null;
  readonly deltaDb: number;
  /** Si el ajuste se recortó por el límite de cambio por transacción. */
  readonly recortadoPorLimite: boolean;
  readonly razon: string;
  readonly confianza: Confidence;
  readonly avisos: readonly string[];
  /** Reducción que el compresor aplicaba en el pico. Cero si no actuaba. */
  readonly reduccionEnPicoDb: number;
  /**
   * Qué procesos hay entre este nivel y lo que se va a escuchar.
   *
   * Vacío cuando el canal está limpio. **No** quiere decir que la medición esté
   * mal —se mide antes del proceso, a propósito—, sino que el efecto de mover
   * la perilla no va a ser el que el usuario espera. La pantalla lo muestra
   * donde se lee el nivel.
   */
  readonly condicionadaPor: readonly string[];
}

/** Cambio máximo de ganancia en una sola propuesta (INV-004). */
export const DELTA_MAXIMO_DB = 3;

/**
 * Propone una ganancia a partir del análisis y del perfil de la fuente.
 *
 * El objetivo es dejar el pico a la distancia del fondo de escala que el
 * perfil pide. Un cajón necesita menos margen que una voz porque su dinámica
 * es más predecible; una voz necesita más porque el cantante va a gritar en el
 * estribillo aunque en la prueba no lo haya hecho.
 *
 * ## Qué hace cuando el canal tiene proceso dinámico
 *
 * En un show casi todos los canales tienen compresor, así que la pregunta no es
 * si hay proceso: es qué cambia por haberlo.
 *
 * **Lo que no cambia es el número.** La ventana se mide en el punto anterior al
 * procesamiento dinámico —ver `MuestraVu`—, así que el pico del que sale la
 * propuesta es el que entra al canal, con el compresor puesto o sin él.
 * Abstenerse acá sería callarse teniendo el dato bueno en la mano.
 *
 * **Lo que sí cambia es lo que hay que contarle al usuario**, y no es un matiz:
 * si el canal está apretando 9 dB, subir tres decibeles de ganancia **no se va
 * a oír como tres decibeles**. La ganancia queda bien puesta y la mezcla se
 * mueve menos de lo esperado. Quien está por tocar necesita saberlo antes de
 * volver al fader creyendo que el cambio no se aplicó.
 *
 * Por eso el aviso se gradúa por lo que se **midió**, no por lo que está
 * configurado: un compresor que no llegó a su umbral no cambia nada de lo que
 * el usuario va a escuchar, y marcarlo pondría un cartel en casi todos los
 * canales hasta que se dejen de mirar.
 *
 * ## Qué le cuesta confianza a una propuesta
 *
 * Solo lo que está **inferido y no medido**. Que el compresor, el ecualizador y
 * la **puerta** no tocan el punto de medición está comprobado contra la
 * consola, así que un canal comprimiendo o con la puerta trabajando no baja de
 * confianza: la medición es tan buena como cualquier otra.
 *
 * Queda un solo bloque sin medir, el **de-esser**: no informa cuánto atenúa y
 * no se probó con sibilancia, así que sigue siendo una inferencia que viva en
 * el mismo lugar que los otros tres. Mientras siga inferido, un canal con
 * de-esser activo no alcanza la confianza más alta, que es la que hace que el
 * usuario aplique sin comprobar.
 */
export function proponerGanancia(
  analisis: AnalisisDeGanancia,
  perfil: ChannelProfile,
  gainActualDb: number | null,
  opciones: {
    readonly repetidoEnDosCapturas: boolean;
    /**
     * Relación señal a ruido de la ventana, o `null` si no se pudo calcular.
     *
     * **El `null` es alcanzable y por eso está en el tipo.** Hoy la aplicación
     * pasa el mínimo del perfil como provisorio —el ruido de fondo real
     * necesita la interfaz de audio— así que nunca llega `null` y el aviso de
     * ruido no puede saltar. El día que se conecte la medición de verdad va a
     * poder faltar, y `Measurement.snrDb` del dominio ya lo declara opcional.
     *
     * Importa porque en JavaScript `null < 12` es **verdadero**: sin el tipo
     * ancho, la comparación entra en la rama y revienta al formatear.
     */
    readonly snrDb: number | null;
    readonly calibracionValida: boolean;
    /**
     * Qué proceso dinámico tenía puesto el canal al medir.
     *
     * Es obligatorio a propósito. Con un valor por defecto, un llamador nuevo
     * volvería a aconsejar sin mirar qué hay entre el previo y el parlante, que
     * es el agujero que esto vino a tapar.
     */
    readonly dinamica: DinamicaDeCanal;
  },
): PropuestaDeGanancia {
  const avisos: string[] = [];

  if (!analisis.suficiente && analisis.motivoInsuficiente) {
    avisos.push(analisis.motivoInsuficiente);
  }

  const margenObjetivo = perfil.margenObjetivoDb;

  // Un compresor que sacó menos de un escalón de la perilla de ganancia no
  // puede cambiar a qué posición se manda al usuario: se trata como cero.
  const reduccion = analisis.reduccionEnPicoDb >= REDUCCION_RELEVANTE_DB
    ? analisis.reduccionEnPicoDb
    : 0;
  const puertaActiva = opciones.dinamica.puerta === 'ACTIVO';
  const deesserActivo = opciones.dinamica.deesser === 'ACTIVO';

  // Qué hay entre el punto que se midió y lo que se va a escuchar. El compresor
  // entra por lo que se midió que hizo, no por estar puesto; la puerta y el
  // de-esser entran por configuración porque no tienen medidor propio.
  const condicionadaPor: string[] = [];
  if (reduccion > 0) condicionadaPor.push('compresor');
  if (puertaActiva) condicionadaPor.push('puerta de ruido');
  if (deesserActivo) condicionadaPor.push('de-esser');

  // El signo importa y es fácil de invertir: si hay MENOS margen del que el
  // perfil pide, hay que BAJAR la ganancia para ganar margen. Un margen medido
  // de 4 dB contra un objetivo de 12 pide bajar 8, no subir 8. Escribirlo al
  // revés propondría empujar hacia la saturación justo el canal que ya está
  // cerca de ella.
  //
  // El margen sale del pico anterior al procesamiento dinámico, así que acá no
  // se descuenta ninguna reducción: no hay nada que descontar. Se midió en el
  // punto correcto en vez de reconstruirlo, que además evitaba tener que
  // suponer la ganancia de compensación del compresor, que nadie midió.
  const deltaIdeal = analisis.margenDb - margenObjetivo;

  const recortado = Math.abs(deltaIdeal) > DELTA_MAXIMO_DB;
  const delta = recortado ? Math.sign(deltaIdeal) * DELTA_MAXIMO_DB : deltaIdeal;

  if (recortado) {
    avisos.push(
      `el ajuste ideal sería de ${deltaIdeal.toFixed(1)} dB, pero se propone ` +
      `${delta.toFixed(1)} y se vuelve a medir: un cambio grande de una sola vez ` +
      'no se puede verificar',
    );
  }

  if (reduccion > 0) {
    // Este aviso **no** dice que la medición esté mal. Dice que el efecto de
    // aplicarla no va a ser el que el usuario espera, que es una cosa distinta
    // y la única que le sirve saber estando parado frente a la consola.
    avisos.push(
      `el canal está comprimiendo: en el pico el compresor sacaba ${reduccion.toFixed(1)} dB, ` +
      `y actuó en el ${(analisis.fraccionComprimida * 100).toFixed(0)} % de la ventana. ` +
      'La ganancia se mide antes del compresor, así que el número de acá arriba es el ' +
      `correcto, pero al aplicarlo vas a escuchar bastante menos de ${Math.abs(delta).toFixed(1)} dB ` +
      'de cambio: el compresor se come parte',
    );
  } else if (opciones.dinamica.compresor === 'ACTIVO') {
    // Buena noticia y vale decirla: sostiene la confianza en el aviso de al
    // lado el día que sí aparezca.
    avisos.push(
      'el canal tiene compresor y no llegó a actuar durante la medición ' +
      `(${analisis.reduccionMaximaDb.toFixed(1)} dB como máximo), así que el cambio se ` +
      'va a escuchar entero',
    );
  }

  if (puertaActiva) {
    avisos.push(
      'la puerta de ruido está activa. No afecta a la medición —está comprobado que ' +
      'no toca el punto donde se mide la ganancia— pero sí a lo que se escucha: por ' +
      'debajo de su umbral el canal se calla, así que subir la ganancia también hace ' +
      'que la puerta abra con señal más débil',
    );
  }

  if (deesserActivo) {
    avisos.push(
      'el canal tiene de-esser activo. Vale lo mismo que para la puerta: se mide antes ' +
      'del bloque dinámico, pero que el de-esser no toque ese punto todavía nadie lo midió',
    );
  }

  const sinConfirmar = procesosEn(opciones.dinamica, 'DESCONOCIDO');
  if (sinConfirmar.length > 0) {
    // Se avisa y no se penaliza. «No lo sé» no es evidencia de que haya
    // proceso, y lo que se mide ya no depende de estas banderas: sirven para
    // contar qué va a pasar aguas abajo, no para validar el número.
    avisos.push(
      `la consola no dijo si ${describirProcesos(sinConfirmar)} está en el camino de ` +
      'este canal',
    );
  }

  if (analisis.probabilidadDeSaturacion > 0) {
    avisos.push(
      `${(analisis.probabilidadDeSaturacion * 100).toFixed(0)} % de las muestras ` +
      'estuvieron en zona de riesgo de saturación',
    );
  }

  // Con la puerta activa, la variación de la ventana puede ser la que produjo
  // la puerta y no la fuente: el aviso estaría midiendo la puerta y culpando al
  // músico. El compresor ya no entra acá —se mide antes de él—, que es
  // justamente lo que se gana midiendo en el punto correcto.
  if (!puertaActiva && analisis.rangoDinamicoDb > perfil.rangoDinamicoEsperadoDb + 6) {
    avisos.push(
      `la fuente varió ${analisis.rangoDinamicoDb.toFixed(0)} dB, más de lo esperado ` +
      `para ${perfil.nombre} (${perfil.rangoDinamicoEsperadoDb} dB). Puede ser una ` +
      'interpretación poco representativa, o hacer falta compresión',
    );
  }

  // **`null` no es «cero decibeles de relación señal a ruido».** En JavaScript
  // `null < 12` es verdadero —`null` se convierte a 0— así que sin este
  // resguardo se entraba en la rama y se llamaba `.toFixed` sobre `null`: el
  // asistente reventaba cada vez que la relación no se podía calcular, que es
  // justo lo que pasa cuando no hubo señal. Lo encontró un test escrito después
  // de ver la pantalla imprimir «Infinity» en la tablet.
  //
  // Que no se pueda calcular no es un aviso: es la ausencia de un dato. Si hace
  // falta decir algo, lo dice la confianza.
  if (opciones.snrDb !== null && opciones.snrDb < perfil.snrMinimoDb) {
    avisos.push(
      `la relación señal a ruido es de ${opciones.snrDb.toFixed(0)} dB y el perfil ` +
      `espera al menos ${perfil.snrMinimoDb}. Puede haber ruido de fondo, o el ` +
      'micrófono estar lejos de la fuente',
    );
  }

  const confianzaMedida: Confidence = analisis.suficiente
    ? confianzaCanal({
        repetidoEnDosCapturas: opciones.repetidoEnDosCapturas,
        desviacionBandaOctavas: 0,
        snrDb: opciones.snrDb,
        calibracionValida: opciones.calibracionValida,
      })
    : 'INSUFFICIENT_DATA';

  // **Solo lo inferido cuesta confianza.** Que el compresor, el ecualizador y
  // la puerta no tocan el punto de medición está **medido** contra la consola:
  // con la puerta cerrada del todo, el nivel de entrada cayó a −∞ y el punto de
  // medición no se movió un decimal. Esos canales miden tan bien como
  // cualquiera y no bajan de escalón.
  //
  // Del de-esser no hay medición: no reporta cuánto atenúa y no se probó con
  // sibilancia. Mientras siga así, esos canales no llegan a ALTA, que es la
  // confianza con la que el usuario aplica sin verificar.
  const inferido = deesserActivo;
  const confianza: Confidence =
    inferido && confianzaMedida === 'HIGH' ? 'MEDIUM' : confianzaMedida;

  // **Sin señal no se arma una frase con números.** Recorriendo la aplicación
  // en la tablet, con el canal en silencio, esto imprimía literalmente «El pico
  // llegó a -Infinity dB, lo que deja Infinity dB de margen»: JavaScript crudo
  // en la cara del usuario, y una frase que suena a medición cuando no se midió
  // nada. La confianza ya decía SIN DATOS y la lista de razones ya explicaba
  // que faltaban muestras; lo que sobraba era esta oración.
  const razon = !Number.isFinite(analisis.picoDb)
    ? 'No entró señal durante la medición, así que no hay pico del que sacar el '
      + 'margen. Hacé sonar el canal y volvé a medir.'
    : `El pico llegó a ${analisis.picoDb.toFixed(1)} dB en la escala de la consola, lo que deja ` +
    `${formatearDb(analisis.margenDb)} dB de margen` +
    // Se dice de dónde salió el número, porque no es la columna que el usuario
    // está mirando en la consola: la de la consola trae el compresor encima.
    (reduccion > 0 ? ' medidos antes del compresor, que en ese momento sacaba '
      + `${reduccion.toFixed(1)} dB` : '') +
    `. El perfil ${perfil.nombre} busca ${margenObjetivo} dB, así que la ganancia ` +
    (Math.abs(delta) < 0.05
      ? 'ya está donde corresponde'
      : `debería ${delta > 0 ? 'subir' : 'bajar'} ${Math.abs(delta).toFixed(1)} dB`) +
    '.';

  return {
    gainActualDb,
    // Sin ganancia leída no hay valor absoluto que proponer. El delta sí vale:
    // sale del pico medido y de la señal, no de la ganancia. Se dice cuánto
    // mover, no a dónde llegar.
    gainPropuestoDb: gainActualDb === null ? null : gainActualDb + delta,
    deltaDb: delta,
    recortadoPorLimite: recortado,
    razon,
    confianza,
    avisos,
    reduccionEnPicoDb: reduccion,
    condicionadaPor,
  };
}
