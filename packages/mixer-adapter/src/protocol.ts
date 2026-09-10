/**
 * Codificación y decodificación de los mensajes del protocolo.
 *
 * Lo que sabemos hoy, sin verificar en hardware, está en
 * docs/capability-matrix.md con su estado de confianza. Este archivo se
 * corrige con lo que midan los spikes: es una hipótesis ejecutable, no una
 * especificación.
 */

export interface MensajeSetd {
  readonly tipo: 'SETD';
  readonly path: string;
  readonly valor: number;
}
export interface MensajeSets {
  readonly tipo: 'SETS';
  readonly path: string;
  readonly texto: string;
}
export interface MensajeVu {
  readonly tipo: 'VU2';
  readonly cargaBase64: string;
}
export interface MensajeRta {
  readonly tipo: 'RTA';
  readonly cargaBase64: string;
}
export interface MensajeOtro {
  readonly tipo: 'OTRO';
  readonly linea: string;
}

export type MensajeEntrante =
  | MensajeSetd | MensajeSets | MensajeVu | MensajeRta | MensajeOtro;

/** Qué trae una trama del transporte, ya separada de su envoltorio. */
export interface TramaSocketIo {
  /** `conectado`, `latido`, `desconectado` o `datos`. */
  readonly clase: 'conectado' | 'latido' | 'desconectado' | 'datos' | 'desconocida';
  /** Líneas de protocolo, solo en las de clase `datos`. */
  readonly lineas: readonly string[];
}

/**
 * Quita el envoltorio de socket.io 0.9 de una trama del WebSocket.
 *
 * **Esta función faltaba, y sin ella no funciona nada.** La Ui24R habla
 * socket.io 0.9, no WebSocket pelado: cada trama viene como
 * `<tipo>:<id>:<endpoint>:<datos>`, y una línea de protocolo llega como
 * `3:::SETD^i.0.mix^0.41`. Verificado en crudo el 2026-09-08: los bytes son
 * `33 3a 3a 3a` seguidos de la carga.
 *
 * Antes de este cambio, `decodificar()` recibía la trama entera, partía por `^`
 * y comparaba `partes[0]` contra `'SETD'` cuando lo que tenía era `'3:::SETD'`.
 * Todos los mensajes caían en `OTRO` y el estado confirmado quedaba vacío.
 *
 * Dos detalles medidos que conviene no perder:
 *
 * - **Una trama de datos puede traer varias líneas separadas por `\n`.** El
 *   volcado inicial llega en unos doscientos veinte mensajes de ~2 KB, cada uno
 *   con decenas de líneas.
 * - **El latido no se contesta.** La consola manda `2::` cada ~66 ms, no cada
 *   5 s como declara su propio apretón de manos. Probado con eco y sin eco: el
 *   flujo entrante es idéntico, así que responder solo agrega tráfico.
 */
export function despojarSocketIo(trama: string): TramaSocketIo {
  const coincidencia = /^(\d):([^:]*):([^:]*)(?::([\s\S]*))?$/.exec(trama);
  if (!coincidencia) return { clase: 'desconocida', lineas: [] };
  const tipo = coincidencia[1];
  if (tipo === '1') return { clase: 'conectado', lineas: [] };
  if (tipo === '2') return { clase: 'latido', lineas: [] };
  if (tipo === '0') return { clase: 'desconectado', lineas: [] };
  if (tipo !== '3') return { clase: 'desconocida', lineas: [] };
  const datos = coincidencia[4] ?? '';
  return { clase: 'datos', lineas: datos.split('\n').filter((l) => l.length > 0) };
}

/**
 * Mensaje que mantiene vivo el flujo, y que el cliente oficial manda cada segundo.
 *
 * No es opcional. `mixer.html` hace `setInterval(sendMessage("ALIVE"), 1000)`, y
 * medido el 2026-09-08: sin él la consola deja de emitir. En veinte segundos sin
 * `ALIVE` llegaron 148 tramas de analizador; en treinta segundos con `ALIVE`,
 * 905.
 */
export const MENSAJE_ALIVE = 'ALIVE';

/** Intervalo con el que el cliente oficial manda `ALIVE`. */
export const ALIVE_INTERVALO_MS = 1000;

