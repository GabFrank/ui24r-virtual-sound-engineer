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
   * nada audible», **sin cita ni medición**. Sigue siendo razón suficiente para
   * sacarlo: un umbral que nadie midió no separa nada que alguien pueda
   * defender.
   *
   * > **Y el argumento con el que se sacó era falso, lo encontró una
   * > auditoría.** Se dijo que «a los dos lados de ese umbral hay −90 dB, así
   * > que no separa nada». Eso es cierto de lo que devuelve `faderADb` y **no
   * > de la consola**: la función recorta en `FADER_DB_MINIMO = -90`. Sin el
   * > recorte, 0,0009 da −103,1 dB y 0,002 da −95,9: **siete decibeles**, no
   * > «exactamente lo mismo».
   * >
   * > O sea que se reemplazó un umbral inventado por un argumento construido
   * > sobre otra constante de la misma clase —`FADER_DB_MINIMO` es el único
   * > extremo de `conversiones.ts` **sin cita de procedencia**— y se presentó
   * > como medición. La conclusión sobrevive; el razonamiento no.
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
 *
 * **Y la primera declaración de huecos tenía el mismo defecto que venía a
 * corregir.** Sus catorce patrones existían todos en la consola, pero estaban
 * escritos para la familia `i.` mientras el módulo enumera cinco clases:
 * declaraba `i.N.mgmask` y no `l.N.mgmask` —**las entradas de línea, que son el
 * caso testigo que le da sentido a todo esto**—, `i.N.vca` y no el de los
 * auxiliares, los efectos o el reproductor. Una lista de huecos con huecos.
 *
 * Ahora los patrones **se derivan** de una tabla de conceptos por familia, y un
 * test los contrasta contra las 6732 claves del inventario en las dos
 * direcciones. Ver `SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO`: entre los dos, la cuenta
 * de sufijos de familia fuente **cierra exacta**, así que un firmware que
 * agregue uno nuevo rompe el test en vez de pasar desapercibido.
 */

/** Por qué una ruta que no se lee puede cambiar la respuesta. */
export type ClaseDeHueco =
  /** Decide por dónde llega al general, o si llega. */
  | 'CAMINO'
  /** Puede callar —o destapar— una fuente con su `.mute` diciendo lo contrario. */
  | 'SILENCIO'
  /** Mueve ganancias por su cuenta, sin que nadie toque nada. */
  | 'AUTOMATICO'
  /** Existe en la consola y no se estableció qué hace. */
  | 'DESCONOCIDO';

/** Una ruta que existe en la consola y este módulo no lee. */
export interface Hueco {
  /** El patrón con `N` en el índice: `l.N.mgmask`. */
  readonly patron: string;
  readonly clase: ClaseDeHueco;
}

export interface LoQueNoSeVe {
  /** Cada hueco con la razón por la que importa. */
  readonly huecos: readonly Hueco[];
  /** Los mismos patrones, planos, para quien solo quiera la lista. */
  readonly sinMirar: readonly string[];
  readonly porQue: readonly string[];
}

/**
 * Los conceptos que deciden si una fuente llega al general, y en qué familias.
 *
 * **Las familias no se escriben de memoria**: salieron de contar el inventario,
 * y el test las vuelve a contar. `subgroup` está en `f i l p` y **no en `s`**
 * —un subgrupo no alimenta a otro subgrupo—, `amix` solo en `i`, `ducker` solo
 * en `s`. Escribir `i` y confiar es exactamente lo que falló.
 */
