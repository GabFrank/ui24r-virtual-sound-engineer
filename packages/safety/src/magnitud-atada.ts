/**
 * Que la magnitud que el motor juzga sea la que va al cable.
 *
 * **El agujero que esto cierra, y lo que costó dejarlo abierto.** `CambioPropuesto`
 * trae dos cosas: el **crudo** que se escribe en la consola (`valorPropuesto`) y
 * la **magnitud** en unidades físicas que el motor juzga (`magnitudPropuesta`).
 * Nada las ataba. `limits.ts` lo declaraba con todas las letras:
 *
 * > *«nada ata `magnitudPropuesta` al `valorPropuesto` que va al cable. El motor
 * > juzga lo que el llamador declara.»*
 *
 * Una auditoría de seguridad lo demostró midiendo: **una escritura de recorrido
 * completo, crudo 0 a 1, aprobada bajo un techo de −6 dB declarando magnitudes
 * −31 a −30.** El motor miró los decibeles declarados, los encontró razonables, y
 * dejó pasar el recorrido entero del parámetro.
 *
 * **Por qué no se podía cerrar antes, y por qué ahora sí.** Atar la magnitud al
 * crudo necesita la **ley de conversión verificada contra el aparato**, y hasta el
 * 2026-09-13 no había ninguna: `RAW_MAP` estaba entera en `DESCONOCIDO` o
 * `INFERIDO`, y `rutasProbadas()` devolvía la lista vacía. La medición 101 midió
 * dos leyes del ecualizador contra el filtro real y las dejó en `PROBADO`. Desde
 * ahí, para esas rutas, la pregunta «¿el crudo y la magnitud dicen lo mismo?»
 * tiene respuesta.
 *
 * **Lo que esto NO cierra, y hay que decirlo.** Sólo las rutas con la ley
 * verificada quedan atadas. Para el resto el motor sigue juzgando lo que el
 * llamador declara, y eso no mejora por sí solo: mejora cuando alguien mide. Lo
 * que sí cambia es que **ahora la diferencia es visible**: esta función informa
 * cuál de los dos casos aplica, y el motor lo registra.
 */
import { entrada, type RawMapEntry } from '@vse/mixer-adapter';

/**
 * Cuánto puede apartarse la magnitud declarada de la que el crudo implica.
 *
 * **Un uno por ciento del recorrido físico de la entrada, no un número fijo.** Un
 * absoluto no sirve: 0,5 sería enorme para un Q que va de 0,37 a 2,71 y ridículo
 * para una frecuencia que va de 115 a 10 900 Hz. La tolerancia tiene que escalar
 * con lo que se mide.
 *
 * No es la precisión de la medición: es la holgura para el redondeo de quien
 * construye el cambio. Un llamador que se aparte más que esto no redondeó, se
 * equivocó de unidad o de valor.
 */
const TOLERANCIA_RELATIVA = 0.01;

export type ResultadoAtadura =
  | {
      readonly atada: true;
      /** La magnitud que el crudo implica, según la ley medida. */
      readonly magnitudDelCrudo: number;
      readonly unidad: string;
    }
  | {
      readonly atada: false;
      readonly codigo: 'SIN_LEY_VERIFICADA';
      readonly motivo: string;
    }
  | {
      readonly atada: false;
      readonly codigo: 'MAGNITUD_NO_COINCIDE' | 'UNIDAD_NO_COINCIDE' | 'MAGNITUD_NO_NUMERICA';
      readonly motivo: string;
      readonly magnitudDelCrudo: number;
    };

/**
 * ¿La magnitud declarada es la que el crudo produce?
 *
 * Devuelve `SIN_LEY_VERIFICADA` cuando no hay con qué contestar. **Eso no es un
 * rechazo**: es la declaración honesta de que para esa ruta el motor sigue
 * juzgando lo que le dicen. Quien llame decide qué hacer con eso; lo que no puede
 * es no enterarse.
 */
