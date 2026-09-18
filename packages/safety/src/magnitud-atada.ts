/**
 * Que los dos extremos del movimiento que el motor juzga sean los de verdad.
 *
 * **Son dos, y durante meses se ató uno.** Un cambio declara de dónde viene el
 * parámetro y a dónde va; los topes de INV-004 acotan la resta. Que el destino
 * sea honesto no alcanza si el punto de partida es libre: una auditoría lo midió
 * el 2026-09-17 y **un salto de 31 dB en la cuña de un músico pasaba el tope de
 * 2 dB por paso declarando que venía de un decibel más abajo**. Ver
 * `verificarAtaduraDelOrigen`, que es el eslabón que faltaba.
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
    }
  | {
      /**
       * El crudo no es un número finito, así que no hay de qué atar.
       *
       * **No trae `magnitudDelCrudo` a propósito**: no existe. Devolverlo como
       * `NaN` sería ofrecer un número que no lo es, y es exactamente el descuido
       * que este código existe para cerrar.
       */
      readonly atada: false;
      readonly codigo: 'CRUDO_NO_NUMERICO';
      readonly motivo: string;
    };


/**
 * Cuál de los dos extremos del movimiento se está atando.
 *
 * **Los dos extremos hacen falta y durante meses se ató uno solo.** Un cambio
 * declara de dónde viene el parámetro y a dónde va; el motor juzga el
 * movimiento, que es la resta de los dos. Atar sólo el destino deja la resta
 * apoyada en un número libre, y una auditoría lo midió: **un salto de 31 dB en
 * la cuña de un músico pasa el tope de 2 dB por paso con sólo declarar que
 * venía de un decibel más abajo.**
 *
 * El extremo no cambia la cuenta —es la misma ley, la misma holgura— pero sí
 * cambia **qué le pasa al usuario si falla**, y por eso cambia el mensaje. Un
 * destino mal declarado hace que el motor juzgue un número distinto del que va
 * al cable. Un origen mal declarado hace que el motor mida el movimiento desde
 * un punto donde el parámetro no está: el destino es honesto y el salto, no.
 */
export type ExtremoDelMovimiento = 'destino' | 'origen';

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
  return atar(path, valorPropuesto, magnitudPropuesta, unidad, 'destino');
}

/**
 * ¿El punto de partida declarado es el que produce el crudo de partida?
 *
 * **Lo que ata, y dónde cierra la cadena, que no es acá.** Los dos números que
 * esta función compara los declara **el mismo llamador**: esto no lee la
 * consola, y mentirlos los dos de forma coherente pasa. Quien ata el crudo a la
 * realidad es el adaptador, y **después** del veredicto: compara `valorEsperado`
 * contra el estado confirmado justo antes de enviar y devuelve `CONFLICT` sin
 * escribir (INV-011, `coincideConEsperado`).
 *
 * Así que la garantía hay que enunciarla sobre el cable y no sobre el veredicto:
 * **ninguna escritura sale con el movimiento mal medido.** O el origen declarado
 * es el de verdad —y entonces esto comprueba sus decibeles— o no lo es, y la
 * escritura no sale. Lo que cerró este paso es el hueco entre las dos: crudo de
 * partida verdadero para que el adaptador lo acepte, decibeles de partida falsos
 * para que el motor mida mal. Eso pasaba entero.
 *
 * **Y hoy importa más que cuando la auditoría lo encontró.** ADR-034 suspende el
 * presupuesto acumulado mientras una cuña no tiene nivel establecido —sin eso no
 * se puede levantar un retorno desde el piso—, así que durante toda la subida
 * **el tope por paso es el único freno sobre la brusquedad**. Un freno que se
 * corre declarando de dónde venía no es un freno.
 *
 * **Y el freno sigue sin ser exacto, porque atar es comparar con tolerancia.**
 * La tolerancia es el 1 % del recorrido —0,4214 dB en el envío a monitor— y
 * **se cobra en los dos extremos**: el origen declarado un poco más arriba y el
 * destino un poco más abajo suman. Medido con el motor: un paso real de
 * **2,84 dB pasa por uno de 2**, 2,85 no. O sea 0,84 dB de juego, un 42 % sobre
 * el tope.
 *
 * **La primera redacción de este párrafo dijo 2,42 y estaba mal**, porque midió
 * sesgando un solo extremo; lo corrigió una auditoría adversarial el mismo día.
 * Y hay que decir la comparación honesta: **antes de esta guarda el margen no
 * era 0,84 dB, era ilimitado** —el origen no estaba atado a nada y se podía
 * declarar cualquier cosa—. Esto no deja el tope exacto, lo deja acotado.
 *
 * Es la misma holgura que la auditoría del 2026-09-17 le encontró al techo de
 * nominal, y acá pesa más: allá acota dónde se termina, acá cuán brusco es cada
 * paso, y es el único freno que rige durante la rampa.
 *
 * Las mismas dos advertencias que el destino: `SIN_LEY_VERIFICADA` no es un
 * rechazo, y sólo quedan atadas las rutas cuya ley está medida contra el
 * aparato. **La ganancia del previo no la tiene** —su ruta, `hw.N.gain`, no
 * figura en `RAW_MAP`— y es el único parámetro que la aplicación mueve hoy de
 * punta a punta: ahí esta guarda se aparta entera.
 */
