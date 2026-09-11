import type { ParameterKind } from '@vse/domain';

/**
 * Clasifica una ruta del protocolo en su clase de parámetro del dominio.
 *
 * Existe por un hueco concreto y grave. INV-008 e INV-010 están enunciadas
 * **sobre rutas** —«paths escribibles ∩ paths de AUX monitor = …»— pero el
 * motor de seguridad decidía con la clase que declaraba quien proponía el
 * cambio, sin ninguna atadura entre una cosa y la otra. Una auditoría lo
 * comprobó ejecutando el motor:
 *
 *     path 'i.3.aux.1.value', kind 'CHANNEL_FADER' → { permitido: true }
 *
 * Es decir: un envío a un auxiliar de monitor, etiquetado como fader de canal,
 * pasaba. La invariante que existe para que un asistente no deje al músico sin
 * monitores en pleno show era una comprobación de honestidad, no un guardia.
 * Bastaba un error de tipeo en un asistente futuro.
 *
 * Devuelve `null` cuando la ruta no se reconoce. Eso también es un rechazo:
 * escribir en una ruta que el dominio no sabe clasificar es escribir a ciegas.
 */

interface Patron {
  readonly re: RegExp;
  readonly kind: ParameterKind;
}

/**
 * El orden importa: los patrones más específicos van primero.
 *
 * `i.N.aux.M.value` tiene que evaluarse antes que cualquier patrón general de
 * entrada, porque es justamente el que no se escribe nunca.
 */