const CONCEPTOS: readonly { sufijo: string; familias: readonly string[]; clase: ClaseDeHueco }[] = [
  { sufijo: 'subgroup', familias: ['f', 'i', 'l', 'p'], clase: 'CAMINO' },
  { sufijo: 'vca', familias: ['a', 'f', 'i', 'l', 'p'], clase: 'CAMINO' },
  { sufijo: 'link2master', familias: ['a'], clase: 'CAMINO' },
  { sufijo: 'matrix', familias: ['a'], clase: 'CAMINO' },
  // Qué entrada física alimenta cada tira. **Por acá entró el Bluetooth.**
  { sufijo: 'src', familias: ['i', 'l'], clase: 'CAMINO' },
  { sufijo: 'mgmask', familias: ['a', 'f', 'i', 'l', 'p', 's', 'v'], clase: 'SILENCIO' },
  { sufijo: 'forceunmute', familias: ['a', 'f', 'i', 'l', 'p', 's', 'v'], clase: 'SILENCIO' },
  { sufijo: 'solo', familias: ['a', 'f', 'i', 'l', 'p', 's', 'v'], clase: 'SILENCIO' },
  { sufijo: 'amix', familias: ['i'], clase: 'AUTOMATICO' },
  { sufijo: 'amixgroup', familias: ['i'], clase: 'AUTOMATICO' },
  // El nombre sugiere qué hacen y **el nombre no es una medición**. Lo que no
  // se pudo descartar se declara, que es la dirección segura.
  { sufijo: 'scsrc', familias: ['i', 'l'], clase: 'DESCONOCIDO' },
  { sufijo: 'exclude', familias: ['i', 's'], clase: 'DESCONOCIDO' },
  { sufijo: 'ducker', familias: ['s'], clase: 'DESCONOCIDO' },
  { sufijo: 'bypass', familias: ['f'], clase: 'DESCONOCIDO' },
  { sufijo: 'smix', familias: ['f'], clase: 'DESCONOCIDO' },
  { sufijo: 'span', familias: ['f'], clase: 'DESCONOCIDO' },
];

/**
 * Huecos que no cuelgan de una familia de fuente: los globales y los grupos.
 *
 * Los VCA están acá **enteros**: `v.N.mix` tiene fader y `CLASES` no lo
 * reconoce, así que la enumeración descarta la familia completa en silencio.
 */
const HUECOS_SUELTOS: readonly { patron: string; clase: ClaseDeHueco }[] = [
  { patron: 'v.N.mix', clase: 'CAMINO' },
  { patron: 'v.N.mute', clase: 'CAMINO' },
  { patron: 'v.N.name', clase: 'CAMINO' },
  { patron: 'vg.N', clase: 'CAMINO' },
  { patron: 'vg.N.name', clase: 'CAMINO' },
  { patron: 'hwoutm.N.src', clase: 'CAMINO' },
  { patron: 'hwoutaux.N.src', clase: 'CAMINO' },
  { patron: 'hwouthp.N.src', clase: 'CAMINO' },
  { patron: 'hwouthpdsp.N.src', clase: 'CAMINO' },
  { patron: 'mgmask', clase: 'SILENCIO' },
  { patron: 'mg.N.name', clase: 'SILENCIO' },
  { patron: 'settings.soloMode', clase: 'SILENCIO' },
  { patron: 'settings.solotype', clase: 'SILENCIO' },
  { patron: 'settings.multiplesolo', clase: 'SILENCIO' },
  { patron: 'settings.solovol', clase: 'SILENCIO' },
  { patron: 'automix.a.on', clase: 'AUTOMATICO' },
  { patron: 'automix.b.on', clase: 'AUTOMATICO' },
  { patron: 'automix.time', clase: 'AUTOMATICO' },
];

/** Los tres sufijos que este módulo sí lee de cada fuente. */
export const SUFIJOS_LEIDOS: readonly string[] = ['mix', 'mute', 'name'];

/**
 * Lo que no se lee **porque cambia el sonido y no el camino**, con su motivo.
 *
 * Existe para que la cuenta cierre. Sin esto, «estos son mis huecos» es una
 * afirmación que nadie puede comprobar: hay 42 sufijos en las familias de
 * fuente, y la única forma de saber que ninguno se coló es que cada uno esté en
 * exactamente una de las tres listas. El test lo verifica contra el inventario.
 *
 * **No es una lista de cosas sin importancia.** Un canal con la ganancia al
 * mínimo o la fase invertida cambia el general muchísimo. Lo que dicen estas
 * entradas es más angosto: no cambian **si** la fuente llega, que es la única
 * pregunta que este módulo contesta.
 */