export function decodificar(linea: string): MensajeEntrante {
  const partes = linea.split('^');
  const cabecera = partes[0];
  if (cabecera === 'SETD' && partes.length >= 3) {
    const valor = Number(partes[2]);
    if (Number.isFinite(valor)) {
      return { tipo: 'SETD', path: partes[1]!, valor };
    }
  }
  if (cabecera === 'SETS' && partes.length >= 3) {
    return { tipo: 'SETS', path: partes[1]!, texto: partes.slice(2).join('^') };
  }
  if (cabecera === 'VU2' && partes.length >= 2) {
    return { tipo: 'VU2', cargaBase64: partes[1]! };
  }
  // El analizador de espectro. Se reconoce porque es la unica emision que la
  // consola mantiene pase lo que pase: 30 Hz medidos, tanto en silencio como
  // con señal. Es la señal de vida honesta de este aparato.
  if (cabecera === 'RTA' && partes.length >= 2) {
    return { tipo: 'RTA', cargaBase64: partes[1]! };
  }
  return { tipo: 'OTRO', linea };
}

export function codificarSetd(path: string, valor: number): string {
  return `SETD^${path}^${valor}`;
}

export function codificarSets(path: string, texto: string): string {
  return `SETS^${path}^${texto}`;
}

/**
 * Base64 sin depender de `Buffer` ni de `atob`.
 *
 * El mismo código corre en el navegador, en el WebView de Android y en Node
 * durante los tests. Una implementación propia de veinte líneas evita tener
 * tres caminos distintos que se comportan distinto justo en los bordes.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesABase64(bytes: readonly number[]): string {
  let salida = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    salida += ALFABETO[(triple >> 18) & 63];
    salida += ALFABETO[(triple >> 12) & 63];
    salida += i + 1 < bytes.length ? ALFABETO[(triple >> 6) & 63] : '=';
    salida += i + 2 < bytes.length ? ALFABETO[triple & 63] : '=';
  }
  return salida;
}

export function base64ABytes(texto: string): number[] {
  const limpio = texto.replace(/[^A-Za-z0-9+/]/g, '');
  const salida: number[] = [];
  for (let i = 0; i < limpio.length; i += 4) {
    const c0 = ALFABETO.indexOf(limpio[i] ?? 'A');
    const c1 = ALFABETO.indexOf(limpio[i + 1] ?? 'A');
    const c2 = ALFABETO.indexOf(limpio[i + 2] ?? 'A');
    const c3 = ALFABETO.indexOf(limpio[i + 3] ?? 'A');
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    salida.push((triple >> 16) & 255);
    if (i + 2 < limpio.length) salida.push((triple >> 8) & 255);
    if (i + 3 < limpio.length) salida.push(triple & 255);
  }
  return salida;
}

/**
 * Cabecera de una trama `VU2`, en bytes.
 *
 * Medido el 2026-09-08 contra la consola: la cabecera vale 8 bytes y el primero
 * es la cantidad de canales de entrada. Los siguientes repiten la topología que
 * la consola publica en `curSetup` — para la Ui24R salieron
 * `[24, 2, 6, 4, 10, 2, 2, 0]`.
   *
   * **Ojo con el byte 1: es el reproductor de medios, no `linein`.** Coincide
   * en el número —hay 2 de cada uno— y por eso se lee mal sin darse cuenta.
   * Las entradas de línea son el **byte 6** y su sección va al **final** de la
   * trama, después del general. Ver `vu-buses.ts`, que sí lo tiene bien.
 */
export const VU_CABECERA_BYTES = 8;

/** Bytes por canal dentro de una trama `VU2`. */
export const VU_BYTES_POR_CANAL = 6;

/**
 * Escala de los medidores, de `deconvertVU` en `mixer.html`.
 *
 * Un byte de 0 a ~240 se convierte en una posición de 0 a 1. **No son
 * decibeles**, pero tampoco es la posición de un fader: la consola dibuja la
 * barra con `c = h * value` y coloca las marcas de su escala con
 * `vuPosMark(dB, h) = -dB * h / VU_RANGE`, con `VU_RANGE = 80`. Las dos cosas
 * juntas dicen que **el medidor es lineal en decibeles**: ver `MEDIDOR_RANGO_DB`.
 */
export const VU_ESCALA = 0.004167508166392142;