const PATRONES: readonly Patron[] = [

  // --- Los «safe», arriba de todo ---
  //
  // **Arriba de las familias a propósito**: `l.0.safe` es un safe antes que una
  // entrada de línea, e `i.3.safe` antes que un canal. El patrón de familia es
  // más ancho y lo agarraría primero — el mismo tropiezo que costó un fallo con
  // `s.2.mtx.0.pan`.
  //
  // Cincuenta claves en esta consola: 24 canales, 10 auxiliares, 6 subgrupos,
  // 4 efectos, 2 del reproductor, 2 de línea, el general, y
  // `var.unsaved.chsafes`.
  { re: /^[a-z]+\.?\d*\.safe$/, kind: 'SAFE' },
  { re: /^var\.unsaved\./, kind: 'SAFE' },

  // --- Envíos a la matriz, ARRIBA de las familias ---
  //
  // **El orden importa y costó un test.** `s.2.mtx.0.pan` lo agarraba
  // `/^s\.\d+\./` y salía `SUBGROUP`: el patrón de familia es más ancho y
  // estaba primero. Lo más específico va arriba.
  //
  // `<fuente>.mtx.<destino>.*`, medido el 2026-09-10: la alcanzan 19 fuentes
  // --los diez auxiliares, los seis subgrupos, el general y **sólo dos de los
  // veinticuatro canales**, `i.9` e `i.19`--. Son 400 claves que caían en «ruta
  // desconocida».
  //
  // **La matriz no es `hwoutaux.N.src`**, que es el jack físico y sigue sin
  // clasificar a propósito: mover eso manda señal a un conector que uno no ve.
  { re: /^[a-z]+\.?\d*\.mtx\.\d+\./, kind: 'MATRIX_SEND' },
  // --- Entradas: envíos a auxiliares. Nunca se escriben (INV-010). ---
  // **Un envío a monitor es más que su nivel.** Sólo `.value` estaba
  // clasificado; `.mute`, `.pan`, `.post` y `.postproc` --960 claves-- caían en
  // «ruta desconocida». Las cuatro están medidas contra el aparato: `.post` es
  // antes o después del fader y `.postproc` antes o después del procesamiento,
  // los dos puntos de derivación que cerró el criterio 1 de SPK-P0.2a.
  //
  // Todas van al mismo kind, y eso es deliberado: el envío al monitor de un
  // músico es del músico, y ninguna de las cuatro se escribe. La excepción del
  // bus de análisis sigue mirando **sólo `.value`**, que es la única que INV-008
  // admite.
  { re: /^i\.\d+\.aux\.\d+\.(value|mute|pan|post|postproc)$/, kind: 'MONITOR_AUX_SEND' },

  // --- Entradas: cadena de canal ---
  // **`l.N` es un canal, con otra fuente.** Las dos entradas de línea --las RCA
  // de esta consola-- tienen exactamente la misma cadena que `i.N`: fader,
  // silencio, panorama, ecualizador, dinámica, puerta, envíos. Lo que cambia es
  // de dónde viene la señal.
  //
  // **Estuvieron sin clasificar desde siempre, 246 claves**, y eso dejó de ser
  // una deuda abstracta el 2026-09-11: un receptor Bluetooth enchufado a esas
  // entradas, abiertas a 0 dB, metió un tono en el general durante dos días de
  // mediciones. Ni la aplicación ni yo podíamos nombrar esa puerta. Lo encontró
  // el oído del usuario.
  { re: /^i\.\d+\.eq\.hpf\./, kind: 'HPF' },
  { re: /^i\.\d+\.eq\./, kind: 'CHANNEL_EQ' },
  { re: /^i\.\d+\.dyn\./, kind: 'COMPRESSOR' },
  { re: /^i\.\d+\.gate\./, kind: 'GATE' },
  { re: /^i\.\d+\.deesser\./, kind: 'DEESSER' },
  { re: /^i\.\d+\.mix$/, kind: 'CHANNEL_FADER' },
  { re: /^i\.\d+\.pan$/, kind: 'CHANNEL_PAN' },
  { re: /^i\.\d+\.mute$/, kind: 'CHANNEL_MUTE' },
  // **Las dos rutas de fantasma, y no son la misma cosa.** La que manda es
  // `hw.N.phantom`, la del previo: medido el 2026-09-10, con el condensador
  // alimentado valía 1 mientras `i.N.phantom` valía 0 en el mismo instante.
  //
  // `i.N.phantom` estuvo devolviendo `null` con un comentario que la llamaba
  // «inventada». **No lo está**: existe en la consola y está en la
  // especificación. Clasificarla también deja que un intento de escribirla se
  // rechace por PARAMETRO_DEL_USUARIO (INV-007), que es el motivo verdadero, y
  // no por RUTA_DESCONOCIDA (INV-008), que manda a buscar el problema al lugar
  // equivocado. Las dos son del usuario y ninguna se escribe.
  { re: /^hw\.\d+\.phantom$/, kind: 'PHANTOM' },
  { re: /^i\.\d+\.phantom$/, kind: 'PHANTOM' },
  { re: /^hw\.\d+\.gain$/, kind: 'PREAMP_GAIN' },

  // --- Reproductor: solo dentro de la reserva ---
  { re: /^p\.\d+\.mute$/, kind: 'PLAYER_MUTE' },
  { re: /^p\.\d+\.mix$/, kind: 'PLAYER_FADER' },
  { re: /^p\.\d+\.pan$/, kind: 'PLAYER_FADER' },
  { re: /^p\.\d+\.aux\.\d+\.value$/, kind: 'PLAYER_SEND' },

  // --- General ---
  { re: /^m\.eq\./, kind: 'OUTPUT_EQ' },
  { re: /^m\.delay/, kind: 'OUTPUT_DELAY' },
  // **`m.polarity` no existe en la consola.** El general invierte por lado:
  // `m.l.invert` y `m.r.invert`. Con el patrón viejo, `OUTPUT_POLARITY` era
  // inalcanzable para el general — el mismo defecto que tenía el supresor,
  // encontrado por la misma auditoría el mismo día.
  { re: /^m\.[lr]\.invert$/, kind: 'OUTPUT_POLARITY' },
  { re: /^m\.dyn\./, kind: 'OUTPUT_LIMITER' },
  { re: /^m\.mix$/, kind: 'MASTER_FADER' },
  // **`m.mute` tampoco existe.** El general no tiene silencio: tiene `m.dim`,
  // que baja el nivel sin cortarlo. Otro kind que era inalcanzable.
  { re: /^m\.dim$/, kind: 'MASTER_MUTE' },

  // --- Auxiliares y matrices como buses de salida ---
  { re: /^a\.\d+\.eq\./, kind: 'OUTPUT_EQ' },
  { re: /^a\.\d+\.delay/, kind: 'OUTPUT_DELAY' },
  { re: /^a\.\d+\.invert$/, kind: 'OUTPUT_POLARITY' },
  { re: /^a\.\d+\.mute$/, kind: 'PA_BUS_MUTE' },
  { re: /^a\.\d+\.mix$/, kind: 'MONITOR_AUX_SEND' },
  { re: /^v\.\d+\./, kind: 'VCA' },

  // --- Subgrupos ---
  //
  // **`SUBGROUP` estaba declarado en el registro de propiedad y el clasificador
  // no podía producirlo jamás: no tenía patrón.** La consola publica 612 claves
  // `s.N.*` y todas caían en RUTA_DESCONOCIDA. Se rechazaban igual —el lado
  // seguro— pero citando que la ruta no se conoce, cuando sí se conoce.
  { re: /^s\.\d+\./, kind: 'SUBGROUP' },

  // --- Entradas de línea ---
  //
  // **Toda la tira, en una sola categoría, y a propósito.** Se habían
  // clasificado reutilizando las de canal porque el strip es idéntico, y eso las
  // nombró **y las abrió**: 44 rutas pasaron a estar permitidas, incluida
  // `l.0.mix`, el fader que estuvo a 0 dB metiendo el tono del Bluetooth en el
  // general. **Clasificar no es autorizar.**
  //
  // Con categoría propia el registro dice «entrada de línea» en vez de «ruta
  // desconocida» --que era lo que se buscaba-- y no se concede ningún permiso.
  { re: /^l\.\d+\./, kind: 'LINE_INPUT' },

  // --- Efectos y sistema ---
  { re: /^f\.\d+\./, kind: 'FX' },
  // El envío de un canal a un efecto. 288 claves sin clasificar hasta ahora.
  { re: /^i\.\d+\.fx\.\d+\./, kind: 'FX' },

  // `var.mtk.*` es el espacio de soundcheck y multipista, no un envío de bus:
  // lo decía la matriz de capacidades y acá estaba clasificado como el **único
  // routing escribible** que admite INV-008. No hay categoría para soundcheck
  // todavía, así que cae en RUTA_DESCONOCIDA y se rechaza, que es la respuesta
  // correcta mientras SPK-P0.7a no lo verifique.
  { re: /^var\.currentSnapshot$/, kind: 'SNAPSHOT' },

  // --- Supresión de realimentación ---
  //
  // **El patrón era `/^afs2\./` y esa familia no existe en la consola.** `AFS2`
  // es el nombre comercial de Soundcraft; las rutas que el aparato publica son
  // `m.afs.*` para el general, `a.B.afs.*` para cada auxiliar, y `var.afsdata`,
  // que trae los filtros ya puestos. Ninguna empieza con `afs2`, así que el
  // kind era **inalcanzable** y el supresor caía en RUTA_DESCONOCIDA.
  //
  // Es el mismo error que el comentario de `hw.N.phantom`, doce líneas más
  // arriba, describe y dice haber arreglado — en el mismo archivo. Se rechazaba
  // igual, pero citando INV-008 «ruta desconocida» en vez de la invariante de
  // propiedad, y el registro es lo que se lee después de un show.
  //
  // Y no es un parámetro cualquiera: el supresor le mete filtros de −18 dB al
  // audio por su cuenta, y `m.afs.enabled` es **el único de 45 campos que una
  // recuperación de instantánea no devuelve**. Lo encontró una auditoría.
  // **Cinco familias, no tres.** El arreglo del 2026-09-10 agregó las tres
  // primeras buscando «afs» en la documentación narrativa; las dos últimas solo
  // aparecen si uno mira los volcados, que es la fuente que ese mismo arreglo
  // decía estar usando. Las dos están en la consola ahora mismo:
  // `SETD^afs.enabled^1` y `SETD^settings.afsonboot^0`.
  { re: /^m\.afs\./, kind: 'AFS2' },
  { re: /^a\.\d+\.afs\./, kind: 'AFS2' },
  { re: /^var\.afsdata$/, kind: 'AFS2' },
  { re: /^afs\.enabled$/, kind: 'AFS2' },
  { re: /^settings\.afsonboot$/, kind: 'AFS2' },
];

