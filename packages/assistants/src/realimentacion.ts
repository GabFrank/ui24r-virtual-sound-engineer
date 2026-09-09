/**
 * Detección de realimentación sobre el espectro de la consola.
 *
 * **La regla es «no cayó como debía», no «creció».** Cualquier golpe de música
 * crece: un platillo, un ataque de piano, una palmada. Lo que distingue a la
 * realimentación es que **se queda**. El analizador de la consola tiene su
 * balística medida —2026-09-09: sube dentro de una trama y cae 20 dB en unos
 * 300 ms— así que hay un valor esperado para cuánto tendría que haber bajado
 * una banda desde su pico, y una banda que no bajó eso es una banda que algo
 * está realimentando.
 *
 * ## Qué está medido y qué elegí yo
 *
 * **Medido**: la caída del analizador (20 dB en ~300 ms, o sea ~67 dB/s), su
 * cadencia (~30 tramas por segundo), que son 122 bandas de un doceavo de
 * octava, y que un tono da una campana de unas 5 bandas de ancho a media
 * altura.
 *
 * **Elegido, y por lo tanto discutible**: cuántos decibeles por encima de lo
 * esperado cuentan como «se sostuvo», cuánto tiene que sobresalir de sus
 * vecinas, y cuánto tiempo tiene que durar antes de avisar. Son umbrales de
 * producto: mueven el equilibrio entre avisar tarde y avisar de más, y se
 * ajustan con el usuario delante de una sala real, no con una medición.
 *
 * ## Lo que esto NO es
 *
 * No es un veredicto. Una nota tenida —un acorde de teclado, una nota de bajo
 * sostenida, una voz con mucho reverb— también es estrecha y también se
 * sostiene. Sin micrófono de medición no hay forma de distinguir por señal si
 * el sostenimiento viene del músico o del aire, porque **el analizador mira el
 * canal, no la sala**. Por eso esto devuelve *candidatas* y el nivel de
 * autonomía se queda en avisar: la decisión de bajar algo es del operador.
 */

/** Caída del analizador, medida: 20 dB en ~300 ms. */
export const CAIDA_ESPERADA_DB_POR_S = 20 / 0.3;

/**
 * Cuánto por encima de lo esperado cuenta como «no cayó».
 *
 * Elegido. Con 6 dB, una banda tiene que estar al doble de presión de lo que
 * la balística predice para llamar la atención. Más chico avisa con el
 * sostenimiento normal de la música; más grande espera a que la realimentación
 * ya se escuche.
 */
export const MARGEN_SOSTENIDO_DB = 6;

/**
 * Cuánto tiene que sobresalir de sus vecinas.
 *
 * Elegido, apoyado en algo medido: un tono da una campana de unas 5 bandas a
 * media altura, así que a 4 bandas de distancia —un tercio de octava— una
 * resonancia estrecha ya bajó bastante. La música ancha —un bombo, una guitarra
 * distorsionada— no sobresale así de sus vecinas.
 */
export const MARGEN_SOBRE_VECINAS_DB = 9;

/** A qué distancia se mira la vecindad, en bandas. Cuatro son un tercio de octava. */
export const BANDAS_DE_VECINDAD = 4;

/**
 * Cuánto tiene que sostenerse antes de avisar.
 *
 * Elegido. Medio segundo son unas 15 tramas: suficiente para descartar un
 * golpe y sus colas, y poco para avisar antes de que la realimentación se
 * vuelva audible para toda la sala.
 */
export const MS_PARA_AVISAR = 500;

/** Por debajo de esto no vale la pena mirar: es piso de ruido. */
export const PISO_UTIL_DB = 12;

/** Una banda que se está sosteniendo más de lo que debería. */
export interface Candidata {
  readonly banda: number;
  readonly hz: number;
  readonly db: number;
  /** Cuánto lleva sosteniéndose, en milisegundos. */
  readonly sostenidaMs: number;
  /** Cuánto por encima de lo que la balística predice. */
  readonly excesoDb: number;
}

interface Seguimiento {
  pico: number;
  picoEnMs: number;
  sostenidaDesdeMs: number | null;
}

/**
 * Sigue el espectro trama a trama y dice qué bandas se están sosteniendo.
 *
 * Tiene estado a propósito: la regla es sobre la evolución en el tiempo, y una
 * sola trama no puede decir si algo cayó o no. Se le pasan las tramas con su
 * hora de llegada; no llama al reloj para poder probarse.
 */
export class VigilanteDeRealimentacion {
  private readonly seguidas = new Map<number, Seguimiento>();

  private readonly margenSostenidoDb: number;
  private readonly margenSobreVecinasDb: number;
  private readonly msParaAvisar: number;