/**
 * Recorrido del medidor, en decibeles. `VU_RANGE` en `mixer.html`.
 *
 * La escala va de 0 en la punta a −80 en el fondo, y la barra se dibuja
 * proporcional a la posición, así que un escalón del byte son
 * `80 * VU_ESCALA` = 0,333 dB.
 *
 * **Este número estuvo en 84,5 durante unas horas y se volvió atrás.** Vale
 * dejar escrito el episodio completo, porque la trampa es sutil y se puede
 * repetir.
 *
 * Se midió con tonos de nivel conocido generados en la máquina de desarrollo,
 * entrando por una entrada de la consola. Tres barridos dieron pendientes de
 * 0,94 contra el recorrido de 80, con desvíos de 0,21 a 0,79 dB: rectas
 * impecables, y todas apuntando a un recorrido de ~85 dB. Con eso se cambió la
 * constante.
 *
 * Lo que faltaba mirar: **esos barridos no coincidían entre sí.** En dB por
 * escalón del byte daban 0,3516, 0,3582 y 0,3644 según el nivel al que se
 * midiera. Una escala tiene un solo factor; tres factores distintos según el
 * nivel no son una escala, son una cadena analógica metiendo la cola —el
 * conversor, el cable, el previo, o el ruido sumándose en los niveles bajos—.
 *
 * Lo que lo resolvió fue una medición **sin cadena analógica**: mover el fader
 * del canal, que es una ganancia digital dentro de la consola, con la fuente
 * fija y el medidor de entrada de testigo. De 0 a −38,19 dB de atenuación
 * —según la propia ley de fader de la consola— el medidor recorrió 114,7
 * escalones. Con este recorrido de 80 eso da 38,24 dB: **coincide en 0,05 dB
 * sobre 38**. Dos hechos independientes tomados del código de la consola, su
 * `VU_RANGE` y su `VtoLIN`, concuerdan entre sí y con la medición limpia.
 *
 * La moraleja para el próximo que mida: una fuente externa mide la cadena
 * entera, no el medidor. Para medir el medidor hay que mover algo que ya esté
 * adentro. Y la correspondencia con dBFS reales sigue sin medirse: eso es lo
 * que pide SPK-P0.10b con un bucle calibrado.
 */
export const MEDIDOR_RANGO_DB = 80;

/**
 * Posición desde la que la consola enciende su indicador de saturación.
 *
 * `setVU` hace `1 <= b ? this.clip.clip() : ...` sobre el valor del medidor, y
 * `setVUPre` lo mismo con el nivel del previo. O sea: satura cuando la barra
 * llega a la punta de la escala, que son 0 dB. No es un umbral elegido por
 * nosotros.
 */
export const MEDIDOR_SATURACION = 1;

/**
 * Ampliación del medidor de reducción de ganancia. `COMP_ZOOM` en `mixer.html`.
 *
 * El medidor de reducción usa la misma escala de bytes que el de nivel, pero
 * dibujada al doble: por eso su recorrido es la mitad, 40 dB y no 80.
 */
export const COMP_ZOOM = 2;

/** Recorrido del medidor de reducción de ganancia, en decibeles. */
export const REDUCCION_RANGO_DB = MEDIDOR_RANGO_DB / COMP_ZOOM;

/**
 * Fracción por debajo de la cual la consola da la reducción por nula.
 *
 * Es su propia zona muerta, no una elección nuestra: con el compresor sin
 * actuar el byte vale 247 en todos los canales, que despejado da 0,0079 —justo
 * por debajo de este umbral—. Sin la zona muerta, un canal quieto informaría
 * 0,32 dB de reducción permanente.
 */
const REDUCCION_ZONA_MUERTA = 0.008;

/**
 * Fracción de reducción de ganancia a partir del sexto byte del canal.
 *
 * La cuenta es la de `mixer.html`, y **el orden de los operadores importa**:
 * `a` se arma con los siete bits bajos desplazados a la izquierda, y el bit que
 * se cae por arriba se recupera con `a | ((a >> 7) & 1)`. Leerlo como
 * `(a | (a >> 7)) & 1` da otra cosa.
 *
 * **Medido contra la consola el 2026-09-09**, tono fijo y umbral del compresor
 * bajando: 10,8 % de reducción dio 4,66 dB medidos contra 4,32 calculados;
 * 22,5 % dio 9,00 contra 9,00; 27,5 % dio 10,80 contra 11,00. Los tres puntos
 * caen dentro de 0,35 dB.
 */
export function fraccionDeReduccion(byte: number): number {
  const a = (byte & 127) << 1;
  const fraccion = (1 - VU_ESCALA * (a | ((a >> 7) & 1))) * COMP_ZOOM;
  if (fraccion < REDUCCION_ZONA_MUERTA) return 0;
  return fraccion > 1 ? 1 : fraccion;
}

