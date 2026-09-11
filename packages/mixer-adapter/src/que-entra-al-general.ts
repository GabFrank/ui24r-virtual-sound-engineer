import { clasificarRuta } from './clasificar-ruta.ts';

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
   * Si puede llegar al general: no está silenciada **y** su fader no está abajo
   * del todo.
   *
   * Un fader en cero es silencio efectivo, pero **no es lo mismo que un
   * silencio**: se sube sin tocar un botón. Se informan los dos por separado
   * para que quien lea decida.
   */
  readonly abierta: boolean;
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

/** El fader por debajo del cual una fuente no aporta nada audible. */
const FADER_CERRADO = 0.001;

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
      abierta: !silenciada && fader > FADER_CERRADO,
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
