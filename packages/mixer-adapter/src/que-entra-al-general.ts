import { clasificarRuta } from './clasificar-ruta.ts';
import { faderADb } from './conversiones.ts';

/**
 * Qué fuentes están alimentando el general ahora mismo.
 *
 * **Por qué existe.** El 2026-09-11 se midió el espectro del general durante dos
 * días sin preguntar nunca qué estaba entrando en él. Había un receptor
 * Bluetooth enchufado a las entradas de línea `l.0`/`l.1`, **abiertas a 0 dB**,
 * metiendo un tono continuo. Lo encontró el oído del usuario: escuchó el
 * chillido, tocó el micrófono con la uña, no salió nada por el monitor, y al
 * desconectar el Bluetooth el ruido paró.
 *
 * De ahí salieron tres conclusiones falsas —que el detector de realimentación
 * fallaba en una sala en silencio, que 105 Hz era un modo resonante, y que el
 * silencio de un canal lo sacaba del analizador— y ninguna sobrevivió.
 *
 * **La lección no es sobre umbrales: es que quien mide el general está midiendo
 * la suma de cosas que no puede enumerar.** Esto las enumera.
 *
 * **Lo que esto NO es.** No mide nivel de audio: mira el enrutamiento y los
 * faders del estado confirmado. Una fuente puede estar abierta y en silencio
 * absoluto, y va a figurar igual — que es lo correcto, porque lo que informa es
 * **por dónde puede entrar algo**, no si está entrando.
 */

/** Una fuente que puede llegar al general. */
export interface FuenteDelGeneral {
  /** El prefijo de la fuente: `i.8`, `l.0`, `p.0`, `s.2`. */
  readonly ruta: string;
  readonly clase: 'CANAL' | 'ENTRADA_DE_LINEA' | 'REPRODUCTOR' | 'SUBGRUPO' | 'EFECTO';
  /** El nombre que la consola le da, si tiene uno. */
  readonly nombre: string | null;
  /** Silenciada en la consola. */
  readonly silenciada: boolean;
  /** Posición cruda del fader, tal como la publica la consola. */
  readonly fader: number;
  /**
   * El fader en decibeles, con la ley medida contra la consola.
   *
   * **Existe porque acá había un umbral inventado.** Decía
   * `FADER_CERRADO = 0.001`, «el fader por debajo del cual una fuente no aporta
   * nada audible», sin cita ni medición. Pasado por `faderADb` --que vive en
   * este mismo paquete y sale del cliente de la consola-- **a los dos lados de
   * ese umbral hay −90 dB**: 0,0009 daba «cerrada» y 0,002 daba «abierta», y las
   * dos aportan exactamente lo mismo. No separaba nada.
   *
   * Peor: 0,001 es el corte de pantalla de la consola, y `conversiones.ts`
   * --tres días antes, mismo paquete-- advierte por escrito contra usarlo.
   *
   * Se quitó el umbral y se expone el número. **Quien necesite un piso lo pone
   * con un valor que alguien haya medido**, en decibeles, que es la unidad en la
   * que se puede discutir.
   */
  readonly faderDb: number;
  /**
   * Si **puede** entrar algo por acá: no está silenciada y su fader no está en
   * el fondo absoluto.
   *
   * **No dice que esté entrando**, y la diferencia importa: esto mira
   * enrutamiento y faders del estado confirmado, no nivel de audio. Una fuente
   * abierta y en silencio absoluto figura igual, que es lo correcto — lo que
   * informa es por dónde puede entrar algo.
   *
   * Un fader en el fondo es silencio efectivo pero **no es un silencio**: se
   * sube sin tocar un botón. Los dos se informan por separado.
   */
  readonly abierta: boolean;
}

/**
 * Lo que este módulo **no** puede ver, dicho en la salida y no en un comentario.
 *
 * Una auditoría encontró que los VCA se descartaban en silencio y que el
 * enrutamiento no se miraba en absoluto. Devolver una lista de fuentes sin decir
 * esto invita a creer que la lista es completa — que es el error original, con
 * la confianza subida.
 */
export interface LoQueNoSeVe {
  /** Rutas de enrutamiento que existen en la consola y este módulo no lee. */
  readonly sinMirar: readonly string[];
  readonly porQue: readonly string[];
}

const CLASES: readonly { re: RegExp; clase: FuenteDelGeneral['clase'] }[] = [
  { re: /^i\.\d+$/, clase: 'CANAL' },
  // **Las entradas de línea son la puerta que nadie miraba.** Son las RCA de
  // esta consola, y es por donde entró el Bluetooth.
  { re: /^l\.\d+$/, clase: 'ENTRADA_DE_LINEA' },
  { re: /^p\.\d+$/, clase: 'REPRODUCTOR' },
  { re: /^s\.\d+$/, clase: 'SUBGRUPO' },
  { re: /^f\.\d+$/, clase: 'EFECTO' },
];


