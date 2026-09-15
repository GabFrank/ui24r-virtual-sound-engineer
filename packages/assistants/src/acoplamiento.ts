import {
  anguloFueraDeEjeGrados, distanciaM, rangoInutil, NULO_DEL_PATRON_GRADOS,
  type ElementoCaptacion, type Emisor, type PatronPolar, type Rango,
} from '@vse/domain';

/**
 * Qué pareja monitor↔micrófono está más expuesta a realimentar.
 *
 * **Esto es el segundo camino, y su valor está en poder contradecir al
 * primero.** El analizador dice que algo se sostiene a nueve kilohercios pero
 * no dice de dónde sale; la geometría dice qué pareja está más expuesta pero no
 * dice a qué frecuencia. Cuando los dos apuntan al mismo canal, se confirman.
 * **Cuando no, uno de los dos datos está mal** —el monitor no está donde se
 * dijo, está en otro auxiliar del registrado, o el micrófono se movió— y hoy no
 * hay ninguna otra forma de enterarse.
 *
 * ## Lo que este módulo NO hace, que es la mitad de lo que hay que saber
 *
 * **No devuelve decibeles, y no es que falten unidades: faltan las leyes.** La
 * ganancia de lazo necesita el envío al auxiliar, el preamplificador y la
 * sensibilidad del micrófono. Las leyes del envío y del ecualizador de canal
 * **no están medidas contra la consola** —son tareas pendientes, no supuestos
 * que se puedan rellenar—, así que cualquier decibel que saliera de acá sería
 * inventado. Lo que sale es un **orden**, sin unidad, y el propio tipo lo dice.
 *
 * **No predice la frecuencia del lazo.** Eso lo deciden los modos de la sala y
 * la respuesta del micrófono y de la caja. La frecuencia la dice el analizador.
 *
 * **No propone nada y no escribe nada.** Ni bajar un envío, ni mover un fader,
 * ni tocar un ecualizador. Diagnostica: nombra la pareja, dice a qué distancia
 * y con qué ángulo, y muestra lo que está registrado de ese canal.
 *
 * **Y no ordena lo que no se puede ordenar.** Cada pareja trae un rango, no un
 * número, porque las posiciones traen su incertidumbre. Dos parejas cuyos
 * rangos se solapan **no son ordenables**: van en el mismo escalón, y el
 * escalón se informa como empate en vez de inventar un desempate. Un plano
 * cargado a ojo produce un solo escalón con todo adentro, que es exactamente lo
 * que hay que ver cuando el plano está cargado a ojo.
 *
 * ## Los supuestos físicos, escritos antes de usarlos
 *
 * 1. **Campo libre y camino directo único.** No hay reflexiones ni oclusión. En
 *    una sala chica el lazo suele cerrarse contra la pared del fondo, no por la
 *    recta que se calcula acá.
 * 2. **Patrones ideales de primer orden y sin frecuencia.** La directividad de
 *    un micrófono cae con la frecuencia y un cardioide se vuelve mucho menos
 *    direccional en el registro grave, que es donde suele acoplar. **Ese
 *    comportamiento no está medido en este proyecto** —es acústica general, no
 *    un dato propio— y por eso acá sólo se lo declara como límite en vez de
 *    ponerle un número.
 * 3. **La directividad del emisor no está modelada.** Una cuña de cobertura
 *    ancha y una caja de largo alcance se tratan igual, porque el modelo del
 *    escenario no guarda la apertura de un componente.
 * 4. **El índice es por pareja y no se suma por micrófono ni por auxiliar.** Un
 *    músico con dos cuñas en el mismo auxiliar recibe por dos caminos, y el
 *    lazo se cierra con la suma; acá aparece como dos parejas sueltas, cada una
 *    más chica que la que tiene una sola cuña más cerca. Una auditoría lo midió:
 *    dos cuñas a 1,9 m suman más que una a 1,5 m, y el informe las ordena al
 *    revés. **Sumarlas necesita saber cuánto manda cada envío, y la ley del
 *    envío no está medida**, así que el hueco queda declarado en vez de
 *    rellenado con un supuesto.
 * 5. **Puertas adentro, pasada la distancia crítica, el nivel deja de caer con
 *    la distancia.** El campo reverberante es parejo, así que ordenar por
 *    distancia a las parejas lejanas no corresponde a nada. Al aire libre el
 *    supuesto 1 vale; en una sala, vale sólo cerca.
 */

