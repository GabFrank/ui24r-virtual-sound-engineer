import type { ChannelAssignment, ChannelProfile, ChannelProfileType } from '../entities/musical.ts';
import { perfilPorTipo } from './channel-profiles.ts';

/**
 * Catálogo de instrumentos: **tres facetas ortogonales, no un árbol**.
 *
 * Un instrumento se describe con qué es (`fuente`), qué clase de esa cosa es
 * (`variante`) y para qué se lo usa en la canción (`rol`). Las tres son
 * independientes entre sí.
 *
 * El árbol de tres niveles se descartó por dos motivos concretos. Primero,
 * multiplica hojas: «conga» × tres tamaños × tres roles son nueve hojas que
 * repiten la misma información nueve veces, y agregar un rol obliga a tocar
 * todas las ramas. Segundo, y más importante, obliga a recorrer ramas para
 * responder preguntas que el usuario va a hacer seguido —«todos los repiques»,
 * «todas las voces de coro»—; con facetas cada una de esas preguntas es un
 * filtro sobre una lista plana.
 *
 * Lo que sí depende de la fuente es **qué variantes y qué roles tienen
 * sentido**: un djembe no tiene tesitura de voz y una voz no es «de nylon».
 * Por eso cada fuente declara su propia lista, y la mitad del valor de esto es
 * que la estructura impida las combinaciones absurdas antes de que se guarden.
 *
 * Nada de acá es una medición. Los nombres, las variantes y los roles son
 * **convención musical** del repertorio del usuario —percusión afrolatina y
 * canción—. Lo único que enlaza con datos del proyecto es el perfil de canal,
 * y ese enlace se declara fuente por fuente, sin inventar parecidos.
 */

export type FuenteId =
  | 'VOZ' | 'PALABRA'
  | 'GUITARRA' | 'BAJO' | 'TECLADO' | 'FLAUTA'
  | 'DJEMBE' | 'BOMBO' | 'CAJON' | 'CONGA' | 'MARACA' | 'SHAKER'
  | 'LINEA';

/**
 * Variantes de todas las fuentes, en una sola lista.
 *
 * Los identificadores son neutros —`ELECTRICO`, no `ELECTRICA`— y el nombre
 * que se muestra vive en cada fuente, ya concordado: la guitarra es
 * «eléctrica» y el bajo «eléctrico», y el identificador es el mismo porque la
 * faceta es la misma. Que la lista sea única es lo que permite preguntar «qué
 * hay conectado que sea de tesitura grave» sin recorrer el catálogo.
 */
export type VarianteId =
  | 'TESITURA_GRAVE' | 'TESITURA_MEDIA' | 'TESITURA_AGUDA'
  | 'NYLON' | 'ACERO' | 'ELECTRICO' | 'ACUSTICO'
  | 'CON_BORDONAS' | 'SIN_BORDONAS'
  | 'TAMANO_GRANDE' | 'TAMANO_MEDIANO' | 'TAMANO_PEQUENO';

/**
 * Función musical del instrumento dentro del tema.
 *
 * No es `MusicalRole`. `MusicalRole` describe qué lugar ocupa un **canal** en
 * la mezcla (`LEAD`, `FOUNDATION`, `RHYTHMIC`…) y lo consume el asistente de
 * mezcla; esto describe qué hace la **persona** con el instrumento. Un djembe
 * de base y un djembe de repique son los dos `RHYTHMIC` y no son lo mismo.
 * Por eso `SOLISTA` y no `SOLO`: que no se confundan al leerlos.
 */
export type RolDeInstrumento =
  | 'PRINCIPAL' | 'SEGUNDA_VOZ' | 'CORO'
  | 'BASE' | 'REPIQUE'
  | 'SOLISTA' | 'REFUERZO';

export interface VarianteDeFuente {
  readonly id: VarianteId;
  /** Cómo se la nombra para esta fuente, ya concordada en género. */
  readonly nombre: string;
}

