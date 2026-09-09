import type { Confidence } from '../entities/recommendation.ts';

/**
 * La confianza se define distinto en cada dominio.
 *
 * La sala se mide en varias posiciones, así que puede hablar de consistencia
 * espacial. Un canal se mide en una sola, así que su criterio es que el mismo
 * hallazgo aparezca en dos capturas seguidas. La mezcla mira ventanas dentro
 * de una misma captura. Aplicar el criterio de sala a un canal daría siempre
 * datos insuficientes (ADR-014).
 */

export interface RoomConfidenceInput {
  /** Fracción de posiciones con el mismo signo y magnitud suficiente. */
  readonly consistencia: number;
  readonly desviacionDb: number;
  /** Desviación típica medida en este lugar, del spike de repetibilidad. */
  readonly sigmaBandaDb: number | null;
  readonly calibracionValida: boolean;
  readonly coherenciaMedia: number | null;
  readonly promedios: number;
}

export function confianzaSala(i: RoomConfidenceInput): Confidence {
  if (!i.calibracionValida) return 'INSUFFICIENT_DATA';
  if (i.promedios < 16) return 'INSUFFICIENT_DATA';
  if (i.coherenciaMedia !== null && i.coherenciaMedia < 0.5) return 'INSUFFICIENT_DATA';
  if (i.sigmaBandaDb === null) {
    // Sin repetibilidad medida no se puede afirmar que la desviación supere
    // el ruido de la propia medición.
    return i.consistencia >= 0.8 ? 'MEDIUM' : 'LOW';
  }
  const superaRuido = Math.abs(i.desviacionDb) >= 2 * i.sigmaBandaDb;
  if (i.consistencia >= 0.8 && superaRuido) return 'HIGH';
  if (i.consistencia >= 0.4 && superaRuido) return 'MEDIUM';
  return 'LOW';
}

export interface ChannelConfidenceInput {
  /** El mismo hallazgo apareció en dos capturas consecutivas. */
  readonly repetidoEnDosCapturas: boolean;
  /** Coincidencia de banda entre capturas, en fracción de octava. */
  readonly desviacionBandaOctavas: number;
  /**
   * Relación señal a ruido, o `null` si no se pudo calcular.
   *
   * **El `null` está en el tipo porque el resultado correcto salía por
   * accidente.** Antes esto era `number` y la comparación `snrDb < 10` daba
   * verdadero con `null` —JavaScript lo convierte a 0— así que devolvía
   * «datos insuficientes», que es lo que corresponde, pero por coerción y no
   * por decisión. Un cambio de umbral a un número negativo lo habría dado
   * vuelta sin que nadie lo notara.
   */
  readonly snrDb: number | null;
  readonly calibracionValida: boolean;
}

export function confianzaCanal(i: ChannelConfidenceInput): Confidence {
  if (!i.calibracionValida) return 'INSUFFICIENT_DATA';
  // Sin relación señal a ruido no hay con qué juzgar el ruido de fondo, y esta
  // función solo sube de confianza cuando puede descartarlo.
  if (i.snrDb === null || i.snrDb < 10) return 'INSUFFICIENT_DATA';
  const mismaBanda = i.desviacionBandaOctavas <= 1 / 6;
  if (i.repetidoEnDosCapturas && mismaBanda && i.snrDb >= 20) return 'HIGH';
  if (i.repetidoEnDosCapturas && i.snrDb >= 10) return 'MEDIUM';
  return 'LOW';
}

export interface MixConfidenceInput {
  /** En cuántas ventanas de diez segundos apareció el hallazgo. */
  readonly ventanasConHallazgo: number;
  readonly ventanasTotales: number;
  readonly calibracionValida: boolean;
}

export function confianzaMezcla(i: MixConfidenceInput): Confidence {
  if (!i.calibracionValida) return 'INSUFFICIENT_DATA';
  if (i.ventanasTotales < 3) return 'INSUFFICIENT_DATA';
  const fraccion = i.ventanasConHallazgo / i.ventanasTotales;
  if (fraccion >= 2 / 3) return 'HIGH';
  if (fraccion >= 1 / 3) return 'MEDIUM';
  return 'LOW';
}