/**
 * La respuesta ideal de un patrón polar fuera de eje, entre 0 y 1.
 *
 * Son los patrones de primer orden de libro: `a + b·cos θ` con `a + b = 1`. No
 * son micrófonos medidos, y el docblock de arriba dice lo que eso cuesta.
 *
 * Se toma el valor absoluto porque un lóbulo trasero capta con la fase
 * invertida pero **capta igual**, y para realimentar la fase del lóbulo no
 * importa: lo que importa es cuánta señal entra.
 */
const COEFICIENTES: Readonly<Record<PatronPolar, { readonly a: number; readonly b: number }>> = {
  OMNI: { a: 1, b: 0 },
  CARDIOIDE: { a: 0.5, b: 0.5 },
  SUPERCARDIOIDE: { a: 0.37, b: 0.63 },
  HIPERCARDIOIDE: { a: 0.25, b: 0.75 },
  BIDIRECCIONAL: { a: 0, b: 1 },
  // De un patrón sin cargar no se adivina: se trata como el caso más expuesto,
  // que es no rechazar nada. Errar por exceso pone la pareja más arriba en la
  // lista; errar por defecto la esconde.
  DESCONOCIDO: { a: 1, b: 0 },
};

export function respuestaDelPatron(patron: PatronPolar, gradosFueraDeEje: number): number {
  const { a, b } = COEFICIENTES[patron];
  return Math.abs(a + b * Math.cos((gradosFueraDeEje * Math.PI) / 180));
}

/**
 * Dónde se anula exactamente este patrón, en grados, o `null` si no se anula.
 *
 * **Sale de los mismos coeficientes que la respuesta**, y no de la tabla del
 * dominio, que está redondeada a grados enteros para mostrarla: el
 * hipercardioide se anula en 109,47° y la tabla dice 110, así que evaluar la
 * respuesta en 110 da 0,0065 y no cero. Para *mostrar* el nulo, 110 alcanza;
 * para *calcular el piso de un rango*, no, y la diferencia apareció al escribir
 * el test del mínimo interior.
 */
export function nuloExactoGrados(patron: PatronPolar): number | null {
  const { a, b } = COEFICIENTES[patron];
  if (b === 0) return null;
  return (Math.acos(-a / b) * 180) / Math.PI;
}



/**
 * Un número **sin unidad**, que sólo sirve para ordenar.
 *
 * El nombre lleva la advertencia adentro a propósito. No es una ganancia, no es
 * una presión y **la razón entre dos de estos valores no significa nada**: que
 * una pareja dé el doble que otra no quiere decir que acople al doble.
 */
export interface IndiceDeExposicion {
  readonly rango: Rango;
}

/** Una pareja de monitor y micrófono, con lo que se puede decir de ella. */
export interface ParejaExpuesta {
  readonly emisor: Emisor;
  readonly captacion: ElementoCaptacion;
  readonly distanciaM: Rango;
  /**
   * Cuántos grados fuera de su eje le queda el emisor al micrófono.
   *
   * **`null` significa una sola cosa: el micrófono no tiene orientación
   * cargada.** No significa que sea omnidireccional. El docblock decía las dos
   * cosas y una auditoría lo corrigió: un omnidireccional con orientación
   * cargada —que es lo que arma la pantalla— devuelve un ángulo normal, y lo
   * que lo hace el caso más expuesto es su patrón, no este campo.
   */
  readonly anguloEnElMicrofono: Rango | null;
  /** Dónde tiene su nulo el patrón, para saber si el ángulo cae cerca. */
  readonly nuloDelPatronGrados: number | null;
  readonly exposicion: IndiceDeExposicion;
  /**
   * Si el micrófono llega a ese monitor por el auxiliar que lo alimenta.
   *
   * **Es el filtro más fuerte y el único que no es geométrico.** Un micrófono
   * que no se envía a ese monitor no cierra lazo por ahí, por más cerca que
   * esté. `null` cuando no se sabe —no llegó el estado de la consola, o el
   * micrófono todavía no tiene canal asignado—, y entonces la pareja se informa
   * igual, marcada: no saber no es lo mismo que saber que no.
   */
  readonly llegaPorElEnvio: boolean | null;
  /** Lo que le falta a esta pareja para poder afirmarse, si le falta algo. */
  readonly reservas: readonly string[];
}