export interface FuenteDeSonido {
  readonly id: FuenteId;
  readonly nombre: string;
  /** Vacío cuando la fuente no admite ninguna distinción de este tipo. */
  readonly variantes: readonly VarianteDeFuente[];
  /** Vacío cuando la fuente no cumple una función musical propia. */
  readonly roles: readonly RolDeInstrumento[];
  /** Perfil de canal por defecto de la fuente. `null` si no hay ninguno que le corresponda. */
  readonly perfil: ChannelProfileType | null;
  /** Perfil cuando la variante cambia el instrumento físico, no solo su tamaño. */
  readonly perfilPorVariante: Readonly<Partial<Record<VarianteId, ChannelProfileType>>> | null;
  /** Perfil cuando el rol cambia lo que la consola tiene que hacer con el canal. */
  readonly perfilPorRol: Readonly<Partial<Record<RolDeInstrumento, ChannelProfileType>>> | null;
  /**
   * Por qué esta fuente no tiene perfil, cuando no lo tiene.
   *
   * Es obligatorio: forzar el perfil más parecido produce un filtro pasa altos
   * y un margen objetivo que nadie midió para esa fuente, y la aplicación los
   * presentaría con la misma cara que los que sí se pensaron. Decir «no hay»
   * y explicarlo es más útil que acertar por casualidad.
   */
  readonly sinPerfilPorque: string | null;
}

/**
 * Un instrumento concreto: las tres facetas, más el texto del que salió.
 *
 * `variante` y `rol` son nulos cuando la fuente no admite ninguno —un shaker
 * no tiene tesitura— y también cuando el usuario todavía no eligió.
 *
 * `fuente` es nulo solo en un caso: texto libre que el catálogo no supo
 * clasificar. En ese caso `textoOriginal` es lo único que queda, y por eso
 * nunca se descarta.
 */
export interface Instrumento {
  readonly fuente: FuenteId | null;
  readonly variante: VarianteId | null;
  readonly rol: RolDeInstrumento | null;
  /**
   * El texto tal como se escribió, cuando el instrumento vino de texto libre.
   *
   * Se conserva **siempre** que haya venido de texto, incluso si se pudo
   * clasificar entero. Conservarlo solo en los casos dudosos obliga a decidir
   * qué es dudoso, y esa decisión se equivoca en silencio: si el lector
   * clasifica «guitarra criolla» como guitarra de nylon y tira el texto, el
   * día que se corrija la clasificación ya no hay de dónde recuperarla.
   * Es `null` cuando el instrumento se eligió de la lista, porque ahí no hubo
   * texto que conservar.
   */
  readonly textoOriginal: string | null;
}

const v = (id: VarianteId, nombre: string): VarianteDeFuente => ({ id, nombre });

/**
 * El catálogo.
 *
 * Los nombres siguen a los que el proyecto ya usa: los canales del simulador
 * (`tools/mixer-sim/src/state.mjs`) y los perfiles de `docs/channel-profiles.md`.
 * No se inventaron sinónimos nuevos para cosas que ya tenían nombre acá.
 */