export interface OpcionesDeClasificacion {
  /**
   * Qué auxiliar es el bus de análisis.
   *
   * INV-008 admite un solo routing escribible: los envíos hacia ese bus. Cuál
   * es lo tiene que decir SPK-P0.5, así que no se puede escribir un número acá.
   * Sin este dato **todo** `i.N.aux.M.value` es un envío de monitor y no se
   * escribe nunca, que es el lado seguro: el caso permitido por la invariante
   * era hasta ahora inexpresable, y el patrón que decía cubrirlo cubría otra
   * cosa.
   */
  readonly busDeAnalisis?: number;
}

export function clasificarRuta(
  path: string,
  opciones: OpcionesDeClasificacion = {},
): ParameterKind | null {
  const bus = opciones.busDeAnalisis;
  if (bus !== undefined && new RegExp(`^i\\.\\d+\\.aux\\.${bus}\\.value$`).test(path)) {
    return 'ANALYSIS_BUS_SEND';
  }
  for (const p of PATRONES) {
    if (p.re.test(path)) return p.kind;
  }
  return null;
}

/**
 * Toda ruta que el dominio reconoce como de auxiliar de monitor.
 *
 * Lo usa el test estático que INV-010 promete: la intersección entre las rutas
 * escribibles y las de auxiliar de monitor tiene que ser la lista cerrada de
 * la invariante.
 */
export function esEnvioDeMonitor(path: string): boolean {
  return clasificarRuta(path) === 'MONITOR_AUX_SEND';
}