/**
 * Cuántos decibeles le está sacando el procesador dinámico al canal.
 *
 * **Este número es la diferencia entre avisar y aconsejar.** El medidor de
 * entrada de cada canal —el byte `+1` de la trama— está **después** del
 * procesamiento dinámico: medido el 2026-09-09 con un tono fijo, bajar el
 * umbral del compresor movió la lectura de −29,66 a −40,46 dB. O sea que el
 * nivel con el que se calcula un consejo de ganancia puede venir ya comprimido,
 * y hasta hoy nada lo decía. Con esto se puede decir cuánto, y distinguir un
 * compresor puesto que no está actuando —reducción cero, que no condiciona
 * nada— de uno que está sacando nueve decibeles.
 */
export function dbDeReduccion(byte: number): number {
  return fraccionDeReduccion(byte) * REDUCCION_RANGO_DB;
}

/**
 * El byte que produciría esta reducción. Lo usan el simulador y los tests.
 *
 * Es una búsqueda sobre `dbDeReduccion`, no una fórmula despejada a mano: así
 * no puede desviarse de la función directa, que es la que describe el aparato.
 * El bit 7 va puesto porque es lo que hace la consola —es el indicador de
 * puerta, no el de saturación— y no interviene en la cuenta.
 */
export function byteDeReduccion(db: number): number {
  let mejor = 247;
  let menorError = Infinity;
  for (let b = 128; b <= 255; b++) {
    const error = Math.abs(dbDeReduccion(b) - db);
    if (error < menorError) {
      menorError = error;
      mejor = b;
    }
  }
  return mejor;
}

