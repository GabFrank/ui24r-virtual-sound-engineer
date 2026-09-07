/**
 * Puntajes de sala y de mezcla. Implementa docs/scores.md.
 *
 * Un puntaje sin fórmula es un número que nadie puede explicar ni testear.
 * Por eso cada uno devuelve su desglose: mostrar "sala 87" sin decir de dónde
 * sale no le sirve a nadie que tenga que arreglar algo.
 */

export interface RoomScoreInput {
  /** Desviación cuadrática media al objetivo, en decibeles. */
  readonly desviacionRmsDb: number;
  /** Mediana de la desviación típica entre posiciones, por banda. */
  readonly sigmaEntrePosicionesDb: number;
  /** Diferencia entre la respuesta suavizada fina y la gruesa. */
  readonly rugosidadDb: number;
  readonly snrDb: number;
  /** Bandas usadas sobre el total: un puntaje sobre media banda es parcial. */
  readonly bandasUsadas: number;
  readonly bandasTotales: number;
}

export interface ScoreBreakdown {
  readonly total: number;
  readonly componentes: readonly { readonly nombre: string; readonly valor: number; readonly peso: number }[];
  readonly parcial: boolean;
}

const acotar = (x: number) => Math.max(0, Math.min(100, x));

export function roomScore(i: RoomScoreInput): ScoreBreakdown {
  const desviacion = acotar(100 - 8 * i.desviacionRmsDb);
  const consistencia = acotar(100 - 10 * i.sigmaEntrePosicionesDb);
  const suavidad = acotar(100 - 6 * i.rugosidadDb);
  const ruido = acotar(i.snrDb >= 40 ? 100 : 100 - 5 * (40 - i.snrDb));

  const componentes = [
    { nombre: 'Desviación al objetivo', valor: desviacion, peso: 45 },
    { nombre: 'Consistencia espacial', valor: consistencia, peso: 30 },
    { nombre: 'Suavidad espectral', valor: suavidad, peso: 15 },
    { nombre: 'Ruido de fondo', valor: ruido, peso: 10 },
  ];

  const total = componentes.reduce((acc, c) => acc + c.valor * c.peso, 0) / 100;
  return {
    total: Math.round(total),
    componentes,
    parcial: i.bandasUsadas < i.bandasTotales * 0.8,
  };
}

export interface MixScoreInput {
  /** Error cuadrático medio frente a los objetivos de rol, en decibeles. */
  readonly errorRolRmsDb: number;
  /** Pico del general, en dBFS. */
  readonly picoMasterDbfs: number;
  readonly canalesConSaturacion: number;
  /** Desviación del espectro del general frente a la curva objetivo. */
  readonly desviacionEspectralDb: number;
}

export function mixScore(i: MixScoreInput): ScoreBreakdown {
  const rol = acotar(100 - 12 * i.errorRolRmsDb);

  // El margen ideal está entre −12 y −3 dBFS: por encima se arriesga saturar,
  // por debajo se desperdicia resolución.
  let margen = 100;
  if (i.picoMasterDbfs > -3) margen = acotar(100 - 10 * (i.picoMasterDbfs + 3));
  else if (i.picoMasterDbfs < -12) margen = acotar(100 - 10 * (-12 - i.picoMasterDbfs));

  const saturacion = acotar(100 - 20 * i.canalesConSaturacion);
  const espectro = acotar(100 - 8 * i.desviacionEspectralDb);

  const componentes = [
    { nombre: 'Objetivos de rol', valor: rol, peso: 40 },
    { nombre: 'Margen', valor: margen, peso: 25 },
    { nombre: 'Ausencia de saturación', valor: saturacion, peso: 20 },
    { nombre: 'Equilibrio espectral', valor: espectro, peso: 15 },
  ];

  const total = componentes.reduce((acc, c) => acc + c.valor * c.peso, 0) / 100;
  return { total: Math.round(total), componentes, parcial: false };
}

/**
 * Tolerancia del lazo cerrado. Implementa INV-023.
 *
 * No es un número fijo: es el doble de la variación que tiene la medición en
 * esa sala concreta, con un mínimo de dos puntos. Sin la repetibilidad medida
 * en esa sala, el lazo cerrado no está disponible: decidiría conservar o
 * revertir sobre su propio ruido, y oscilaría.
 */
export function toleranciaLazoCerrado(sigmaRoomScore: number | null): number | null {
  if (sigmaRoomScore === null) return null;
  return Math.max(2 * sigmaRoomScore, 2);
}
