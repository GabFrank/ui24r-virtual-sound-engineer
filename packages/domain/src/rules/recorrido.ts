import type { ChannelAssignment } from '../entities/musical.ts';
import type { FuenteId, Instrumento } from '../data/instrumentos.ts';
import type { ChannelAssignmentId } from '../ids.ts';

/**
 * El recorrido guiado: en qué orden se ajusta la banda, y qué se ajusta de cada
 * instrumento.
 *
 * **Qué está respaldado y qué decidí yo**, que es la parte que hay que leer.
 * `docs/orden-del-soundcheck.md` tiene el detalle; el resumen:
 *
 * - La tabla de familias sale de **una sola fuente**, no de tres. Las otras dos
 *   no coinciden: una es sólo de batería y **contradice** el orden de toms y
 *   aéreos, y la otra tiene una secuencia distinta.
 * - **Esa fuente no da ningún motivo.** La primera versión de este docblock le
 *   atribuía a las tres un argumento sobre armar primero el cimiento de graves;
 *   una auditoría bajó las páginas y no está en ninguna con esa forma. Y el
 *   argumento ni siquiera explica la tabla: con ese criterio el bajo no iría en
 *   el puesto 5, detrás de los platos.
 * - Los puestos de la percusión afrolatina y de la línea **los decidí yo**. No
 *   salen de la tabla ni de ninguna fuente.
 *
 * **Y es una propuesta, no una imposición.** La fuente describe una banda de
 * rock, y un trío de cuerdas o un grupo de candombe no encajan. Por eso el orden
 * se puede reordenar: el arrastre no es un adorno, es cómo se corrige cuando la
 * plantilla no aplica.
 */

/**
 * Las seis etapas por instrumento, en el orden en que se tocan.
 *
 * **Sale de la misma fuente que la tabla de familias**, que publica ganancia,
 * fader, puerta, ecualizador, compresor y envíos. La primera versión ponía el
 * compresor **antes** del ecualizador —al revés que la fuente— y lo justificaba
 * con un razonamiento propio. Una auditoría lo señaló.
 *
 * El fader no es una etapa acá aunque la fuente lo liste: el recorrido ajusta el
 * canal, y el equilibrio entre canales es otra cosa.
 *
 * **Y los envíos van al final porque lo dice la fuente, no porque se sepa dónde
 * derivan.** Que manden lo que las etapas anteriores dejaron depende de si el
 * envío se toma antes o después del procesamiento, y eso **no está medido**: las
 * rutas tienen tanto `post` como `postproc`. Afirmarlo sería construir sobre una
 * ley sin medir.
 */
export type EtapaDeInstrumento =
  | 'GANANCIA'
  | 'PUERTA'
  | 'COMPRESOR'
  | 'ECUALIZADOR'
  | 'ENVIO_A_EFECTOS'
  | 'ENVIO_A_MONITORES';

export const ETAPAS_EN_ORDEN: readonly EtapaDeInstrumento[] = [
  'GANANCIA', 'PUERTA', 'ECUALIZADOR', 'COMPRESOR', 'ENVIO_A_EFECTOS', 'ENVIO_A_MONITORES',
];

/**
 * Si la ley que esa etapa necesita está medida contra la consola.
 *
 * **Es un dato y no una constante escrita a mano en la pantalla**, para que el
 * día que una ley se mida alcance con cambiar acá: si estuviera repartido, la
 * pantalla seguiría diciendo «sin medir» después de la medición, o peor, al
 * revés.
 *
 * Al 2026-09-11 sólo la ganancia está medida. Las otras cinco son tareas con el
 * usuario en la sala, y **el usuario decidió que se miden antes de la primera
 * entrega**: el recorrido no está pensado para convivir con etapas bloqueadas
 * para siempre.
 */
export const LEY_MEDIDA: Readonly<Record<EtapaDeInstrumento, boolean>> = {
  GANANCIA: true,
  PUERTA: false,
  COMPRESOR: false,
  ECUALIZADOR: false,
  ENVIO_A_EFECTOS: false,
  ENVIO_A_MONITORES: false,
};

/**
 * El puesto que ocupa cada familia en el orden propuesto.
 *
 * **Sólo siete de las trece salen de la tabla del documento**: bombo, bajo,
 * guitarra, teclado, flauta, voz y palabra. Las otras seis —cajón, djembe,
 * conga, maraca, shaker y línea— las decidí yo, y el documento las declara como
 * tales. La primera versión de este comentario decía que los números salían de
 * la tabla, a secas.
 *
 * No son consecutivos a propósito: dejan hueco para el redoblante, los toms y
 * los aéreos, que el catálogo no tiene. **Los vientos sí los tiene** —`FLAUTA`
 * está en el catálogo y en el puesto 70— y la primera versión de este comentario
 * decía lo contrario.
 *
 * **La tabla es total sobre las familias del catálogo**, así que no hay familia
 * conocida sin puesto. El único camino al puesto del final es que el catálogo no
 * haya podido clasificar la fuente: ahí no se sabe nada, y lo que no se sabe no
 * puede meterse en el medio del cimiento.
 */
