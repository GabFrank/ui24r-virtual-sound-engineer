import type {
  BandMemberId, ChannelAssignmentId, EscenarioElementoId, PAComponentId, VenueProfileId,
} from '../ids.ts';
import { CLASES_QUE_RADIAN } from './venue.ts';
import type { BusRef, PAComponentSpec } from './venue.ts';

/**
 * Dónde está cada cosa en la sala, y con cuánta duda.
 *
 * **Por qué existe.** La aplicación razona sobre señales: niveles, espectro,
 * medidores. Con el escenario cargado razona además sobre el espacio, y eso da
 * algo que este proyecto no tenía: **dos caminos independientes hacia la misma
 * conclusión**. Si la geometría dice que el monitor 2 apunta casi directo al
 * micrófono 4 y el analizador dice que hay un lazo a 9 kHz, se confirman. Si la
 * geometría señala otra pareja como la más acoplada, **una de las dos está
 * mal**: el monitor no está donde se dijo, está en otro auxiliar, o el
 * micrófono se movió. Hoy no hay forma de detectar ninguna de las tres.
 *
 * **La regla que gobierna todo este archivo.** Ninguna inferencia geométrica se
 * presenta más precisa que sus entradas. Un micrófono en un pie está a ±5 cm; un
 * cantante con micrófono de mano se mueve medio metro cada dos compases. Por eso
 * cada emplazamiento lleva su incertidumbre y **toda función exportada de este
 * archivo que deriva una magnitud del mundo devuelve un {@link Rango}**, no un
 * escalar. Las auxiliares privadas —la norma de un vector, el versor de una
 * orientación— sí devuelven números sueltos: son álgebra, no afirmaciones sobre
 * la sala. «Entre 8 y 14 dB»
 * es honesto; «11,3 dB» es mentir con decimales.
 *
 * **Lo que este modelo NO hace, empezando por lo que todavía no hace.** Este
 * archivo da posiciones, distancias y ángulos, todos con rango. **No ordena
 * parejas por riesgo ni calcula acoplamiento**: eso va aparte y todavía no está
 * escrito. Y cuando esté, tampoco va a predecir la frecuencia del lazo —eso lo
 * deciden los modos de la sala y la respuesta del micrófono y de la caja—, ni a
 * proponer valores, ni a escribir en la consola. La geometría ordenará parejas
 * por riesgo; la frecuencia la dice el analizador.
 *
 * **Lo que se acopla es el micrófono, no el instrumento.** Un amplificador de
 * guitarra en un punto es una *fuente*; el micrófono delante es lo que el
 * monitor realimenta. Para una voz están casi en el mismo sitio; para una
 * batería, no. Por eso fuente y captación son dos elementos distintos aunque a
 * veces compartan canal.
 *
 * **Dónde vive.** El escenario cuelga del **local** y no de la banda, porque los
 * monitores se mueven de sala en sala mientras la formación no cambia.
 *
 * **Lo que este modelo no sabe, y conviene leer antes de creerle.** Una
 * auditoría que sólo vio el código —sin estos comentarios— enumeró los
 * supuestos físicos que están escondidos en las cuentas. Se dejan escritos acá
 * porque cada uno es un lugar donde la geometría y el analizador van a
 * discrepar, y hay que poder saber cuál de los dos miente:
 *
 * 1. **Campo libre y camino directo único.** Sólo hay recta punto a punto: no
 *    hay reflexiones ni oclusión. En una sala chica el lazo suele cerrarse
 *    contra la pared del fondo, no por la recta que se calcula acá. El cuerpo
 *    de quien canta entre la cuña y el micrófono es transparente para este
 *    modelo.
 * 2. **Todo es puntual y sin frecuencia.** La directividad de un micrófono y de
 *    una caja dependen fuerte de la frecuencia: un cardioide es casi omni por
 *    debajo de 200 Hz y una cuña es omni en graves. El rechazo trasero que
 *    justifica «el monitor detrás del cardioide molesta menos» **no existe en
 *    graves**, que es donde suele acoplar.
 * 3. **La ganancia no está.** El riesgo de realimentación es ganancia de lazo:
 *    envío al auxiliar, preamplificador, distancia fuente-micrófono y
 *    sensibilidad. Nada de eso vive en este archivo, y tres de esas cuatro
 *    cosas dependen de leyes que todavía no se midieron contra la consola.
 * 4. **El ángulo es escalar y sin signo.** Dos posiciones simétricas respecto
 *    del eje son indistinguibles, y para un supercardioide —cuyo nulo no está
 *    en 180°— esa simetría no vale.
 * 5. **Peor caso propagado.** Dos parejas con rangos solapados **no son
 *    ordenables**, y este archivo no ofrece ninguna regla para desempatarlas.
 *    Quien las ordene va a tener que decidir qué hace con el empate, y decirlo.
 *
 * **El sistema de amplificación no se vuelve a describir acá, pero sí se lo
 * ubica.** El perfil de amplificación ya tiene componentes con su bus, y el bus
 * ya distingue general, auxiliar y matriz: un monitor *es* un componente
 * alimentado por un auxiliar, y no hace falta declararlo dos veces. Lo que el
 * escenario agrega es **dónde está puesto**, referenciando el componente por su
 * identificador.
 *
 * Esa separación no estaba al principio: el emplazamiento vivía dentro del
 * componente, y una auditoría encontró lo que eso costaba. Dos locales que
 * comparten el mismo sistema —que la aplicación permite— se pisaban las
 * posiciones entre sí, en silencio: ubicar las cuñas en un galpón movía las del
 * bar. **Qué equipo es, es del equipo; dónde está puesto, es de la sala.**
 * {@link elementosDelEscenario} une las dos mitades para quien necesite la
 * lista completa.
 */

