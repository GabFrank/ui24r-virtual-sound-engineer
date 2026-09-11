/**
 * Quién puede escribir cada parámetro. Implementa ADR-010.
 *
 * Esto no es documentación: es la regla que ejecuta el Safety Engine antes de
 * cada escritura. El músico que usa esto depende de sus monitores para tocar.
 * Un asistente que "ayuda" moviendo un envío de monitor lo deja sin referencia
 * en pleno show, y por eso los monitores son de la categoría que la aplicación
 * nunca escribe.
 *
 * Hay un test que enumera todas las rutas escribibles y verifica que ninguna
 * pertenezca a esa categoría.
 */

export type Owner =
  | 'CHANNEL_ASSISTANT'
  | 'MIX_ASSISTANT'
  | 'ROOM_ASSISTANT'
  | 'SYSTEM'
  | 'USER_ONLY';

export type ParameterKind =
  | 'PREAMP_GAIN' | 'HPF' | 'CHANNEL_EQ' | 'COMPRESSOR' | 'GATE' | 'DEESSER'
  | 'CHANNEL_FADER' | 'CHANNEL_PAN'
  | 'OUTPUT_EQ' | 'OUTPUT_DELAY' | 'OUTPUT_POLARITY'
  | 'ANALYSIS_BUS_SEND' | 'PLAYER_MUTE' | 'PLAYER_FADER' | 'PLAYER_SEND'
  | 'PA_BUS_MUTE' | 'SNAPSHOT'
  | 'MONITOR_AUX_SEND' | 'MASTER_FADER' | 'MASTER_MUTE' | 'CHANNEL_MUTE'
  | 'PHANTOM' | 'OUTPUT_LIMITER' | 'FX' | 'SUBGROUP' | 'VCA' | 'AFS2'
  | 'MATRIX_SEND' | 'LINE_INPUT' | 'SAFE';

export interface OwnershipEntry {
  readonly kind: ParameterKind;
  readonly owner: Owner;
  /** Si la aplicación puede escribirlo alguna vez, en alguna versión. */
  readonly escribible: boolean;
  readonly nota: string;
  /**
   * La invariante que hay que citar al rechazar, cuando hay una más específica
   * que INV-008.
   *
   * INV-008 habla de propiedad en general y sirve de omisión. Pero la
   * alimentación fantasma tiene la suya, INV-007, y el identificador que viaja
   * al registro es lo que alguien lee después de un show para entender qué pasó:
   * mandarlo a la regla genérica es mandarlo a buscar al lugar equivocado.
   */
  readonly invariante?: string;
}