export function verificarAtaduraDelOrigen(
  path: string,
  valorEsperado: number,
  magnitudEsperada: number,
  unidad: string,
): ResultadoAtadura {
  return atar(path, valorEsperado, magnitudEsperada, unidad, 'origen');
}

/**
 * La cuenta, una sola vez para los dos extremos.
 *
 * **Vive sola a propósito.** La trampa de «la misma regla implementada dos
 * veces» ya mordió en este repositorio —el adaptador calculaba bien la conexión
 * inestable y la interfaz tenía una segunda copia rota— y acá el riesgo es el
 * mismo: dos guardas que tienen que decidir igual y envejecen por separado.
 * Lo único que se ramifica es el texto.
 */
function atar(
  path: string,
  crudo: number,
  magnitud: number,
  unidad: string,
  extremo: ExtremoDelMovimiento,
): ResultadoAtadura {
  const e: RawMapEntry | undefined = entrada(path);
  if (e === undefined) {
    return {
      atada: false,
      codigo: 'SIN_LEY_VERIFICADA',
      motivo: `${path} no está en la tabla de conversión: no hay con qué atar la `
        + `magnitud ${extremo === 'origen' ? 'de partida ' : ''}al crudo, y el motor `
        + 'juzga lo que el llamador declara',
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
      magnitudDelCrudo: e.fromRaw(crudo),
    };
  }
  // **El crudo también tiene que ser un número, y esta guarda faltaba el día
  // que se escribió la del origen.** Es el mismo `NaN` que ya se tapó dos veces
  // en este repositorio —en `verificarLimite` y acá mismo, sobre la magnitud— y
  // se volvió a dejar abierto **en el otro operando del mismo `if`**: con el
  // crudo en `NaN`, `fromRaw` da `NaN`, `Math.abs(NaN - x) > holgura` es `false`
  // y la función devolvía `atada: true`.
  //
  // **Una auditoría adversarial lo midió de punta a punta el 2026-09-17**, con
  // el ejecutor de transacciones real: declarando `valorEsperado: NaN` y un
  // movimiento de 1 dB, la cuña se movió **31 dB de verdad**, la transacción
  // quedó `APLICADA` y la escritura salió al cable. O sea el mismo salto que la
  // atadura del origen existe para cerrar, entrando por el operando de al lado.
  //
  // **Y no lo frenaba el adaptador**, porque `coincideConEsperado` tiene hoy la
  // misma forma: `Math.abs(e.valor - esperado) > tolerancia` con `NaN` da
  // `false` y contesta que coincide. Eso es de INV-011 y de otro paquete, así
  // que queda anotado como tarea aparte; **lo que hace que no esté expuesto es
  // esta guarda**, porque nada llega al adaptador sin pasar por el motor.
  if (typeof crudo !== 'number' || !Number.isFinite(crudo)) {
    return {
      atada: false,
      codigo: 'CRUDO_NO_NUMERICO',
      motivo: `${path}: el ${extremo === 'origen' ? 'valor de partida' : 'valor a escribir'} `
        + `es ${String(crudo)}, que no es un número finito. No hay crudo del que sacar `
        + 'una magnitud, así que no hay nada que atar',
    };
  }
  const magnitudDelCrudo = e.fromRaw(crudo);
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
  //
  // **Y desde que el origen también se ata, este borde se alcanza por los dos
  // lados.** El silencio de una cuña es el crudo 0, y para el envío a monitor
  // `fromRaw(0)` es −∞: una cuña en silencio no tiene punto de partida en
  // decibeles que se pueda declarar. Ni un número finito --que no coincide-- ni
  // −∞ --que no es un número--: **desde el crudo 0 no hay ningún valor que esta
  // guarda acepte.**
  //
  // **Eso es un cambio de comportamiento, no de nombre, y la primera versión de
  // este comentario decía lo contrario.** Decía «es el mismo veredicto que daba
  // el tope por paso», y una auditoría de fidelidad lo midió y no lo es: un paso
  // declarado como chico desde el crudo 0 --−32 a −31-- **pasaba** y ahora se
  // rechaza. Que ahora se rechace es lo correcto, porque esa declaración era
  // falsa: el crudo 0 no son −32 dB, y lo que se escribía era un salto desde el
  // silencio disfrazado de pasito. Pero decir que el veredicto no cambió, con un
  // test de la propia suite que hubo que mover para que siguiera pasando, es
  // justamente la forma de error que este repositorio repite.
  //
  // **Y le cambia el trabajo a la pieza que sigue de ADR-034.** Antes, proponer
  // el primer paso desde el silencio necesitaba una excepción al tope por paso;
  // ahora necesita además un caso con nombre propio acá adentro, porque el
  // destino que el usuario eligió --arrancar en −32,14 dB, el punto más bajo que
  // se sabe escribir-- ya no se puede ni expresar desde el crudo 0. Hasta que
  // alguien lo construya, frenar es lo correcto: nadie sabe todavía proponerlo.
  if (typeof magnitud !== 'number' || !Number.isFinite(magnitud)) {
    return {
      atada: false,
      codigo: 'MAGNITUD_NO_NUMERICA',
      motivo: extremo === 'origen'
        ? `${path}: el cambio declara que venía de ${String(magnitud)} ${unidad}, que no `
          + 'es un número finito. Sin un punto de partida no hay movimiento que medir, '
          + 'y el movimiento es lo que los topes acotan'
        : `${path}: el cambio declara ${String(magnitud)} ${unidad}, que no es `
          + 'un número finito. No se puede atar al crudo lo que no se puede comparar',
      magnitudDelCrudo,
    };
  }
  if (Math.abs(magnitudDelCrudo - magnitud) > holgura) {
    return {
      atada: false,
      codigo: 'MAGNITUD_NO_COINCIDE',
      motivo: extremo === 'origen'
        ? `${path}: la consola tiene el crudo ${crudo}, que por la ley medida es `
          + `${magnitudDelCrudo.toFixed(3)} ${e.unidad}, y el cambio declara que venía `
          + `de ${magnitud} ${unidad}. La diferencia supera la holgura de `
          + `${holgura.toFixed(3)} ${e.unidad}, que es el 1 % del recorrido: el motor `
          + 'estaría midiendo el movimiento desde un punto donde el parámetro no está, '
          + 'y un salto grande pasaría por chico'
        : `${path}: el crudo ${crudo} produce ${magnitudDelCrudo.toFixed(3)} `
          + `${e.unidad} y el cambio declara ${magnitud} ${unidad}. `
          + `La diferencia supera la holgura de ${holgura.toFixed(3)} ${e.unidad}, que es `
          + 'el 1 % del recorrido: el motor estaría juzgando un número distinto del que '
          + 'va al cable',
      magnitudDelCrudo,
    };
  }
  return { atada: true, magnitudDelCrudo, unidad: e.unidad };
}