export const FUENTES: readonly FuenteDeSonido[] = [
  {
    id: 'VOZ',
    nombre: 'voz',
    // Tesitura y no «tipo de voz»: soprano o barítono son etiquetas de canto
    // académico que este repertorio no usa, y grave/media/aguda es lo que
    // efectivamente cambia dónde vive el contenido de la señal.
    variantes: [v('TESITURA_GRAVE', 'grave'), v('TESITURA_MEDIA', 'media'), v('TESITURA_AGUDA', 'aguda')],
    roles: ['PRINCIPAL', 'SEGUNDA_VOZ', 'CORO'],
    perfil: 'LEAD_VOCAL',
    perfilPorVariante: null,
    // La única fuente donde el rol cambia el perfil: el proyecto ya distingue
    // voz principal de voz de acompañamiento, y esa distinción es de función,
    // no de aparato. Dos micrófonos idénticos con perfiles distintos.
    perfilPorRol: { CORO: 'BACKING_VOCAL', SEGUNDA_VOZ: 'BACKING_VOCAL' },
    sinPerfilPorque: null,
  },
  {
    id: 'PALABRA',
    nombre: 'palabra',
    variantes: [],
    roles: ['PRINCIPAL'],
    perfil: 'SPEECH',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'GUITARRA',
    nombre: 'guitarra',
    variantes: [v('NYLON', 'de nylon'), v('ACERO', 'de cuerda de acero'), v('ELECTRICO', 'eléctrica')],
    roles: ['BASE', 'SOLISTA', 'REFUERZO'],
    // Sin variante elegida se asume acústica: es lo que toca la banda, y el
    // perfil eléctrico recorta a 12 kHz una guitarra que llega a 16.
    perfil: 'ACOUSTIC_GUITAR',
    perfilPorVariante: {
      NYLON: 'ACOUSTIC_GUITAR', ACERO: 'ACOUSTIC_GUITAR', ELECTRICO: 'ELECTRIC_GUITAR',
    },
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'BAJO',
    nombre: 'bajo',
    variantes: [v('ELECTRICO', 'eléctrico'), v('ACUSTICO', 'acústico')],
    roles: ['BASE', 'SOLISTA'],
    // Las dos variantes comparten perfil: el perfil describe el registro grave
    // pulsado, y no hay medición que separe el bajo acústico del eléctrico.
    perfil: 'BASS',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'TECLADO',
    nombre: 'teclado',
    // Sin variantes: la distinción que aparece en la consola es «L» y «R»
    // —dos canales de un mismo teclado— y eso no es una variante del
    // instrumento sino un par estéreo. Ver la nota sobre el panorama al final.
    variantes: [],
    roles: ['BASE', 'SOLISTA', 'REFUERZO'],
    perfil: 'KEYBOARD',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'FLAUTA',
    nombre: 'flauta',
    // Traversa, quena y dulce son variantes reales y suenan distinto, pero
    // nada en este proyecto las distingue todavía: no hay perfiles separados
    // ni un canal del simulador que las nombre. Declararlas sería inventar una
    // clasificación que después nadie usa. Agregarlas es una línea acá.
    variantes: [],
    roles: ['PRINCIPAL', 'SOLISTA', 'REFUERZO'],
    perfil: 'FLUTE',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'DJEMBE',
    nombre: 'djembe',
    variantes: [v('TAMANO_GRANDE', 'grande'), v('TAMANO_MEDIANO', 'mediano'), v('TAMANO_PEQUENO', 'pequeño')],
    roles: ['BASE', 'REPIQUE', 'SOLISTA'],
    perfil: null,
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque:
      'No hay perfil de djembe. El de conga es el más parecido y no sirve: corta '
      + 'el pasa altos entre 60 y 90 Hz, y el golpe grave del djembe vive justo ahí. '
      + 'Hasta que se mida uno, el canal se configura a mano o con «Personalizado».',
  },
  {
    id: 'BOMBO',
    nombre: 'bombo',
    variantes: [],
    roles: ['BASE', 'REPIQUE'],
    perfil: null,
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque:
      'No hay perfil de bombo. Ningún perfil de la tabla baja de 30 Hz con el '
      + 'margen que pide un parche grande, y el de cajón —que es el otro golpe '
      + 'grave con parche— arranca en 45 Hz. Falta medirlo.',
  },
  {
    id: 'CAJON',
    nombre: 'cajón',
    // Con bordonas o sin ellas cambia el timbre de verdad --las bordonas
    // agregan el siseo que imita a la caja-- pero no cambia la banda útil, así
    // que las dos variantes comparten perfil.
    variantes: [v('CON_BORDONAS', 'con bordonas'), v('SIN_BORDONAS', 'sin bordonas')],
    roles: ['BASE', 'REPIQUE', 'SOLISTA'],
    perfil: 'CAJON',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'CONGA',
    nombre: 'conga',
    // Los nombres del oficio, no «grande/mediana/chica»: el músico dice
    // tumbadora y quinto. El identificador sí es el tamaño, que es la faceta.
    variantes: [v('TAMANO_GRANDE', 'tumbadora'), v('TAMANO_MEDIANO', 'mediana'), v('TAMANO_PEQUENO', 'quinto')],
    roles: ['BASE', 'REPIQUE', 'SOLISTA'],
    perfil: 'CONGA',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'MARACA',
    nombre: 'maraca',
    variantes: [],
    roles: ['BASE', 'REFUERZO'],
    // El perfil «Shaker» no es el de un shaker en particular: describe un
    // idiófono sacudido, sin contenido por debajo de 300 Hz y con todo el
    // ataque arriba. La maraca es uno. No es forzar el más parecido, es la
    // misma familia.
    perfil: 'SHAKER',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'SHAKER',
    nombre: 'shaker',
    variantes: [],
    roles: ['BASE', 'REFUERZO'],
    perfil: 'SHAKER',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
  {
    id: 'LINEA',
    nombre: 'entrada de línea',
    variantes: [],
    // Sin roles: una entrada de línea no cumple una función musical propia,
    // la cumple lo que venga por ella. El rol se declara por escena.
    roles: [],
    perfil: 'PLAYBACK',
    perfilPorVariante: null,
    perfilPorRol: null,
    sinPerfilPorque: null,
  },
];

/**
 * El vocabulario con el que se lee el texto libre, completo por faceta.
 *
 * Son `Record` y no listas dentro del catálogo por una razón que el compilador
 * sostiene: un `Record<FuenteId, …>` no compila si falta una fuente. Así, la
 * lista de identificadores y la lista de palabras no pueden divergir sin que
 * alguien lo vea.
 *
 * Las palabras se comparan normalizadas: sin tildes, en minúsculas y por
 * palabra entera. «Cajón» y «cajon» son la misma.
 */
export const SINONIMOS_DE_FUENTE: Readonly<Record<FuenteId, readonly string[]>> = {
  VOZ: ['voz', 'voces', 'vocal', 'canto', 'cantante', 'coro', 'coros'],
  PALABRA: ['palabra', 'locucion', 'presentacion', 'speech', 'charla'],
  GUITARRA: ['guitarra', 'guitarras', 'viola', 'criolla'],
  BAJO: ['bajo', 'bass', 'contrabajo'],
  TECLADO: ['teclado', 'teclados', 'piano', 'keyboard', 'sintetizador', 'organo'],
  FLAUTA: ['flauta', 'flautas', 'traversa', 'quena', 'flute'],
  DJEMBE: ['djembe', 'yembe', 'jembe'],
  BOMBO: ['bombo', 'kick', 'bombo leguero'],
  CAJON: ['cajon', 'cajones'],
  CONGA: ['conga', 'congas', 'tumbadora', 'quinto', 'tumba'],
  MARACA: ['maraca', 'maracas'],
  SHAKER: ['shaker', 'shakers', 'huevo', 'chekere', 'ganza'],
  LINEA: ['linea', 'entrada de linea', 'rca', 'aux', 'playback', 'pista', 'reproductor'],
};

export const SINONIMOS_DE_VARIANTE: Readonly<Record<VarianteId, readonly string[]>> = {
  TESITURA_GRAVE: ['grave', 'graves', 'baritono'],
  TESITURA_MEDIA: ['media', 'medio', 'mezzo', 'tenor'],
  TESITURA_AGUDA: ['aguda', 'agudo', 'soprano'],
  NYLON: ['nylon', 'nailon', 'criolla', 'espanola', 'clasica'],
  ACERO: ['acero', 'cuerda de acero', 'folk', 'western'],
  // «el» sale de los nombres abreviados de la consola: el canal se llama
  // «GUITARRA EL» porque en la pantalla de la Ui24R no entra más. El riesgo de
  // una palabra tan corta está acotado: las variantes solo se buscan entre las
  // que declara la fuente ya reconocida, y solo guitarra y bajo tienen esta.
  ELECTRICO: ['electrica', 'electrico', 'el'],
  ACUSTICO: ['acustico', 'acustica', 'contrabajo'],
  CON_BORDONAS: ['con bordonas', 'bordonas', 'flamenco'],
  SIN_BORDONAS: ['sin bordonas', 'peruano'],
  TAMANO_GRANDE: ['grande', 'grandes', 'tumbadora'],
  TAMANO_MEDIANO: ['mediano', 'mediana', 'media', 'segunda'],
  TAMANO_PEQUENO: ['pequeno', 'pequena', 'chico', 'chica', 'quinto'],
};

export const NOMBRE_DE_ROL: Readonly<Record<RolDeInstrumento, string>> = {
  PRINCIPAL: 'principal',
  SEGUNDA_VOZ: 'segunda voz',
  CORO: 'coro',
  BASE: 'base',
  REPIQUE: 'repique',
  SOLISTA: 'solista',
  REFUERZO: 'refuerzo',
};

export const SINONIMOS_DE_ROL: Readonly<Record<RolDeInstrumento, readonly string[]>> = {
  PRINCIPAL: ['principal', 'lead', 'ppal'],
  SEGUNDA_VOZ: ['segunda voz', 'segunda', 'armonia'],
  CORO: ['coro', 'coros', 'backing', 'back'],
  BASE: ['base', 'acompanamiento', 'ritmo'],
  REPIQUE: ['repique', 'repiques'],
  SOLISTA: ['solista', 'solo'],
  REFUERZO: ['refuerzo', 'apoyo', 'doble'],
};

/** Los identificadores de cada faceta, para poblar listas y recorrer el catálogo. */
export const FUENTES_IDS = Object.keys(SINONIMOS_DE_FUENTE) as readonly FuenteId[];
export const VARIANTES_IDS = Object.keys(SINONIMOS_DE_VARIANTE) as readonly VarianteId[];
export const ROLES_DE_INSTRUMENTO = Object.keys(NOMBRE_DE_ROL) as readonly RolDeInstrumento[];

const PORFUENTE = new Map(FUENTES.map((f) => [f.id, f]));

export function fuentePorId(id: FuenteId): FuenteDeSonido {
  const f = PORFUENTE.get(id);
  if (f === undefined) {
    throw new Error(
      `no hay fuente de sonido con identificador ${id}. `
      + `Se esperaba una de: ${FUENTES.map((x) => x.id).join(', ')}`,
    );
  }
  return f;
}

/**
 * Texto comparable: minúsculas, sin tildes y con un solo espacio entre
 * palabras.
 *
 * La `ñ` también pierde la tilde y queda `n`, así que «pequeño» y «pequeno» se
 * comparan igual. Es deliberado: el usuario escribe con el teclado que tenga.
 */
function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Busca la entrada cuyo sinónimo más largo aparezca como palabra entera.
 *
 * Gana el más largo, no el primero: «cajón sin bordonas» contiene «bordonas»,
 * que es sinónimo de «con bordonas», y si ganara el primero quedaría dicho lo
 * contrario de lo que el texto dice.
 */
function reconocer<T extends string>(
  texto: string,
  candidatos: readonly T[],
  sinonimos: Readonly<Partial<Record<T, readonly string[]>>>,
): T | null {
  const conEspacios = ` ${texto} `;
  let mejor: T | null = null;
  let largo = 0;
  for (const c of candidatos) {
    for (const s of sinonimos[c] ?? []) {
      if (s.length > largo && conEspacios.includes(` ${s} `)) {
        mejor = c;
        largo = s.length;
      }
    }
  }
  return mejor;
}

/**
 * Lee un instrumento escrito a mano.
 *
 * Es la conversión de los perfiles ya guardados: hasta hoy `instrumentos` era
 * una lista de cadenas escritas por el usuario, y esas cadenas están en la
 * columna `datos` de `band_profile`. La regla es que **nunca se pierda el
 * texto**: si el catálogo no reconoce nada, el instrumento queda sin fuente
 * pero con `textoOriginal`, y se sigue mostrando exactamente lo que el usuario
 * escribió.
 *
 * La variante y el rol se buscan solo entre los que la fuente reconocida
 * admite. Sin eso, «conga media» quedaría con tesitura de voz.
 */
export function interpretarInstrumento(texto: string): Instrumento {
  const original = texto.trim();
  const normalizado = normalizarTexto(original);
  const fuente = reconocer(normalizado, FUENTES_IDS, SINONIMOS_DE_FUENTE);
  if (fuente === null) {
    return { fuente: null, variante: null, rol: null, textoOriginal: original };
  }
  const f = fuentePorId(fuente);
  return {
    fuente,
    variante: reconocer(normalizado, f.variantes.map((x) => x.id), SINONIMOS_DE_VARIANTE),
    rol: reconocer(normalizado, f.roles, SINONIMOS_DE_ROL),
    textoOriginal: original,
  };
}

/**
 * Arma un instrumento elegido de la lista, y rechaza las combinaciones que la
 * fuente no admite.
 *
 * Sin `textoOriginal`: no hubo texto. Que el campo quede nulo es lo que
 * distingue «lo eligió de la lista» de «lo escribió y se interpretó».
 */
export function crearInstrumento(
  fuente: FuenteId,
  variante: VarianteId | null = null,
  rol: RolDeInstrumento | null = null,
): Instrumento {
  const instrumento: Instrumento = { fuente, variante, rol, textoOriginal: null };
  const error = errorDeInstrumento(instrumento);
  if (error !== null) throw new Error(error);
  return instrumento;
}

/**
 * Qué tiene de malo este instrumento, o `null` si no tiene nada.
 *
 * Devuelve el mensaje en vez de un booleano porque el mensaje dice **qué se
 * esperaba**, que es lo que le sirve a quien lo lea.
 */
export function errorDeInstrumento(instrumento: Instrumento): string | null {
  const { fuente, variante, rol, textoOriginal } = instrumento;

  if (fuente === null) {
    if (variante !== null || rol !== null) {
      return 'un instrumento sin fuente no puede declarar variante ni rol: '
        + 'las dos se definen por fuente. Se esperaba fuente distinta de null.';
    }
    if (textoOriginal === null || textoOriginal.length === 0) {
      return 'un instrumento sin fuente tiene que conservar el texto original: '
        + 'sin fuente y sin texto no queda nada de lo que el usuario dijo.';
    }
    return null;
  }

  const f = fuentePorId(fuente);
  if (variante !== null && !f.variantes.some((x) => x.id === variante)) {
    const admitidas = f.variantes.map((x) => x.id).join(', ');
    return `la fuente ${fuente} no admite la variante ${variante}. `
      + `Se esperaba ${admitidas.length === 0 ? 'ninguna variante' : `una de: ${admitidas}`}.`;
  }
  if (rol !== null && !f.roles.includes(rol)) {
    const admitidos = f.roles.join(', ');
    return `la fuente ${fuente} no admite el rol ${rol}. `
      + `Se esperaba ${admitidos.length === 0 ? 'ningún rol' : `uno de: ${admitidos}`}.`;
  }
  return null;
}

/**
 * El tipo de perfil de canal que le corresponde a este instrumento, o `null`
 * si a su fuente no le corresponde ninguno.
 *
 * Precedencia: variante, después rol, después el de la fuente. La variante
 * manda porque describe el aparato —una guitarra eléctrica es otro aparato—
 * mientras que el rol solo describe cómo se lo usa. Hoy ninguna fuente declara
 * las dos tablas, y hay un test que lo comprueba: el día que alguna las
 * declare, esta regla ya está escrita y no se decide sobre la marcha.
 */
export function perfilDeInstrumento(instrumento: Instrumento): ChannelProfileType | null {
  if (instrumento.fuente === null) return null;
  const f = fuentePorId(instrumento.fuente);
  const porVariante = instrumento.variante === null
    ? undefined
    : f.perfilPorVariante?.[instrumento.variante];
  if (porVariante !== undefined) return porVariante;
  const porRol = instrumento.rol === null ? undefined : f.perfilPorRol?.[instrumento.rol];
  if (porRol !== undefined) return porRol;
  return f.perfil;
}

/**
 * El perfil de canal entero: banda útil, rango de pasa altos y margen
 * objetivo. Esto es lo que hace que el catálogo sirva para algo — elegir
 * «cajón» trae con qué comparar la medición.
 */
export function perfilDeCanalDeInstrumento(instrumento: Instrumento): ChannelProfile | null {
  const tipo = perfilDeInstrumento(instrumento);
  return tipo === null ? null : perfilPorTipo(tipo);
}

/** El nombre del catálogo, con la variante y el rol que se hayan elegido. */
export function etiquetaCanonicaDeInstrumento(instrumento: Instrumento): string {
  if (instrumento.fuente === null) return instrumento.textoOriginal ?? '';
  const f = fuentePorId(instrumento.fuente);
  const variante = f.variantes.find((x) => x.id === instrumento.variante);
  const partes = [f.nombre];
  if (variante !== undefined) partes.push(variante.nombre);
  const base = partes.join(' ');
  return instrumento.rol === null ? base : `${base}, ${NOMBRE_DE_ROL[instrumento.rol]}`;
}

/**
 * Cómo se muestra el instrumento.
 *
 * Manda el texto original cuando lo hay. Es deliberado y es la mitad de la
 * compatibilidad hacia atrás: un perfil guardado con «GUITARRA CRIOLLA» sigue
 * diciendo «GUITARRA CRIOLLA» en la pantalla aunque por dentro ya esté
 * clasificado como guitarra de nylon. Reescribirle al usuario lo que él
 * escribió, para mostrarle nuestro nombre, es cambiar sus datos sin pedirle
 * permiso.
 */
export function etiquetaDeInstrumento(instrumento: Instrumento): string {
  return instrumento.textoOriginal ?? etiquetaCanonicaDeInstrumento(instrumento);
}

/**
 * Vuelve a leer un instrumento que quedó sin clasificar pero conserva su texto.
 *
 * Es lo que convierte los datos viejos sin perder nada: la migración de la base
 * solo puede darle forma al texto —SQL no sabe de djembes— y deja `fuente` en
 * nulo. Esta función completa la clasificación la primera vez que el perfil
 * pasa por el dominio. Es idempotente: lo que el catálogo no reconoce queda
 * igual, con su texto intacto.
 */
export function reinterpretarInstrumento(instrumento: Instrumento): Instrumento {
  if (instrumento.fuente !== null) return instrumento;
  if (instrumento.textoOriginal === null) return instrumento;
  return interpretarInstrumento(instrumento.textoOriginal);
}

/**
 * Todas las fuentes que admiten un rol dado.
 *
 * Existe para mostrar de qué sirven las facetas: «todos los repiques» es un
 * filtro sobre una lista plana. Con un árbol habría que recorrer ramas.
 */
export function fuentesConRol(rol: RolDeInstrumento): readonly FuenteDeSonido[] {
  return FUENTES.filter((f) => f.roles.includes(rol));
}

/**
 * El instrumento clasificado de una asignación de canal.
 *
 * Es la única forma correcta de leerlo. Si la asignación no trae clasificación
 * —todas las guardadas hasta hoy— se interpreta la etiqueta, que es texto
 * libre escrito por el usuario o sincronizado desde la consola. Así la
 * pantalla no tiene que saber si el perfil que abrió es viejo o nuevo.
 */
export function instrumentoDeAsignacion(asignacion: ChannelAssignment): Instrumento {
  return asignacion.instrumentoDetalle ?? interpretarInstrumento(asignacion.instrumento);
}