/**
 * Una pareja en su puesto, con quiénes no se la puede separar.
 *
 * **Es una lista por pareja y no una partición, y la diferencia importa.** La
 * primera versión agrupaba por encadenamiento: si A se solapa con B y B con C,
 * los tres iban al mismo grupo aunque A y C no se tocaran. Una auditoría midió
 * lo que eso costaba en un escenario real —un cantante con el micrófono de mano
 * encima de su cuña, más guitarra, coro y bombo—: **esa única pareja ancha se
 * tragaba a las otras seis**, que entre sí eran perfectamente separables, y la
 * pantalla pasaba a decir que la geometría no podía separar ocho parejas cuando
 * siete estaban separadas.
 *
 * Ahora cada pareja dice de cuáles no se la puede distinguir. Es más
 * información y no menos: la pareja ancha aparece empatada con todas, y las
 * otras siguen ordenadas entre sí.
 */
export interface ParejaEnSuPuesto {
  readonly pareja: ParejaExpuesta;
  /**
   * Las otras parejas cuyo rango se solapa con el suyo, por nombre.
   *
   * Vacía significa que esta pareja está genuinamente separada de todas las
   * demás — que es la única situación en la que se puede afirmar un orden.
   */
  readonly empatadaCon: readonly string[];
}

/** Cómo se llama una pareja, que es lo que se usa para nombrarla en un empate. */
export function nombreDePareja(p: ParejaExpuesta): string {
  return `${p.emisor.nombre} → ${p.captacion.nombre}`;
}

/**
 * De una captación a su canal en la consola.
 *
 * **Es un parámetro y no una cuenta de este módulo, porque el dato no vive
 * acá.** La captación guarda el identificador de su asignación de canal, y
 * resolverlo hasta el índice de entrada necesita la lista de asignaciones de la
 * banda. Pasarlo de afuera deja el hueco declarado en la firma en vez de
 * rellenarlo con un supuesto; por omisión no resuelve nada, y entonces toda
 * pareja alimentada por un auxiliar sale con su reserva escrita y ninguna se
 * descarta de más.
 */
export type CanalDeCaptacion = (captacion: ElementoCaptacion) => number | null;

/** Qué se sabe del enrutamiento, para el filtro que no es geométrico. */
export interface EnvioConocido {
  /** El canal del micrófono, tal como lo numera la consola. */
  readonly canal: number;
  /** El auxiliar del monitor. */
  readonly aux: number;
  /** Si ese envío está abierto. */
  readonly abierto: boolean;
}

/**
 * Distancia mínima que se acepta, en metros.
 *
 * A cero, la cuenta de campo libre se va a infinito y el orden pierde sentido.
 * Diez centímetros es menos que cualquier separación real entre una caja y un
 * micrófono, así que recortar ahí no cambia ningún orden verdadero; lo que hace
 * es impedir que un dato mal cargado se lleve la lista por delante.
 */
export const DISTANCIA_MINIMA_M = 0.1;

/**
 * A partir de qué ancho un rango de ángulos deja de informar, en grados.
 *
 * **Elegido, no medido.** Noventa grados es un cuadrante: un ángulo que puede
 * estar en cualquier punto de un cuadrante no permite decir si el monitor le
 * queda de frente o de costado al micrófono, que es lo único que este módulo
 * quiere leer del ángulo. Más chico marcaría con reserva parejas que sí
 * informan; más grande dejaría pasar rangos que no dicen nada.
 */
export const ANCHO_ANGULAR_QUE_NO_INFORMA = 90;

/**
 * Los coeficientes de cada patrón, expuestos para poder comprobarlos.
 *
 * Se exportan porque la invariante que importa —que ningún patrón tenga `a > b`
 * con `b ≠ 0`, o sea que ninguno sea de lóbulo ancho— hay que poder comprobarla
 * **sobre la tabla**, no a través de una función que devuelve un booleano.
 * Había una función así y era inerte: hacerle devolver `true` a secas no rompía
 * ningún test. Una auditoría lo encontró, y es el mismo defecto que la función
 * venía a arreglar, un nivel más arriba.
 */
export { COEFICIENTES };

