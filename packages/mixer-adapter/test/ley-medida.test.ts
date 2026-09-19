import { test } from 'node:test';
import { strictEqual } from 'node:assert/strict';
import { entrada } from '../src/raw-map.ts';
import { ETAPAS_EN_ORDEN, LEY_MEDIDA, type EtapaDeInstrumento } from '@vse/domain';

/**
 * La tabla que le dice al recorrido qué etapas tienen ley, contra la tabla
 * donde las leyes viven.
 *
 * **Por qué existe.** `LEY_MEDIDA` prometía en su docblock que «el día que una
 * ley se mida alcance con cambiar acá». Se midió el envío a monitor el
 * 2026-09-13 y el ecualizador entero el 2026-09-16, y nadie cambió acá: la
 * pantalla del recorrido dijo «sin medir» sobre dos etapas medidas hasta el
 * 2026-09-17. El dominio no puede importar el adaptador, así que la comparación
 * vive de este lado, que ve las dos.
 *
 * **Qué compara.** Por cada etapa, UNA ruta representativa: la que la etapa
 * necesita para actuar. Si esa ruta no está en `RAW_MAP`, la etapa no puede
 * estar medida. Si está, la etapa está medida exactamente cuando la ruta está
 * `PROBADO`.
 */
const RUTA_QUE_DECIDE: Readonly<Record<Exclude<EtapaDeInstrumento, 'GANANCIA'>, string>> = {
  // El umbral, no la profundidad: es lo que la etapa mueve para que la puerta
  // deje pasar la fuente y no la filtración. La profundidad está medida (ítem
  // 120) y no alcanza sola.
  PUERTA: 'i.N.gate.thresh',
  COMPRESOR: 'i.N.dyn.threshold',
  // La ganancia de la banda 1, que es la que el motor puede usar: está en dB
  // como el tope de su kind. Las cuatro bandas comparten la ley (ítem 113).
  ECUALIZADOR: 'i.N.eq.b1.gain',
  ENVIO_A_EFECTOS: 'i.N.fx.M.value',
  ENVIO_A_MONITORES: 'i.N.aux.M.value',
};

test('LEY_MEDIDA dice lo mismo que RAW_MAP, etapa por etapa', () => {
  for (const etapa of ETAPAS_EN_ORDEN) {
    // La ganancia de entrada no vive en RAW_MAP: su tabla escalonada está en
    // `conversiones.ts`, verificada contra la pantalla de la consola. Queda
    // fuera de esta comparación a propósito y con el motivo escrito.
    if (etapa === 'GANANCIA') continue;
    const ruta = RUTA_QUE_DECIDE[etapa];
    const e = entrada(ruta);
    const medida = e !== undefined && e.estado === 'PROBADO';
    strictEqual(LEY_MEDIDA[etapa], medida,
      `${etapa}: RAW_MAP dice que ${ruta} está ${e ? e.estado : 'AUSENTE'}, `
      + `y LEY_MEDIDA dice ${LEY_MEDIDA[etapa]}. La pantalla del recorrido le miente al usuario.`);
  }
});