/** Lectura de un canal dentro de una trama `VU2`, en posición normalizada. */
export interface MedidorCanal {
  /**
   * Nivel **después del previo y antes del procesamiento dinámico**.
   *
   * El nombre venía de suponer que era anterior a la ganancia del previo, y es
   * al revés. Las dos mitades están medidas contra la consola el 2026-09-09:
   *
   * - **Después del previo**: subiendo `hw.N.gain` de 10 a 22 dB, esta lectura
   *   subió 6,00 y 6,01 dB, lo mismo que `entrada`.
   * - **Antes del compresor**: con el compresor apretando 5 dB, `entrada` cayó
   *   a −53,33 y esta se quedó en −48,66. El dinámico no la toca.
   *
   * **Es el punto de la cadena en el que hay que aconsejar ganancia**, y por eso
   * es el que muestrea el asistente. `entrada` es lo que la consola dibuja en su
   * tira y sirve para hablar el mismo idioma que el operador, pero llega con el
   * proceso encima.
   *
   * **Lo que está medido y lo que no.** Que el compresor, el **ecualizador** y
   * la **puerta** no la tocan está medido contra el aparato el 2026-09-09: con
   * el umbral de la puerta por encima de la señal, `entrada` se fue a −∞ y esto
   * quedó clavado en −48,66 dB.
   *
   * Sin medir queda el **de-esser**, que es un cuarto bloque y no un detalle del
   * dinámico: no reporta cuánto atenúa y no se probó con sibilancia. Mientras
   * siga inferido, el asistente no le da a un canal con de-esser activo la
   * confianza más alta.
   */
  readonly pre: number;
  /**
   * Nivel de entrada al canal, **después del procesamiento dinámico**.
   *
   * El nombre engaña y conviene no arreglarlo cambiándolo: es «entrada» porque
   * es lo que la consola muestra en la tira de entrada, antes del fader. Pero
   * el compresor y la puerta ya pasaron. Medido el 2026-09-09.
   */
  readonly entrada: number;
  /** Nivel de salida, después del fader. */
  readonly salida: number;
  /**
   * Los dos bytes del bloque dinámico, `+3` y `+4`.
   *
   * **No los llena «solo el canal seleccionado», y eso era imposible.**
   * `selectedStrip` es estado del **cliente**: la consola no sabe qué tira está
   * mirando cada tableta, así que no puede llenar bytes selectivamente. Lo que
   * hace el cliente es *dibujarlos* solo para la tira seleccionada. Llegan
   * siempre, en todos los canales y en todos los buses. Comprobado en una trama
   * archivada con música: los canales 21 y 22, que no eran la tira
   * seleccionada, traen los dos bytes llenos.
   *
   * O sea que la aplicación viene tirando, en cada trama y en cada canal, el
   * dato que dice cuánto está trabajando el procesamiento — que es justo lo que
   * se fue a buscar por el byte de reducción.
   *
   * **Qué son exactamente queda con una tensión sin resolver.** El cliente los
   * lee como entrada y salida del bloque dinámico, y muestra el mismo par en la
   * página del compresor y en la de la puerta (`d.vuIN`/`d.vuOUT` y
   * `f.vuIN`/`f.vuOUT`). Pero una auditoría midió que **`+3` se anula con
   * `gate.enabled = 0` y `+4` con `dyn.bypass = 1`**, cada uno por su sección,
   * que no es lo que uno espera de la entrada y la salida de un mismo bloque.
   *
   * Las dos observaciones pueden convivir —el motor podría calcular cada byte
   * solo cuando su sección está activa, y el cliente rotularlos in/out igual—
   * pero no está resuelto. Por eso los nombres se dejan como están: cambiarlos
   * a «medidor de la puerta» y «medidor del compresor» afirmaría la lectura de
   * la medición sobre la del cliente, y todavía no hay con qué elegir.
   */
  readonly dinamicoEntrada: number;
  readonly dinamicoSalida: number;
  /** Byte crudo de reducción de ganancia y bandera, sin interpretar. */
  readonly byteReduccion: number;
  /**
   * Reducción de ganancia que el procesador dinámico está aplicando, en dB.
   *
   * Estuvo llegando en cada trama desde siempre y no lo leía nadie. Ver
   * `dbDeReduccion`.
   */
  readonly reduccionDb: number;
  /**
   * El indicador de puerta, crudo y sin interpretar.
   *
   * Es el bit 7 del último byte del canal. `parseVUdata` lo saca con
   * `p = 0 != (byte & 128)` y termina en `this.gi.setValue(...)`, que es un
   * `GATEind`: el indicador de puerta, **no** el de saturación. Vale anotarlo
   * porque invita al error: el byte vale 247 en todos los canales quietos, con
   * el bit 7 puesto, y leerlo como saturación da todos los canales saturando
   * todo el tiempo.
   *
   * **La polaridad quedó resuelta el 2026-09-09: `1` es puerta ABIERTA.**
   *
   * Estuvo escrito acá que «la evidencia apunta más bien al revés, porque el
   * bit está puesto en todos los canales quietos y un canal quieto tiene la
   * puerta cerrada». La premisa era falsa, y la respuesta ya estaba pagada en
   * el repositorio: en `SPK-P0.1/evidence/prueba-A-pasivo.txt`, de los 24
   * canales **el 15 es el único con el bit en 0**, y es también el único con
   * `gate.thresh` distinto de cero —0,4109, que con `VtoTHRESH = 96a − 90` son
   * −50,55 dB—. Los otros 23 tenían el umbral en −90 dB, o sea la puerta
   * abierta permanentemente aunque no hubiera señal.
   *
   * Lo que faltó fue mirar el estado de alrededor —los umbrales—, que es el
   * mismo patrón del subgrupo silenciado y de la música apagada.
   *
   * Lo confirma el trabajo previo: dos implementaciones independientes llaman
   * a este byte `CompMeterAndGated`, con el bit como bandera de la puerta.
   *
   * El campo sigue llamándose sin interpretar porque nadie lo consume todavía
   * y el nombre crudo no se equivoca.
   */
  readonly indicadorDePuerta: boolean;
}

/**
 * Decodifica una trama de medidores a lecturas por canal.
 *
 * **Formato medido el 2026-09-08**, no supuesto. La versión anterior de este
 * archivo asumía «un byte por canal, de 0 a 255, que mapea de −80 a 0 dB», y las
 * tres partes eran incorrectas: hay cabecera, el paso es de seis bytes, y el
 * byte no son decibeles. Con aquella lectura el canal 1 devolvía el byte de la
 * cabecera —la cuenta de entradas, 24— informado como −72,5 dB.
 *
 * Comprobado contra una fuente conocida: con música entrando solo por las RCA,
 * la trama dio nivel en los canales 21 y 22 y cero en los otros veintidós. Las
 * RCA de esta consola son exactamente esos dos canales.
 */