// --- Números que no están medidos, y hay que decirlo ------------------------

/**
 * Cómo está puesto un elemento, que es lo que fija cuánta duda arrastra.
 *
 * No es una propiedad del objeto sino de la puesta: el mismo micrófono a ±5 cm
 * en un pie está a ±50 cm en la mano de quien canta.
 *
 * **La incertidumbre mide lo que NO sabemos de su posición, y eso tiene dos
 * fuentes distintas: cuánto se mueve, y con cuánta precisión se lo pudo
 * marcar.** Una auditoría señaló que la tabla parece contradecirse —`FIJO` duda
 * más que `EN_PIE`—. **Ese reparo quedó resuelto el 2026-09-12 sacándole la
 * incertidumbre a `FIJO`, no explicándola**: la fijeza declara *cuánto se
 * mueve* algo, y nada más. Cuán bien se lo puede medir es otra cosa, va por el
 * tercer argumento de {@link emplazar}, y la declara quien coloca la ficha.
 */
export type Fijeza =
  /** Atornillado, colgado o apoyado y nadie lo toca: cajas, amplificadores. */
  | 'FIJO'
  /** En un pie: micrófonos de instrumento, cuñas que alguien puede patear. */
  | 'EN_PIE'
  /** En la mano o encima de alguien: micrófono de mano, inalámbrico de solapa. */
  | 'EN_MANO';

/**
 * Incertidumbre por defecto de cada fijeza, en metros y en grados.
 *
 * **Estos seis números NO están medidos.** Son suposiciones declaradas, puestas
 * acá en un solo lugar para que se las pueda discutir, cambiar o reemplazar por
 * mediciones sin tocar el resto del modelo. Uno por uno, de dónde sale cada uno:
 *
 * - `EN_PIE.posicionM` = 0,05. `docs/alcance-mvp.md` nombra ±5 cm para un
 *   micrófono en un pie frente a un amplificador.
 * - `EN_MANO.posicionM` = 0,50. El mismo documento habla de medio metro de
 *   desplazamiento cada dos compases. Se toma **el desplazamiento entero como
 *   radio**, no la mitad: el radio honesto sería ±0,25 m si la marca estuviera
 *   en el centro del vaivén, y no hay motivo para creer que lo esté. Errar
 *   ancho ensancha la conclusión; errar angosto la falsifica.
 * - `FIJO` = **cero, en posición y en orientación.** Decisión del usuario el
 *   2026-09-12: «*al crear el instrumento/microfono, se indica si es fijo o
 *   tiene rango de movimiento, punto final*». Si el usuario declara que algo es
 *   fijo, el sistema no le discute la declaración.
 *
 *   **Antes valía 0,10 y era el peor número de esta tabla.** Salía de mezclar
 *   dos cosas distintas —cuánto se mueve algo y cuán bien se lo puede medir— en
 *   un solo número, y el resultado era que `FIJO` tenía *más* incertidumbre que
 *   `EN_PIE`. Una auditoría ya lo había marcado como el único sin origen
 *   documental, y el comentario que lo defendía —una caja colgada de una
 *   parrilla no se mueve y se mide pésimo— describía un problema real metido en
 *   el campo equivocado. **El error de medición no es del modelo: es de quien
 *   coloca la ficha en el plano**, y para eso está el tercer argumento de
 *   {@link emplazar}, que sigue existiendo. Quien cuelgue algo a tres metros y
 *   no pueda medirlo bien, lo declara y listo.
 * - Los dos de orientación que quedan, estimaciones sin respaldo de ningún tipo.
 *
 * Quien conozca mejor su sala puede sobreescribirlos elemento por elemento:
 * {@link Emplazamiento} lleva la incertidumbre explícita, no la fijeza sola.
 */
export const INCERTIDUMBRE_POR_FIJEZA: Readonly<Record<Fijeza, { readonly posicionM: number; readonly orientacionGrados: number }>> = {
  FIJO: { posicionM: 0, orientacionGrados: 0 },
  EN_PIE: { posicionM: 0.05, orientacionGrados: 10 },
  EN_MANO: { posicionM: 0.50, orientacionGrados: 60 },
};

// --- Geometría --------------------------------------------------------------

/**
 * Un punto del local, en metros.
 *
 * **Convención, fijada acá y en ningún otro lado:** el origen es una esquina del
 * piso del local; `x` cruza el ancho, `y` recorre el largo **creciendo desde el
 * escenario hacia el público**, y `z` sube desde el piso.
 *
 * Los topes salen de `VenueProfile.dimensionesM`, pero **la correspondencia es
 * cruzada y no posicional**: ese campo declara largo, ancho y alto en ese orden,
 * y acá `x` va contra el **ancho** y `y` contra el **largo**. Escrito porque
 * leerlo al revés no rompe nada: deja el plano espejado y todas las
 * conclusiones siguen pareciendo razonables.
 */
