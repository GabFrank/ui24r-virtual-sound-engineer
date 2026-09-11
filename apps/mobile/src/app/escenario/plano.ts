import { elementosDelEscenario, NULO_DEL_PATRON_GRADOS } from '@vse/domain';
import type {
  Emplazamiento, Escenario, PAComponentId, PAComponentSpec, PuntoM,
} from '@vse/domain';

/**
 * El plano del local en pantalla: metros a píxeles, y el dedo a metros.
 *
 * **Por qué esto es un archivo aparte y no está dentro del componente.** Acá
 * vive el único riesgo real del editor: una conversión que espeje la sala o que
 * se coma un factor deja un plano que *parece* bien y ubica todo al revés. El
 * modelo del escenario ya tuvo ese defecto —veinte tests en verde con la
 * izquierda y la derecha cambiadas— y se encontró rompiéndolo a propósito. Acá
 * la conversión se prueba sin montar Angular, y los tests están escritos para
 * fallar ante un espejo.
 *
 * **La convención de la pantalla, que es una decisión y no una herencia.** El
 * plano se dibuja como se mira una sala desde arriba, **con el escenario
 * arriba y el público abajo**. El modelo dice que `y` crece desde el escenario
 * hacia el público, así que `y` crece hacia **abajo** en pantalla, que es
 * además la dirección en que crecen las coordenadas de un lienzo. Y `x` crece
 * hacia la derecha.
 *
 * De ahí sale algo que conviene tener presente: **la conversión es una escala
 * pura, sin ningún volteo**. Si alguna vez aparece un signo menos acá, es un
 * error, no una sutileza.
 *
 * **Y la precisión al centímetro no la da el dedo.** La aplicación acepta
 * centímetros porque el usuario los sabe para algunas cosas, pero arrastrar con
 * el dedo sobre un plano no los alcanza ni de lejos. {@link precisionDelDedoM}
 * dice cuánto vale un dedo en metros sobre este plano, para que la pantalla
 * pueda decirlo en vez de fingir.
 */

/**
 * Lado de un blanco que un dedo acierta, en píxeles.
 *
 * **Es el mismo 48 que declara `--tap-min` en `apps/mobile/src/styles/_tokens.scss`
 * y que documenta el sistema de diseño**, repetido acá porque este archivo hace
 * aritmética y no puede leer una ficha CSS. La repetición es deliberada y tiene
 * su test: dos números que dicen lo mismo y pueden separarse son un defecto
 * esperando, y la forma de que no se separen en silencio es que alguien los
 * compare.
 */
export const BLANCO_MINIMO_PX = 48;

/**
 * Cuánto ocupa la yema de un dedo, en píxeles.
 *
 * No es lo mismo que el blanco mínimo: el blanco es cuán grande hay que dibujar
 * algo para poder tocarlo, y esto es cuánta incertidumbre mete el dedo al
 * soltarlo. Se usa para decir cuánta precisión real tiene un arrastre.
 */
export const YEMA_PX = 44;