export const PUESTO_POR_FUENTE: Readonly<Record<FuenteId, number>> = {
  // El cimiento de graves, que es lo que las fuentes ponen primero.
  BOMBO: 10,
  // Percusión afrolatina, del más grave al más agudo. **Esto no está en las
  // fuentes**: las tres describen una batería de rock y ninguna dice dónde va un
  // djembe. Es el principio que ellas dan aplicado a las familias que el
  // catálogo sí tiene, y el documento lo declara como decisión.
  CAJON: 15,
  DJEMBE: 20,
  CONGA: 25,
  MARACA: 30,
  SHAKER: 30,
  BAJO: 50,
  GUITARRA: 60,
  TECLADO: 70,
  FLAUTA: 70,
  // Una entrada de línea no toma aire de nadie. El catálogo la define como
  // «entrada de línea» y nada más: lo de «un instrumento que entra sin
  // micrófono» que decía antes es una extensión que el catálogo no dice --un
  // teclado por caja directa se clasifica `TECLADO`--.
  LINEA: 75,
  VOZ: 80,
  PALABRA: 80,
};

/**
 * El puesto de lo que el catálogo no supo clasificar: al final.
 *
 * **Y hoy eso incluye el redoblante, los toms y los aéreos**, que son las filas
 * 2, 3 y 4 del documento — el cimiento de una batería acústica. El catálogo no
 * tiene esas familias, así que una batería completa sale con medio kit detrás de
 * las voces. Está escrito en el documento y es una tarea, no un supuesto:
 * arreglarlo es agregar las familias al catálogo, que es decisión de producto.
 *
 * Para una banda de rock eso son uno o dos canales raros. Para un coro, una obra
 * de teatro o un grupo de percusión, **«al final» deja de ser un margen y pasa a
 * ser la propuesta entera**, y ahí el orden propuesto es el de canal disfrazado.
 */
export const PUESTO_DESCONOCIDO = 999;

/** Un instrumento del recorrido, con su canal y su puesto. */
export interface PasoDelRecorrido {
  readonly asignacionId: ChannelAssignmentId;
  readonly canal: number;
  readonly etiqueta: string;
  /** El puesto propuesto. Sirve para explicar por qué está donde está. */
  readonly puestoPropuesto: number;
}

/**
 * El orden que la aplicación propone, a partir de lo que ya está cargado.
 *
 * Dentro de una misma familia manda el número de canal. **No es la convención
 * de oficio** —que es de derecha a izquierda del escenario— porque eso necesita
 * saber dónde está cada fuente, y el escenario puede no estar cargado. El
 * número de canal es el único orden que existe siempre, y el usuario reordena
 * si le importa.
 */
export function ordenPropuesto(
  asignaciones: readonly ChannelAssignment[],
  instrumentoDe: (a: ChannelAssignment) => Instrumento | null,
): readonly PasoDelRecorrido[] {
  return [...asignaciones]
    .map((a) => ({
      asignacionId: a.id,
      canal: a.ui24rInputIndex as number,
      etiqueta: a.instrumento,
      puestoPropuesto: puestoDe(instrumentoDe(a)),
    }))
    .sort((x, y) => x.puestoPropuesto - y.puestoPropuesto || x.canal - y.canal);
}

function puestoDe(i: Instrumento | null): number {
  // **Sin `?? PUESTO_DESCONOCIDO` al final**, que era inalcanzable: la tabla es
  // un `Record` total sobre `FuenteId`, así que toda fuente clasificada tiene
  // puesto. Una auditoría lo probó borrándolo y ningún test cambió. Dejarlo
  // hacía parecer que había una defensa donde no hacía falta ninguna, y el
  // comentario que lo justificaba describía una rama que no puede ejecutarse.
  if (i === null || i.fuente === null) return PUESTO_DESCONOCIDO;
  return PUESTO_POR_FUENTE[i.fuente];
}

/**
 * Aplica el orden que el usuario guardó, y ubica lo que ese orden no menciona.
 *
 * **Lo que el orden guardado no menciona no desaparece.** Un canal agregado
 * después de guardar el orden —que es lo normal: se suma un micrófono a mitad
 * del soundcheck— no está en la lista, y dejarlo afuera lo sacaría del recorrido
 * sin decir nada. Va al final, que es donde va lo que todavía no se ordenó.
 */