export const OWNERSHIP: readonly OwnershipEntry[] = [
  { kind: 'PREAMP_GAIN', owner: 'CHANNEL_ASSISTANT', escribible: true,
    nota: 'Solo en configuración de canal, y nunca con una toma de soundcheck activa' },
  { kind: 'HPF', owner: 'CHANNEL_ASSISTANT', escribible: true, nota: '' },
  { kind: 'CHANNEL_EQ', owner: 'CHANNEL_ASSISTANT', escribible: true, nota: '' },
  { kind: 'COMPRESSOR', owner: 'CHANNEL_ASSISTANT', escribible: true, nota: '' },
  { kind: 'GATE', owner: 'CHANNEL_ASSISTANT', escribible: true, nota: '' },
  { kind: 'DEESSER', owner: 'CHANNEL_ASSISTANT', escribible: true, nota: '' },

  { kind: 'CHANNEL_FADER', owner: 'MIX_ASSISTANT', escribible: true, nota: '' },
  { kind: 'CHANNEL_PAN', owner: 'MIX_ASSISTANT', escribible: true, nota: '' },

  { kind: 'OUTPUT_EQ', owner: 'ROOM_ASSISTANT', escribible: true,
    nota: 'Solo sobre buses declarados en el perfil de amplificación, y solo atenuaciones' },
  { kind: 'OUTPUT_DELAY', owner: 'ROOM_ASSISTANT', escribible: false,
    nota: 'Solo lectura hasta la fase de alineación' },
  { kind: 'OUTPUT_POLARITY', owner: 'ROOM_ASSISTANT', escribible: false,
    nota: 'Solo lectura hasta la fase de alineación' },

  { kind: 'ANALYSIS_BUS_SEND', owner: 'SYSTEM', escribible: true,
    nota: 'Único routing que la aplicación escribe' },
  { kind: 'PLAYER_MUTE', owner: 'SYSTEM', escribible: true, nota: 'Solo dentro de la reserva' },
  { kind: 'PLAYER_FADER', owner: 'SYSTEM', escribible: true, nota: 'Solo dentro de la reserva' },
  { kind: 'PLAYER_SEND', owner: 'SYSTEM', escribible: true,
    nota: 'Solo hacia menos infinito y solo dentro de la reserva' },
  { kind: 'PA_BUS_MUTE', owner: 'SYSTEM', escribible: true,
    nota: 'Solo durante medición por componente, con restauración garantizada' },
  { kind: 'SNAPSHOT', owner: 'SYSTEM', escribible: true, nota: 'Solo el prefijo propio' },

  { kind: 'MONITOR_AUX_SEND', owner: 'USER_ONLY', escribible: false,
    nota: 'El músico depende de sus monitores para tocar' },
  { kind: 'MASTER_FADER', owner: 'USER_ONLY', escribible: false, nota: '' },
  { kind: 'MASTER_MUTE', owner: 'USER_ONLY', escribible: false, nota: '' },
  { kind: 'CHANNEL_MUTE', owner: 'USER_ONLY', escribible: false, nota: '' },
  // **La invariante específica, para que el registro no mande a buscar al lugar
  // equivocado.** Todo lo que es `USER_ONLY` se rechaza por INV-008, que habla
  // de propiedad en general; la alimentación fantasma tiene la suya —INV-007—
  // y es la que hay que leer después de un show. Un arreglo del 2026-09-10
  // afirmó en cuatro lugares que ya se citaba INV-007 y **no era cierto**: el
  // identificador estaba cableado en el motor. Lo encontró una auditoría.
  { kind: 'PHANTOM', owner: 'USER_ONLY', escribible: false, invariante: 'INV-007',
    nota: 'La aplicación solo lee. Además es un botón físico en la interfaz de audio' },
  { kind: 'OUTPUT_LIMITER', owner: 'USER_ONLY', escribible: false,
    nota: 'Protege el sistema de amplificación: no se automatiza' },
  { kind: 'FX', owner: 'USER_ONLY', escribible: false, nota: 'Fuera de alcance' },
  // **El envío a la matriz es del usuario y no se escribe.** La matriz sale a
  // conectores que la aplicación no puede ver: un envío de retorno, una zona,
  // una grabación. Tocarla a ciegas es mandar señal a un sitio desconocido.
  { kind: 'MATRIX_SEND', owner: 'USER_ONLY', escribible: false,
    nota: 'La matriz sale a destinos que la aplicación no puede ver' },
  // **Una entrada de línea es un canal, y aun así no se escribe.**
  //
  // El 2026-09-11 se clasificaron reutilizando las categorías de canal, porque
  // el strip es idéntico. Eso las nombró **y las abrió**: una auditoría midió
  // que 44 rutas de `l.*` pasaron a estar permitidas, incluida `l.0.mix` — el
  // fader exacto que estuvo a 0 dB metiendo un tono del Bluetooth en el general
  // durante dos días. El commit que arreglaba «la aplicación no sabe qué entra
  // al general» habilitó a la aplicación a moverlo.
  //
  // **Clasificar no es autorizar**, y se habían confundido las dos cosas. Con
  // categoría propia se conserva lo que se buscaba —que el registro diga
  // «entrada de línea del usuario» en vez de «ruta desconocida»— sin conceder
  // permiso. Que la aplicación deba poder mezclar una entrada de línea es una
  // decisión de producto que nadie tomó.
  { kind: 'LINE_INPUT', owner: 'USER_ONLY', escribible: false,
    nota: 'Lo que entra por las RCA lo decide el usuario: la aplicación solo lo lee' },
  // **El «safe» decide qué NO toca una recuperación de instantánea.**
  //
  // Es una decisión del operador sobre su propia red de seguridad: marcar un
  // canal como protegido significa «pase lo que pase, esto no me lo muevan».
  // Que la aplicación lo escribiera sería desarmarle el paracaídas sin avisar.
  //
  // Y es lo contrario de lo que necesita el punto de retorno de INV-001: cuanto
  // más haya marcado, **menos devuelve** una recuperación. Se lee para poder
  // decirlo; no se escribe nunca.
  { kind: 'SAFE', owner: 'USER_ONLY', escribible: false,
    nota: 'La red de seguridad del operador: la aplicación la lee y no la toca' },
  { kind: 'SUBGROUP', owner: 'USER_ONLY', escribible: false, nota: 'Fuera de alcance' },
  { kind: 'VCA', owner: 'USER_ONLY', escribible: false, nota: 'Fuera de alcance' },
  { kind: 'AFS2', owner: 'USER_ONLY', escribible: false,
    nota: 'La supresión de realimentación es un procedimiento manual' },
];

const PORKIND = new Map(OWNERSHIP.map((e) => [e.kind, e]));

export function ownership(kind: ParameterKind): OwnershipEntry {
  const e = PORKIND.get(kind);
  if (!e) throw new Error(`parámetro sin propiedad declarada: ${kind}`);
  return e;
}

export function esEscribible(kind: ParameterKind): boolean {
  return ownership(kind).escribible;
}

/** Todos los parámetros que la aplicación nunca escribe. */
export function parametrosSoloDelUsuario(): readonly ParameterKind[] {
  return OWNERSHIP.filter((e) => e.owner === 'USER_ONLY').map((e) => e.kind);
}