function exposicionEn(distancia: number, patron: PatronPolar, grados: number): number {
  const d = Math.max(DISTANCIA_MINIMA_M, distancia);
  // **Las dos mitades tienen que hablar la misma lengua, y no la hablaban.**
  // La respuesta polar `a + b·cos θ` es una sensibilidad de **presión**, y
  // dividir por `d²` es la ley de la **intensidad**. El producto no era ni una
  // cosa ni la otra, y eso **cambia el orden**, no sólo la escala: a 1,00 m y
  // 75° fuera de eje contra 1,55 m en el eje, el índice mezclado daba 0,6294
  // contra 0,4162 —gana la de costado— y las dos leyes coherentes dan 0,6452
  // para la de eje. Las dos dicen lo contrario que la mezcla.
  //
  // Peor: un comentario anterior defendía la mezcla diciendo que para ordenar
  // daba lo mismo porque las dos son monótonas. Es cierto a ángulo fijo y falso
  // en cuanto el factor polar entra en el producto. Lo midió una auditoría.
  //
  // Queda en presión. Intensidad daría el mismo orden —es el cuadrado, que es
  // monótono— y presión es la lengua natural de la respuesta polar.
  return respuestaDelPatron(patron, grados) / d;
}

/**
 * Los ángulos donde `|a + b·cos θ|` puede tener un extremo dentro de un rango.
 *
 * **Y esto es lo que el primer intento no tenía.** La respuesta polar no es
 * monótona entre 0° y 180°: baja hasta anularse en el nulo y **vuelve a subir**
 * por el lóbulo trasero. Mirar sólo las esquinas del rango daba resultados
 * falsos en los tres patrones con lóbulo: un bidireccional con el ángulo entre
 * 80° y 100° —que contiene su nulo en 90°— salía con el rango **colapsado a un
 * punto**, o sea inventando la precisión que este módulo entero jura no
 * inventar. Lo midió una auditoría.
 *
 * Y el error iba para el lado inseguro: un piso inflado no se solapa con nadie,
 * así que producía escalones separados donde la geometría no separa nada.
 */
function anguloscriticos(patron: PatronPolar, rango: Rango): readonly number[] {
  const dentro = (g: number): boolean => rango.min <= g && g <= rango.max;
  const criticos = [rango.min, rango.max];
  // El máximo está en el eje y el mínimo en el nulo, que vale exactamente cero.
  //
  // **180° no hace falta**: el dominio recorta el ángulo a 180, así que el
  // máximo local del lóbulo trasero, cuando cae dentro del rango, es la esquina
  // `rango.max`. Estaba en la lista y era código muerto —quitarlo no rompía
  // ningún test—, lo que lo hacía indistinguible de una guarda que sí sirve.
  for (const g of [0, nuloExactoGrados(patron) ?? -1]) if (dentro(g)) criticos.push(g);
  return criticos;
}

/**
 * El rango del índice, propagando la duda de las entradas.
 *
 * Se evalúa en las esquinas: lo peor es el micrófono lo más cerca posible y lo
 * más en eje posible; lo mejor, lo más lejos y lo más fuera de eje. **Las dos
 * esquinas se calculan, no se estiman**, y el resultado es un rango del que no
 * se puede sacar un valor central sin volver a inventar precisión.
 */
export function exposicionDe(
  distancia: Rango,
  patron: PatronPolar,
  angulo: Rango | null,
): IndiceDeExposicion {
  // Sin eje, el patrón no reduce nada: se comporta como el caso más expuesto.
  const grados = angulo ?? { min: 0, max: 0 };
  const valores: number[] = [];
  for (const g of anguloscriticos(patron, grados)) {
    // Las dos distancias contra cada ángulo crítico: la respuesta polar y la
    // distancia son independientes, así que el extremo del producto está en
    // algún par de extremos de cada factor.
    valores.push(exposicionEn(distancia.min, patron, g), exposicionEn(distancia.max, patron, g));
  }
  return { rango: { min: Math.min(...valores), max: Math.max(...valores) } };
}

/**
 * Arma todas las parejas y las ordena en escalones.
 *
 * Las cajas de sala también entran: una caja principal apuntando al público
 * igual devuelve energía al escenario, y en una sala chica es el lazo clásico.
 * Lo que las saca de la lista no es su clase sino el enrutamiento y la
 * distancia.
 */