export const SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO: readonly { sufijo: string; porQue: string }[] = [
  { sufijo: 'gain', porQue: 'previo: cambia cuánto entra, no si entra' },
  { sufijo: 'disablegain', porQue: 'previo' },
  { sufijo: 'hiz', porQue: 'previo: impedancia de entrada' },
  { sufijo: 'phantom', porQue: 'previo: alimentación del micrófono (INV-007, de solo lectura)' },
  { sufijo: 'delay', porQue: 'cambia cuándo suena, no si llega' },
  { sufijo: 'invert', porQue: 'cambia la fase, no el camino' },
  { sufijo: 'pan', porQue: 'reparte entre izquierda y derecha; al extremo sigue llegando' },
  { sufijo: 'mtkrec', porQue: 'va a la grabación multipista, no al general' },
  { sufijo: 'safe', porQue: 'es del punto de retorno, no del camino: ver que-no-devuelve-el-punto-de-retorno.ts' },
  { sufijo: 'color', porQue: 'cosmético' },
  { sufijo: 'instrument', porQue: 'etiqueta' },
  { sufijo: 'iosyscmd', porQue: 'etiqueta del sistema de entrada/salida' },
  { sufijo: 'iosysname', porQue: 'etiqueta del sistema de entrada/salida' },
  { sufijo: 'fxtype', porQue: 'qué efecto es; el retorno llega igual' },
  { sufijo: 'bpm', porQue: 'parámetro del efecto' },
  { sufijo: 'prmod', porQue: 'preajuste del efecto' },
  { sufijo: 'prname', porQue: 'nombre del preajuste del efecto' },
  { sufijo: 'par1', porQue: 'parámetro del efecto' },
  { sufijo: 'par2', porQue: 'parámetro del efecto' },
  { sufijo: 'par3', porQue: 'parámetro del efecto' },
  { sufijo: 'par4', porQue: 'parámetro del efecto' },
  { sufijo: 'par5', porQue: 'parámetro del efecto' },
  { sufijo: 'par6', porQue: 'parámetro del efecto' },
];

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
 *
 * Los patrones **se arman** con `CONCEPTOS` × sus familias, así que no hay forma
 * de declarar el de un canal y olvidarse del de una entrada de línea: o está
 * para todas las familias que lo tienen, o el test lo dice.
 */
export function loQueNoSeVe(): LoQueNoSeVe {
  const huecos: Hueco[] = [];
  for (const c of CONCEPTOS) {
    for (const f of c.familias) huecos.push({ patron: `${f}.N.${c.sufijo}`, clase: c.clase });
  }
  for (const h of HUECOS_SUELTOS) huecos.push({ patron: h.patron, clase: h.clase });
  huecos.sort((a, b) => a.patron.localeCompare(b.patron));

  const hay = (c: ClaseDeHueco): boolean => huecos.some((h) => h.clase === c);
  const porQue: string[] = [];
  if (hay('CAMINO')) {
    porQue.push(
      'El enrutamiento no se mira. Un canal que llega al general POR UN SUBGRUPO, '
      + 'o cuyo fader gobierna un VCA, se cuenta como fuente directa y sin relación '
      + 'con ellos; y uno ruteado fuera del general se informa igual como fuente '
      + 'suya. Tampoco se lee qué entrada física alimenta cada tira ni qué manda de '
      + 'verdad la salida general: por ahí entró el receptor Bluetooth.',
    );
  }
  if (hay('SILENCIO')) {
    porQue.push(
      'Un grupo de silencio, un `forceunmute` o un solo pueden dejar una fuente '
      + 'callada —o al aire— con su `.mute` diciendo lo contrario. Entonces esta '
      + 'enumeración diría «no silenciada» sobre algo silenciado: un falso negativo, '
      + 'que es la dirección peligrosa. **No está medido contra el aparato.**',
    );
  }
  if (hay('AUTOMATICO')) {
    porQue.push(
      'El automix mueve ganancias por su cuenta. Una fuente puede abrirse sin que '
      + 'nadie toque nada, así que la foto que devuelve esto puede quedar vieja sola.',
    );
  }
  if (hay('DESCONOCIDO')) {
    porQue.push(
      'Hay rutas que existen en la consola y de las que solo se conoce el nombre. '
      + 'El nombre no es una medición: `s.N.ducker` suena a que baja un subgrupo por '
      + 'su cuenta y `i.N.exclude` a que saca un canal de algo, y ninguna de las dos '
      + 'cosas se comprobó. Lo que no se pudo descartar se declara.',
    );
  }
  porQue.push(
    'La cuenta cierra: los 42 sufijos de las familias de fuente están repartidos '
    + 'entre los tres que se leen, éstos y `SUFIJOS_QUE_NO_AFECTAN_EL_CAMINO`. Lo '
    + 'que este módulo no puede prometer es que los conceptos sean los correctos: '
    + 'que un sufijo no cambie el camino es un juicio, no una medición.',
  );

  return { huecos, sinMirar: huecos.map((h) => h.patron), porQue };
}