export interface PuntoM {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Hacia dónde apunta algo.
 *
 * `azimut` es 0° apuntando a +y —del escenario hacia el público— y crece hacia
 * +x. `inclinacion` es 0° horizontal y positiva hacia arriba: una cuña de
 * monitor puesta en el piso y mirando a la cara de quien canta tiene inclinación
 * positiva, y eso es justamente lo que la pone en el eje del micrófono.
 */
export interface Orientacion {
  readonly azimutGrados: number;
  readonly inclinacionGrados: number;
}

/**
 * Posición, orientación e incertidumbre.
 *
 * La incertidumbre es un campo, no un derivado de la fijeza, porque quien mide
 * su sala con cinta métrica sabe más que la tabla de suposiciones. Se construye
 * con {@link emplazar}, que aplica la tabla salvo que se le pase otra cosa.
 *
 * `orientacion` puede ser `null`: una caja directa o un instrumento acústico no
 * apuntan a ningún lado en el sentido que le importa a este modelo.
 */
/**
 * Hasta dónde se mueve algo que no está fijo.
 *
 * **Es un rectángulo y no un radio, y lo eligió el usuario**: «*si el equipo es
 * móvil entonces se ve el rango (que al registrar seteamos), puede ser un
 * rectángulo editable*» y, al elegir entre opciones, «*rectángulo que se
 * estira*».
 *
 * Y tiene sentido físico además de ser lo que pidió: un cantante con
 * inalámbrico se mueve **por el frente del escenario**, o sea mucho en `x` y
 * poco en `y`. Un radio no puede decir eso; obliga a elegir entre exagerar la
 * profundidad o subestimar el ancho.
 *
 * **Se suma a la duda de la fijeza, no la reemplaza.** Un cantante con
 * inalámbrico tiene los ±0,50 m de `EN_MANO` en todas las direcciones —incluida
 * la altura, porque se agacha— y encima este rectángulo en el plano.
 *
 * Centrado en {@link Emplazamiento.posicion} y **alineado con los ejes del
 * local**, no rotado. Un rectángulo rotado sería más expresivo y mucho más
 * difícil de estirar con el dedo, y este modelo existe para que el usuario
 * pueda marcar su sala en treinta segundos.
 *
 * **Sólo `x` e `y`.** La altura no entra: el plano es una vista desde arriba y
 * el modelo ya trata `z` con un campo numérico aparte.
 */
export interface RangoDeMovimiento {
  /** Cuánto se mueve a lo ancho del local, en metros. El rectángulo completo. */
  readonly anchoM: number;
  /** Cuánto se mueve a lo largo, del escenario hacia el público. */
  readonly largoM: number;
}

export interface Emplazamiento {
  readonly posicion: PuntoM;
  readonly orientacion: Orientacion | null;
  readonly fijeza: Fijeza;
  /**
   * Radio de duda alrededor de la posición, en metros.
   *
   * **Es el error de la marca, no el movimiento.** Cuánto se mueve algo lo dice
   * {@link rangoDeMovimiento}, y los dos se suman: la marca puede estar un poco
   * corrida *y* el equipo puede moverse dentro de su rectángulo.
   */
  readonly incertidumbrePosicionM: number;
  /** Duda sobre hacia dónde apunta, en grados. */
  readonly incertidumbreOrientacionGrados: number;
  /**
   * El rectángulo por el que se mueve, **además** de la duda de la fijeza.
   *
   * `null` mientras el usuario no lo declare, que es el caso por omisión: ahí
   * vale la duda isótropa de la tabla de fijeza y nada más. Cuando lo estira,
   * este rectángulo se **suma** a esa duda en el plano; la altura la sigue
   * llevando {@link incertidumbrePosicionM}, porque el rectángulo es una vista
   * desde arriba y quien canta se agacha.
   */
  readonly rangoDeMovimiento: RangoDeMovimiento | null;
}

/**
 * Arma un emplazamiento aplicando la tabla de suposiciones por fijeza.
 *
 * **El rango de movimiento no tiene valor por omisión, y la tabla de fijeza
 * queda intacta.** La primera versión de esto le daba a `EN_MANO` un cuadrado
 * de un metro de lado y le bajaba el radio a 0, leyendo los 0,50 m de la tabla
 * como medio lado. Un test lo tiró abajo con un caso físico: quien canta **se
 * agacha hacia su cuña**, o sea que un micrófono de mano también se mueve en
 * altura, y un rectángulo del plano no puede decir eso. Con el radio en 0 el
 * modelo afirmaba que el micrófono no podía acercarse a una cuña 40 cm más
 * abajo, que es justamente el caso que el test describe.
 *
 * Así que la división es otra, y más simple: **la fijeza da la duda isótropa
 * —decisión del usuario, sin tocar— y el rectángulo es lo que se le suma** al
 * estirarlo. `EN_MANO` sigue siendo ±0,50 m en todas las direcciones hasta que
 * el usuario declare que ese cantante se mueve tres metros por el frente; ahí
 * el rectángulo crece en `x` y no en `y`.
 *
 * Lo bueno de esta forma es que no hay nada que decidir por el usuario. Su
 * pregunta —«*si no es fijo, cuál es el rango de movimiento?*»— la contesta la
 * pantalla, y mientras no la contesten vale la tabla que él ya fijó.
 */
export function emplazar(
  posicion: PuntoM,
  fijeza: Fijeza,
  orientacion: Orientacion | null = null,
  sobreescribir: {
    readonly posicionM?: number;
    readonly orientacionGrados?: number;
    readonly rango?: RangoDeMovimiento | null;
  } = {},
): Emplazamiento {
  const base = INCERTIDUMBRE_POR_FIJEZA[fijeza];
  return {
    posicion,
    orientacion,
    fijeza,
    incertidumbrePosicionM: sobreescribir.posicionM ?? base.posicionM,
    incertidumbreOrientacionGrados: sobreescribir.orientacionGrados ?? base.orientacionGrados,
    rangoDeMovimiento: sobreescribir.rango ?? null,
  };
}

/**
 * La duda de un emplazamiento, separada en sus dos formas.
 *
 * **Son dos formas distintas y no se pueden mezclar en una.** El rango de
 * movimiento es una **caja** alineada con los ejes; el error de la marca es una
 * **esfera**. La región donde puede estar el elemento es la suma de las dos
 * —una caja con las esquinas redondeadas—, y para eso hay que llevarlas
 * separadas.
 *
 * **Mezclarlas fue el primer intento y estaba mal.** Sumé el radio a cada
 * semieje, o sea que convertí la esfera en una caja de lado `2r`. Una esfera de
 * radio `r` está **inscripta** en esa caja, así que el intervalo de distancia
 * salía más ancho de lo que corresponde: dos marcas con 0,30 y 0,40 m de duda a
 * cinco metros daban un mínimo de 4,02 en vez de 4,30. Lo encontró el test que
 * fija que las incertidumbres se suman y no se componen en cuadratura, con el
 * número exacto.
 */
function duda(e: Emplazamiento): {
  readonly radio: number;
  readonly caja: { readonly x: number; readonly y: number; readonly z: number };
} {
  const g = e.rangoDeMovimiento;
  return {
    radio: Math.max(0, e.incertidumbrePosicionM),
    caja: {
      x: g === null ? 0 : Math.max(0, g.anchoM) / 2,
      y: g === null ? 0 : Math.max(0, g.largoM) / 2,
      // La altura no tiene rango de movimiento: el rectángulo es del plano.
      z: 0,
    },
  };
}

/**
 * Un intervalo cerrado. Lo que devuelve toda derivación geométrica.
 *
 * No hay «valor central» en este tipo, y es deliberado: en cuanto exista un
 * campo con el número lindo, alguien lo va a mostrar solo y la incertidumbre se
 * pierde en el camino a la pantalla.
 */
export interface Rango {
  readonly min: number;
  readonly max: number;
}

/**
 * Si el rango es tan ancho —o tan roto— que informarlo no ayuda a decidir nada.
 *
 * **Un `NaN` cuenta como inservible.** La versión anterior devolvía `false`
 * ante un `NaN`, porque toda comparación con `NaN` es falsa: un azimut mal
 * cargado producía un rango de `NaN` a `NaN` y esta función lo declaraba apto
 * para decidir. Lo mismo un rango invertido. Los dos son datos rotos, y un dato
 * roto que pasa por bueno es peor que uno ancho.
 */
export function rangoInutil(r: Rango, anchoMaximo: number): boolean {
  if (!Number.isFinite(r.min) || !Number.isFinite(r.max)) return true;
  if (r.max < r.min) return true;
  return r.max - r.min > anchoMaximo;
}

// --- Captación --------------------------------------------------------------

/**
 * El patrón polar del micrófono, que es dato de catálogo.
 *
 * Hace falta porque un micrófono no capta igual en todas las direcciones: un
 * monitor puesto justo detrás de un cardioide molesta mucho menos que el mismo
 * monitor puesto de frente. Sin el patrón, el ángulo fuera de eje no dice nada.
 *
 * **Esto no reabre el registro de micrófonos con su curva de corrección**, que
 * es otra cosa —respuesta en frecuencia, calibración— y sigue siendo fase
 * futura. Acá alcanza con el nombre del patrón, que viene impreso en la caja.
 */
export type PatronPolar =
  | 'OMNI'
  | 'CARDIOIDE'
  | 'SUPERCARDIOIDE'
  | 'HIPERCARDIOIDE'
  | 'BIDIRECCIONAL'
  /** El usuario no lo cargó. Se informa como desconocido, no se adivina. */
  | 'DESCONOCIDO';

/**
 * Dónde tiene su nulo cada patrón, en grados fuera de eje.
 *
 * **Está acá porque sin esto el patrón polar era un campo inerte**: se exigía
 * al validar y no lo leía ninguna cuenta, así que CARDIOIDE, HIPERCARDIOIDE y
 * BIDIRECCIONAL daban exactamente el mismo resultado. Peor: quien ordenara por
 * ángulo iba a leer 180° como el mejor caso, y para un bidireccional 180° es
 * **el peor** —el lóbulo trasero capta igual que el delantero—.
 *
 * **Son los patrones ideales de primer orden, de libro, no micrófonos medidos.**
 * Un cardioide real es casi omnidireccional por debajo de 200 Hz y su rechazo
 * trasero cambia con la frecuencia. Esto ordena, no predice, y no reabre el
 * registro de micrófonos con curvas de corrección.
 *
 * **Son las cifras de catálogo, las que vienen impresas**, no el nulo exacto
 * del patrón ideal. Para el hipercardioide se dice 110° y el nulo exacto de
 * `0,25 + 0,75·cos θ` está en 109,47°. La diferencia no importa para mostrar y
 * sí para calcular el piso de un rango, así que quien calcula lo deriva de los
 * coeficientes en vez de leer esta tabla. Un test compara las dos cosas para
 * que no puedan separarse de verdad.
 *
 * `null` donde no hay nulo que buscar: un omnidireccional capta parejo, y de un
 * patrón sin cargar no se adivina nada.
 */
export const NULO_DEL_PATRON_GRADOS: Readonly<Record<PatronPolar, number | null>> = {
  OMNI: null,
  CARDIOIDE: 180,
  SUPERCARDIOIDE: 126,
  HIPERCARDIOIDE: 110,
  // Dos nulos, a 90° de cada lado; el ángulo sin signo de este archivo no los
  // distingue y no hace falta que lo haga.
  BIDIRECCIONAL: 90,
  DESCONOCIDO: null,
};

/** Cómo entra la señal a la consola. */
export type TipoDeCaptacion =
  /** Micrófono: tiene lugar, tiene eje, y es lo que se realimenta. */
  | 'MICROFONO'
  /**
   * Caja directa o salida de línea.
   *
   * **No tiene relevancia espacial**: no capta aire, así que ningún monitor la
   * realimenta. Se la modela igual para que el escenario esté completo y para
   * que la respuesta a «¿por qué este canal no aparece en el análisis?» sea
   * «porque es una caja directa» y no un silencio.
   */
  | 'DIRECTA';

// --- Elementos del escenario ------------------------------------------------

/**
 * Algo que suena por sí mismo: una voz, un parche, un amplificador de guitarra.
 *
 * No se conecta a ningún canal: lo que se conecta es el micrófono que la toma.
 * La fuente existe en el modelo porque su posición es lo que determina cuánto de
 * ella se filtra en los micrófonos de al lado, que es de donde sale el umbral de
 * la puerta.
 */
export interface ElementoFuente {
  readonly tipo: 'FUENTE';
  readonly id: EscenarioElementoId;
  readonly nombre: string;
  readonly emplazamiento: Emplazamiento;
  /** Quién la produce, si es una persona de la formación. */
  readonly bandMemberId: BandMemberId | null;
}

/** Un micrófono o una caja directa, con el canal al que entra. */
export interface ElementoCaptacion {
  readonly tipo: 'CAPTACION';
  readonly id: EscenarioElementoId;
  readonly nombre: string;
  readonly emplazamiento: Emplazamiento;
  readonly captacion: TipoDeCaptacion;
  /**
   * El patrón, solo para micrófonos.
   *
   * Una caja directa lleva `null` y no `'OMNI'`: decir que capta parejo en todas
   * las direcciones es afirmar que capta, y no capta nada.
   */
  readonly patron: PatronPolar | null;
  /** El canal de la consola al que entra, si ya está asignado. */
  readonly asignacionId: ChannelAssignmentId | null;
  /** Qué fuente viene a tomar. Es lo que empareja micrófono con instrumento. */
  readonly fuenteId: EscenarioElementoId | null;
}

export type ElementoDeEscenario = ElementoFuente | ElementoCaptacion;

/**
 * Qué se puede decir del ángulo con que una captación ve a otro elemento.
 *
 * **Existe porque `anguloFueraDeEjeGrados` devolvía `null` para tres cosas muy
 * distintas**: una caja directa que no capta aire, un micrófono direccional al
 * que le falta la orientación, y un micrófono **omnidireccional perfectamente
 * válido**. Lo señaló una auditoría, y el tercero es el caso caro: el
 * omnidireccional es el micrófono más propenso a realimentar de cualquier
 * escenario, y salía del análisis con el mismo `null` que una caja directa.
 */
export type LecturaDeAngulo =
  /** Caja directa: no capta aire, ningún monitor la realimenta. */
  | { readonly tipo: 'SIN_CAPTACION_AEREA' }
  /**
   * Omnidireccional: capta parejo, el ángulo no reduce nada.
   *
   * No es «no se sabe». Es que la respuesta no depende de la dirección, y por
   * eso hay que tratarlo como el caso más expuesto, no como el que falta.
   */
  | { readonly tipo: 'OMNIDIRECCIONAL' }
  /** Falta el patrón: hasta que esté, el ángulo no dice nada. */
  | { readonly tipo: 'PATRON_SIN_CARGAR' }
  /** Micrófono direccional sin orientación cargada. */
  | { readonly tipo: 'SIN_EJE' }
  /** Los dos elementos están más cerca que su propia duda. */
  | { readonly tipo: 'INDETERMINADO'; readonly rango: Rango }
  | {
    readonly tipo: 'ANGULO';
    readonly rango: Rango;
    /** Dónde está el nulo de este patrón, para saber si el rango lo contiene. */
    readonly nuloGrados: number;
  };

/** Lee el ángulo con que una captación ve a otro emplazamiento. */
export function anguloDeCaptacion(captacion: ElementoCaptacion, otro: Emplazamiento): LecturaDeAngulo {
  if (captacion.captacion === 'DIRECTA') return { tipo: 'SIN_CAPTACION_AEREA' };
  if (captacion.patron === null || captacion.patron === 'DESCONOCIDO') return { tipo: 'PATRON_SIN_CARGAR' };
  if (captacion.patron === 'OMNI') return { tipo: 'OMNIDIRECCIONAL' };
  const rango = anguloFueraDeEjeGrados(captacion.emplazamiento, otro);
  if (rango === null) return { tipo: 'SIN_EJE' };
  if (rango.min === 0 && rango.max === 180) return { tipo: 'INDETERMINADO', rango };
  const nuloGrados = NULO_DEL_PATRON_GRADOS[captacion.patron];
  // Un patrón direccional siempre tiene nulo; el tipo no lo sabe y se contesta
  // SIN_EJE antes que inventar un número.
  if (nuloGrados === null) return { tipo: 'SIN_EJE' };
  return { tipo: 'ANGULO', rango, nuloGrados };
}

// --- El escenario -----------------------------------------------------------

/**
 * El plano cargado de un local.
 *
 * Solo tiene fuentes y captaciones. Los monitores y el sistema salen del perfil
 * de amplificación, por lo dicho arriba.
 */
export interface Escenario {
  readonly venueProfileId: VenueProfileId;
  readonly elementos: readonly ElementoDeEscenario[];
  /**
   * Dónde está puesto, **en este local**, cada componente del sistema.
   *
   * Un componente que no figura acá es uno que el usuario todavía no ubicó en
   * esta sala. No se hereda de otro local: el mismo equipo en dos salas
   * distintas está en dos lugares distintos, y ésa es toda la razón de que esta
   * lista esté acá y no dentro del perfil de amplificación.
   */
  readonly emisores: readonly EmplazamientoDeComponente[];
  /** Fecha de la última edición, en ISO. Un plano viejo vale menos. */
  readonly actualizado: string;
  readonly notas: string | null;
}

/** Un componente del sistema, puesto en algún lugar de este local. */
export interface EmplazamientoDeComponente {
  readonly componenteId: PAComponentId;
  readonly emplazamiento: Emplazamiento;
}

/**
 * Un componente de amplificación con su lugar, listo para la geometría.
 *
 * Es la mitad que vive en el perfil de amplificación, traída a la misma forma
 * que los elementos del escenario para poder recorrer las dos juntas.
 */
export interface Emisor {
  readonly nombre: string;
  readonly bus: BusRef;
  readonly emplazamiento: Emplazamiento;
  readonly componente: PAComponentSpec;
}

/**
 * Une las dos mitades: los emisores del perfil de amplificación que tienen
 * lugar cargado, y las captaciones del escenario.
 *
 * **Nada desaparece en silencio, y por dos motivos distintos.** Un monitor que
 * el usuario no ubicó vuelve en `sinLugar`: si se lo tragara el análisis, sería
 * exactamente el caso en que el diagnóstico geométrico y el analizador se
 * contradicen sin que nadie sepa por qué. Y unos intraurales vuelven en
 * `noRadian`, que es distinto: ahí no falta un dato, no hay nada que acoplar.
 * Confundir los dos casos hace que la aplicación pida ubicar lo que no hace
 * falta, o que dé por analizado lo que no miró.
 */
export function elementosDelEscenario(
  escenario: Escenario,
  componentes: readonly PAComponentSpec[],
): {
  readonly emisores: readonly Emisor[];
  readonly captaciones: readonly ElementoCaptacion[];
  readonly fuentes: readonly ElementoFuente[];
  /**
   * Componentes que radian al aire pero que este local todavía no ubicó.
   *
   * **Son los componentes enteros y no sus nombres.** Devolver nombres perdía
   * la identidad de dos componentes homónimos --lado izquierdo y lado derecho
   * de un general estéreo comparten `bus`-- y quien recibiera la lista no podía
   * distinguirlos para pedirle al usuario que los ubique.
   */
  readonly sinLugar: readonly PAComponentSpec[];
  /**
   * Los que quedaron afuera **porque no pueden acoplar**, no porque falte un
   * dato. Hoy son los intraurales. Van aparte de `sinLugar` para que la
   * aplicación no le pida al usuario que ubique algo que no hace falta ubicar.
   */
  readonly noRadian: readonly PAComponentSpec[];
} {
  const emisores: Emisor[] = [];
  const sinLugar: PAComponentSpec[] = [];
  const noRadian: PAComponentSpec[] = [];
  const porId = new Map((escenario.emisores ?? []).map((e) => [e.componenteId, e.emplazamiento]));
  for (const c of componentes) {
    if (!CLASES_QUE_RADIAN.includes(c.clase)) { noRadian.push(c); continue; }
    const emplazamiento = porId.get(c.id);
    if (emplazamiento === undefined) sinLugar.push(c);
    else emisores.push({ nombre: c.nombre, bus: c.bus, emplazamiento, componente: c });
  }
  const captaciones = escenario.elementos.filter((e): e is ElementoCaptacion => e.tipo === 'CAPTACION');
  const fuentes = escenario.elementos.filter((e): e is ElementoFuente => e.tipo === 'FUENTE');
  return { emisores, captaciones, fuentes, sinLugar, noRadian };
}

// --- Derivaciones, todas con rango -----------------------------------------

const GRADO = Math.PI / 180;

function resta(a: PuntoM, b: PuntoM): PuntoM {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function norma(v: PuntoM): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Distancia entre dos emplazamientos, con la duda de los dos sumada.
 *
 * Las incertidumbres se **suman**, no se componen en cuadratura: componerlas
 * supone que son errores aleatorios independientes, y no lo son —un cantante que
 * se corre medio metro no es ruido gaussiano alrededor de su marca—. Sumar da un
 * rango más ancho y es la dirección segura para equivocarse.
 *
 * El mínimo se recorta en cero: no existe la distancia negativa, y un micrófono
 * apoyado sobre la cuña es el caso real que lo produce.
 */
export function distanciaM(a: Emplazamiento, b: Emplazamiento): Rango {
  // **Eje por eje, y no `d ± (ua+ub)`.** La forma vieja restaba un radio a la
  // distancia entre centros, que es correcto para dos esferas y no para dos
  // cajas: un cantante que se mueve tres metros a lo ancho y nada a lo largo
  // no se acerca tres metros a algo que tiene al costado.
  //
  // Entre dos cajas alineadas con los ejes el mínimo y el máximo son exactos:
  // por cada eje, la separación va de `max(0, |Δ| − (sa+sb))` a `|Δ| + sa+sb`,
  // y la distancia es la norma de esas separaciones. El mínimo da 0 cuando las
  // cajas se solapan, que es lo correcto: pueden estar en el mismo lugar.
  //
  // Con los dos rangos en `null` esto da exactamente lo mismo que la forma
  // vieja para el máximo, y **menos** para el mínimo sólo cuando las esferas se
  // solapan --donde la vieja ya recortaba a 0--. Hay un test que lo fija.
  const da = duda(a);
  const db = duda(b);
  // Primero las cajas, eje por eje: eso es exacto entre rectángulos alineados.
  const ejes = [
    { d: Math.abs(a.posicion.x - b.posicion.x), s: da.caja.x + db.caja.x },
    { d: Math.abs(a.posicion.y - b.posicion.y), s: da.caja.y + db.caja.y },
    { d: Math.abs(a.posicion.z - b.posicion.z), s: da.caja.z + db.caja.z },
  ];
  const entreCajas = {
    min: Math.hypot(...ejes.map((e) => Math.max(0, e.d - e.s))),
    max: Math.hypot(...ejes.map((e) => e.d + e.s)),
  };
  // Y después los radios, a lo largo de la recta que las une: eso es exacto
  // entre esferas. Las dos cuentas juntas dan la distancia entre las dos
  // regiones completas, cada una una caja con las esquinas redondeadas.
  //
  // **Sin rangos de movimiento esto da exactamente la forma vieja**, `d ± u`,
  // porque las cajas se reducen a sus centros. Hay un test que lo fija con
  // números exactos.
  const radios = da.radio + db.radio;
  return {
    min: Math.max(0, entreCajas.min - radios),
    max: entreCajas.max + radios,
  };
}

/** Vector unitario hacia donde apunta una orientación, en la terna del local. */
function versorDe(o: Orientacion): PuntoM {
  const a = o.azimutGrados * GRADO;
  const i = o.inclinacionGrados * GRADO;
  return { x: Math.sin(a) * Math.cos(i), y: Math.cos(a) * Math.cos(i), z: Math.sin(i) };
}

/**
 * Cuántos grados fuera de su eje le queda `otro` a `quien`, con rango.
 *
 * Devuelve `null` si `quien` no apunta a ningún lado —una caja directa, un
 * instrumento acústico—: no hay eje del que salirse.
 *
 * **Cuando los dos puntos están más cerca que su propia duda, el resultado es
 * `0..180`**, que es la forma de decir «no se sabe» sin dejar de contestar. Es
 * el caso del micrófono de mano prácticamente encima de la cuña: ahí la
 * geometría deja de informar y hay que mirar el analizador.
 */
export function anguloFueraDeEjeGrados(quien: Emplazamiento, otro: Emplazamiento): Rango | null {
  if (quien.orientacion === null) return null;
  const v = resta(otro.posicion, quien.posicion);
  const d = norma(v);
  // **El semieje mayor, no el radio.** Un rango de movimiento hace la duda
  // anisótropa, y el ángulo fuera de eje no se puede calcular eje por eje como
  // la distancia. Se toma el semieje más grande de cada uno: es el lado seguro
  // --sobrestima la duda-- y este número se usa para decidir cuándo la
  // geometría deja de informar, donde sobrestimar es lo correcto.
  const dq = duda(quien);
  const doo = duda(otro);
  const alcance = (x: ReturnType<typeof duda>): number =>
    x.radio + Math.max(x.caja.x, x.caja.y, x.caja.z);
  const u = alcance(dq) + alcance(doo);
  if (d <= u || d === 0) return { min: 0, max: 180 };

  const eje = versorDe(quien.orientacion);
  const coseno = (eje.x * v.x + eje.y * v.y + eje.z * v.z) / d;
  const centro = Math.acos(Math.min(1, Math.max(-1, coseno))) / GRADO;

  // Dos fuentes de duda angular, y se suman por lo mismo que las distancias.
  // La posicional subtiende un ángulo que crece cuando los elementos se
  // acercan: la misma imprecisión de 10 cm no significa lo mismo a 30 cm que a
  // 4 m, y tratarla como un número fijo de grados sería el error de siempre.
  //
  // **La orientación de `otro` NO entra, y entraba.** Esta cuenta usa el eje de
  // `quien` y la recta entre las dos posiciones; hacia dónde mira `otro` no
  // aparece en ninguno de los dos, así que sumar su incertidumbre ensanchaba el
  // rango por una razón que la fórmula no sostiene. Lo encontró una auditoría
  // que sólo vio el código, sin los comentarios. Ensanchar de más es la
  // dirección segura para equivocarse, pero no es gratis: un rango inflado sin
  // motivo hace que un par parezca indecidible cuando no lo es.
  const porPosicion = Math.asin(Math.min(1, u / d)) / GRADO;
  const margen = porPosicion + quien.incertidumbreOrientacionGrados;
  return { min: Math.max(0, centro - margen), max: Math.min(180, centro + margen) };
}

/**
 * Si dos elementos pueden llegar a estar en el mismo sitio.
 *
 * Sirve para no afirmar «el micrófono está delante del monitor» cuando los
 * rangos admiten que esté detrás.
 */
export function puedenSuperponerse(a: Emplazamiento, b: Emplazamiento): boolean {
  return distanciaM(a, b).min === 0;
}

// --- Validación -------------------------------------------------------------

/** Algo que el escenario cargado tiene mal o incompleto. */
export interface ProblemaDeEscenario {
  readonly elementoId: EscenarioElementoId;
  readonly problema: string;
}

/**
 * Revisa el escenario contra sí mismo y contra las dimensiones del local.
 *
 * No arregla nada ni descarta elementos: informa. Un plano con problemas sigue
 * sirviendo para diagnosticar lo que no depende de ellos.
 */
export function validarEscenario(
  escenario: Escenario,
  dimensionesM: { readonly largo: number; readonly ancho: number; readonly alto: number } | null,
): readonly ProblemaDeEscenario[] {
  const problemas: ProblemaDeEscenario[] = [];
  const ids = new Set<EscenarioElementoId>();
  const fuentes = new Set(escenario.elementos.filter((e) => e.tipo === 'FUENTE').map((e) => e.id));

  for (const e of escenario.elementos) {
    if (ids.has(e.id)) problemas.push({ elementoId: e.id, problema: 'hay dos elementos con este identificador' });
    ids.add(e.id);

    const p = e.emplazamiento.posicion;
    if (![p.x, p.y, p.z].every(Number.isFinite)) {
      problemas.push({ elementoId: e.id, problema: 'la posición tiene coordenadas que no son números' });
    } else {
      // **Las coordenadas negativas se revisan siempre, haya dimensiones o
      // no.** Antes todo el bloque colgaba de que el local las tuviera, así que
      // un escenario al aire libre pasaba sin una sola comprobación: ni
      // negativos ni un 200 tipeado donde iba 2,00. Una auditoría lo señaló, y
      // el test que lo consagraba como correcto está corregido.
      if (p.x < 0 || p.y < 0 || p.z < 0) {
        problemas.push({ elementoId: e.id, problema: `la posición tiene coordenadas negativas (${p.x}, ${p.y}, ${p.z}); el origen es una esquina del piso` });
      }
      if (dimensionesM !== null) {
        // Fuera del local es un dato mal cargado. **Al aire libre el local se
        // declara con las dimensiones del área útil y no del terreno** — es una
        // convención que se decide acá y no está escrita en ningún otro lado,
        // así que queda dicho que es una decisión y no una regla heredada.
        if (p.x > dimensionesM.ancho) problemas.push({ elementoId: e.id, problema: `x=${p.x} m pasa el ancho del local (${dimensionesM.ancho} m)` });
        if (p.y > dimensionesM.largo) problemas.push({ elementoId: e.id, problema: `y=${p.y} m pasa el largo del local (${dimensionesM.largo} m)` });
        if (p.z > dimensionesM.alto) problemas.push({ elementoId: e.id, problema: `z=${p.z} m pasa el alto del local (${dimensionesM.alto} m)` });
      }
    }

    if (e.emplazamiento.incertidumbrePosicionM < 0) {
      problemas.push({ elementoId: e.id, problema: 'la incertidumbre de posición es negativa' });
    }
    const rango = e.emplazamiento.rangoDeMovimiento;
    if (rango !== null) {
      // **Un lado negativo o no finito daría un mínimo mayor que el máximo**, y
      // todo lo que lea el intervalo después le va a creer. Es el mismo motivo
      // por el que se valida la incertidumbre angular, tres líneas más abajo.
      if (!(Number.isFinite(rango.anchoM) && Number.isFinite(rango.largoM))) {
        problemas.push({ elementoId: e.id, problema: 'el rango de movimiento tiene lados que no son números' });
      } else if (rango.anchoM < 0 || rango.largoM < 0) {
        problemas.push({ elementoId: e.id, problema: 'el rango de movimiento tiene un lado negativo' });
      } else if (dimensionesM !== null
        && (rango.anchoM > dimensionesM.ancho || rango.largoM > dimensionesM.largo)) {
        // Un rango más grande que el local es un dato que nadie puede haber
        // querido, y estirar el rectángulo con el dedo es fácil de pasarse.
        problemas.push({
          elementoId: e.id,
          problema: `el rango de movimiento (${rango.anchoM} × ${rango.largoM} m) `
            + `no entra en el local (${dimensionesM.ancho} × ${dimensionesM.largo} m)`
            + ' — sin dimensiones del local esto no se comprueba',
        });
      }
      // **Y que sea FIJO con rango es una contradicción declarada.** La fijeza
      // dice cuánto se mueve: marcar algo fijo y darle un rectángulo de
      // movimiento son dos afirmaciones que no pueden ser ciertas a la vez.
      if (e.emplazamiento.fijeza === 'FIJO' && (rango.anchoM > 0 || rango.largoM > 0)) {
        problemas.push({
          elementoId: e.id,
          problema: 'está marcado FIJO y tiene rango de movimiento: una de las dos cosas sobra',
        });
      }
    }
    if (e.emplazamiento.incertidumbreOrientacionGrados < 0) {
      // Con una incertidumbre angular negativa el rango sale invertido --min
      // mayor que max-- y todo lo que lo lea después va a creerle.
      problemas.push({ elementoId: e.id, problema: 'la incertidumbre de orientación es negativa' });
    }
    const o = e.emplazamiento.orientacion;
    if (o !== null && !(Number.isFinite(o.azimutGrados) && Number.isFinite(o.inclinacionGrados))) {
      problemas.push({ elementoId: e.id, problema: 'la orientación tiene ángulos que no son números' });
    }

    if (e.tipo !== 'CAPTACION') continue;

    if (e.captacion === 'MICROFONO') {
      // **`DESCONOCIDO` es un patrón sin cargar y ahora se dice.** Antes pasaba
      // la validación sin un solo aviso, y además la línea de abajo lo trataba
      // como direccional --`patron !== 'OMNI'`--, que es exactamente adivinar
      // lo que el valor viene a declarar que no se sabe.
      if (e.patron === null || e.patron === 'DESCONOCIDO') {
        problemas.push({ elementoId: e.id, problema: 'un micrófono necesita patrón polar; sin él el ángulo fuera de eje no dice nada' });
      } else if (e.patron !== 'OMNI' && e.emplazamiento.orientacion === null) {
        problemas.push({ elementoId: e.id, problema: 'un micrófono direccional sin orientación no se puede analizar' });
      }
    } else if (e.patron !== null) {
      problemas.push({ elementoId: e.id, problema: 'una caja directa no capta aire: no puede tener patrón polar' });
    }

    if (e.fuenteId !== null && !fuentes.has(e.fuenteId)) {
      problemas.push({ elementoId: e.id, problema: `apunta a la fuente «${e.fuenteId}», que no está en el escenario` });
    }
  }
  return problemas;
}
