import type { BandMemberId, ChannelAssignmentId, EscenarioElementoId, VenueProfileId } from '../ids.ts';
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
 * **Y el sistema de amplificación NO se modela acá.** El perfil de amplificación
 * ya tiene componentes con su bus, y el bus ya distingue general, auxiliar y
 * matriz: un monitor *es* un componente alimentado por un auxiliar. Agregarles
 * emplazamiento a esos componentes —que es lo que hace {@link PAComponentSpec}—
 * es más barato y más honesto que declarar monitores acá y tener dos listas que
 * se contradicen. {@link elementosDelEscenario} une las dos mitades para quien
 * necesite la lista completa.
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
 * más que `EN_PIE`— y tenía razón en que había que explicarlo: una caja colgada
 * de una parrilla o atornillada a tres metros de altura **no se mueve nada y se
 * mide pésimo**, mientras que un pie de micrófono se toca con la mano y se
 * puede medir con cinta. Las dos fuentes se suman en un solo número porque
 * aguas abajo se usan para lo mismo.
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
 * - `FIJO.posicionM` = 0,10. **Sin respaldo en ningún documento.** Es el número
 *   que se puso para una caja colgada o atornillada: no se mueve, pero se mide
 *   mal. Lo señaló una auditoría por ser el único de la tabla sin origen.
 * - Los tres de orientación, estimaciones sin respaldo de ningún tipo.
 *
 * Quien conozca mejor su sala puede sobreescribirlos elemento por elemento:
 * {@link Emplazamiento} lleva la incertidumbre explícita, no la fijeza sola.
 */
export const INCERTIDUMBRE_POR_FIJEZA: Readonly<Record<Fijeza, { readonly posicionM: number; readonly orientacionGrados: number }>> = {
  FIJO: { posicionM: 0.10, orientacionGrados: 10 },
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
export interface Emplazamiento {
  readonly posicion: PuntoM;
  readonly orientacion: Orientacion | null;
  readonly fijeza: Fijeza;
  /** Radio de duda alrededor de la posición, en metros. */
  readonly incertidumbrePosicionM: number;
  /** Duda sobre hacia dónde apunta, en grados. */
  readonly incertidumbreOrientacionGrados: number;
}

/** Arma un emplazamiento aplicando la tabla de suposiciones por fijeza. */
export function emplazar(
  posicion: PuntoM,
  fijeza: Fijeza,
  orientacion: Orientacion | null = null,
  sobreescribir: { readonly posicionM?: number; readonly orientacionGrados?: number } = {},
): Emplazamiento {
  const base = INCERTIDUMBRE_POR_FIJEZA[fijeza];
  return {
    posicion,
    orientacion,
    fijeza,
    incertidumbrePosicionM: sobreescribir.posicionM ?? base.posicionM,
    incertidumbreOrientacionGrados: sobreescribir.orientacionGrados ?? base.orientacionGrados,
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
  /** Fecha de la última edición, en ISO. Un plano viejo vale menos. */
  readonly actualizado: string;
  readonly notas: string | null;
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
   * Componentes que radian al aire pero no tienen lugar cargado.
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
  for (const c of componentes) {
    if (!CLASES_QUE_RADIAN.includes(c.clase)) { noRadian.push(c); continue; }
    if (c.emplazamiento === null || c.emplazamiento === undefined) sinLugar.push(c);
    else emisores.push({ nombre: c.nombre, bus: c.bus, emplazamiento: c.emplazamiento, componente: c });
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
  const d = norma(resta(a.posicion, b.posicion));
  const u = a.incertidumbrePosicionM + b.incertidumbrePosicionM;
  return { min: Math.max(0, d - u), max: d + u };
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
  const u = quien.incertidumbrePosicionM + otro.incertidumbrePosicionM;
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
