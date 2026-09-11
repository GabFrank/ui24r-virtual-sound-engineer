import type { ChannelAssignment } from '../entities/musical.ts';
import type { FuenteId, Instrumento } from '../data/instrumentos.ts';
import type { ChannelAssignmentId } from '../ids.ts';

/**
 * El recorrido guiado: en qué orden se ajusta la banda, y qué se ajusta de cada
 * instrumento.
 *
 * **El orden propuesto no sale de la intuición de quien programa.** Está
 * respaldado en `docs/orden-del-soundcheck.md`, que cita tres fuentes de oficio
 * que coinciden familia por familia: primero el cimiento de graves, y todo lo
 * que viene después se equilibra contra lo que ya está puesto. Un instrumento
 * ajustado antes que su base se vuelve a tocar entero.
 *
 * **Y es una propuesta, no una imposición.** Las tres fuentes describen la misma
 * formación —batería, bajo, guitarras, teclados, voces— y un trío de cuerdas o
 * un grupo de candombe no encajan. Por eso el orden se puede reordenar y lo que
 * el usuario elija queda guardado: el arrastre no es un adorno, es cómo se
 * corrige cuando la plantilla no aplica.
 */

/**
 * Las seis etapas por instrumento, en el orden en que se tocan.
 *
 * El orden dentro del instrumento tampoco es libre: la ganancia va primero
 * porque todo lo demás se mide sobre lo que ella deja entrar, y los envíos van
 * al final porque mandan a otro lado lo que las etapas anteriores dejaron.
 */
export type EtapaDeInstrumento =
  | 'GANANCIA'
  | 'PUERTA'
  | 'COMPRESOR'
  | 'ECUALIZADOR'
  | 'ENVIO_A_EFECTOS'
  | 'ENVIO_A_MONITORES';

export const ETAPAS_EN_ORDEN: readonly EtapaDeInstrumento[] = [
  'GANANCIA', 'PUERTA', 'COMPRESOR', 'ECUALIZADOR', 'ENVIO_A_EFECTOS', 'ENVIO_A_MONITORES',
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
 * Los números salen de la tabla de `docs/orden-del-soundcheck.md`. No son
 * consecutivos a propósito: dejan hueco para familias que el catálogo todavía
 * no tiene —redoblante, toms, aéreos, vientos— sin tener que renumerar lo que
 * ya está.
 *
 * **Lo que no está en esta tabla va al final**, no al principio: una fuente que
 * el catálogo no clasificó es una de la que no se sabe nada, y lo que no se sabe
 * no puede meterse en el medio del cimiento.
 */
const PUESTO_POR_FUENTE: Readonly<Record<FuenteId, number>> = {
  BOMBO: 10,
  CAJON: 15,
  DJEMBE: 20,
  CONGA: 25,
  MARACA: 30,
  SHAKER: 30,
  BAJO: 50,
  GUITARRA: 60,
  TECLADO: 70,
  FLAUTA: 70,
  // La línea es una fuente grabada o un instrumento que entra sin micrófono:
  // no necesita el aire de nadie, así que su puesto no cambia el resto.
  LINEA: 75,
  VOZ: 80,
  PALABRA: 80,
};

/** El puesto de lo que el catálogo no supo clasificar: al final. */
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
  if (i === null || i.fuente === null) return PUESTO_DESCONOCIDO;
  return PUESTO_POR_FUENTE[i.fuente] ?? PUESTO_DESCONOCIDO;
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
  const puesto = new Map(ordenGuardado.map((id, i) => [id, i]));
  return [...pasos].sort((a, b) => {
    const pa = puesto.get(a.asignacionId) ?? Number.MAX_SAFE_INTEGER;
    const pb = puesto.get(b.asignacionId) ?? Number.MAX_SAFE_INTEGER;
    // Empate significa que ninguno de los dos estaba en el orden guardado: se
    // conserva entre ellos el orden propuesto, que ya viene resuelto.
    return pa - pb;
  });
}
