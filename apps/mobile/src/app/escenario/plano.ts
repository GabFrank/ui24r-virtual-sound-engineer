import {
  elementosDelEscenario, INCERTIDUMBRE_POR_FIJEZA, NULO_DEL_PATRON_GRADOS,
} from '@vse/domain';
import type {
  Emplazamiento, Escenario, PAComponentId, PAComponentSpec, PuntoM,
  RangoDeMovimiento,
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

// --- Distancias en vivo -----------------------------------------------------

/**
 * Una distancia dibujada entre dos fichas.
 *
 * `medio` es dónde va el número, a mitad de la línea.
 */
export interface LineaDeDistancia {
  readonly id: string;
  readonly desde: PuntoPx;
  readonly hasta: PuntoPx;
  readonly medio: PuntoPx;
  readonly texto: string;
  /** Para ordenar y para que la pantalla pueda destacar la más cercana. */
  readonly metros: number;
}

/**
 * Las distancias de una ficha contra todas las demás, listas para dibujar.
 *
 * **Existe porque el plano no mostraba ninguna.** Dibujaba fichas, su eje y un
 * círculo de duda, y los números aparecían después en otra tarjeta como ranking
 * de exposición — nunca como «esto está a 1,80 de aquello». Sin un número a la
 * vista, nadie puede corregir una posición arrastrando, que es como el usuario
 * describió que quiere usar esto: «*posicionamos un equipo, luego al posicionar
 * el otro vemos la distancia que hay entre uno y otro, talvez movemos un poco
 * mas, cambia la distancia*» (2026-09-12).
 *
 * **Y eso cambia qué es el plano.** Deja de ser un instrumento que deduce
 * posiciones y pasa a ser una mesa donde el usuario arrastra hasta que el
 * número dice lo que él ya midió. Con el número a la vista, cuán fino sea el
 * dedo deja de importar.
 *
 * Van ordenadas de más cerca a más lejos: la más cercana es la que más suele
 * importar, y si hay que recortar la lista se recorta por el otro extremo.
 */
export function lineasDeDistancia(
  desdeId: string,
  fichas: readonly FichaDelPlano[],
  e: EscalaDelPlano,
  texto: (min: number, max: number) => string,
  distancia: (a: Emplazamiento, b: Emplazamiento) => { min: number; max: number },
): LineaDeDistancia[] {
  const origen = fichas.find((f) => f.id === desdeId);
  if (origen === undefined) return [];
  const desde = aPantalla(origen.emplazamiento.posicion, e);
  return fichas
    .filter((f) => f.id !== desdeId)
    .map((f) => {
      const hasta = aPantalla(f.emplazamiento.posicion, e);
      const d = distancia(origen.emplazamiento, f.emplazamiento);
      return {
        id: f.id,
        desde,
        hasta,
        medio: { x: (desde.x + hasta.x) / 2, y: (desde.y + hasta.y) / 2 },
        texto: texto(d.min, d.max),
        // Se ordena por el mínimo: es la distancia que decide si dos cosas se
        // pueden tocar, y la que el usuario mira primero.
        metros: d.min,
      };
    })
    .sort((a, b) => a.metros - b.metros);
}

/* ──────────────────────────────────────────────────────────────────────────
 * La vista: zoom y encuadre
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Qué pedazo del local se está mirando.
 *
 * **Por qué existe.** {@link precisionDelDedoM} dice la verdad —en una sala de
 * 12 × 8 m un dedo vale decenas de centímetros— y decirla no la arregla: con dos
 * fichas superpuestas no hay forma de tocar la de abajo, y arrastrar *empeora*
 * el dato. El zoom es lo que convierte esa honestidad en capacidad de trabajo.
 *
 * **Es una capa encima y no un reemplazo.** {@link calcularEscala} sigue siendo
 * el encuadre completo, con su firma intacta, porque es el que las capturas de
 * `tools/visual/flujo.mjs` fijaron. Todo lo demás de este archivo —dibujar,
 * arrastrar, medir distancias, calcular el grosor del dedo— pasa por
 * {@link EscalaDelPlano} y por eso no se enteró de que ahora hay zoom.
 */
export interface Vista {
  /** 1 es el local entero. Nunca menos: ver {@link ZOOM_MINIMO}. */
  readonly zoom: number;
  /** Qué punto del local queda en el centro del lienzo, en metros. */
  readonly centroM: { readonly x: number; readonly y: number };
}

/**
 * No se puede alejar más allá del local entero.
 *
 * Afuera del local no hay nada que mirar. Dejar alejar daría una pantalla donde
 * todo se ve más chico sin ganar información, y además rompería la promesa de
 * que el plano dibujado es la sala: aparecería sala donde no hay.
 */
export const ZOOM_MINIMO = 1;

/**
 * Hasta dónde sirve acercar, **derivado y no elegido**.
 *
 * El modelo tiene una incertidumbre más fina que todas las que no son cero:
 * `INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM` = 0,05 m, decisión del usuario del
 * 2026-09-12. Un dedo más fino que eso no puede mejorar ningún dato, porque no
 * hay dato en el modelo con esa resolución: `FIJO` declara cero incertidumbre y
 * su error es de quien puso la marca, no del plano.
 *
 * Así que el tope sale de la constante del dominio y del tamaño real del lienzo.
 * Si alguien cambia la tabla de fijeza, el zoom se ajusta solo; si en cambio
 * acá hubiera un número escrito a mano, se separarían en silencio, que es el
 * defecto que este archivo ya documenta en {@link BLANCO_MINIMO_PX}.
 *
 * Nunca devuelve menos de {@link ZOOM_MINIMO}: en una sala chica el encuadre
 * completo ya puede tener el dedo más fino que 5 cm, y ahí el tope es 1 porque
 * no hace falta acercar nada.
 */
export function zoomUtilMaximo(
  dim: DimensionesDelLocal,
  lienzoAnchoPx: number,
  lienzoAltoPx: number,
  margenPx = 24,
): number {
  const base = calcularEscala(dim, lienzoAnchoPx, lienzoAltoPx, margenPx);
  const finoDelModeloM = INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM;
  const pxPorMetroNecesarios = YEMA_PX / finoDelModeloM;
  return Math.max(ZOOM_MINIMO, pxPorMetroNecesarios / base.pxPorMetro);
}

/** El local entero, centrado: con qué vista abre la pantalla. */
export function vistaInicial(dim: DimensionesDelLocal): Vista {
  return { zoom: ZOOM_MINIMO, centroM: { x: dim.ancho / 2, y: dim.largo / 2 } };
}

/**
 * La escala que corresponde a una vista.
 *
 * **A zoom 1 devuelve exactamente {@link calcularEscala}**, los cuatro campos
 * idénticos y no "parecidos". Eso tiene su test: es lo que garantiza que
 * agregar zoom no movió el encuadre completo, que es el único que está medido.
 *
 * El centro pedido se recorta al rectángulo del local. A zoom alto eso deja ver
 * más allá de la pared —en una esquina, tres cuartos de lienzo vacío— y es a
 * propósito: sin eso no se puede arrastrar algo *contra* la pared sin que el
 * dedo tape justo el lugar donde va.
 */
export function escalaConVista(
  dim: DimensionesDelLocal,
  lienzoAnchoPx: number,
  lienzoAltoPx: number,
  vista: Vista,
  margenPx = 24,
): EscalaDelPlano {
  const base = calcularEscala(dim, lienzoAnchoPx, lienzoAltoPx, margenPx);
  const zoom = Number.isFinite(vista.zoom)
    ? Math.min(
        Math.max(vista.zoom, ZOOM_MINIMO),
        zoomUtilMaximo(dim, lienzoAnchoPx, lienzoAltoPx, margenPx),
      )
    : ZOOM_MINIMO;
  if (zoom === ZOOM_MINIMO) return base;

  const pxPorMetro = base.pxPorMetro * zoom;
  // El centro se recorta a las paredes. `recortar` ya devuelve el mínimo ante un
  // NaN, así que un centro inventado cae en la esquina del local y el local
  // sigue tocando el lienzo, que es la expectativa 5 del contrato.
  const cx = recortar(vista.centroM.x, 0, dim.ancho);
  const cy = recortar(vista.centroM.y, 0, dim.largo);
  return {
    pxPorMetro,
    // El origen es donde cae la esquina (0,0) del local: se corre para que el
    // punto (cx, cy) quede en el medio del lienzo.
    origenX: lienzoAnchoPx / 2 - cx * pxPorMetro,
    origenY: lienzoAltoPx / 2 - cy * pxPorMetro,
    anchoPx: dim.ancho * pxPorMetro,
    altoPx: dim.largo * pxPorMetro,
  };
}

/**
 * Cuánto cambia el zoom cada vez que se toca el botón.
 *
 * Un tercio por paso: con el tope derivado de una sala de 12 × 8 m en una
 * tablet, son unos diez toques de punta a punta. Menos pasos se sentiría brusco
 * —el plano salta y hay que buscar de nuevo dónde quedó lo que se miraba— y más
 * pasos es un botón que hay que apretar veinte veces.
 */
export const PASO_DE_ZOOM = 4 / 3;

/**
 * Acerca o aleja alrededor de un punto del local, dejándolo quieto.
 *
 * Mantener el punto fijo es lo que hace que el zoom no desoriente: se acerca
 * *sobre* la ficha que se está mirando, no sobre el medio de la sala. El
 * recorte final lo hace {@link escalaConVista}, que es el único lugar donde el
 * zoom se limita —tenerlo en dos lados es tenerlo en ninguno.
 */
export function acercarSobre(
  vista: Vista,
  puntoM: { readonly x: number; readonly y: number },
  factor = PASO_DE_ZOOM,
): Vista {
  return { zoom: vista.zoom * factor, centroM: { x: puntoM.x, y: puntoM.y } };
}

/** Vuelve al local entero. Es la salida cuando uno se perdió con el zoom. */
export function encuadreCompleto(dim: DimensionesDelLocal): Vista {
  return vistaInicial(dim);
}

/* ──────────────────────────────────────────────────────────────────────────
 * El rectángulo de rango de movimiento
 * ────────────────────────────────────────────────────────────────────────── */

/** El rectángulo de movimiento dibujado, en píxeles del lienzo. */
export interface RectanguloEnPx {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/**
 * El rectángulo de movimiento de un elemento, listo para dibujar.
 *
 * Devuelve `null` cuando el elemento no declaró rango: no hay rectángulo, y
 * dibujar uno de tamaño cero pondría un artefacto en el plano que invita a
 * estirarlo sin que nadie lo haya pedido.
 *
 * **No incluye la duda de la fijeza.** Ésa se dibuja como el círculo de
 * `radioIncertidumbrePx`, y son dos cosas distintas: el círculo dice «la marca
 * puede estar corrida» y el rectángulo dice «esto camina hasta acá». Sumarlas
 * en un solo dibujo perdería la distinción que el usuario pidió.
 */
export function rectanguloDeRango(
  em: Emplazamiento, e: EscalaDelPlano,
): RectanguloEnPx | null {
  const g = em.rangoDeMovimiento;
  if (g === null) return null;
  const ancho = Math.max(0, g.anchoM) * e.pxPorMetro;
  const alto = Math.max(0, g.largoM) * e.pxPorMetro;
  const centro = aPantalla(em.posicion, e);
  return { x: centro.x - ancho / 2, y: centro.y - alto / 2, ancho, alto };
}

/** Por qué lado se está estirando el rectángulo. */
export type EjeDeEstiramiento = 'ancho' | 'largo';

/**
 * Dónde va el tirador de cada eje, en píxeles.
 *
 * **A media altura del lado, y por fuera del rectángulo.** Por fuera porque
 * adentro competiría con el arrastre de la ficha, que ocupa el centro; y a
 * media altura porque en una esquina los dos tiradores se pisarían y con
 * 48 px de blanco cada uno no hay lugar.
 *
 * Con el rectángulo en cero los dos tiradores caen sobre la ficha, así que la
 * pantalla no los dibuja hasta que hay rango declarado —lo mismo que
 * {@link rectanguloDeRango}—.
 */
export function tiradorDeRango(
  em: Emplazamiento, e: EscalaDelPlano, eje: EjeDeEstiramiento,
): PuntoPx | null {
  const r = rectanguloDeRango(em, e);
  if (r === null) return null;
  const centro = aPantalla(em.posicion, e);
  return eje === 'ancho'
    ? { x: r.x + r.ancho, y: centro.y }
    : { x: centro.x, y: r.y + r.alto };
}

/**
 * El rango nuevo después de arrastrar un tirador hasta `ahoraPx`.
 *
 * **Crece simétrico**: el elemento se queda donde está y el rectángulo se abre
 * para los dos lados. Si creciera hacia un solo lado, estirar movería la
 * posición marcada, que es un dato distinto y ya se edita arrastrando la ficha.
 *
 * **Se recorta al local**, igual que el arrastre de la ficha. Un rango más
 * grande que la sala es un dato que nadie puede haber querido y que la
 * validación del dominio denuncia después; frenarlo acá es más amable que
 * aceptarlo y retarlo.
 *
 * Y **al centímetro**, por lo mismo que las coordenadas: lo que sale de dividir
 * píxeles tiene dieciséis cifras de las cuales dos son verdad.
 */
export function estirarRango(
  em: Emplazamiento,
  e: EscalaDelPlano,
  dim: DimensionesDelLocal,
  eje: EjeDeEstiramiento,
  ahoraPx: PuntoPx,
): RangoDeMovimiento {
  const g = em.rangoDeMovimiento;
  const centro = aPantalla(em.posicion, e);
  const actual = { anchoM: g === null ? 0 : g.anchoM, largoM: g === null ? 0 : g.largoM };
  // El semilado nuevo es la distancia del centro al dedo, y el lado es el doble.
  const semiPx = eje === 'ancho'
    ? Math.abs(ahoraPx.x - centro.x)
    : Math.abs(ahoraPx.y - centro.y);
  const ladoM = aCentimetros(recortar(
    (semiPx * 2) / e.pxPorMetro, 0, eje === 'ancho' ? dim.ancho : dim.largo,
  ));
  return eje === 'ancho'
    ? { anchoM: ladoM, largoM: actual.largoM }
    : { anchoM: actual.anchoM, largoM: ladoM };
}

/**
 * Cómo se lee un rango en palabras, para la ficha y para el lector de pantalla.
 *
 * **Un cuadrado se dice una vez.** «3 por 3 m» hace leer dos números y comparar
 * para darse cuenta de que son iguales; «3 m en cuadrado» lo dice de una.
 */
export function comoSeLeeElRango(
  g: RangoDeMovimiento,
  // **La misma firma que `metros` de `lo-que-dice-la-geometria`**, que formatea
  // un intervalo. Se le pasa el mismo número dos veces porque un lado del
  // rectángulo es un dato y no un rango: así hay un solo formateador en toda la
  // pantalla y las cifras no se escriben de dos maneras.
  formatear: (min: number, max: number) => string,
): string {
  // El mismo umbral de cinco milímetros que usa `metros` para decidir si un
  // intervalo colapsó: dos lados que difieren en tres milímetros no son dos
  // datos.
  if (Math.abs(g.anchoM - g.largoM) < 0.005) {
    return `${formatear(g.anchoM, g.anchoM)} en cuadrado`;
  }
  return `${formatear(g.anchoM, g.anchoM)} de ancho por `
    + `${formatear(g.largoM, g.largoM)} de fondo`;
}