/** Dimensiones del local que hacen falta para dibujar el plano. */
export interface DimensionesDelLocal {
  readonly largo: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Cómo se sitúa el plano dentro del lienzo. */
export interface EscalaDelPlano {
  /**
   * Píxeles por metro.
   *
   * **Píxeles CSS de verdad**, no unidades de dibujo: quien arma la escala
   * tiene que pasarle el tamaño con que el lienzo se está mostrando. Si no, el
   * blanco táctil y la precisión del dedo salen escalados por el estiramiento
   * del SVG y las dos cifras que esta pantalla promete no falsear quedan
   * falseadas. Lo encontró una auditoría: en una tablet de 400 px de ancho, un
   * blanco declarado de 48 medía 26,7.
   */
  readonly pxPorMetro: number;
  /** Dónde cae la esquina del local dentro del lienzo, en píxeles. */
  readonly origenX: number;
  readonly origenY: number;
  readonly anchoPx: number;
  readonly altoPx: number;
}

/**
 * Calcula la escala que hace entrar el local en el lienzo, sin deformarlo.
 *
 * **Un solo factor para los dos ejes.** Estirar el plano para llenar la
 * pantalla haría que un ángulo dibujado no fuera el ángulo real, y este editor
 * existe justamente para razonar sobre ángulos.
 */
export function calcularEscala(
  dim: DimensionesDelLocal,
  lienzoAnchoPx: number,
  lienzoAltoPx: number,
  margenPx = 24,
): EscalaDelPlano {
  const utilAncho = Math.max(1, lienzoAnchoPx - margenPx * 2);
  const utilAlto = Math.max(1, lienzoAltoPx - margenPx * 2);
  const pxPorMetro = Math.min(utilAncho / dim.ancho, utilAlto / dim.largo);
  const anchoPx = dim.ancho * pxPorMetro;
  const altoPx = dim.largo * pxPorMetro;
  // Centrado en el eje que sobra. Un local más ancho que hondo deja hueco
  // arriba y abajo; dejarlo todo de un lado haría que el plano pareciera
  // corrido respecto de la sala, que es justo la confusión que este editor no
  // se puede permitir.
  return {
    pxPorMetro,
    origenX: margenPx + (utilAncho - anchoPx) / 2,
    origenY: margenPx + (utilAlto - altoPx) / 2,
    anchoPx,
    altoPx,
  };
}

/** Un punto del lienzo, en píxeles. */
export interface PuntoPx {
  readonly x: number;
  readonly y: number;
}

/**
 * De metros del local a píxeles del lienzo.
 *
 * `z` no se dibuja: un plano es una vista desde arriba y la altura no cabe en
 * él. Se edita con un campo numérico, y por eso esta función la ignora sin
 * disimulo en vez de aplastarla contra el piso.
 */
export function aPantalla(p: PuntoM, e: EscalaDelPlano): PuntoPx {
  return { x: e.origenX + p.x * e.pxPorMetro, y: e.origenY + p.y * e.pxPorMetro };
}

/**
 * De píxeles del lienzo a metros del local, recortado a las paredes.
 *
 * Recorta porque el dedo se sale del plano constantemente —el borde de la
 * pantalla queda a un centímetro del borde del local— y dejar que un elemento
 * salga del local produce un dato que la validación después denuncia. Es más
 * amable frenarlo en la pared que aceptarlo y retarlo.
 *
 * `alturaM` se pasa porque la conversión no la conoce: la pantalla es de dos
 * dimensiones y el modelo de tres.
 */
export function aMetros(
  px: PuntoPx,
  e: EscalaDelPlano,
  dim: DimensionesDelLocal,
  alturaM: number,
): PuntoM {
  const x = (px.x - e.origenX) / e.pxPorMetro;
  const y = (px.y - e.origenY) / e.pxPorMetro;
  return {
    x: recortar(x, 0, dim.ancho),
    y: recortar(y, 0, dim.largo),
    z: recortar(alturaM, 0, dim.alto),
  };
}

function recortar(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/**
 * Cuántos metros vale un dedo sobre este plano.
 *
 * **Es el número que impide que la pantalla mienta.** Un local de 12 m de ancho
 * por 8 de fondo en un lienzo de 700 px da **51,4 px por metro**, así que una
 * yema de 44 px son **86 cm** de ambigüedad: pedirle centímetros al arrastre es
 * absurdo. La pantalla usa esto para ofrecer escribir las coordenadas cuando el
 * dedo no alcanza, en vez de dejar creer que el arrastre fue exacto.
 *
 * **El dedo se vuelve grueso en las salas grandes, no en las chicas.** El
 * lienzo mide lo que mide la tablet, así que cuanto más chico el local, más
 * píxeles por metro y más fino el dedo: con el mismo lienzo, una sala de 4 por
 * 3 da 27 cm y una de 12 por 8 da 83. Escribí lo contrario en una versión
 * anterior de este archivo y lo encontró una auditoría calculándolo.
 *
 * Todos esos números salieron de correr {@link calcularEscala}, no de
 * estimarlos: una versión anterior decía 58 px/m y 76 cm porque olvidaba restar
 * los márgenes, y escribir una cuenta sin hacerla es exactamente lo que este
 * proyecto viene aprendiendo a no hacer.
 */
export function precisionDelDedoM(e: EscalaDelPlano): number {
  return YEMA_PX / e.pxPorMetro;
}

/**
 * El radio de duda de un elemento, dibujado.
 *
 * **Se dibuja siempre, aunque quede diminuto.** Un punto sin su círculo invita
 * a creer que la posición es exacta, y la mitad de este modelo consiste en no
 * creer eso.
 */
export function radioIncertidumbrePx(em: Emplazamiento, e: EscalaDelPlano): number {
  return Math.max(0, em.incertidumbrePosicionM) * e.pxPorMetro;
}

/**
 * Si el arrastre con el dedo es más grueso que la duda ya declarada del
 * elemento.
 *
 * Cuando lo es, mover el elemento con el dedo **empeora el dato**: lo deja
 * donde cayó la yema, que es menos preciso que lo que estaba cargado. La
 * pantalla ofrece escribir los números en ese caso.
 */
export function elDedoEsMasGruesoQueLaDuda(em: Emplazamiento, e: EscalaDelPlano): boolean {
  return precisionDelDedoM(e) > Math.max(0, em.incertidumbrePosicionM) * 2;
}

/**
 * Punta de la flecha que muestra hacia dónde apunta un elemento.
 *
 * El azimut del modelo es 0° hacia +y y crece hacia +x. Como la pantalla no
 * voltea ningún eje, eso se dibuja tal cual: 0° apunta hacia abajo —hacia el
 * público, que está abajo— y 90° hacia la derecha.
 *
 * Devuelve `null` si el elemento no apunta a ningún lado: no hay flecha que
 * dibujar y poner una hacia el norte sería inventar un dato.
 */
export function puntaDeLaFlecha(
  em: Emplazamiento,
  e: EscalaDelPlano,
  largoPx: number,
): PuntoPx | null {
  if (em.orientacion === null) return null;
  const a = (em.orientacion.azimutGrados * Math.PI) / 180;
  const base = aPantalla(em.posicion, e);
  // La inclinación no se dibuja: en una vista desde arriba, una cuña apuntando
  // al techo y otra al horizonte se ven igual. La flecha muestra el azimut y la
  // ficha del elemento muestra la inclinación en grados.
  return { x: base.x + Math.sin(a) * largoPx, y: base.y + Math.cos(a) * largoPx };
}

/**
 * Redondea una coordenada a centímetros.
 *
 * **Al centímetro y no más fino**, porque el modelo es en metros y guardar
 * `2.4718309859154927` —lo que sale de dividir píxeles— es escribir dieciséis
 * cifras de las cuales dos son verdad. El redondeo no mejora el dato; evita
 * que el dato mienta sobre sí mismo.
 */
export function aCentimetros(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Redondea las tres coordenadas de un punto a centímetros. */
export function puntoACentimetros(p: PuntoM): PuntoM {
  return { x: aCentimetros(p.x), y: aCentimetros(p.y), z: aCentimetros(p.z) };
}

// --- Qué se dibuja en el plano ---------------------------------------------

/**
 * Una cosa dibujable en el plano.
 *
 * El plano junta tres orígenes distintos —fuentes y captaciones del escenario,
 * emisores del perfil de amplificación— y necesita tratarlos igual para
 * dibujarlos y arrastrarlos. Esto es esa forma común, y **no es un cuarto
 * modelo**: cada ficha recuerda de dónde salió para poder devolver el cambio a
 * su sitio.
 */
export interface FichaDelPlano {
  /**
   * Identificador único **dentro del plano**.
   *
   * Lleva prefijo porque los tres orígenes tienen espacios de nombres
   * distintos: el identificador de una fuente y el de una captación pueden
   * coincidir, y si coincidieran, arrastrar uno movería el otro.
   *
   * Para un emisor la parte propia es el identificador del componente. Con el
   * nombre, arrastrar uno movía los dos homónimos —lo comprobó una auditoría
   * ejecutándolo—, y con la posición en la lista se rompía al borrar uno del
   * medio.
   */
  readonly id: string;
  readonly origen: 'FUENTE' | 'CAPTACION' | 'EMISOR';
  readonly etiqueta: string;
  /** Una línea corta que dice qué es, para la ficha y para el lector de pantalla. */
  readonly detalle: string;
  readonly emplazamiento: Emplazamiento;
}

/** El prefijo de cada origen, en un solo lugar. */
export function idDeFicha(origen: FichaDelPlano['origen'], propio: string): string {
  const marca = origen === 'FUENTE' ? 'f' : origen === 'CAPTACION' ? 'c' : 'e';
  return `${marca}:${propio}`;
}

/** Lo que el plano necesita saber para dibujarse y para explicar sus huecos. */
export interface LoQueVaEnElPlano {
  readonly fichas: readonly FichaDelPlano[];
  /** Componentes que radian y no tienen lugar: hay que pedirle al usuario que los ubique. */
  readonly sinUbicar: readonly PAComponentSpec[];
  /** Los que no acoplan. No se les pide lugar, y se dice por qué. */
  readonly noRadian: readonly PAComponentSpec[];
}

const ETIQUETA_DE_CLASE: Readonly<Record<string, string>> = {
  PRINCIPAL: 'Caja principal',
  SUBGRAVE: 'Subgrave',
  MONITOR_CUNA: 'Monitor de piso',
  MONITOR_LATERAL: 'Monitor lateral',
  RETARDO: 'Refuerzo retardado',
  IEM: 'Intraurales',
  OTRO: 'Componente',
};

function nombreDeBus(b: PAComponentSpec['bus']): string {
  if (b.tipo === 'MASTER') return 'general';
  return `${b.tipo === 'AUX' ? 'auxiliar' : 'matriz'} ${b.indice}`;
}

const ETIQUETA_DE_PATRON: Readonly<Record<string, string>> = {
  OMNI: 'omnidireccional',
  CARDIOIDE: 'cardioide',
  SUPERCARDIOIDE: 'supercardioide',
  HIPERCARDIOIDE: 'hipercardioide',
  BIDIRECCIONAL: 'bidireccional',
  DESCONOCIDO: 'patrón sin cargar',
};

/**
 * Junta los tres orígenes en una sola lista dibujable.
 *
 * **Los que no tienen lugar no se dibujan y tampoco se pierden**: vuelven en
 * `sinUbicar`, que es lo que la pantalla usa para ofrecer ponerlos en el plano.
 * Un monitor que el usuario no ubicó y que no aparece en ningún lado es
 * exactamente el caso en que la geometría y el analizador se van a contradecir
 * sin que nadie sepa por qué.
 */
export function loQueVaEnElPlano(
  escenario: Escenario,
  componentes: readonly PAComponentSpec[],
): LoQueVaEnElPlano {
  const r = elementosDelEscenario(escenario, componentes);
  const fichas: FichaDelPlano[] = [];

  for (const f of r.fuentes) {
    fichas.push({
      id: idDeFicha('FUENTE', f.id), origen: 'FUENTE', etiqueta: f.nombre,
      detalle: 'Fuente — suena por sí misma', emplazamiento: f.emplazamiento,
    });
  }
  for (const c of r.captaciones) {
    const detalle = c.captacion === 'DIRECTA'
      ? 'Caja directa — no capta aire'
      : `Micrófono ${ETIQUETA_DE_PATRON[c.patron ?? 'DESCONOCIDO'] ?? 'patrón sin cargar'}`;
    fichas.push({
      id: idDeFicha('CAPTACION', c.id), origen: 'CAPTACION', etiqueta: c.nombre,
      detalle, emplazamiento: c.emplazamiento,
    });
  }
  for (const e of r.emisores) {
    fichas.push({
      id: idDeFicha('EMISOR', e.componente.id), origen: 'EMISOR', etiqueta: e.nombre,
      detalle: `${ETIQUETA_DE_CLASE[e.componente.clase] ?? 'Componente'} — sale por el ${nombreDeBus(e.bus)}`,
      emplazamiento: e.emplazamiento,
    });
  }
  return { fichas, sinUbicar: r.sinLugar, noRadian: r.noRadian };
}

/**
 * Si una captación tiene todo lo que hace falta para entrar en el análisis.
 *
 * Devuelve el motivo cuando no, en castellano y listo para mostrar. **Nunca
 * devuelve `null` por dos razones distintas**: cada hueco tiene su frase, para
 * que la pantalla pueda decir qué falta en vez de dejar el elemento apagado sin
 * explicación.
 */
export function loQueLeFaltaAlMicrofono(
  captacion: 'MICROFONO' | 'DIRECTA',
  patron: string | null,
  tieneOrientacion: boolean,
): string | null {
  if (captacion === 'DIRECTA') return null;
  if (patron === null || patron === 'DESCONOCIDO') {
    return 'Falta el patrón polar. Viene impreso en el micrófono, y sin él el ángulo no dice nada.';
  }
  if (patron !== 'OMNI' && !tieneOrientacion) {
    return 'Falta hacia dónde apunta. Un micrófono direccional sin eje no se puede analizar.';
  }
  if (patron !== 'OMNI' && NULO_DEL_PATRON_GRADOS[patron as keyof typeof NULO_DEL_PATRON_GRADOS] === null) {
    return 'Ese patrón no tiene un nulo declarado y no se puede usar para ordenar parejas.';
  }
  return null;
}

// --- El arrastre ------------------------------------------------------------

/**
 * Un arrastre en curso.
 *
 * **Guarda el agarre, y ése es todo el punto.** La primera versión del editor
 * movía el elemento a la posición absoluta del dedo, así que **apoyar el dedo
 * en el borde del blanco y levantarlo sin moverse reubicaba la ficha**: con un
 * blanco de 48 px sobre una escala real, tocar un micrófono para leer sus
 * números lo corría 34 cm y dejaba la pantalla en «sin guardar». Lo midió una
 * auditoría; era lo contrario exacto de lo que esta pantalla promete.
 *
 * Con el agarre guardado, el elemento se mueve **lo que se movió el dedo**, y
 * un toque que no se desplaza no cambia nada.
 */
export interface Arrastre {
  readonly id: string;
  /** El puntero que lo empezó. Un segundo dedo no lo secuestra. */
  readonly pointerId: number;
  /** Dónde estaba el dedo al apoyarse, en píxeles del lienzo. */
  readonly agarrePx: PuntoPx;
  /** Dónde estaba el elemento al apoyarse, en metros. */
  readonly origenM: PuntoM;
}

/**
 * Dónde queda el elemento después de mover el dedo hasta `ahoraPx`.
 *
 * Devuelve `null` si el dedo no se movió lo suficiente como para que el
 * movimiento sea intencional. **El umbral no es una comodidad: es lo que
 * separa tocar de arrastrar**, y sin él cada toque ensucia el dato.
 */
export function moverArrastre(
  a: Arrastre,
  ahoraPx: PuntoPx,
  e: EscalaDelPlano,
  dim: DimensionesDelLocal,
): PuntoM | null {
  const dx = ahoraPx.x - a.agarrePx.x;
  const dy = ahoraPx.y - a.agarrePx.y;
  if (Math.hypot(dx, dy) < UMBRAL_DE_ARRASTRE_PX) return null;
  return puntoACentimetros({
    x: recortar(a.origenM.x + dx / e.pxPorMetro, 0, dim.ancho),
    y: recortar(a.origenM.y + dy / e.pxPorMetro, 0, dim.largo),
    z: recortar(a.origenM.z, 0, dim.alto),
  });
}

/**
 * Cuánto tiene que moverse el dedo para que cuente como arrastre, en píxeles.
 *
 * Ocho es lo que usan las plataformas para distinguir un toque de un gesto, y
 * es bastante menos que el radio del blanco: no se pierde ningún arrastre
 * intencional y se descartan todos los toques.
 */
export const UMBRAL_DE_ARRASTRE_PX = 8;

// --- Devolver un movimiento a su origen ------------------------------------

/**
 * El escenario y los componentes, que es lo que la pantalla tiene en la mano.
 *
 * **Sólo el escenario se edita.** Los componentes vienen del perfil de
 * amplificación y esta pantalla no los toca: describen qué equipo es, y eso se
 * cambia en la pantalla del sistema. Lo que esta pantalla escribe es dónde está
 * puesto cada uno **en este local**, que vive en el escenario.
 */
export interface EstadoDelPlano {
  readonly escenario: Escenario;
  readonly componentes: readonly PAComponentSpec[];
}

/**
 * Aplica el movimiento de una ficha al origen del que salió.
 *
 * **Acá vive el riesgo del identificador con prefijo.** Una ficha puede venir
 * del escenario o del perfil de amplificación, y la única forma de saber cuál
 * es el prefijo. Si se perdiera, arrastrar una cuña movería una fuente que se
 * llamara igual, en silencio.
 *
 * Devuelve el estado sin tocar si el identificador no corresponde a nada: una
 * ficha que ya no existe —porque se la borró desde otra pantalla— no puede
 * crear una entrada nueva de la nada.
 */
export function aplicarMovida(estado: EstadoDelPlano, movida: {
  readonly id: string;
  readonly emplazamiento: Emplazamiento;
}): EstadoDelPlano {
  const corte = movida.id.indexOf(':');
  if (corte < 0) return estado;
  const marca = movida.id.slice(0, corte);
  const propio = movida.id.slice(corte + 1);

  if (marca === 'e') {
    // **El lugar se escribe en el escenario del local, no en el componente.**
    // Por identificador y no por nombre: dos componentes homónimos son un caso
    // real y con el nombre se movían los dos a la vez.
    if (!estado.componentes.some((c) => c.id === propio)) return estado;
    const id = propio as PAComponentId;
    const previos = estado.escenario.emisores ?? [];
    const emisores = previos.some((e) => e.componenteId === id)
      ? previos.map((e) => (e.componenteId === id ? { ...e, emplazamiento: movida.emplazamiento } : e))
      : [...previos, { componenteId: id, emplazamiento: movida.emplazamiento }];
    return { ...estado, escenario: { ...estado.escenario, emisores } };
  }

  const buscado = marca === 'f' ? 'FUENTE' : marca === 'c' ? 'CAPTACION' : null;
  if (buscado === null) return estado;
  let tocado = false;
  const elementos = estado.escenario.elementos.map((el) => {
    if (el.tipo !== buscado || el.id !== propio) return el;
    tocado = true;
    return { ...el, emplazamiento: movida.emplazamiento };
  });
  return tocado
    ? { ...estado, escenario: { ...estado.escenario, elementos } }
    : estado;
}