export function parejasExpuestas(
  emisores: readonly Emisor[],
  captaciones: readonly ElementoCaptacion[],
  envios: readonly EnvioConocido[] = [],
  canalDe: CanalDeCaptacion = () => null,
): readonly ParejaExpuesta[] {
  const porEnvio = new Map(envios.map((e) => [`${e.canal}:${e.aux}`, e.abierto]));
  const parejas: ParejaExpuesta[] = [];

  for (const emisor of emisores) {
    for (const captacion of captaciones) {
      if (captacion.captacion === 'DIRECTA') continue; // No capta aire.
      const reservas: string[] = [];
      const patron = captacion.patron ?? 'DESCONOCIDO';
      if (patron === 'DESCONOCIDO') {
        reservas.push('el micrófono no tiene patrón polar cargado, así que se lo trata como el caso más expuesto');
      }
      const distancia = distanciaM(emisor.emplazamiento, captacion.emplazamiento);
      const angulo = anguloFueraDeEjeGrados(captacion.emplazamiento, emisor.emplazamiento);
      if (angulo === null && patron !== 'OMNI') {
        reservas.push('el micrófono no tiene orientación cargada: el ángulo no entra en la cuenta');
      }
      // **Un rango tan ancho no informa, aunque no sea el centinela exacto.** La
      // primera versión comparaba contra `{0, 180}` con igualdad, así que un
      // `[0, 172,9]` --el mismo caso físico, apenas recortado-- se escapaba sin
      // reserva. `rangoInutil` del dominio existe justamente para esto y no se
      // lo estaba llamando. Lo encontró una auditoría.
      if (angulo !== null && rangoInutil(angulo, ANCHO_ANGULAR_QUE_NO_INFORMA)) {
        reservas.push('el ángulo es tan incierto que no dice nada: están más cerca que su propia incertidumbre');
      }

      const llegaPorElEnvio = llegaPorEnvio(porEnvio, emisor, captacion, canalDe);
      if (llegaPorElEnvio === null) {
        reservas.push('no se sabe si este micrófono llega a ese monitor: falta el canal o el estado de la consola');
      } else if (emisor.bus.tipo !== 'AUX') {
        // **Que no haya envío que consultar no es saber más, es saber menos.**
        // Sin esta reserva, una caja de sala salía como la pareja más limpia
        // del informe --sin una sola advertencia-- mientras la cuña, de la que
        // sí se sabe algo, llevaba la suya escrita. La falta de dato se mostraba
        // al revés. Lo encontró una auditoría.
        reservas.push('sale por el general, así que le llega a todo canal abierto; cuánto le llega no se sabe');
      }

      parejas.push({
        emisor,
        captacion,
        distanciaM: distancia,
        anguloEnElMicrofono: angulo,
        nuloDelPatronGrados: NULO_DEL_PATRON_GRADOS[patron],
        exposicion: exposicionDe(distancia, patron, angulo),
        llegaPorElEnvio,
        reservas,
      });
    }
  }
  // **Las que no llegan por el envío se van, no bajan de puesto.** Un
  // micrófono que no se manda a ese monitor no cierra lazo por ahí, y dejarlo
  // en la lista con poco peso invita a mirarlo cuando no hay nada que mirar.
  return parejas.filter((p) => p.llegaPorElEnvio !== false);
}

function llegaPorEnvio(
  porEnvio: ReadonlyMap<string, boolean>,
  emisor: Emisor,
  captacion: ElementoCaptacion,
  canalDe: CanalDeCaptacion,
): boolean | null {
  // El general no sale de un auxiliar: no hay envío que consultar, y la energía
  // le llega a todo canal que esté abierto. Se informa como que llega.
  if (emisor.bus.tipo !== 'AUX') return true;
  const canal = canalDe(captacion);
  if (canal === null) return null;
  return porEnvio.get(`${canal}:${emisor.bus.indice}`) ?? null;
}

/** Si dos rangos se tocan, aunque sea en un punto. */
function seSolapan(a: Rango, b: Rango): boolean {
  return a.min <= b.max && b.min <= a.max;
}

/**
 * Ordena las parejas y dice, para cada una, de cuáles no se la puede separar.
 *
 * El orden es por el **techo** del rango: es la pregunta que importa —cuál
 * puede ser la peor—, y ordenar por el piso respondería otra. Con techos
 * iguales desempata el piso y después el nombre, para que el orden no dependa
 * de cómo llegaron las parejas a la lista.
 *
 * **El empate se mira de a pares, no en cadena.** Que A no se separe de B y B
 * no se separe de C no significa que A y C estén empatadas; encadenarlas hacía
 * que una sola pareja ancha destruyera el orden de todas las demás.
 */