  // Los campos van escritos a mano y no como propiedades de parámetro: el
  // proyecto corre los tests con `--experimental-strip-types`, que borra tipos
  // sin transformar nada, y esa forma abreviada necesita transformación.
  constructor(
    margenSostenidoDb = MARGEN_SOSTENIDO_DB,
    margenSobreVecinasDb = MARGEN_SOBRE_VECINAS_DB,
    msParaAvisar = MS_PARA_AVISAR,
  ) {
    this.margenSostenidoDb = margenSostenidoDb;
    this.margenSobreVecinasDb = margenSobreVecinasDb;
    this.msParaAvisar = msParaAvisar;
  }

  /** Empieza de cero. Hace falta al cambiar de fuente o al reconectar. */
  reiniciar(): void {
    this.seguidas.clear();
  }

  /**
   * Procesa una trama y devuelve las candidatas del momento.
   *
   * `bandas` viene de `decodificarEspectro`: decibeles relativos, uno por banda.
   */
  observar(bandas: readonly number[], ahoraMs: number): readonly Candidata[] {
    const candidatas: Candidata[] = [];

    for (let b = 0; b < bandas.length; b++) {
      const db = bandas[b]!;

      if (db < PISO_UTIL_DB) {
        this.seguidas.delete(b);
        continue;
      }

      const previa = this.seguidas.get(b);
      if (previa === undefined || db > previa.pico) {
        // Sube: se reinicia el pico y la cuenta. Que suba no es sospechoso —
        // sospechoso es lo que pasa después.
        //
        // **Estrictamente mayor, y esto importa.** Con `>=`, una banda clavada
        // exactamente en su pico —que es la forma más pura de «no cayó»— se
        // leía como una subida nueva en cada trama, reiniciaba la cuenta y no
        // se avisaba nunca. El caso que hay que detectar era justo el que se
        // escapaba.
        this.seguidas.set(b, { pico: db, picoEnMs: ahoraMs, sostenidaDesdeMs: null });
        continue;
      }

      const transcurridoS = (ahoraMs - previa.picoEnMs) / 1000;
      const esperado = previa.pico - CAIDA_ESPERADA_DB_POR_S * transcurridoS;
      const exceso = db - esperado;

      if (exceso < this.margenSostenidoDb) {
        // Cayó como tenía que caer: no hay nada que mirar, y se deja de contar.
        previa.sostenidaDesdeMs = null;
        continue;
      }

      // No cayó. ¿Es estrecha? Una resonancia lo es; un bombo no.
      if (!this.sobresaleDeSusVecinas(bandas, b)) {
        previa.sostenidaDesdeMs = null;
        continue;
      }

      previa.sostenidaDesdeMs ??= ahoraMs;
      const sostenidaMs = ahoraMs - previa.sostenidaDesdeMs;
      if (sostenidaMs < this.msParaAvisar) continue;

      candidatas.push({
        banda: b,
        hz: 1000 * Math.pow(2, (b - 67) / 12),
        db,
        sostenidaMs,
        excesoDb: exceso,
      });
    }

    return soloLasCumbres(candidatas);
  }

  /**
   * Si la banda sobresale de las que tiene a `BANDAS_DE_VECINDAD` de distancia.
   *
   * Se miran las dos vecinas y se exige que sobresalga de **la más alta**: con
   * la más baja alcanzaría cualquier flanco de una montaña ancha.
   */
  private sobresaleDeSusVecinas(bandas: readonly number[], b: number): boolean {
    const izq = bandas[b - BANDAS_DE_VECINDAD];
    const der = bandas[b + BANDAS_DE_VECINDAD];
    // En los bordes del espectro falta una vecina. Se usa la que hay; exigir
    // las dos dejaría ciegas las bandas graves, que es justo donde viven las
    // resonancias de sala más molestas.
    const vecinas = [izq, der].filter((v): v is number => v !== undefined);
    if (vecinas.length === 0) return false;
    return bandas[b]! - Math.max(...vecinas) >= this.margenSobreVecinasDb;
  }
}

/**
 * Una resonancia son varias bandas contiguas, pero un solo aviso.
 *
 * Un tono da una campana de unas 5 bandas a media altura, así que cuando el
 * pico se sostiene, sus hombros se sostienen con él y cada uno cumple la regla
 * por su cuenta. Sin esto, una sola resonancia de 1 kHz sale como tres avisos
 * en 970, 1000 y 1030 Hz, que al operador le suena a tres problemas cuando
 * tiene uno.
 *
 * Se agrupan las candidatas contiguas y se deja la más fuerte de cada grupo,
 * que es la que está más cerca de la frecuencia real de la resonancia.
 */
function soloLasCumbres(candidatas: readonly Candidata[]): readonly Candidata[] {
  const cumbres: Candidata[] = [];
  let grupo: Candidata[] = [];

  const cerrar = (): void => {
    if (grupo.length === 0) return;
    let mejor = grupo[0]!;
    for (const c of grupo) if (c.db > mejor.db) mejor = c;
    cumbres.push(mejor);
    grupo = [];
  };

  for (const c of candidatas) {
    const ultima = grupo[grupo.length - 1];
    if (ultima !== undefined && c.banda !== ultima.banda + 1) cerrar();
    grupo.push(c);
  }
  cerrar();
  return cumbres;
}
