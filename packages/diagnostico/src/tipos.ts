/**
 * Tipos del informe de diagnóstico.
 *
 * Lo que se mide acá es lo que pide SPK-P0.1, y se mide **desde la tablet**.
 * No es lo mismo que medirlo desde una laptop: el número que decide si la
 * reconexión es aceptable es el del aparato que se va a usar en el show, con
 * su radio, su sistema y su gestión de energía.
 */

/** Una cadencia medida sobre marcas de tiempo de mensajes que llegan. */
export interface EstadisticaDeCadencia {
  readonly muestras: number;
  readonly mediaMs: number;
  readonly medianaMs: number;
  readonly p95Ms: number;
  /** Media de la diferencia absoluta entre intervalos sucesivos. */
  readonly fluctuacionMs: number;
  readonly minimoMs: number;
  readonly maximoMs: number;
  /**
   * Umbral con el que se declara inestable la conexión: tres veces el
   * intervalo medio. Lo fija el criterio 4 de SPK-P0.1.
   */
  readonly umbralDeInestabilidadMs: number;
}

/** Cómo se cortó la red en un ciclo de reconexión. */
export type ModoDeCorte = 'router-apagado' | 'ip-cambiada' | 'wifi-cortada' | 'otro';

export interface CicloDeReconexion {
  readonly modo: ModoDeCorte;
  readonly caidaEn: string;
  /**
   * Cuándo volvió la red, si el sistema lo dijo. Es un dato del navegador
   * —avisa que hay interfaz, no que haya consola— y puede faltar.
   */
  readonly redVuelveEn: string | null;
  readonly volcadoEn: string;
  /** Desde la caída hasta el volcado completo. Incluye el tiempo sin red. */
  readonly msDesdeLaCaida: number;
  /**
   * Desde que el sistema avisó que había red otra vez hasta el volcado
   * completo. Es el número que compara con el umbral de 10 s del criterio 1,
   * y es `null` cuando el sistema no avisó.
   */
  readonly msDesdeQueVolvioLaRed: number | null;
}

export interface DatosDelDispositivo {
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly direccion: string;
  readonly agente: string;
}

export interface InformeDeDiagnostico {
  readonly version: 1;
  readonly generadoEn: string;
  readonly dispositivo: DatosDelDispositivo;
  readonly cadenciaDeMedidores: EstadisticaDeCadencia | null;
  readonly duracionDeLaMedicionMs: number;
  readonly ciclos: readonly CicloDeReconexion[];
  /** Huella del estado confirmado, para comparar entre clientes. */
  readonly huellaDelEstado: string | null;
  readonly canalesLeidos: number;
  /** Lo que esta corrida NO midió, dicho en el propio informe. */
  readonly sinMedir: readonly string[];
}