export function verificarAtadura(
  path: string,
  valorPropuesto: number,
  magnitudPropuesta: number,
  unidad: string,
): ResultadoAtadura {
  const e: RawMapEntry | undefined = entrada(path);
  if (e === undefined) {
    return {
      atada: false,
      codigo: 'SIN_LEY_VERIFICADA',
      motivo: `${path} no está en la tabla de conversión: no hay con qué atar la `
        + 'magnitud al crudo, y el motor juzga lo que el llamador declara',
    };
  }
  if (e.estado !== 'PROBADO') {
    return {
      atada: false,
      codigo: 'SIN_LEY_VERIFICADA',
      motivo: `${path} tiene estado ${e.estado} (${e.spike}): su ley no está medida `
        + 'contra el aparato, así que la magnitud no se puede atar al crudo',
    };
  }
  if (unidad !== e.unidad) {
    return {
      atada: false,
      codigo: 'UNIDAD_NO_COINCIDE',
      motivo: `${path} se mide en ${e.unidad} y el cambio declara ${unidad}`,
      magnitudDelCrudo: e.fromRaw(valorPropuesto),
    };
  }
  const magnitudDelCrudo = e.fromRaw(valorPropuesto);
  const recorrido = Math.abs(e.fisicoMax - e.fisicoMin);
  const holgura = recorrido * TOLERANCIA_RELATIVA;
  // **`NaN` decía «atada» y no lo estaba, que es justo lo contrario de para lo
  // que existe esta función.** Toda comparación con `NaN` es falsa, así que
  // `Math.abs(NaN - x) > holgura` da `false` y el `return` de abajo no se
  // ejecuta: la guarda que comprueba que el motor juzgue el mismo número que va
  // al cable aprobaba **cualquier crudo** con tal de que la magnitud declarada
  // no fuera un número. Es la misma forma que el tope de INV-004 tenía en
  // `verificarLimite` y se cerró el mismo día.
  //
  // **Va como su propio código y no como `MAGNITUD_NO_COINCIDE`**, porque no es
  // que los dos números difieran: es que uno no es un número, y el mensaje que
  // le sirve a quien lo lee es distinto.
  //
  // **Y cubre más que `NaN`, a diferencia de la guarda gemela de `limits.ts`.**
  // Acá se pide un número **finito**, así que ±Infinity --que antes caía en
  // `MAGNITUD_NO_COINCIDE`-- ahora cae en éste. Es un cambio de código de
  // rechazo, no de veredicto: los dos rechazan. El commit que introdujo esta
  // guarda dijo «sólo se tapó NaN» y para esta función no era exacto; lo marcó
  // una auditoría de fidelidad el mismo día. La distinción importa para la pieza
  // siguiente de ADR-034, que es justamente el borde de −∞: cuando llegue, va a
  // tener que pasar por acá con su propio nombre.
  if (typeof magnitudPropuesta !== 'number' || !Number.isFinite(magnitudPropuesta)) {
    return {
      atada: false,
      codigo: 'MAGNITUD_NO_NUMERICA',
      motivo: `${path}: el cambio declara ${String(magnitudPropuesta)} ${unidad}, que no es `
        + 'un número finito. No se puede atar al crudo lo que no se puede comparar',
      magnitudDelCrudo,
    };
  }
  if (Math.abs(magnitudDelCrudo - magnitudPropuesta) > holgura) {
    return {
      atada: false,
      codigo: 'MAGNITUD_NO_COINCIDE',
      motivo: `${path}: el crudo ${valorPropuesto} produce ${magnitudDelCrudo.toFixed(3)} `
        + `${e.unidad} y el cambio declara ${magnitudPropuesta} ${unidad}. `
        + `La diferencia supera la holgura de ${holgura.toFixed(3)} ${e.unidad}, que es `
        + 'el 1 % del recorrido: el motor estaría juzgando un número distinto del que '
        + 'va al cable',
      magnitudDelCrudo,
    };
  }
  return { atada: true, magnitudDelCrudo, unidad: e.unidad };
}