export function ordenDeExposicion(parejas: readonly ParejaExpuesta[]): readonly ParejaEnSuPuesto[] {
  const ordenadas = [...parejas].sort((a, b) => {
    const porTecho = b.exposicion.rango.max - a.exposicion.rango.max;
    if (porTecho !== 0) return porTecho;
    const porPiso = b.exposicion.rango.min - a.exposicion.rango.min;
    if (porPiso !== 0) return porPiso;
    return nombreDePareja(a).localeCompare(nombreDePareja(b));
  });
  return ordenadas.map((p) => ({
    pareja: p,
    empatadaCon: ordenadas
      .filter((q) => q !== p && seSolapan(p.exposicion.rango, q.exposicion.rango))
      .map(nombreDePareja),
  }));
}

/** Qué dice la geometría frente a lo que dijo el analizador. */
export type Veredicto =
  /** Los dos caminos señalan el mismo canal. */
  | { readonly tipo: 'SE_CONFIRMAN'; readonly canal: number }
  /**
   * Señalan canales distintos. **No dice cuál tiene razón**: dice que un dato
   * registrado está mal, y cuáles pueden ser.
   */
  | { readonly tipo: 'SE_CONTRADICEN'; readonly segunElAnalizador: number; readonly segunLaGeometria: number }
  /** No hay con qué comparar. */
  | { readonly tipo: 'SIN_GEOMETRIA' }
  | { readonly tipo: 'SIN_SOSPECHOSO' }
  /**
   * El escalón más alto apunta a **más de un canal**: la geometría no separa,
   * así que no puede ni confirmar ni contradecir.
   *
   * No es lo mismo que tener más de una pareja arriba: tres parejas del mismo
   * escalón que resuelven al mismo canal sí confirman, porque el canal es lo
   * que se está comparando. `cuantas` cuenta canales, no parejas — el docblock
   * decía parejas y una auditoría lo corrigió.
   */
  | { readonly tipo: 'EMPATE'; readonly cuantas: number };

/**
 * Compara los dos caminos.
 *
 * **Un desacuerdo no es un fallo del método, es el método funcionando.** Todo
 * el valor de tener dos caminos independientes está en que puedan discrepar: si
 * discrepan, hay un dato registrado que no es cierto, y sin esto no habría cómo
 * enterarse.
 */
/**
 * **Hoy no lo llama ninguna pantalla, y hay que decirlo.**
 *
 * Comparar los dos caminos necesita el canal que sospecha el analizador, y eso
 * vive en la pantalla del espectro, que todavía no conoce el escenario. Está
 * escrito y probado acá porque es la justificación entera del módulo; conectarlo
 * es una tarea propia. Mientras tanto, la pantalla del escenario muestra el
 * orden pero no lo contrasta con nada.
 */
export function compararCaminos(
  orden: readonly ParejaEnSuPuesto[],
  canalSospechado: number | null,
  canalDeLaPareja: (p: ParejaExpuesta) => number | null,
): Veredicto {
  if (canalSospechado === null) return { tipo: 'SIN_SOSPECHOSO' };
  const primero = orden[0];
  if (primero === undefined) return { tipo: 'SIN_GEOMETRIA' };
  // La de arriba y todas las que no se pueden separar de ella. **Sólo ésas**:
  // encadenar traía parejas que no se solapan con la primera y ensuciaba el
  // veredicto con canales que la geometría sí distinguía.
  const empatadas = new Set([nombreDePareja(primero.pareja), ...primero.empatadaCon]);
  const canales = new Set(
    orden.filter((x) => empatadas.has(nombreDePareja(x.pareja)))
      .map((x) => canalDeLaPareja(x.pareja))
      .filter((c): c is number => c !== null));
  if (canales.size === 0) return { tipo: 'SIN_GEOMETRIA' };
  if (canales.size > 1) return { tipo: 'EMPATE', cuantas: canales.size };
  const segunLaGeometria = [...canales][0]!;
  return segunLaGeometria === canalSospechado
    ? { tipo: 'SE_CONFIRMAN', canal: canalSospechado }
    : { tipo: 'SE_CONTRADICEN', segunElAnalizador: canalSospechado, segunLaGeometria };
}