export function aplicarOrdenGuardado(
  pasos: readonly PasoDelRecorrido[],
  ordenGuardado: readonly ChannelAssignmentId[],
): readonly PasoDelRecorrido[] {
  // **Gana la primera aparición, no la última.** `new Map` con duplicados se
  // queda con el último índice, así que un orden guardado con un identificador
  // repetido movía ese canal al final en vez de dejarlo donde el usuario lo
  // puso. Lo encontró una auditoría probando `[ch_1, ch_2, ch_1]`.
  const puesto = new Map<ChannelAssignmentId, number>();
  for (const [i, id] of ordenGuardado.entries()) if (!puesto.has(id)) puesto.set(id, i);
  return [...pasos].sort((a, b) => {
    const pa = puesto.get(a.asignacionId) ?? Number.MAX_SAFE_INTEGER;
    const pb = puesto.get(b.asignacionId) ?? Number.MAX_SAFE_INTEGER;
    // Empate significa que ninguno de los dos estaba en el orden guardado: se
    // conserva entre ellos el orden propuesto, que ya viene resuelto.
    return pa - pb;
  });
}

// --- Lo que la pantalla necesita, en una sola llamada -----------------------

/** El recorrido tal como se muestra: lo que se recorre y lo que quedó afuera. */
export interface RecorridoDeLaBanda {
  /** En el orden en que se recorren. */
  readonly pasos: readonly PasoDelRecorrido[];
  /**
   * Asignaciones que el usuario sacó, en el orden propuesto entre ellas.
   *
   * **No desaparecen.** Se muestran aparte para poder traerlas de vuelta: un
   * canal que se saca y no se ve más es un canal que se pierde.
   */
  readonly fuera: readonly PasoDelRecorrido[];
  /** Si el usuario tiene un orden propio guardado. */
  readonly ordenPropio: boolean;
}

/**
 * Arma el recorrido completo a partir del perfil de la banda.
 *
 * **Existe para que la pantalla no reordene por su cuenta.** Un auditor de
 * expectativas señaló, antes de que esto existiera, que una reimplementación en
 * el componente pasaría cualquier inspección a ojo y se desincronizaría en
 * silencio: `Array.prototype.sort` es estable, así que una copia empataría por
 * el orden de entrada mientras {@link ordenPropuesto} empata por número de
 * canal. Y el defecto se escondería, porque la lista de asignaciones ya suele
 * venir ordenada por canal.
 *
 * Con esta función, la pantalla llama y muestra. No hay dónde desincronizarse.
 */
export function recorridoDeLaBanda(
  asignaciones: readonly ChannelAssignment[],
  instrumentoDe: (a: ChannelAssignment) => Instrumento | null,
  ordenGuardado: readonly ChannelAssignmentId[] | null,
  fueraDelRecorrido: readonly ChannelAssignmentId[],
): RecorridoDeLaBanda {
  const propuesto = ordenPropuesto(asignaciones, instrumentoDe);
  const afuera = new Set(fueraDelRecorrido);
  const adentro = propuesto.filter((p) => !afuera.has(p.asignacionId));
  return {
    pasos: ordenGuardado === null ? adentro : aplicarOrdenGuardado(adentro, ordenGuardado),
    // Lo sacado conserva el orden propuesto entre sí: si el usuario lo trae de
    // vuelta, aparece donde le toca y no al final por haber estado afuera.
    fuera: propuesto.filter((p) => afuera.has(p.asignacionId)),
    ordenPropio: ordenGuardado !== null,
  };
}

/**
 * El orden que hay que guardar después de mover una fila.
 *
 * Devuelve `null` cuando **la fila volvió a donde estaba**: un arrastre de
 * desplazamiento neto cero no es un cambio, y escribirlo dejaría una escritura
 * por cada vez que alguien levanta una fila y la suelta. Es el mismo criterio
 * que el resto de la aplicación aplica a los formularios —escribir una letra y
 * borrarla no es un cambio—, traído al gesto.
 */
export function moverPaso(
  pasos: readonly PasoDelRecorrido[],
  desde: number,
  hasta: number,
): readonly ChannelAssignmentId[] | null {
  if (desde < 0 || desde >= pasos.length) return null;
  // Se recorta en vez de rechazar: soltar más allá del final es soltar al
  // final, que es lo que el dedo quiso decir.
  const destino = Math.min(Math.max(hasta, 0), pasos.length - 1);
  // **Una sola comprobación para dos casos**, y es a propósito. Cubre el
  // arrastre nulo --soltar donde se levantó-- y también el que el recorte
  // devuelve a su propio lugar, que es soltar la última fila más abajo del
  // final. Había una guarda aparte para el primero y un barrido de mutaciones
  // mostró que era inerte: con el rango ya validado arriba, `destino` no puede
  // diferir de `desde` cuando `hasta` vale `desde`. Se comprobó antes de
  // sacarla, que es lo que el protocolo pide.
  if (destino === desde) return null;
  const ids = pasos.map((p) => p.asignacionId);
  const [movido] = ids.splice(desde, 1);
  ids.splice(destino, 0, movido!);
  return ids;
}