/**
 * Enumera las fuentes del general a partir del estado confirmado.
 *
 * `leer` devuelve el valor numérico de una ruta, o `null` si no se conoce;
 * `leerTexto` el valor de una ruta de texto. Se pasan como funciones para que
 * esto sea probable sin consola y sin adaptador.
 */
export function fuentesDelGeneral(
  rutas: Iterable<string>,
  leer: (ruta: string) => number | null,
  leerTexto: (ruta: string) => string | null,
): readonly FuenteDelGeneral[] {
  const prefijos = new Set<string>();
  for (const r of rutas) {
    // Se detecta por el fader: toda fuente que puede ir al general tiene uno.
    const m = /^([a-z]+\.\d+)\.mix$/.exec(r);
    if (m !== null) prefijos.add(m[1]!);
  }

  const salida: FuenteDelGeneral[] = [];
  for (const p of [...prefijos].sort()) {
    const clase = CLASES.find((c) => c.re.test(p))?.clase;
    // Los auxiliares y el general tienen `mix` y **no son fuentes del general**:
    // son salidas. Se descartan acá y no por omisión.
    if (clase === undefined) continue;

    const fader = leer(`${p}.mix`) ?? 0;
    const silenciada = (leer(`${p}.mute`) ?? 0) > 0.5;
    salida.push({
      ruta: p,
      clase,
      nombre: leerTexto(`${p}.name`),
      silenciada,
      fader,
      faderDb: faderADb(fader),
      // **El fondo absoluto y nada más.** No hay umbral inventado: `faderADb`
      // devuelve `-Infinity` sólo en el cero exacto, y ahí no puede entrar nada.
      // Cualquier piso por encima de eso es una decisión, y se toma con
      // `faderDb` a la vista.
      abierta: !silenciada && Number.isFinite(faderADb(fader)),
    });
  }
  return salida;
}

/**
 * Las que de verdad pueden estar sonando, para el que solo quiere eso.
 *
 * Existe para que nadie tenga que filtrar a mano y se olvide del silencio o del
 * fader — que es la mitad del error que esto vino a evitar.
 */
export function fuentesAbiertas(
  fuentes: readonly FuenteDelGeneral[],
): readonly FuenteDelGeneral[] {
  return fuentes.filter((f) => f.abierta);
}

/**
 * Si el clasificador puede nombrar una ruta.
 *
 * **Una ruta que la aplicación no sabe nombrar es una puerta que no puede
 * vigilar.** Se expone para que la pantalla de diagnóstico pueda decir cuánto
 * del estado entiende, en vez de dar a entender que lo entiende todo.
 */
export function rutasSinNombre(rutas: Iterable<string>): readonly string[] {
  const sin: string[] = [];
  for (const r of rutas) if (clasificarRuta(r) === null) sin.push(r);
  return sin;
}


/**
 * Lo que esta enumeración no puede ver, para que nadie la lea como completa.
 *
 * Se devuelve junto con las fuentes y no se esconde en un comentario: una lista
 * que no declara sus huecos invita a creer que no los tiene, que es el error que
 * este módulo vino a corregir.
 */
export function loQueNoSeVe(): LoQueNoSeVe {
  return {
    sinMirar: [
      'i.N.subgroup', 'l.N.subgroup', 'i.N.vca', 'l.N.vca',
      'a.N.link2master', 'a.N.matrix',
      'v.N.mix', 'v.N.mute',
      'i.N.solo', 'settings.soloMode', 'settings.solotype',
      'i.N.mgmask', 'mgmask', 'i.N.forceunmute',
    ],
    porQue: [
      'El enrutamiento no se mira: un canal que va al general POR UN SUBGRUPO se '
      + 'cuenta dos veces y sin relación, y uno ruteado fuera del general se '
      + 'informa igual como fuente suya.',
      'Los VCA gobiernan si una fuente llega al general y acá no aparecen. Se '
      + 'descartaban en silencio.',
      'El solo cambia lo que llega al general y no se lee.',
      'Los grupos de silencio y `forceunmute` pueden dejar un canal silenciado '
      + 'con `i.N.mute` en cero. Si eso es así, esta enumeración diría '
      + '«no silenciada» sobre algo silenciado — un falso negativo, que es la '
      + 'dirección peligrosa. **No está medido contra el aparato.**',
    ],
  };
}