export function decodificarVuCanales(base64: string): MedidorCanal[] {
  const bytes = base64ABytes(base64);
  if (bytes.length < VU_CABECERA_BYTES) return [];
  const cuantos = bytes[0] ?? 0;
  const canales: MedidorCanal[] = [];
  for (let c = 0; c < cuantos; c++) {
    const o = VU_CABECERA_BYTES + VU_BYTES_POR_CANAL * c;
    if (o + VU_BYTES_POR_CANAL > bytes.length) break;
    canales.push({
      pre: (bytes[o] ?? 0) * VU_ESCALA,
      entrada: (bytes[o + 1] ?? 0) * VU_ESCALA,
      salida: (bytes[o + 2] ?? 0) * VU_ESCALA,
      dinamicoEntrada: (bytes[o + 3] ?? 0) * VU_ESCALA,
      dinamicoSalida: (bytes[o + 4] ?? 0) * VU_ESCALA,
      byteReduccion: bytes[o + 5] ?? 0,
      reduccionDb: dbDeReduccion(bytes[o + 5] ?? 0),
      indicadorDePuerta: ((bytes[o + 5] ?? 0) & 128) !== 0,
    });
  }
  return canales;
}

/**
 * Nivel de entrada de cada canal, en dB de la escala de la consola.
 *
 * Un dB por canal, que es la forma que el adaptador ya consumía, sacado del
 * formato real de la trama y de la recta del medidor —ver `dbDeMedidor`—.
 *
 * **Lo que este dB no es.** No es dBFS. Es el número que la consola dibuja en
 * su propia escala, de 0 en la punta a −80 en el fondo, y sirve para hablarle
 * al operador en los términos que él está viendo. Qué nivel digital real le
 * corresponde a cada punto de esa escala **no está medido**: lo mide
 * SPK-P0.10b, con tonos de −20, −6 y −1 dBFS por un bucle físico.
 */
export function decodificarVu(base64: string): number[] {
  return decodificarVuCanales(base64).map((c) => dbDeMedidor(c.entrada));
}

/**
 * Posición normalizada de medidor a decibeles.
 *
 * **Medido en el código de la consola el 2026-09-08, no supuesto.** Antes esto
 * convertía con la ley del fader, sobre la hipótesis de que la consola dibuja
 * sus medidores con la misma regla que sus faders. Es falsa, y el error no era
 * chico: con la guitarra en el canal 1 de una Ui24R real, el byte 225 daba
 * +4,6 dB —recortado a +10 en pantalla, con mil saturaciones inventadas—
 * cuando la consola mostraba −12.
 *
 * Lo que hace `mixer.html`: dibuja la barra con `c = h * value`, proporcional a
 * la posición, y coloca las marcas de la escala con `-dB * h / VU_RANGE`. De
 * ahí sale una recta, y solo una:
 *
 *     dB = VU_RANGE * posicion - VU_RANGE
 *
 * Comprobada contra el aparato en dos puntos independientes: byte 225 en la
 * guitarra da −5,0 dB de entrada, que con el fader del canal en −6,9 dB deja
 * −11,9 a la salida —los «−12» que mostraba la consola—; y la música por las
 * RCA, con salida en el byte 102, da −46 dB, que es la barra de la captura.
 *
 * **Esto sigue sin ser dBFS verificado.** Es lo que ve el operador en su
 * pantalla, que es lo que hace falta para hablar el mismo idioma que él. La
 * correspondencia con un nivel digital real la mide SPK-P0.10b, con tonos por
 * un bucle físico.
 */
export function dbDeMedidor(posicion: number): number {
  if (posicion <= 0) return -Infinity;
  return MEDIDOR_RANGO_DB * posicion - MEDIDOR_RANGO_DB;
}

/**
 * Arma una trama `VU2` con el formato real. La usa el simulador.
 *
 * Recibe posiciones normalizadas, no decibeles: es lo que viaja por el cable.
 * `reduccionesDb` es opcional y por canal; sin ella todos los canales van sin
 * reducción, que es el byte 247. `posicionesPreProceso` también es opcional y
 * por defecto iguala a `posiciones`: sirve para armar una trama donde el nivel
 * anterior al dinámico y el posterior **no** coincidan, que es lo que pasa en
 * cuanto el compresor aprieta.
 */
export function codificarVu(
  posiciones: readonly number[],
  reduccionesDb: readonly number[] = [],
  posicionesPreProceso: readonly number[] = [],
): string {
  const bytes: number[] = [posiciones.length, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < posiciones.length; i++) {
    const p = posiciones[i]!;
    const byte = Math.max(0, Math.min(255, Math.round(Math.max(0, p) / VU_ESCALA)));
    const pPre = posicionesPreProceso[i] ?? p;
    const bytePre = Math.max(0, Math.min(255, Math.round(Math.max(0, pPre) / VU_ESCALA)));
    bytes.push(bytePre, byte, byte, 0, 0, byteDeReduccion(reduccionesDb[i] ?? 0));
  }
  return bytesABase64(bytes);
}
